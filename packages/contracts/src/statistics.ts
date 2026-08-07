import { z } from 'zod';

/** A single row in the platform/organisation "ranks" list. */
export const StatsRankRowSchema = z
  .object({
    rank: z.object({
      id: z.string().uuid(),
      nameRomaji: z.string(),
      nameEn: z.string(),
      sortOrder: z.number().int().nonnegative(),
    }),
    count: z.number().int().nonnegative(),
  })
  .meta({ id: 'StatsRankRow' });

export const StatsScopeSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('platform') }),
    z.object({ type: z.literal('organisation'), id: z.string().uuid(), name: z.string() }),
    z.object({ type: z.literal('user'), id: z.string(), name: z.string().nullable() }),
  ])
  .meta({ id: 'StatsScope' });

export const StatsMembershipCountsSchema = z
  .object({
    student: z.number().int().nonnegative(),
    instructor: z.number().int().nonnegative(),
    orgadmin: z.number().int().nonnegative(),
  })
  .meta({ id: 'StatsMembershipCounts' });

/** Platform + Organisation share the same structural shape. */
const OrgMetricsShape = z.object({
  membershipCount: StatsMembershipCountsSchema,
  gradingEventsMonthToDate: z.number().int().nonnegative(),
  activeUsersLast30Days: z.number().int().nonnegative(),
  feedbackThreadsOpenedMonthToDate: z.number().int().nonnegative(),
});

export const PlatformStatsSchema = z
  .object({
    scope: z.object({ type: z.literal('platform') }),
    metrics: OrgMetricsShape,
    ranks: StatsRankRowSchema.array(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'PlatformStats' });

export const OrganisationStatsSchema = z
  .object({
    scope: z.object({ type: z.literal('organisation'), id: z.string().uuid(), name: z.string() }),
    metrics: OrgMetricsShape,
    ranks: StatsRankRowSchema.array(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'OrganisationStats' });

/** User scope: coverage % per rank + per-rank progression summary. */
export const UserStatsRankCoverageSchema = z
  .object({
    rank: z.object({
      id: z.string().uuid(),
      nameRomaji: z.string(),
      nameEn: z.string(),
      sortOrder: z.number().int().nonnegative(),
    }),
    /** 0..100. */
    coveragePct: z.number().min(0).max(100),
  })
  .meta({ id: 'UserStatsRankCoverage' });

export const UserStatsSchema = z
  .object({
    scope: z.object({ type: z.literal('user'), id: z.string(), name: z.string().nullable() }),
    coverageByRank: UserStatsRankCoverageSchema.array(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'UserStats' });

export const StatsTrendPointSchema = z
  .object({
    year: z.number().int().min(2000).max(9999),
    month: z.number().int().min(1).max(12),
    value: z.number(),
  })
  .meta({ id: 'StatsTrendPoint' });

export const StatsTrendResponseSchema = z
  .object({
    metric: z.string(),
    dimensionKey: z.string(),
    points: StatsTrendPointSchema.array(),
  })
  .meta({ id: 'StatsTrendResponse' });

export const StatsTrendQuerySchema = z
  .object({
    metric: z.string().min(1),
    dimensionKey: z.string().default(''),
    months: z.coerce.number().int().min(1).max(60).default(12),
  })
  .meta({ id: 'StatsTrendQuery' });

export const RebuildStatsResponseSchema = z
  .object({ ok: z.literal(true), durationMs: z.number().int().nonnegative() })
  .meta({ id: 'RebuildStatsResponse' });

export type StatsRankRow = z.infer<typeof StatsRankRowSchema>;
export type StatsScope = z.infer<typeof StatsScopeSchema>;
export type StatsMembershipCounts = z.infer<typeof StatsMembershipCountsSchema>;
export type PlatformStats = z.infer<typeof PlatformStatsSchema>;
export type OrganisationStats = z.infer<typeof OrganisationStatsSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
/** Convenience type for a single row of UserStats.coverageByRank. */
export type UserStatsRankCoverage = z.infer<typeof UserStatsRankCoverageSchema>;
export type StatsTrendPoint = z.infer<typeof StatsTrendPointSchema>;
export type StatsTrendResponse = z.infer<typeof StatsTrendResponseSchema>;
export type StatsTrendQuery = z.input<typeof StatsTrendQuerySchema>;
export type RebuildStatsResponse = z.infer<typeof RebuildStatsResponseSchema>;

/** Canonical metric names used across the wire. Snake_case matches how the
 *  SQL layer stores them in stat_current.metric and stat_snapshot_monthly.metric. */
export const STAT_METRICS = {
  rankCount: 'rank_count',
  membershipCount: 'membership_count',
  contentCoveragePct: 'content_coverage_pct',
  gradingEventsMonthToDate: 'grading_events_month_to_date',
  avgMonthsBetweenRanks: 'avg_months_between_ranks',
  activeUsersLast30Days: 'active_users_last_30_days',
  feedbackThreadsOpenedMonthToDate: 'feedback_threads_opened_month_to_date',
} as const;

export const StatisticsOpenApiRegistry = {
  StatsRankRow: StatsRankRowSchema,
  StatsScope: StatsScopeSchema,
  StatsMembershipCounts: StatsMembershipCountsSchema,
  PlatformStats: PlatformStatsSchema,
  OrganisationStats: OrganisationStatsSchema,
  UserStatsRankCoverage: UserStatsRankCoverageSchema,
  UserStats: UserStatsSchema,
  StatsTrendPoint: StatsTrendPointSchema,
  StatsTrendResponse: StatsTrendResponseSchema,
  RebuildStatsResponse: RebuildStatsResponseSchema,
} as const;
