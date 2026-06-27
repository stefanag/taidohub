import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import {
  createMembership,
  deleteMembership,
  listMemberships,
  updateMembership,
} from '../api/membership.api.js';

import type {
  CreateMembershipInput,
  ListMembershipsQuery,
  OrganisationMembership,
} from '@repo/contracts/memberships';


export const membershipKeys = {
  all: ['memberships'] as const,
  lists: () => [...membershipKeys.all, 'list'] as const,
  list: (query: ListMembershipsQuery) => [...membershipKeys.lists(), query] as const,
};

export function listMembershipsQueryOptions(query: ListMembershipsQuery = {}) {
  return queryOptions({
    queryKey: membershipKeys.list(query),
    queryFn: () => listMemberships(query),
  });
}

// onSuccess composition: spread `options` FIRST, then define the invalidating
// `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot overwrite the
// invalidation. (Same pattern as the organisation entity.)
export function useCreateMembership(
  options?: Omit<UseMutationOptions<OrganisationMembership, Error, CreateMembershipInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMembership,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export interface UpdateMembershipVariables {
  id: string;
  role: OrganisationMembership['role'];
}

export function useUpdateMembership(
  options?: Omit<UseMutationOptions<OrganisationMembership, Error, UpdateMembershipVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: UpdateMembershipVariables) => updateMembership(id, { role }),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export interface DeleteMembershipVariables {
  id: string;
  confirm?: boolean;
}

export function useDeleteMembership(
  options?: Omit<UseMutationOptions<void, Error, DeleteMembershipVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: DeleteMembershipVariables) =>
      deleteMembership(id, confirm === undefined ? {} : { confirm }),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['me', 'memberships'] });
      options?.onSuccess?.(...args);
    },
  });
}
