import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type { ListUsersQuery, UpdateUserInput, User } from '@repo/contracts/users';

import { listUsers, updateUser } from '../api/user.api.js';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (query: ListUsersQuery) => [...userKeys.lists(), query] as const,
};

export function listUsersQueryOptions(query: ListUsersQuery) {
  return queryOptions({
    queryKey: userKeys.list(query),
    queryFn: () => listUsers(query),
  });
}

export interface UpdateUserVariables {
  id: string;
  input: UpdateUserInput;
}

// onSuccess composition: spread `options` first, then the invalidator last.
export function useUpdateUser(
  options?: Omit<UseMutationOptions<User, Error, UpdateUserVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateUserVariables) => updateUser(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}
