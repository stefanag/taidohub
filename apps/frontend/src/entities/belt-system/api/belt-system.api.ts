import {
  BeltSystemSchema,
  type BeltSystem,
  type CreateBeltSystemInput,
  type UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';
import { BeltSystemsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the BeltSystem entity. */

export async function getBeltSystems(): Promise<BeltSystem[]> {
  const raw = await httpClient(BeltSystemsRoutes.base);
  return BeltSystemSchema.array().parse(raw);
}

export async function createBeltSystem(input: CreateBeltSystemInput): Promise<BeltSystem> {
  const raw = await httpClient(BeltSystemsRoutes.base, { method: 'POST', body: input });
  return BeltSystemSchema.parse(raw);
}

export async function updateBeltSystem(
  id: string,
  input: UpdateBeltSystemInput,
): Promise<BeltSystem> {
  const raw = await httpClient(BeltSystemsRoutes.byId(id), { method: 'PATCH', body: input });
  return BeltSystemSchema.parse(raw);
}

export async function deleteBeltSystem(id: string): Promise<void> {
  await httpClient(BeltSystemsRoutes.byId(id), { method: 'DELETE' });
}
