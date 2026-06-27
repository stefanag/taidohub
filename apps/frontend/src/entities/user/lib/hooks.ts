import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import {
  addUser,
  deactivateUser,
  deleteUser,
  inviteUser,
  listUsers,
  reactivateUser,
  sendPasswordReset,
  updateUser,
} from '../api/user.api.js';

import type { AddUserInput, AddUserResponse, InviteUserInput, ListUsersQuery, UpdateUserInput, User } from '@repo/contracts/users';


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

export function useInviteUser(
  options?: Omit<UseMutationOptions<User, Error, InviteUserInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inviteUser,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useAddUser(
  options?: Omit<UseMutationOptions<AddUserResponse, Error, AddUserInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addUser,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateUser(
  options?: Omit<UseMutationOptions<User, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateUser,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useReactivateUser(
  options?: Omit<UseMutationOptions<User, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reactivateUser,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteUser(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useSendPasswordReset(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  return useMutation({
    mutationFn: sendPasswordReset,
    ...options,
  });
}
