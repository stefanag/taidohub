import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  BeltRank,
  CreateBeltRankInput,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

import {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  getPublicRank,
  updateBeltRank,
} from '../api/belt-rank.api.js';

export const beltRankKeys = {
  all: ['belt-ranks'] as const,
  list: () => [...beltRankKeys.all, 'list'] as const,
  byId: (id: string) => [...beltRankKeys.all, 'byId', id] as const,
  publicBySlug: (slug: string) => [...beltRankKeys.all, 'public', slug] as const,
};

export function listBeltRanksQueryOptions() {
  return queryOptions({
    queryKey: beltRankKeys.list(),
    queryFn: () => getBeltRanks(),
  });
}

export function beltRankQueryOptions(id: string) {
  return queryOptions({
    queryKey: beltRankKeys.byId(id),
    queryFn: () => getBeltRank(id),
  });
}

export function publicRankQueryOptions(slug: string) {
  return queryOptions({
    queryKey: beltRankKeys.publicBySlug(slug),
    queryFn: () => getPublicRank(slug),
  });
}

export function useCreateBeltRank(
  options?: Omit<UseMutationOptions<BeltRank, Error, CreateBeltRankInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBeltRank,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltRankKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateBeltRank(
  options?: Omit<
    UseMutationOptions<BeltRank, Error, { id: string; input: UpdateBeltRankInput }>,
    'mutationFn'
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }) => updateBeltRank(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltRankKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteBeltRank(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBeltRank(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltRankKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
