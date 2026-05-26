import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

import {
  createBeltSystem,
  deleteBeltSystem,
  getBeltSystems,
  updateBeltSystem,
} from '../api/belt-system.api.js';

export const beltSystemKeys = {
  all: ['belt-systems'] as const,
  list: () => [...beltSystemKeys.all, 'list'] as const,
};

export function listBeltSystemsQueryOptions() {
  return queryOptions({
    queryKey: beltSystemKeys.list(),
    queryFn: () => getBeltSystems(),
  });
}

/**
 * onSuccess composition: spread caller `options` FIRST, then define the
 * invalidating `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot
 * overwrite the invalidation.
 */
export function useCreateBeltSystem(
  options?: Omit<UseMutationOptions<BeltSystem, Error, CreateBeltSystemInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBeltSystem,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltSystemKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateBeltSystem(
  options?: Omit<
    UseMutationOptions<BeltSystem, Error, { id: string; input: UpdateBeltSystemInput }>,
    'mutationFn'
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }) => updateBeltSystem(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltSystemKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteBeltSystem(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBeltSystem(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltSystemKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
