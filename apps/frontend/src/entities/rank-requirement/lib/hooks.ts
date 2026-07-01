import type { SetGradingRequirementsInput } from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/rank-requirement.api.js';

/**
 * React Query hooks for the RankRequirement module.
 *
 * Query keys are namespaced under `rankRequirementKeys.all` so a single
 * `invalidateQueries({ queryKey: rankRequirementKeys.all })` after a mutation
 * refetches the actor, per-user, and per-set read variants in one shot.
 */
export const rankRequirementKeys = {
  all: ['rankRequirement'] as const,
  forActor: (rankId: string) => ['rankRequirement', 'actor', rankId] as const,
  forUser: (rankId: string, userId: string) =>
    ['rankRequirement', 'user', rankId, userId] as const,
  forSet: (rankId: string, setId: string) => ['rankRequirement', 'set', rankId, setId] as const,
};

export function useRequirementsQuery(rankId: string | null) {
  return useQuery({
    queryKey: rankRequirementKeys.forActor(rankId ?? ''),
    queryFn: () => api.getRequirements(rankId!),
    enabled: !!rankId,
  });
}

export function useRequirementsForUserQuery(rankId: string | null, userId: string | null) {
  return useQuery({
    queryKey: rankRequirementKeys.forUser(rankId ?? '', userId ?? ''),
    queryFn: () => api.getRequirementsForUser(rankId!, userId!),
    enabled: !!rankId && !!userId,
  });
}

export function useRequirementsForSetQuery(rankId: string | null, setId: string | null) {
  return useQuery({
    queryKey: rankRequirementKeys.forSet(rankId ?? '', setId ?? ''),
    queryFn: () => api.getRequirementsForSet(rankId!, setId!),
    enabled: !!rankId && !!setId,
  });
}

export function useSetRequirementsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rankId, body }: { rankId: string; body: SetGradingRequirementsInput }) =>
      api.setRequirements(rankId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rankRequirementKeys.all });
    },
  });
}

export function useClearRequirementsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rankId, setId }: { rankId: string; setId: string }) =>
      api.clearRequirements(rankId, setId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rankRequirementKeys.all });
    },
  });
}
