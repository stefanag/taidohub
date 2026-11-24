import {
  ListPendingOperationsResponseSchema,
  PendingOperationSchema,
  type ListPendingOperationsResponse,
  type PendingOperation,
  type PendingOperationStatus,
} from '@repo/contracts/pending-operations';
import { PendingOperationsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for proposals made by AI clients. */

/** The caller's own proposals, newest first; optionally only one status. */
export async function listPendingOperations(
  status?: PendingOperationStatus,
): Promise<ListPendingOperationsResponse> {
  const url = status
    ? `${PendingOperationsRoutes.base}?status=${encodeURIComponent(status)}`
    : PendingOperationsRoutes.base;
  return ListPendingOperationsResponseSchema.parse(await httpClient(url));
}

/**
 * Approve a proposal and perform its write. Resolves with status `failed`
 * (and the reason in `error`) when the server refused the write.
 */
export async function approvePendingOperation(id: string): Promise<PendingOperation> {
  const raw = await httpClient(PendingOperationsRoutes.approve(id), { method: 'POST' });
  return PendingOperationSchema.parse(raw);
}

/** Reject a proposal. Nothing is written. */
export async function rejectPendingOperation(id: string): Promise<PendingOperation> {
  const raw = await httpClient(PendingOperationsRoutes.reject(id), { method: 'POST' });
  return PendingOperationSchema.parse(raw);
}
