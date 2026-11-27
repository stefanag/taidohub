import { queryOptions } from '@tanstack/react-query';

import { authClient, getSignInProviders, type Session } from '../api/auth.api.js';

/**
 * TanStack Query options for the current session. The cookie is sent
 * automatically (httpClient and better-auth both use `credentials: 'include'`)
 * so the queryFn just calls `authClient.getSession()` and surfaces the result.
 */
export const sessionKeys = {
  all: ['auth', 'session'] as const,
};

export function sessionQueryOptions() {
  return queryOptions<Session | null>({
    queryKey: sessionKeys.all,
    queryFn: async () => {
      const result = await authClient.getSession();
      if (!result.data) return null;
      return result.data as unknown as Session;
    },
    staleTime: 60_000,
  });
}

/** Which sign-in methods the server offers; changes only with a deploy. */
export function signInProvidersQueryOptions() {
  return queryOptions({
    queryKey: ['auth', 'sign-in-providers'] as const,
    queryFn: getSignInProviders,
    staleTime: Infinity,
  });
}
