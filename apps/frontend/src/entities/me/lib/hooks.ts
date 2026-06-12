import { useQuery } from '@tanstack/react-query';

import * as api from '../api/me.api.js';

/**
 * React Query hooks for the "me" module.
 *
 * Query keys are namespaced under `['me', ...]` so a single
 * `invalidateQueries({ queryKey: ['me'] })` (e.g., after the user joins or
 * leaves an organisation) refetches every "me"-scoped query.
 */
export const meKeys = {
  memberships: ['me', 'memberships'] as const,
};

export function useMyMembershipsQuery() {
  return useQuery({
    queryKey: meKeys.memberships,
    queryFn: () => api.getMyMemberships(),
    staleTime: 5 * 60 * 1000,
  });
}
