/**
 * e2e suite for the statistics triggers + `rebuild_all()` shipped in
 * migration `0033_statistics_triggers.sql` (Task 2 of the statistics
 * implementation plan), plus (from the "Task 3: repository nightly-job
 * methods" describe block onward) the `StatisticsRepository` methods that
 * aren't trigger-maintained: `refreshActivityStats`, `recomputeAvgGapPerRank`,
 * `captureMonthlyIfNewMonth`.
 *
 * The Task 2 tests use the raw `postgres` client directly against the
 * docker-compose e2e Postgres (see `apps/backend/docker-compose.e2e.yml`)
 * rather than going through the Nest app / Drizzle ORM — the thing under
 * test is DB-level trigger behaviour, not application code. The Task 3
 * tests exercise `StatisticsRepository` through a real `DrizzleDb` client
 * (the actual production entrypoint into these queries) while still using
 * the raw `sql` client for seeding, matching the Task 2 seed helpers.
 *
 * Isolation: each test seeds its own fresh user id, organisation id, and
 * belt rank id (all UUIDs / unique strings), so `stat_current` rows keyed
 * by those ids never collide across tests even though the suite shares one
 * database and `rebuild_all()` truncates the whole table. Tests run
 * sequentially (vitest default, and this config forces `singleFork`), so
 * that isolation-by-fresh-key strategy is safe.
 *
 * Schema deviations from the Task 2 brief's literal SQL (verified against
 * apps/backend/src/infrastructure/database/schema/*.ts and the applied
 * migrations before writing the trigger SQL):
 *   - `organisation` -> `organisations` (plural), `parent_organisation_id`
 *     -> `parent_id`.
 *   - No `rank_requirement` join table exists; `rank_requirement_technique`
 *     / `rank_requirement_pattern` carry `rank_id` + `set_id` directly.
 *   - `user_content_progress` has no `entity_id`; it is polymorphic via
 *     `technique_id` / `pattern_id`.
 * See `0033_statistics_triggers.sql` for the corrected SQL.
 */

import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDrizzleClient,
  disposeDrizzleClient,
  type DrizzleDb,
} from '../../src/infrastructure/database/client.js';
import { StatisticsRepository } from '../../src/modules/statistics/statistics.repository.js';
import { hasDatabase } from '../helpers/app-factory.js';
import { resetDatabase } from '../helpers/db-reset.js';

