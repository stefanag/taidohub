import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { statCurrent, statSnapshotMonthly } from '../../infrastructure/database/schema/statistics.js';

/**
 * Internal shapes; the service maps these to the wire contract via `toApi()`.
 * Only this file (and the service that consumes it) knows about them.
 */
export interface OrgOrPlatformStatsRaw {
  metrics: {
    membershipCount: { student: number; instructor: number; orgadmin: number };
    gradingEventsMonthToDate: number;
    activeUsersLast30Days: number;
    feedbackThreadsOpenedMonthToDate: number;
  };
  ranks: Array<{ rankId: string; count: number }>;
  updatedAt: Date;
}

export interface UserStatsRaw {
  coverageByRank: Array<{ rankId: string; coveragePct: number }>;
  updatedAt: Date;
}

/**
 * Repository — the only file that touches `stat_current` / `stat_snapshot_monthly`.
 * The nightly-job methods (`rebuildAll`, `refreshActivityStats`,
 * `recomputeAvgGapPerRank`, `captureMonthlyIfNewMonth`) call the SQL
 * functions / raw SQL shipped in migration `0033_statistics_triggers.sql`
 * (Task 2). Table/column names below match the REAL schema, not the
 * original brief's assumed names — see that migration's header comments
 * for the full deviation list (organisations.parent_id not
 * parent_organisation_id, functions unqualified in `public` not
 * `statistics.*`, user_content_progress.technique_id/pattern_id not
 * entity_id, rank_requirement_technique/pattern.set_id with no
 * intermediate rank_requirement table).
 */
