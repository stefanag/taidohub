import type {
  ContentType,
  UpsertProgressInput,
} from '@repo/contracts/progress';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/progress.api.js';

/**
 * React Query hooks for the Progress module.
 *
 * Query keys are namespaced under `['progress', ...]` so a single
 * `invalidateQueries({ queryKey: ['progress'] })` after any mutation refetches
 * list + by-technique + by-pattern variants in one shot.
 */
export const progressKeys = {
  list: (contentType?: ContentType) =>
    ['progress', 'list', contentType ?? 'all'] as const,
  byTechnique: (id: string) => ['progress', 'technique', id] as const,
  byPattern: (id: string) => ['progress', 'pattern', id] as const,
};

export function useProgressListQuery(
  contentType?: ContentType,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: progressKeys.list(contentType),
    queryFn: () => api.getProgressList(contentType),
    enabled: options?.enabled ?? true,
  });
}

export function useTechniqueProgressQuery(id: string | null) {
  return useQuery({
    queryKey: progressKeys.byTechnique(id ?? ''),
    queryFn: () => api.getTechniqueProgress(id!),
    enabled: !!id,
  });
}

export function usePatternProgressQuery(id: string | null) {
  return useQuery({
    queryKey: progressKeys.byPattern(id ?? ''),
    queryFn: () => api.getPatternProgress(id!),
    enabled: !!id,
  });
}

export function useUpsertTechniqueProgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertProgressInput }) =>
      api.upsertTechniqueProgress(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useUpsertPatternProgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertProgressInput }) =>
      api.upsertPatternProgress(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useDeleteTechniqueProgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTechniqueProgress(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useDeletePatternProgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePatternProgress(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
