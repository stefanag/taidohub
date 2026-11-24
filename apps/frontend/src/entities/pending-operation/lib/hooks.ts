import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  approvePendingOperation,
  listPendingOperations,
  rejectPendingOperation,
} from '../api/pending-operations.api.js';

export const pendingOperationKeys = {
  all: ['pending-operations'] as const,
};

export function pendingOperationsQueryOptions() {
  return queryOptions({
    queryKey: pendingOperationKeys.all,
    queryFn: () => listPendingOperations(),
  });
}

/** Approve a proposal; refreshes the list (and nothing else is cached from it). */
export function useApprovePendingOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approvePendingOperation(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: pendingOperationKeys.all }),
  });
}

/** Reject a proposal; refreshes the list. */
export function useRejectPendingOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectPendingOperation(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: pendingOperationKeys.all }),
  });
}
