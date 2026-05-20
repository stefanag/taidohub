import {
  ListMembershipsResponseSchema,
  OrganisationMembershipSchema,
  type CreateMembershipInput,
  type ListMembershipsQuery,
  type ListMembershipsResponse,
  type OrganisationMembership,
  type UpdateMembershipInput,
} from '@repo/contracts/memberships';
import { MembershipsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the OrganisationMembership entity. */

export async function listMemberships(
  query: ListMembershipsQuery = {},
): Promise<ListMembershipsResponse> {
  const raw = await httpClient(MembershipsRoutes.base, {
    query: { userId: query.userId, organisationId: query.organisationId },
  });
  return ListMembershipsResponseSchema.parse(raw);
}

export async function createMembership(
  input: CreateMembershipInput,
): Promise<OrganisationMembership> {
  const raw = await httpClient(MembershipsRoutes.base, { method: 'POST', body: input });
  return OrganisationMembershipSchema.parse(raw);
}

export async function updateMembership(
  id: string,
  input: UpdateMembershipInput,
): Promise<OrganisationMembership> {
  const raw = await httpClient(MembershipsRoutes.byId(id), { method: 'PATCH', body: input });
  return OrganisationMembershipSchema.parse(raw);
}

export async function deleteMembership(id: string): Promise<void> {
  await httpClient(MembershipsRoutes.byId(id), { method: 'DELETE' });
}
