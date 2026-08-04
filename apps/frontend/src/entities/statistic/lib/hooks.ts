import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { StatsTrendQuery } from '@repo/contracts/statistics';

import * as api from '../api/statistics.api.js';

/**
 * React Query hooks for the Statistics module.
 *
 * Query keys are namespaced under `['statistics', ...]` so a coarse
 * `invalidateQueries({ queryKey: statisticsKeys.all })` after a rebuild
 * sweeps every cached platform/organisation/user/trend variant.
 */
export const statisticsKeys = {
  all: ['statistics'] as const,
  platform: () => [...statisticsKeys.all, 'platform'] as const,
  organisation: (orgId: string) => [...statisticsKeys.all, 'organisation', orgId] as const,
  organisationTrends: (orgId: string, q: StatsTrendQuery) =>
    [...statisticsKeys.all, 'organisation', orgId, 'trends', q] as const,
  user: (userId: string) => [...statisticsKeys.all, 'user', userId] as const,
  userTrends: (userId: string, q: StatsTrendQuery) =>
    [...statisticsKeys.all, 'user', userId, 'trends', q] as const,
};

export function usePlatformStatsQuery() {
  return useQuery({
    queryKey: statisticsKeys.platform(),
    queryFn: () => api.getPlatformStats(),
  });
}

export function useOrganisationStatsQuery(orgId: string) {
  return useQuery({
    queryKey: statisticsKeys.organisation(orgId),
    queryFn: () => api.getOrganisationStats(orgId),
  });
}

export function useOrganisationTrendsQuery(orgId: string, q: StatsTrendQuery) {
  return useQuery({
    queryKey: statisticsKeys.organisationTrends(orgId, q),
    queryFn: () => api.getOrganisationTrends(orgId, q),
  });
}

export function useUserStatsQuery(userId: string) {
  return useQuery({
    queryKey: statisticsKeys.user(userId),
    queryFn: () => api.getUserStats(userId),
  });
}

export function useUserTrendsQuery(
  userId: string,
  q: StatsTrendQuery,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: statisticsKeys.userTrends(userId, q),
    queryFn: () => api.getUserTrends(userId, q),
    enabled,
  });
}

export function useRebuildStatsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.rebuildStats(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: statisticsKeys.all });
    },
  });
}
