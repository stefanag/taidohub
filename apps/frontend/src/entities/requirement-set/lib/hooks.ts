import type {
  CloneRequirementSetInput,
  CreateRequirementSetInput,
  UpdateRequirementSetInput,
} from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/requirement-set.api.js';

/**
 * React Query hooks for the RequirementSet module.
 *
 * Query keys are namespaced under `requirementSetKeys.all` so a single
 * `invalidateQueries({ queryKey: requirementSetKeys.all })` after a mutation
 * refetches both the list and any by-id variants in one shot.
 */
export const requirementSetKeys = {
  all: ['requirementSet'] as const,
  list: () => ['requirementSet', 'list'] as const,
  byId: (id: string) => ['requirementSet', 'byId', id] as const,
};

export function useRequirementSetsQuery() {
  return useQuery({
    queryKey: requirementSetKeys.list(),
    queryFn: () => api.getRequirementSets(),
  });
}

export function useRequirementSetQuery(id: string | null) {
  return useQuery({
    queryKey: requirementSetKeys.byId(id ?? ''),
    queryFn: () => api.getRequirementSetById(id!),
    enabled: !!id,
  });
}

export function useCreateRequirementSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequirementSetInput) => api.createRequirementSet(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requirementSetKeys.all });
    },
  });
}

export function useUpdateRequirementSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRequirementSetInput }) =>
      api.updateRequirementSet(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requirementSetKeys.all });
    },
  });
}

export function useDeleteRequirementSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRequirementSet(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requirementSetKeys.all });
    },
  });
}

export function useActivateRequirementSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activateRequirementSet(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requirementSetKeys.all });
    },
  });
}

export function useDeactivateRequirementSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deactivateRequirementSet(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requirementSetKeys.all });
    },
  });
}

export function useCloneRequirementSetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CloneRequirementSetInput }) =>
      api.cloneRequirementSet(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requirementSetKeys.all });
    },
  });
}
