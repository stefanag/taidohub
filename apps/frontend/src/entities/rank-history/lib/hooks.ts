import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import {
  createRankHistory,
  deleteRankHistory,
  getGradingHistory,
  unverifyRankHistory,
  updateRankHistory,
  verifyRankHistory,
} from '../api/rank-history.api.js';

import { refreshSession } from '@/entities/me';

import type {
  CreateRankHistoryInput,
  GradingHistoryResponse,
  RankHistory,
  UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';

/**
 * Cache key registry for the rank-history entity. `unified(userId)` keys the
 * `GET /api/grading-events/history/:userId` projection; `all` is the umbrella
 * for blanket invalidation after mutations.
 */
export const rankHistoryKeys = {
  all: ['rank-history'] as const,
  unified: (userId: string) => [...rankHistoryKeys.all, 'unified', userId] as const,
};

export function gradingHistoryQueryOptions(userId: string) {
  return queryOptions({
    queryKey: rankHistoryKeys.unified(userId),
    queryFn: () => getGradingHistory(userId),
    enabled: Boolean(userId),
  });
}

/** Variables for the `useCreateRankHistory` mutation — `subjectUserId` is the user the entry is recorded for. */
export interface CreateRankHistoryVariables {
  subjectUserId: string;
  input: CreateRankHistoryInput;
}

/**
 * onSuccess composition: spread caller `options` FIRST, then define the
 * invalidating `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot
 * overwrite the invalidation. Mirrors `useUpdateMyProfile`.
 */
export function useCreateRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, CreateRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectUserId, input }: CreateRankHistoryVariables) =>
      createRankHistory(subjectUserId, input),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      options?.onSuccess?.(...args);
    },
  });
}

/** Variables for the `useUpdateRankHistory` mutation — `subjectUserId` powers cache invalidation. */
export interface UpdateRankHistoryVariables {
  id: string;
  subjectUserId: string;
  input: UpdateRankHistoryInput;
}

export function useUpdateRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, UpdateRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateRankHistoryVariables) => updateRankHistory(id, input),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export interface DeleteRankHistoryVariables {
  id: string;
  subjectUserId: string;
}

export function useDeleteRankHistory(
  options?: Omit<UseMutationOptions<void, Error, DeleteRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteRankHistoryVariables) => deleteRankHistory(id),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export interface VerifyRankHistoryVariables {
  id: string;
  subjectUserId: string;
}

export function useVerifyRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, VerifyRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: VerifyRankHistoryVariables) => verifyRankHistory(id),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export function useUnverifyRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, VerifyRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: VerifyRankHistoryVariables) => unverifyRankHistory(id),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export type { GradingHistoryResponse };
