import {
  ClubJoinRequestSchema,
  JoinableClubSchema,
  type ClubJoinRequest,
  type CreateClubJoinRequestInput,
  type JoinableClub,
} from '@repo/contracts/club-join-requests';
import { ClubJoinRequestRoutes } from '@repo/contracts/routes';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

export async function listJoinableClubs(): Promise<JoinableClub[]> {
  return z.array(JoinableClubSchema).parse(await httpClient(ClubJoinRequestRoutes.clubs));
}

export async function listMyJoinRequests(): Promise<ClubJoinRequest[]> {
  return z.array(ClubJoinRequestSchema).parse(await httpClient(ClubJoinRequestRoutes.mine));
}

export async function listPendingJoinRequests(): Promise<ClubJoinRequest[]> {
  return z.array(ClubJoinRequestSchema).parse(await httpClient(ClubJoinRequestRoutes.pending));
}

export async function createJoinRequest(
  input: CreateClubJoinRequestInput,
): Promise<ClubJoinRequest> {
  return ClubJoinRequestSchema.parse(
    await httpClient(ClubJoinRequestRoutes.create, { method: 'POST', body: input }),
  );
}

export async function cancelJoinRequest(id: string): Promise<void> {
  await httpClient(ClubJoinRequestRoutes.cancel(id), { method: 'DELETE' });
}

export async function approveJoinRequest(id: string): Promise<ClubJoinRequest> {
  return ClubJoinRequestSchema.parse(
    await httpClient(ClubJoinRequestRoutes.approve(id), { method: 'POST' }),
  );
}

export async function declineJoinRequest(id: string): Promise<ClubJoinRequest> {
  return ClubJoinRequestSchema.parse(
    await httpClient(ClubJoinRequestRoutes.decline(id), { method: 'POST' }),
  );
}
