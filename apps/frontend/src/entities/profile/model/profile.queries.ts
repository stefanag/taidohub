import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import { getMyProfile, getUserProfile, updateMyProfile } from '../api/profile.api.js';

import type { UpdateUserProfileInput, UserProfile } from '@repo/contracts/profile';

export const profileKeys = {
  all: ['profile'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
  byUser: (id: string) => [...profileKeys.all, 'user', id] as const,
};

export function myProfileQueryOptions() {
  return queryOptions({
    queryKey: profileKeys.me(),
    queryFn: () => getMyProfile(),
  });
}

export function userProfileQueryOptions(id: string) {
  return queryOptions({
    queryKey: profileKeys.byUser(id),
    queryFn: () => getUserProfile(id),
  });
}

/**
 * onSuccess composition: spread `options` FIRST, then define the invalidating
 * `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot overwrite the
 * invalidation. Invalidates the whole profile cache; also invalidates the
 * `users` cache so a synced `name` change is reflected in the admin list.
 */
export function useUpdateMyProfile(
  options?: Omit<UseMutationOptions<UserProfile, Error, UpdateUserProfileInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyProfile,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      options?.onSuccess?.(...args);
    },
  });
}
