import {
  OrganisationStatsSchema,
  PlatformStatsSchema,
  RebuildStatsResponseSchema,
  StatsTrendResponseSchema,
  UserStatsSchema,
  type OrganisationStats,
  type PlatformStats,
  type RebuildStatsResponse,
  type StatsTrendQuery,
  type StatsTrendResponse,
  type UserStats,
} from '@repo/contracts/statistics';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Statistics module.
 *
 * Every response is parsed with the Zod schemas from
 * `@repo/contracts/statistics` so the frontend cannot drift away from the
 * backend's actual response shape.
 *
 * - `GET  /api/statistics/platform`                       — platform-wide rollup.
 * - `GET  /api/statistics/organisation/:id`                — single-org rollup.
 * - `GET  /api/statistics/organisation/:id/trends`         — single-org monthly trend series.
 * - `GET  /api/statistics/user/:id`                        — single-user rank coverage.
 * - `GET  /api/statistics/user/:id/trends`                 — single-user monthly trend series.
 * - `POST /api/admin/statistics/rebuild`                   — sysadmin-only forced rebuild.
 */

function buildTrendQuery(query: StatsTrendQuery): string {
  const params = new URLSearchParams();
  params.set('metric', query.metric);
  if (query.dimensionKey !== undefined) params.set('dimensionKey', query.dimensionKey);
  if (query.months !== undefined) params.set('months', String(query.months));
  return params.toString();
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const raw = await httpClient('/api/statistics/platform');
  return PlatformStatsSchema.parse(raw);
}

export async function getOrganisationStats(orgId: string): Promise<OrganisationStats> {
  const raw = await httpClient(`/api/statistics/organisation/${orgId}`);
  return OrganisationStatsSchema.parse(raw);
}

export async function getOrganisationTrends(
  orgId: string,
  query: StatsTrendQuery,
): Promise<StatsTrendResponse> {
  const raw = await httpClient(
    `/api/statistics/organisation/${orgId}/trends?${buildTrendQuery(query)}`,
  );
  return StatsTrendResponseSchema.parse(raw);
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const raw = await httpClient(`/api/statistics/user/${userId}`);
  return UserStatsSchema.parse(raw);
}

export async function getUserTrends(
  userId: string,
  query: StatsTrendQuery,
): Promise<StatsTrendResponse> {
  const raw = await httpClient(`/api/statistics/user/${userId}/trends?${buildTrendQuery(query)}`);
  return StatsTrendResponseSchema.parse(raw);
}

export async function rebuildStats(): Promise<RebuildStatsResponse> {
  const raw = await httpClient('/api/admin/statistics/rebuild', { method: 'POST' });
  return RebuildStatsResponseSchema.parse(raw);
}