@Injectable()
export class StatisticsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getPlatform(): Promise<OrgOrPlatformStatsRaw> {
    return this.getOrgOrPlatform('platform', '__platform__');
  }

  async getOrganisation(orgId: string): Promise<OrgOrPlatformStatsRaw | null> {
    const rows = await this.db
      .select()
      .from(statCurrent)
      .where(and(eq(statCurrent.scopeType, 'organisation'), eq(statCurrent.scopeId, orgId)))
      .limit(1);
    if (rows.length === 0) return null;
    return this.getOrgOrPlatform('organisation', orgId);
  }

  private async getOrgOrPlatform(
    scopeType: 'platform' | 'organisation',
    scopeId: string,
  ): Promise<OrgOrPlatformStatsRaw> {
    const rows = await this.db
      .select()
      .from(statCurrent)
      .where(and(eq(statCurrent.scopeType, scopeType), eq(statCurrent.scopeId, scopeId)));

    const metrics: OrgOrPlatformStatsRaw['metrics'] = {
      membershipCount: { student: 0, instructor: 0, orgadmin: 0 },
      gradingEventsMonthToDate: 0,
      activeUsersLast30Days: 0,
      feedbackThreadsOpenedMonthToDate: 0,
    };
    const ranks: Array<{ rankId: string; count: number }> = [];
    let updatedAt = new Date(0);

    for (const r of rows) {
      if (r.updatedAt > updatedAt) updatedAt = r.updatedAt;
      const n = Number(r.value);
      if (r.metric === 'membership_count') {
        const role = r.dimensionKey as 'student' | 'instructor' | 'orgadmin';
        if (role in metrics.membershipCount) metrics.membershipCount[role] = n;
      } else if (r.metric === 'rank_count') {
        ranks.push({ rankId: r.dimensionKey, count: n });
      } else if (r.metric === 'grading_events_month_to_date') {
        metrics.gradingEventsMonthToDate = n;
      } else if (r.metric === 'active_users_last_30_days') {
        metrics.activeUsersLast30Days = n;
      } else if (r.metric === 'feedback_threads_opened_month_to_date') {
        metrics.feedbackThreadsOpenedMonthToDate = n;
      }
    }

    return { metrics, ranks, updatedAt };
  }

  async getUser(userId: string): Promise<UserStatsRaw> {
    const rows = await this.db
      .select()
      .from(statCurrent)
      .where(
        and(
          eq(statCurrent.scopeType, 'user'),
          eq(statCurrent.scopeId, userId),
          eq(statCurrent.metric, 'content_coverage_pct'),
        ),
      );

    const coverageByRank = rows.map((r) => ({
      rankId: r.dimensionKey,
      coveragePct: Number(r.value),
    }));
    const updatedAt = rows.reduce<Date>((acc, r) => (r.updatedAt > acc ? r.updatedAt : acc), new Date(0));
    return { coverageByRank, updatedAt };
  }

  async getTrends(
    scope: { type: 'platform' | 'organisation' | 'user'; id: string },
    metric: string,
    dimensionKey: string,
    months: number,
  ): Promise<Array<{ year: number; month: number; value: number }>> {
    const rows = await this.db
      .select({
        year: statSnapshotMonthly.year,
        month: statSnapshotMonthly.month,
        value: statSnapshotMonthly.value,
      })
      .from(statSnapshotMonthly)
      .where(
        and(
          eq(statSnapshotMonthly.scopeType, scope.type),
          eq(statSnapshotMonthly.scopeId, scope.id),
          eq(statSnapshotMonthly.metric, metric),
          eq(statSnapshotMonthly.dimensionKey, dimensionKey),
        ),
      )
      .orderBy(desc(statSnapshotMonthly.year), desc(statSnapshotMonthly.month))
      .limit(months);

    return rows
      .map((r) => ({ year: r.year, month: r.month, value: Number(r.value) }))
      .reverse();
  }

  async rebuildAll(executor: DrizzleExecutor = this.db): Promise<{ durationMs: number }> {
    const t0 = Date.now();
    await executor.execute(sql`SELECT rebuild_all()`);
    return { durationMs: Date.now() - t0 };
  }

  /**
   * Recomputes the three "activity" metrics that aren't maintained by
   * triggers (they depend on a rolling/calendar window, not a row delta):
   * `grading_events_month_to_date`, `active_users_last_30_days`,
   * `feedback_threads_opened_month_to_date`. Each metric writes an
   * organisation-scoped row per (org + every ancestor, via
   * `statistics_org_and_ancestors`) plus one platform-scoped row.
   *
   * Dedup: a user (or event) reachable via two sibling memberships must not
   * be double-counted at their shared ancestor — same class of bug fixed in
   * Task 2's `apply_rank_delta`/`rebuild_all`. Each query below routes
   * through a `DISTINCT` subquery keyed on (row identity, ancestor) before
   * aggregating, so a shared ancestor counts each row/user once regardless
   * of how many memberships route to it.
   *
   * Orgs with nothing to aggregate simply get no row written this pass
   * (existing rows aren't cleared either — `stat_current` isn't reset here,
   * unlike `rebuild_all()`). The service maps a missing metric to 0.
   */
  async refreshActivityStats(executor: DrizzleExecutor = this.db): Promise<void> {
    // ── grading_events_month_to_date ──────────────────────────────────────
    await executor.execute(sql`
      WITH events AS (
        SELECT id, user_id
        FROM rank_history
        WHERE result = 'pass'
          AND date_trunc('month', date::timestamp) = date_trunc('month', now())
      ),
      rolled AS (
        SELECT DISTINCT e.id AS event_id, a.organisation_id::text AS scope_id
        FROM events e
        JOIN organisation_membership m ON m.user_id = e.user_id
        JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
      )
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', scope_id, 'grading_events_month_to_date', '', COUNT(*), now()
      FROM rolled
      GROUP BY scope_id
      UNION ALL
      SELECT 'platform', '__platform__', 'grading_events_month_to_date', '', COUNT(*), now()
      FROM events
      HAVING COUNT(*) > 0
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `);

    // ── active_users_last_30_days ─────────────────────────────────────────
    // "Active" = at least one write in the last 30 days across rank_history
    // (created_at or updated_at), user_content_progress (updated_at, which
    // defaultNow()s on insert too), or feedback_comment (created_at, via
    // the comment's author).
    await executor.execute(sql`
      WITH active_users AS (
        SELECT DISTINCT user_id FROM (
          SELECT user_id FROM rank_history
          WHERE created_at >= now() - INTERVAL '30 days'
             OR (updated_at IS NOT NULL AND updated_at >= now() - INTERVAL '30 days')
          UNION
          SELECT user_id FROM user_content_progress
          WHERE updated_at >= now() - INTERVAL '30 days'
          UNION
          SELECT author_id AS user_id FROM feedback_comment
          WHERE created_at >= now() - INTERVAL '30 days'
        ) u
      ),
      rolled AS (
        SELECT DISTINCT au.user_id, a.organisation_id::text AS scope_id
        FROM active_users au
        JOIN organisation_membership m ON m.user_id = au.user_id
        JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
      )
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', scope_id, 'active_users_last_30_days', '', COUNT(*), now()
      FROM rolled
      GROUP BY scope_id
      UNION ALL
      SELECT 'platform', '__platform__', 'active_users_last_30_days', '', COUNT(*), now()
      FROM active_users
      HAVING COUNT(*) > 0
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `);

    // ── feedback_threads_opened_month_to_date ─────────────────────────────
    // Org association is via the thread's student's memberships (a thread
    // has no organisation_id of its own).
    await executor.execute(sql`
      WITH threads AS (
        SELECT id, student_id
        FROM feedback_thread
        WHERE date_trunc('month', created_at) = date_trunc('month', now())
      ),
      rolled AS (
        SELECT DISTINCT t.id AS thread_id, a.organisation_id::text AS scope_id
        FROM threads t
        JOIN organisation_membership m ON m.user_id = t.student_id
        JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
      )
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', scope_id, 'feedback_threads_opened_month_to_date', '', COUNT(*), now()
      FROM rolled
      GROUP BY scope_id
      UNION ALL
      SELECT 'platform', '__platform__', 'feedback_threads_opened_month_to_date', '', COUNT(*), now()
      FROM threads
      HAVING COUNT(*) > 0
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `);
  }

  /**
   * Recomputes `avg_months_between_ranks` (dimension key = rank id) per
   * organisation (+ ancestors). For each PASS `rank_history` row, the "gap"
   * is the time since that user's previous PASS row.
   *
   * Same multi-membership dedup caution as `apply_rank_delta`: a user with
   * two memberships whose ancestor chains share a node must contribute
   * their gap once at that shared ancestor, not once per membership. The
   * `rolled` CTE below is a `DISTINCT` over (user_id, rank_id,
   * organisation_id, prev_date, rh_date) before the `AVG(...)
   * GROUP BY (organisation_id, rank_id)`, so a shared ancestor only ever
   * sees one row per (user, rank, gap).
   */
  async recomputeAvgGapPerRank(executor: DrizzleExecutor = this.db): Promise<void> {
    await executor.execute(sql`
      WITH gaps AS (
        SELECT rh.user_id, rh.rank_id, rh.date AS rh_date, prev.date AS prev_date
        FROM rank_history rh
        JOIN LATERAL (
          SELECT date FROM rank_history p
          WHERE p.user_id = rh.user_id AND p.result = 'pass' AND p.date < rh.date
          ORDER BY p.date DESC LIMIT 1
        ) prev ON true
        WHERE rh.result = 'pass'
      ),
      rolled AS (
        SELECT DISTINCT g.user_id, g.rank_id, a.organisation_id, g.prev_date, g.rh_date
        FROM gaps g
        JOIN organisation_membership m ON m.user_id = g.user_id
        JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
      )
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT
        'organisation', organisation_id::text, 'avg_months_between_ranks',
        rank_id::text,
        AVG(EXTRACT(EPOCH FROM (rh_date::timestamp - prev_date::timestamp)) / (60 * 60 * 24 * 30.44)),
        now()
      FROM rolled
      GROUP BY organisation_id, rank_id
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `);
  }

  /**
   * Snapshots every current `stat_current` row into `stat_snapshot_monthly`
   * under the previous calendar month ("closing month"), exactly once per
   * month. Idempotent: a second call in the same month is a no-op because
   * the existence check keys on (year, month) already present.
   *
   * Deviation from the brief: the brief computed the returned {year, month}
   * client-side via `new Date()`. That risks disagreeing with the DB's
   * `now()` (different clock/timezone between the Node process and
   * Postgres) even though the actual INSERT is computed in SQL. Instead we
   * read {year, month} back from the same `now() - INTERVAL '1 month'`
   * expression used for the write, so the returned value can never drift
   * from what was persisted.
   *
   * The INSERT carries `ON CONFLICT (scope_type, scope_id, metric,
   * dimension_key, year, month) DO NOTHING`, matching the table's composite
   * PK. The pre-INSERT existence check above is the primary defence against
   * re-entry; the `ON CONFLICT` clause is belt-and-braces for the
   * hypothetical case of two nodes running the cron concurrently and both
   * passing the guard before either commits — without it, that race would
   * PK-violate and abort the whole nightly run instead of silently no-oping.
   */
  async captureMonthlyIfNewMonth(
    executor: DrizzleExecutor = this.db,
  ): Promise<{ captured: boolean; year?: number; month?: number }> {
    const existingRows = await executor.execute<{ existing: number }>(sql`
      SELECT COUNT(*)::int AS existing FROM stat_snapshot_monthly
      WHERE year = EXTRACT(YEAR FROM (now() - INTERVAL '1 month'))::smallint
        AND month = EXTRACT(MONTH FROM (now() - INTERVAL '1 month'))::smallint
      LIMIT 1
    `);
    const existing = Number(existingRows[0]?.existing ?? 0);
    if (existing > 0) return { captured: false };

    await executor.execute(sql`
      INSERT INTO stat_snapshot_monthly (scope_type, scope_id, metric, dimension_key, year, month, value)
      SELECT scope_type, scope_id, metric, dimension_key,
             EXTRACT(YEAR FROM (now() - INTERVAL '1 month'))::smallint,
             EXTRACT(MONTH FROM (now() - INTERVAL '1 month'))::smallint,
             value
      FROM stat_current
      ON CONFLICT (scope_type, scope_id, metric, dimension_key, year, month) DO NOTHING
    `);

    const targetRows = await executor.execute<{ year: number; month: number }>(sql`
      SELECT EXTRACT(YEAR FROM (now() - INTERVAL '1 month'))::smallint AS year,
             EXTRACT(MONTH FROM (now() - INTERVAL '1 month'))::smallint AS month
    `);
    const target = targetRows[0];
    if (!target) throw new Error('captureMonthlyIfNewMonth: target-month query returned no rows');
    return { captured: true, year: target.year, month: target.month };
  }
}
