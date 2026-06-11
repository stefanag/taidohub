import {
  TechniqueSchema,
  type CreateTechniqueInput,
  type Technique,
  type UpdateTechniqueInput,
} from '@repo/contracts/techniques';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Technique module.
 *
 * Responses are parsed with the Zod schemas from `@repo/contracts/techniques`
 * so the frontend cannot drift away from the backend's actual response shape.
 *
 * - `GET    /api/techniques`        — filterable list.
 * - `GET    /api/techniques/:id`    — single row by id.
 * - `POST   /api/techniques`        — create.
 * - `PATCH  /api/techniques/:id`    — partial update (classificationIds is REPLACE-semantics).
 * - `DELETE /api/techniques/:id`    — soft/hard delete (backend decides).
 */

const TechniqueListSchema = z.array(TechniqueSchema);

export async function getTechniques(
  opts: {
    classificationIds?: string[];
    includeInactive?: boolean;
    organisationId?: string | null;
    strict?: boolean;
  } = {},
): Promise<Technique[]> {
  const params = new URLSearchParams();
  if (opts.classificationIds && opts.classificationIds.length > 0) {
    params.set('classificationIds', opts.classificationIds.join(','));
  }
  if (opts.includeInactive) params.set('includeInactive', '1');
  if (opts.organisationId) params.set('organisationId', opts.organisationId);
  if (opts.strict) params.set('strictClassificationIds', '1');
  const qs = params.toString();
  const raw = await httpClient(`/api/techniques${qs ? `?${qs}` : ''}`);
  return TechniqueListSchema.parse(raw);
}

export async function getTechnique(id: string): Promise<Technique> {
  const raw = await httpClient(`/api/techniques/${id}`);
  return TechniqueSchema.parse(raw);
}

export async function createTechnique(
  input: CreateTechniqueInput,
): Promise<Technique> {
  const raw = await httpClient('/api/techniques', {
    method: 'POST',
    body: input,
  });
  return TechniqueSchema.parse(raw);
}

export async function updateTechnique(
  id: string,
  input: UpdateTechniqueInput,
): Promise<Technique> {
  const raw = await httpClient(`/api/techniques/${id}`, {
    method: 'PATCH',
    body: input,
  });
  return TechniqueSchema.parse(raw);
}

export async function deleteTechnique(id: string): Promise<void> {
  await httpClient(`/api/techniques/${id}`, { method: 'DELETE' });
}
