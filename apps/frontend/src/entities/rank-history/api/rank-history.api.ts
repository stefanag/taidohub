import {
  CreateRankHistorySchema,
  GradingHistoryResponseSchema,
  RankHistorySchema,
  UpdateRankHistorySchema,
  type CreateRankHistoryInput,
  type GradingHistoryResponse,
  type RankHistory,
  type UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';
import { RankHistoryRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the RankHistory entity. */

/**
 * Fetch the unified grading-history projection for `userId`. The response is
 * `{ data: GradingHistoryRow[] }`; rows already carry per-actor `canVerify` /
 * `canEdit` flags hydrated by the backend.
 */
export async function getGradingHistory(userId: string): Promise<GradingHistoryResponse> {
  const raw = await httpClient(RankHistoryRoutes.unifiedForUser(userId));
  return GradingHistoryResponseSchema.parse(raw);
}

/** Create an external rank-history entry on behalf of `userId`. */
export async function createRankHistory(
  userId: string,
  input: CreateRankHistoryInput,
): Promise<RankHistory> {
  // Parse on the way in too — the form submits raw values, this guards the wire.
  const body = CreateRankHistorySchema.parse(input);
  const raw = await httpClient(RankHistoryRoutes.byUser(userId), {
    method: 'POST',
    body,
  });
  return RankHistorySchema.parse(raw);
}

/** Patch an external rank-history row. Touching `rankId`/`date`/`shogoTitle` on a verified row clears its verification atomically (service-layer rule). */
export async function updateRankHistory(
  id: string,
  input: UpdateRankHistoryInput,
): Promise<RankHistory> {
  const body = UpdateRankHistorySchema.parse(input);
  const raw = await httpClient(RankHistoryRoutes.byId(id), {
    method: 'PATCH',
    body,
  });
  return RankHistorySchema.parse(raw);
}

/** Delete an external rank-history row. Event-sourced rows are rejected server-side with `SOURCE_EVENT`. */
export async function deleteRankHistory(id: string): Promise<void> {
  await httpClient(RankHistoryRoutes.byId(id), { method: 'DELETE' });
}

/** Verify an external row. Recorder ≠ verifier; event rows rejected. Returns the updated row. */
export async function verifyRankHistory(id: string): Promise<RankHistory> {
  const raw = await httpClient(RankHistoryRoutes.verify(id), { method: 'POST' });
  return RankHistorySchema.parse(raw);
}

/** Unverify an external row. Recorder ≠ verifier; event rows rejected. Returns the updated row. */
export async function unverifyRankHistory(id: string): Promise<RankHistory> {
  const raw = await httpClient(RankHistoryRoutes.unverify(id), { method: 'POST' });
  return RankHistorySchema.parse(raw);
}
