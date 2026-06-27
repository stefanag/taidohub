import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { signOut } from '../api/auth.api.js';

/**
 * Sign out hook that ALSO clears the React Query cache.
 *
 * Why a hook rather than extending `signOut()` directly: the cache is
 * obtained via `useQueryClient`, which is React-context-bound. Pulling
 * it through a hook keeps the signOut helper itself environment-free
 * (still usable from non-React code paths if we ever need it) and
 * centralises the "after sign-out, drop every cached query" rule in
 * one place — so a future call site can't accidentally skip it.
 *
 * The cache flush prevents a class of leak we observed in dev: with
 * the membership query set to `staleTime: 5 * 60 * 1000`, signing out
 * and signing back in within five minutes briefly served the previous
 * user's membership rows from cache, which in turn raced the
 * sidebar's "Students" link gating and made it disappear for an
 * instructor on first paint. Clearing the cache on sign-out closes
 * that window entirely.
 */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    await signOut();
    queryClient.clear();
  }, [queryClient]);
}
