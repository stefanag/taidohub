import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  Organisation,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';

import {
  createOrganisation,
  deleteOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
} from '../api/organisation.api.js';

/**
 * TanStack Query options + mutation hooks for the Organisation entity.
 *
 * Keys are tuples namespaced by entity (`['organisations', ...]`) so they can be
 * invalidated en masse from mutations.
 */
export const organisationKeys = {
  all: ['organisations'] as const,
  lists: () => [...organisationKeys.all, 'list'] as const,
  list: (query: ListOrganisationsQuery) => [...organisationKeys.lists(), query] as const,
  details: () => [...organisationKeys.all, 'detail'] as const,
  detail: (id: string) => [...organisationKeys.details(), id] as const,
};

export function listOrganisationsQueryOptions(query: ListOrganisationsQuery = {}) {
  return queryOptions({
    queryKey: organisationKeys.list(query),
    queryFn: () => listOrganisations(query),
  });
}

export function organisationQueryOptions(id: string) {
  return queryOptions({
    queryKey: organisationKeys.detail(id),
    queryFn: () => getOrganisation(id),
    enabled: Boolean(id),
  });
}

// The composed-onSuccess pattern below intentionally spreads `options` FIRST
// and defines `onSuccess` AFTER. Reverse order silently lets a caller-supplied
// `onSuccess` overwrite the invalidating one — the dialog closes but the
// list never refetches.
export function useCreateOrganisation(
  options?: Omit<UseMutationOptions<Organisation, Error, CreateOrganisationInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrganisation,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: organisationKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export interface UpdateOrganisationVariables {
  id: string;
  input: UpdateOrganisationInput;
}

export function useUpdateOrganisation(
  options?: Omit<UseMutationOptions<Organisation, Error, UpdateOrganisationVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateOrganisationVariables) => updateOrganisation(id, input),
    ...options,
    onSuccess: (data, vars, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: organisationKeys.detail(vars.id) });
      void queryClient.invalidateQueries({ queryKey: organisationKeys.lists() });
      options?.onSuccess?.(data, vars, ...rest);
    },
  });
}

export function useDeleteOrganisation(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrganisation(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: organisationKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
