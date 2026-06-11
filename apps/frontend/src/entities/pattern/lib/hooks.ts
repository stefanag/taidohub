import type {
  CreatePatternInput,
  UpdatePatternInput,
} from '@repo/contracts/patterns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/pattern.api.js';

/**
 * React Query hooks for the Pattern module.
 *
 * Query keys are namespaced under `['pattern', ...]` so a single
 * `invalidateQueries({ queryKey: ['pattern'] })` after a mutation refetches
 * both list and by-id variants in one shot. The list key includes a stable
 * sorted join of the filter ids so filter permutations cache independently.
 */
export const patternKeys = {
  list: (filterIds: string[]) =>
    ['pattern', 'list', filterIds.slice().sort().join(',')] as const,
  byId: (id: string) => ['pattern', 'byId', id] as const,
};

export function usePatternsQuery(filterIds: string[] = []) {
  return useQuery({
    queryKey: patternKeys.list(filterIds),
    queryFn: () => api.getPatterns({ classificationIds: filterIds }),
  });
}

export function usePatternQuery(id: string | null) {
  return useQuery({
    queryKey: patternKeys.byId(id ?? ''),
    queryFn: () => api.getPattern(id!),
    enabled: !!id,
  });
}

export function useCreatePatternMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePatternInput) => api.createPattern(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pattern'] });
    },
  });
}

export function useUpdatePatternMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePatternInput }) =>
      api.updatePattern(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pattern'] });
    },
  });
}

export function useDeletePatternMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePattern(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pattern'] });
    },
  });
}