describe.skipIf(!hasDatabase())('statistics triggers (integration)', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await resetDatabase();
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
    sql = postgres(url, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  // ── Seed helpers ─────────────────────────────────────────────────────────

  async function seedUser(id: string): Promise<void> {
    await sql`INSERT INTO "user" (id, email) VALUES (${id}, ${`${id}@example.com`})`;
  }

  async function seedOrg(parentId: string | null = null): Promise<string> {
    const id = randomUUID();
    await sql`
      INSERT INTO organisations (id, parent_id, type, short_code, country, name_en, name_sv, name_fi)
      VALUES (${id}, ${parentId}, 'club', ${`ORG-${id.slice(0, 8)}`}, 'FI', 'Test Org', 'Test Org SV', 'Test Org FI')
    `;
    return id;
  }

  /** Creates a fresh belt_system + belt_rank pair; returns the rank id. */
  async function seedBeltRank(): Promise<string> {
    const systemId = randomUUID();
    await sql`
      INSERT INTO belt_systems (id, code, name_en, name_sv, name_fi)
      VALUES (${systemId}, ${`SYS-${systemId.slice(0, 8)}`}, 'Test System', 'Test System SV', 'Test System FI')
    `;
    const rankId = randomUUID();
    await sql`
      INSERT INTO belt_ranks (id, system_id, level, name_romaji, belt_color)
      VALUES (${rankId}, ${systemId}, 1, ${`Rank-${rankId.slice(0, 8)}`}, 'green')
    `;
    return rankId;
  }

  async function seedMembership(
    userId: string,
    orgId: string,
    role: 'student' | 'orgadmin' | 'instructor' = 'student',
  ): Promise<void> {
    await sql`
      INSERT INTO organisation_membership (user_id, organisation_id, role)
      VALUES (${userId}, ${orgId}, ${role})
    `;
  }

  async function seedRankHistoryPass(
    userId: string,
    rankId: string,
    date: string,
    recordedByUserId: string = userId,
  ): Promise<void> {
    await sql`
      INSERT INTO rank_history (id, user_id, rank_id, date, result, source, recorded_by_user_id)
      VALUES (${randomUUID()}, ${userId}, ${rankId}, ${date}, 'pass', 'external', ${recordedByUserId})
    `;
  }

  async function getStatValue(
    scopeType: string,
    scopeId: string,
    metric: string,
    dimensionKey: string,
  ): Promise<number | null> {
    const [row] = await sql<{ value: string }[]>`
      SELECT value FROM stat_current
      WHERE scope_type = ${scopeType} AND scope_id = ${scopeId} AND metric = ${metric} AND dimension_key = ${dimensionKey}
    `;
    return row ? Number(row.value) : null;
  }

  // ── Task 3 seed helpers ──────────────────────────────────────────────────

  /** A `user_content_progress` write (insert), which counts as an "activity" write. */
  async function seedContentProgressWrite(userId: string, techniqueId: string): Promise<void> {
    await sql`
      INSERT INTO technique (id, name_romaji) VALUES (${techniqueId}, ${`Tech-${techniqueId.slice(0, 8)}`})
    `;
    await sql`
      INSERT INTO user_content_progress (user_id, content_type, technique_id, status)
      VALUES (${userId}, 'technique', ${techniqueId}, 'learning')
    `;
  }

  /**
   * A `feedback_thread` + one `feedback_comment` authored by `studentId`,
   * using entity_type='general' (entityId === studentId per the contract).
   * Both count as "activity" writes; the thread also counts toward
   * feedback_threads_opened_month_to_date.
   */
  async function seedFeedbackThreadWithComment(studentId: string): Promise<void> {
    const threadId = randomUUID();
    await sql`
      INSERT INTO feedback_thread (id, entity_type, entity_id, student_id, created_by_user_id)
      VALUES (${threadId}, 'general', ${studentId}, ${studentId}, ${studentId})
    `;
    await sql`
      INSERT INTO feedback_comment (id, thread_id, author_id, body)
      VALUES (${randomUUID()}, ${threadId}, ${studentId}, 'Test comment')
    `;
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  it('rebuild_all() populates rank_count from existing rank_history', async () => {
    const userId = `stats-t1-${randomUUID()}`;
    await seedUser(userId);
    const orgId = await seedOrg();
    await seedMembership(userId, orgId);
    const rankId = await seedBeltRank();
    await seedRankHistoryPass(userId, rankId, '2026-01-01');

    await sql`SELECT rebuild_all()`;

    const value = await getStatValue('organisation', orgId, 'rank_count', rankId);
    expect(value).toBe(1);
  });

  it('inserting a PASS rank_history row increments rank_count on the org + platform', async () => {
    const userId = `stats-t2-${randomUUID()}`;
    await seedUser(userId);
    const orgId = await seedOrg();
    await seedMembership(userId, orgId);
    const rankId = await seedBeltRank();

    await seedRankHistoryPass(userId, rankId, '2026-01-01');

    const orgValue = await getStatValue('organisation', orgId, 'rank_count', rankId);
    const platformValue = await getStatValue('platform', '__platform__', 'rank_count', rankId);
    expect(orgValue).toBe(1);
    expect(platformValue).toBe(1);
  });

  it('a subsequent higher-rank PASS row decrements the previous rank + increments the new one', async () => {
    const userId = `stats-t3-${randomUUID()}`;
    await seedUser(userId);
    const orgId = await seedOrg();
    await seedMembership(userId, orgId);
    const greenRankId = await seedBeltRank();
    const brownRankId = await seedBeltRank();

    await seedRankHistoryPass(userId, greenRankId, '2026-01-01');
    await seedRankHistoryPass(userId, brownRankId, '2026-02-01');

    const greenValue = await getStatValue('organisation', orgId, 'rank_count', greenRankId);
    const brownValue = await getStatValue('organisation', orgId, 'rank_count', brownRankId);
    expect(greenValue ?? 0).toBe(0);
    expect(brownValue).toBe(1);
  });

  it("inserting a membership copies the user's current rank into the org's rank_count", async () => {
    const userId = `stats-t4-${randomUUID()}`;
    await seedUser(userId);
    const rankId = await seedBeltRank();
    await seedRankHistoryPass(userId, rankId, '2026-01-01');
    // No membership yet at this point.

    const orgId = await seedOrg();
    await seedMembership(userId, orgId);

    const value = await getStatValue('organisation', orgId, 'rank_count', rankId);
    expect(value).toBe(1);
  });

  it('deleting a membership removes rank_count + membership_count from the org tree', async () => {
    const userId = `stats-t5-${randomUUID()}`;
    await seedUser(userId);
    const orgId = await seedOrg();
    const rankId = await seedBeltRank();
    await seedRankHistoryPass(userId, rankId, '2026-01-01');
    await seedMembership(userId, orgId);

    const rankBefore = await getStatValue('organisation', orgId, 'rank_count', rankId);
    const membershipBefore = await getStatValue('organisation', orgId, 'membership_count', 'student');
    expect(rankBefore).toBe(1);
    expect(membershipBefore).toBe(1);

    await sql`DELETE FROM organisation_membership WHERE user_id = ${userId} AND organisation_id = ${orgId}`;

    const rankAfter = await getStatValue('organisation', orgId, 'rank_count', rankId);
    const membershipAfter = await getStatValue('organisation', orgId, 'membership_count', 'student');
    expect(rankAfter ?? 0).toBe(0);
    expect(membershipAfter ?? 0).toBe(0);
  });

  it('coverage_pct updates when user_content_progress transitions to competent', async () => {
    const userId = `stats-t6-${randomUUID()}`;
    await seedUser(userId);
    const rankId = await seedBeltRank();
    await seedRankHistoryPass(userId, rankId, '2026-01-01');

    const setId = randomUUID();
    await sql`
      INSERT INTO requirement_set (id, name, effective_date, is_active)
      VALUES (${setId}, 'Coverage Test Set', '2026-01-01', true)
    `;

    // 4 required techniques for this rank in the active set.
    const techniqueIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const techId = randomUUID();
      await sql`
        INSERT INTO technique (id, name_romaji) VALUES (${techId}, ${`Tech-${techId.slice(0, 8)}`})
      `;
      await sql`
        INSERT INTO rank_requirement_technique (id, rank_id, set_id, technique_id)
        VALUES (${randomUUID()}, ${rankId}, ${setId}, ${techId})
      `;
      techniqueIds.push(techId);
    }

    // 2 competent progress rows out of 4 required -> 50%.
    for (const techId of techniqueIds.slice(0, 2)) {
      await sql`
        INSERT INTO user_content_progress (user_id, content_type, technique_id, status)
        VALUES (${userId}, 'technique', ${techId}, 'competent')
      `;
    }

    const value = await getStatValue('user', userId, 'content_coverage_pct', rankId);
    expect(value).toBe(50);
  });

  // ── Multi-membership dedup (fix round 1) ────────────────────────────────
  //
  // A user can hold multiple `organisation_membership` rows whose ancestor
  // chains share a node (e.g. two clubs under the same federation). The
  // shared ancestor's rank_count must reflect DISTINCT users, not one
  // increment per membership row. See apply_rank_delta, rebuild_all()'s
  // org-scope rank_count block, and on_membership_change's rank_count
  // arithmetic in 0033_statistics_triggers.sql.

  it("rebuild_all() dedups a multi-membership user's rank_count at a shared ancestor", async () => {
    const userId = `stats-t7-${randomUUID()}`;
    await seedUser(userId);
    const fedXId = await seedOrg(); // root
    const orgAId = await seedOrg(fedXId);
    const orgBId = await seedOrg(fedXId);
    const rankId = await seedBeltRank();

    await seedRankHistoryPass(userId, rankId, '2026-01-01');
    await seedMembership(userId, orgAId);
    await seedMembership(userId, orgBId);

    await sql`SELECT rebuild_all()`;

    const fedXValue = await getStatValue('organisation', fedXId, 'rank_count', rankId);
    const orgAValue = await getStatValue('organisation', orgAId, 'rank_count', rankId);
    const orgBValue = await getStatValue('organisation', orgBId, 'rank_count', rankId);
    expect(fedXValue).toBe(1);
    expect(orgAValue).toBe(1);
    expect(orgBValue).toBe(1);
  });

  it('inserting a second sibling membership does not double-increment the shared ancestor', async () => {
    const userId = `stats-t8-${randomUUID()}`;
    await seedUser(userId);
    const fedXId = await seedOrg(); // root
    const orgAId = await seedOrg(fedXId);
    const orgBId = await seedOrg(fedXId);
    const rankId = await seedBeltRank();

    await seedRankHistoryPass(userId, rankId, '2026-01-01');
    await seedMembership(userId, orgAId);

    const fedXAfterFirst = await getStatValue('organisation', fedXId, 'rank_count', rankId);
    expect(fedXAfterFirst).toBe(1);

    await seedMembership(userId, orgBId);

    const fedXAfterSecond = await getStatValue('organisation', fedXId, 'rank_count', rankId);
    const orgBValue = await getStatValue('organisation', orgBId, 'rank_count', rankId);
    expect(fedXAfterSecond).toBe(1);
    expect(orgBValue).toBe(1);
  });

  it('deleting one of two sibling memberships keeps the shared ancestor count intact', async () => {
    const userId = `stats-t9-${randomUUID()}`;
    await seedUser(userId);
    const fedXId = await seedOrg(); // root
    const orgAId = await seedOrg(fedXId);
    const orgBId = await seedOrg(fedXId);
    const rankId = await seedBeltRank();

    await seedRankHistoryPass(userId, rankId, '2026-01-01');
    await seedMembership(userId, orgAId);
    await seedMembership(userId, orgBId);

    const fedXBefore = await getStatValue('organisation', fedXId, 'rank_count', rankId);
    expect(fedXBefore).toBe(1);

    await sql`DELETE FROM organisation_membership WHERE user_id = ${userId} AND organisation_id = ${orgAId}`;

    const orgAAfter = await getStatValue('organisation', orgAId, 'rank_count', rankId);
    const orgBAfter = await getStatValue('organisation', orgBId, 'rank_count', rankId);
    const fedXAfter = await getStatValue('organisation', fedXId, 'rank_count', rankId);
    expect(orgAAfter ?? 0).toBe(0);
    expect(orgBAfter).toBe(1);
    expect(fedXAfter).toBe(1);
  });

  // ── Task 3: repository nightly-job methods ──────────────────────────────
  //
  // `refreshActivityStats`, `recomputeAvgGapPerRank`, `captureMonthlyIfNewMonth`
  // aren't trigger-maintained (they depend on a rolling/calendar window, not
  // a row delta), so they're exercised directly through `StatisticsRepository`
  // over a real `DrizzleDb` client — the same entrypoint the nightly job uses.

  describe('StatisticsRepository nightly-job methods', () => {
    let db: DrizzleDb;
    let repo: StatisticsRepository;

    beforeAll(() => {
      const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
      db = createDrizzleClient(url, { allowMultiple: true });
      repo = new StatisticsRepository(db);
    });

    afterAll(async () => {
      await disposeDrizzleClient(db);
    });

    it('refreshActivityStats computes grading_events_month_to_date for org + ancestors + platform', async () => {
      const userId = `stats-t10-${randomUUID()}`;
      await seedUser(userId);
      const fedXId = await seedOrg();
      const orgAId = await seedOrg(fedXId);
      await seedMembership(userId, orgAId);
      const rankId = await seedBeltRank();

      const today = new Date().toISOString().slice(0, 10);
      await seedRankHistoryPass(userId, rankId, today);

      await repo.refreshActivityStats();

      const orgValue = await getStatValue('organisation', orgAId, 'grading_events_month_to_date', '');
      const fedXValue = await getStatValue('organisation', fedXId, 'grading_events_month_to_date', '');
      const platformValue = await getStatValue('platform', '__platform__', 'grading_events_month_to_date', '');
      expect(orgValue).toBe(1);
      expect(fedXValue).toBe(1);
      expect(platformValue).toBeGreaterThanOrEqual(1);
    });

    it('refreshActivityStats dedups a multi-membership user at a shared ancestor for grading_events_month_to_date', async () => {
      const userId = `stats-t11-${randomUUID()}`;
      await seedUser(userId);
      const fedXId = await seedOrg();
      const orgAId = await seedOrg(fedXId);
      const orgBId = await seedOrg(fedXId);
      await seedMembership(userId, orgAId);
      await seedMembership(userId, orgBId);
      const rankId = await seedBeltRank();

      const today = new Date().toISOString().slice(0, 10);
      await seedRankHistoryPass(userId, rankId, today);

      await repo.refreshActivityStats();

      const orgAValue = await getStatValue('organisation', orgAId, 'grading_events_month_to_date', '');
      const orgBValue = await getStatValue('organisation', orgBId, 'grading_events_month_to_date', '');
      const fedXValue = await getStatValue('organisation', fedXId, 'grading_events_month_to_date', '');
      // One grading event; membership in both orgA and orgB (siblings under
      // fedX) must not double-count fedX's total.
      expect(orgAValue).toBe(1);
      expect(orgBValue).toBe(1);
      expect(fedXValue).toBe(1);
    });

    it('refreshActivityStats computes active_users_last_30_days from user_content_progress writes', async () => {
      const userId = `stats-t12-${randomUUID()}`;
      await seedUser(userId);
      const orgId = await seedOrg();
      await seedMembership(userId, orgId);
      await seedContentProgressWrite(userId, randomUUID());

      await repo.refreshActivityStats();

      const orgValue = await getStatValue('organisation', orgId, 'active_users_last_30_days', '');
      const platformValue = await getStatValue('platform', '__platform__', 'active_users_last_30_days', '');
      expect(orgValue).toBe(1);
      expect(platformValue).toBeGreaterThanOrEqual(1);
    });

    it('refreshActivityStats computes feedback_threads_opened_month_to_date via the student’s memberships', async () => {
      const studentId = `stats-t13-${randomUUID()}`;
      await seedUser(studentId);
      const orgId = await seedOrg();
      await seedMembership(studentId, orgId);
      await seedFeedbackThreadWithComment(studentId);

      await repo.refreshActivityStats();

      const orgValue = await getStatValue('organisation', orgId, 'feedback_threads_opened_month_to_date', '');
      const platformValue = await getStatValue(
        'platform',
        '__platform__',
        'feedback_threads_opened_month_to_date',
        '',
      );
      // The comment authored by the student is also an activity write.
      const activeUsersValue = await getStatValue('organisation', orgId, 'active_users_last_30_days', '');
      expect(orgValue).toBe(1);
      expect(platformValue).toBeGreaterThanOrEqual(1);
      expect(activeUsersValue).toBeGreaterThanOrEqual(1);
    });

    it('recomputeAvgGapPerRank computes the average gap between consecutive PASS rows, rolled up to ancestors', async () => {
      const userId = `stats-t14-${randomUUID()}`;
      await seedUser(userId);
      const orgId = await seedOrg();
      await seedMembership(userId, orgId);
      const rankId = await seedBeltRank();

      // 31-day gap: 2026-01-01 -> 2026-02-01.
      await seedRankHistoryPass(userId, rankId, '2026-01-01');
      await seedRankHistoryPass(userId, rankId, '2026-02-01');

      await repo.recomputeAvgGapPerRank();

      const value = await getStatValue('organisation', orgId, 'avg_months_between_ranks', rankId);
      expect(value).not.toBeNull();
      expect(value!).toBeCloseTo(31 / 30.44, 2);
    });

    it('recomputeAvgGapPerRank dedups a multi-membership user at a shared ancestor', async () => {
      const fedXId = await seedOrg();
      const orgAId = await seedOrg(fedXId);
      const orgBId = await seedOrg(fedXId);
      const rankId = await seedBeltRank();

      // User one: single membership in orgA, 31-day gap.
      const userOneId = `stats-t15a-${randomUUID()}`;
      await seedUser(userOneId);
      await seedMembership(userOneId, orgAId);
      await seedRankHistoryPass(userOneId, rankId, '2026-01-01');
      await seedRankHistoryPass(userOneId, rankId, '2026-02-01');

      // User two: memberships in BOTH orgA and orgB (siblings under fedX),
      // 90-day gap. Without dedup, fedX would average this gap in twice
      // (once via orgA's ancestor path, once via orgB's).
      const userTwoId = `stats-t15b-${randomUUID()}`;
      await seedUser(userTwoId);
      await seedMembership(userTwoId, orgAId);
      await seedMembership(userTwoId, orgBId);
      await seedRankHistoryPass(userTwoId, rankId, '2026-01-01');
      await seedRankHistoryPass(userTwoId, rankId, '2026-04-01');

      await repo.recomputeAvgGapPerRank();

      const gapOne = 31 / 30.44;
      const gapTwo = 90 / 30.44;
      const orgAValue = await getStatValue('organisation', orgAId, 'avg_months_between_ranks', rankId);
      const orgBValue = await getStatValue('organisation', orgBId, 'avg_months_between_ranks', rankId);
      const fedXValue = await getStatValue('organisation', fedXId, 'avg_months_between_ranks', rankId);

      // orgA: userOne + userTwo -> average of the two gaps.
      expect(orgAValue!).toBeCloseTo((gapOne + gapTwo) / 2, 2);
      // orgB: userTwo only.
      expect(orgBValue!).toBeCloseTo(gapTwo, 2);
      // fedX (shared ancestor): must equal orgA's two-distinct-user average,
      // NOT a 3-row average that double-counts userTwo's gap.
      expect(fedXValue!).toBeCloseTo((gapOne + gapTwo) / 2, 2);
    });

    it('captureMonthlyIfNewMonth snapshots stat_current into stat_snapshot_monthly for the previous month, once', async () => {
      const userId = `stats-t16-${randomUUID()}`;
      await seedUser(userId);
      const orgId = await seedOrg();
      await seedMembership(userId, orgId);
      const rankId = await seedBeltRank();
      await seedRankHistoryPass(userId, rankId, '2026-01-01');

      const currentValue = await getStatValue('organisation', orgId, 'rank_count', rankId);
      expect(currentValue).toBe(1);

      const first = await repo.captureMonthlyIfNewMonth();
      expect(first.captured).toBe(true);
      expect(first.year).toBeGreaterThan(2000);
      expect(first.month).toBeGreaterThanOrEqual(1);
      expect(first.month).toBeLessThanOrEqual(12);

      const [snapshotRow] = await sql<{ value: string }[]>`
        SELECT value FROM stat_snapshot_monthly
        WHERE scope_type = 'organisation' AND scope_id = ${orgId}
          AND metric = 'rank_count' AND dimension_key = ${rankId}
          AND year = ${first.year!} AND month = ${first.month!}
      `;
      expect(snapshotRow).toBeDefined();
      expect(Number(snapshotRow!.value)).toBe(1);

      // Already captured this month -> no-op the second time.
      const second = await repo.captureMonthlyIfNewMonth();
      expect(second.captured).toBe(false);
      expect(second.year).toBeUndefined();
      expect(second.month).toBeUndefined();
    });
  });
});
