import type {
  CreateTechniqueInput,
  UpdateTechniqueInput,
} from '@repo/contracts/techniques';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/technique.api.js';

/**
 * React Query hooks for the Technique module.
 *
 * Query keys are namespaced under `['technique', ...]` so a single
 * `invalidateQueries({ queryKey: ['technique'] })` after a mutation refetches
 * both list and by-id variants in one shot. The list key includes a stable
 * sorted join of the filter ids so filter permutations cache independently.
 */
export const techniqueKeys = {
  list: (filterIds: string[]) =>
    ['technique', 'list', filterIds.slice().sort().join(',')] as const,
  byId: (id: string) => ['technique', 'byId', id] as const,
};

export function useTechniquesQuery(filterIds: string[] = []) {
  return useQuery({
    queryKey: techniqueKeys.list(filterIds),
    queryFn: () => api.getTechniques({ classificationIds: filterIds }),
  });
}

export function useTechniqueQuery(id: string | null) {
  return useQuery({
    queryKey: techniqueKeys.byId(id ?? ''),
    queryFn: () => api.getTechnique(id!),
    enabled: !!id,
  });
}

export function useCreateTechniqueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTechniqueInput) => api.createTechnique(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['technique'] });
    },
  });
}

export function useUpdateTechniqueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTechniqueInput }) =>
      api.updateTechnique(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['technique'] });
    },
  });
}

export function useDeleteTechniqueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTechnique(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['technique'] });
    },
  });
}
