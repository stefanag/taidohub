import type {
  RootCode,
  UpdateClassificationCategoryInput,
} from '@repo/contracts/classification-category';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/classification-category.api.js';

/**
 * React Query hooks for the Classification Category module.
 *
 * The query key registry is keyed by root + includeInactive so different
 * variants don't collide in the cache. The mutation invalidates the
 * `['classification-category']` prefix so all root/variant queries refetch
 * after an edit.
 */
export const classificationCategoryKeys = {
  byRoot: (root: RootCode, includeInactive: boolean) =>
    ['classification-category', 'root', root, includeInactive] as const,
};

export function useClassificationCategoriesByRootQuery(
  root: RootCode,
  opts: { includeInactive?: boolean } = {},
) {
  const includeInactive = opts.includeInactive ?? false;
  return useQuery({
    queryKey: classificationCategoryKeys.byRoot(root, includeInactive),
    queryFn: () => api.getClassificationCategories(root, { includeInactive }),
  });
}

export function useUpdateClassificationCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateClassificationCategoryInput;
    }) => api.updateClassificationCategory(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classification-category'] });
    },
  });
}
