import {
  ListOrganisationsResponseSchema,
  OrganisationSchema,
  type CreateOrganisationInput,
  type ListOrganisationsQuery,
  type ListOrganisationsResponse,
  type Organisation,
  type UpdateOrganisationInput,
} from '@repo/contracts/organisations';
import { OrganisationsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api/httpClient';

/**
 * Network surface for the Organisation entity.
 *
 * Every response is parsed with the Zod schemas from `@repo/contracts/organisations`
 * so the frontend cannot drift away from the backend's actual response shape.
 */

export async function listOrganisations(
  query: ListOrganisationsQuery = {},
): Promise<ListOrganisationsResponse> {
  const raw = await httpClient(OrganisationsRoutes.base, {
    query: {
      type: query.type,
      country: query.country,
      parentId: query.parentId ?? undefined,
      q: query.q,
    },
  });
  return ListOrganisationsResponseSchema.parse(raw);
}

export async function getOrganisation(id: string): Promise<Organisation> {
  const raw = await httpClient(OrganisationsRoutes.byId(id));
  return OrganisationSchema.parse(raw);
}

export async function createOrganisation(
  input: CreateOrganisationInput,
): Promise<Organisation> {
  const raw = await httpClient(OrganisationsRoutes.base, {
    method: 'POST',
    body: input,
  });
  return OrganisationSchema.parse(raw);
}

export async function updateOrganisation(
  id: string,
  input: UpdateOrganisationInput,
): Promise<Organisation> {
  const raw = await httpClient(OrganisationsRoutes.byId(id), {
    method: 'PATCH',
    body: input,
  });
  return OrganisationSchema.parse(raw);
}

export async function deleteOrganisation(id: string): Promise<void> {
  await httpClient(OrganisationsRoutes.byId(id), { method: 'DELETE' });
}
