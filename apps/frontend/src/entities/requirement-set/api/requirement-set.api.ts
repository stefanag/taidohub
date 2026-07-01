import {
  RequirementSetSchema,
  RequirementSetsRoutes,
  type CloneRequirementSetInput,
  type CreateRequirementSetInput,
  type RequirementSet,
  type UpdateRequirementSetInput,
} from '@repo/contracts';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the RequirementSet module.
 *
 * Responses are parsed with the Zod schemas from `@repo/contracts`
 * so the frontend cannot drift away from the backend's actual response shape.
 *
 * - `GET    /api/requirement-sets`                 — list.
 * - `GET    /api/requirement-sets/:id`              — single row by id.
 * - `POST   /api/requirement-sets`                  — create.
 * - `PATCH  /api/requirement-sets/:id`               — partial update.
 * - `DELETE /api/requirement-sets/:id`               — delete.
 * - `POST   /api/requirement-sets/:id/activate`      — activate.
 * - `POST   /api/requirement-sets/:id/deactivate`    — deactivate.
 * - `POST   /api/requirement-sets/:id/clone`         — clone.
 */

const RequirementSetListSchema = z.array(RequirementSetSchema);

export async function getRequirementSets(): Promise<RequirementSet[]> {
  const raw = await httpClient(RequirementSetsRoutes.base);
  return RequirementSetListSchema.parse(raw);
}

export async function getRequirementSetById(id: string): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.byId(id));
  return RequirementSetSchema.parse(raw);
}

export async function createRequirementSet(
  body: CreateRequirementSetInput,
): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.base, {
    method: 'POST',
    body,
  });
  return RequirementSetSchema.parse(raw);
}

export async function updateRequirementSet(
  id: string,
  body: UpdateRequirementSetInput,
): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.byId(id), {
    method: 'PATCH',
    body,
  });
  return RequirementSetSchema.parse(raw);
}

export async function deleteRequirementSet(id: string): Promise<void> {
  await httpClient(RequirementSetsRoutes.byId(id), { method: 'DELETE' });
}

export async function activateRequirementSet(id: string): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.activate(id), { method: 'POST' });
  return RequirementSetSchema.parse(raw);
}

export async function deactivateRequirementSet(id: string): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.deactivate(id), { method: 'POST' });
  return RequirementSetSchema.parse(raw);
}

export async function cloneRequirementSet(
  id: string,
  body: CloneRequirementSetInput,
): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.clone(id), {
    method: 'POST',
    body,
  });
  return RequirementSetSchema.parse(raw);
}
