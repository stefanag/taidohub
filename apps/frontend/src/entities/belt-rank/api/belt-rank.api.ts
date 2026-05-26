import {
  BeltRankSchema,
  PublicRankResponseSchema,
  type BeltRank,
  type CreateBeltRankInput,
  type PublicRankResponse,
  type UpdateBeltRankInput,
} from '@repo/contracts/ranks';
import { BeltRanksRoutes, PublicRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the BeltRank entity. */

export async function getBeltRanks(): Promise<BeltRank[]> {
  const raw = await httpClient(BeltRanksRoutes.base);
  return BeltRankSchema.array().parse(raw);
}

export async function getBeltRank(id: string): Promise<BeltRank> {
  const raw = await httpClient(BeltRanksRoutes.byId(id));
  return BeltRankSchema.parse(raw);
}

export async function createBeltRank(input: CreateBeltRankInput): Promise<BeltRank> {
  const raw = await httpClient(BeltRanksRoutes.base, { method: 'POST', body: input });
  return BeltRankSchema.parse(raw);
}

export async function updateBeltRank(
  id: string,
  input: UpdateBeltRankInput,
): Promise<BeltRank> {
  const raw = await httpClient(BeltRanksRoutes.byId(id), { method: 'PATCH', body: input });
  return BeltRankSchema.parse(raw);
}

export async function deleteBeltRank(id: string): Promise<void> {
  await httpClient(BeltRanksRoutes.byId(id), { method: 'DELETE' });
}

export async function getPublicRank(slug: string): Promise<PublicRankResponse> {
  const raw = await httpClient(PublicRoutes.rankBySlug(slug));
  return PublicRankResponseSchema.parse(raw);
}
