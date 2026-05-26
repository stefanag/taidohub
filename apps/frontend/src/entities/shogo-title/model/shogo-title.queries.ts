import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  ShogoTitle,
  CreateShogoTitleInput,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

import {
  createShogoTitle,
  deleteShogoTitle,
  getShogoTitles,
  updateShogoTitle,
} from '../api/shogo-title.api.js';

export const shogoTitleKeys = {
  all: ['shogo-titles'] as const,
  list: () => [...shogoTitleKeys.all, 'list'] as const,
  byCode: (code: string) => [...shogoTitleKeys.all, 'byCode', code] as const,
};

export function listShogoTitlesQueryOptions() {
  return queryOptions({
    queryKey: shogoTitleKeys.list(),
    queryFn: () => getShogoTitles(),
  });
}

export function shogoTitleQueryOptions(code: string) {
  return queryOptions({
    queryKey: shogoTitleKeys.byCode(code),
    queryFn: () => getShogoTitles().then((titles) => titles.find((t) => t.code === code)),
  });
}

export function useCreateShogoTitle(
  options?: Omit<UseMutationOptions<ShogoTitle, Error, CreateShogoTitleInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createShogoTitle,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: shogoTitleKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateShogoTitle(
  options?: Omit<
    UseMutationOptions<ShogoTitle, Error, { code: string; input: UpdateShogoTitleInput }>,
    'mutationFn'
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, input }) => updateShogoTitle(code, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: shogoTitleKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteShogoTitle(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => deleteShogoTitle(code),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: shogoTitleKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
