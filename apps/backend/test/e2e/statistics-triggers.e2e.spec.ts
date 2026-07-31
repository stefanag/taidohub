/**
 * e2e suite for the statistics triggers + `rebuild_all()` shipped in
 * migration `0033_statistics_triggers.sql` (Task 2 of the statistics
 * implementation plan).
 *
 * Uses the raw `postgres` client directly against the docker-compose e2e
 * Postgres (see `apps/backend/docker-compose.e2e.yml`) rather than going
 * through the Nest app / Drizzle ORM — the thing under test is DB-level
 * trigger behaviour, not application code.
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
});
