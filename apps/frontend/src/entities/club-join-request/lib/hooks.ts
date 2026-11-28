import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/club-join-requests.api.js';

export const clubJoinRequestKeys = {
  all: ['club-join-requests'] as const,
  clubs: ['club-join-requests', 'clubs'] as const,
  mine: ['club-join-requests', 'mine'] as const,
  pending: ['club-join-requests', 'pending'] as const,
};

export function useJoinableClubsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clubJoinRequestKeys.clubs,
    queryFn: api.listJoinableClubs,
    enabled: options?.enabled ?? true,
  });
}

export function useMyJoinRequestsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clubJoinRequestKeys.mine,
    queryFn: api.listMyJoinRequests,
    enabled: options?.enabled ?? true,
  });
}

export function usePendingJoinRequestsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clubJoinRequestKeys.pending,
    queryFn: api.listPendingJoinRequests,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Wraps a join-request write. Refreshes the requests, and the caller's
 * memberships too (`['me']`): an approval gives the applicant a club.
 */
export function useJoinRequestMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clubJoinRequestKeys.all });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
