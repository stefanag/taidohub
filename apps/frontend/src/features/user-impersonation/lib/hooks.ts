import { useMutation } from '@tanstack/react-query';

import * as api from '../api/impersonation.api.js';

/**
 * better-auth's `useSession` keeps its own state outside React Query, so
 * invalidating the QueryClient does not refresh the current user. Mirror the
 * login/logout pattern: hard-navigate to a fresh page after the session-cookie
 * swap so the entire React tree re-renders under the new session.
 *
 * `window.location.assign(...)` is used (not `.reload()`) so we can also pick
 * the landing route — for impersonation start, the impersonated user's
 * dashboard; for stop, the sysadmin's users-admin page.
 */
export function useStartImpersonating() {
  return useMutation({
    mutationFn: api.startImpersonating,
    onSuccess: () => {
      window.location.assign('/dashboard');
    },
  });
}

export function useStopImpersonating() {
  return useMutation({
    mutationFn: api.stopImpersonating,
    onSuccess: () => {
      window.location.assign('/admin/users');
    },
  });
}
