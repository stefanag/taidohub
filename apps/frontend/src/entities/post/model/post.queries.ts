import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  CreatePostInput,
  ListPostsQuery,
  Post,
  UpdatePostInput,
} from '@repo/contracts/posts';

import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
} from '../api/post.api.js';

/**
 * TanStack Query options + mutation hooks for the Post entity.
 *
 * All keys are tuples namespaced by entity (`['posts', ...]`) so they can be
 * invalidated en masse from mutations (`queryClient.invalidateQueries({ queryKey: postKeys.all })`).
 */
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (query: ListPostsQuery) => [...postKeys.lists(), query] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};

export function listPostsQueryOptions(query: ListPostsQuery) {
  return queryOptions({
    queryKey: postKeys.list(query),
    queryFn: () => listPosts(query),
  });
}

export function postQueryOptions(id: string) {
  return queryOptions({
    queryKey: postKeys.detail(id),
    queryFn: () => getPost(id),
    enabled: Boolean(id),
  });
}

export function useCreatePost(
  options?: Omit<UseMutationOptions<Post, Error, CreatePostInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPost,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      options?.onSuccess?.(data, vars, ctx);
    },
    ...options,
  });
}

export interface UpdatePostVariables {
  id: string;
  input: UpdatePostInput;
}

export function useUpdatePost(
  options?: Omit<UseMutationOptions<Post, Error, UpdatePostVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdatePostVariables) => updatePost(id, input),
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: postKeys.detail(vars.id) });
      void queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      options?.onSuccess?.(data, vars, ctx);
    },
    ...options,
  });
}

export function useDeletePost(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePost(id),
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: postKeys.all });
      options?.onSuccess?.(data, vars, ctx);
    },
    ...options,
  });
}
