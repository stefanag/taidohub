import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  TaggableType,
  UpdateCategoryInput,
  UpdateTagInput,
} from '@repo/contracts/labels';

import * as api from '../api/labels.api.js';

/**
 * React Query hooks for the Labels module.
 *
 * Query keys are namespaced under `['labels', ...]` so a single
 * `invalidateQueries({ queryKey: ['labels', 'attachments'] })` will sweep all
 * per-target attachment caches when a detach happens (we don't know which
 * target the attachment belonged to without an extra fetch).
 */
export const labelsKeys = {
  all: ['labels'] as const,
  tags: ['labels', 'tags'] as const,
  categories: ['labels', 'categories'] as const,
  attachments: (targetType: string, targetId: string) =>
    ['labels', 'attachments', targetType, targetId] as const,
};

export function useTagsQuery() {
  return useQuery({ queryKey: labelsKeys.tags, queryFn: api.getTags });
}

export function useCategoriesQuery() {
  return useQuery({ queryKey: labelsKeys.categories, queryFn: api.getCategories });
}

export function useAttachmentsQuery(targetType: TaggableType, targetId: string) {
  return useQuery({
    queryKey: labelsKeys.attachments(targetType, targetId),
    queryFn: () => api.getAttachmentsForTarget(targetType, targetId),
  });
}

export function useCreateTagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createTag,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: labelsKeys.tags });
    },
  });
}

export function useUpdateTagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTagInput }) =>
      api.updateTag(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: labelsKeys.tags });
    },
  });
}

export function useDeleteTagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTag,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: labelsKeys.tags });
    },
  });
}

export function useCreateCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createCategory,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: labelsKeys.categories });
    },
  });
}

export function useUpdateCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.updateCategory(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: labelsKeys.categories });
    },
  });
}

export function useDeleteCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteCategory,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: labelsKeys.categories });
    },
  });
}

export function useAttachTagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.attachTag,
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({
        queryKey: labelsKeys.attachments(vars.targetType, vars.targetId),
      });
    },
  });
}

export function useAttachCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.attachCategory,
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({
        queryKey: labelsKeys.attachments(vars.targetType, vars.targetId),
      });
    },
  });
}

export function useDetachTagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.detachTag,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['labels', 'attachments'] });
    },
  });
}

export function useDetachCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.detachCategory,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['labels', 'attachments'] });
    },
  });
}
