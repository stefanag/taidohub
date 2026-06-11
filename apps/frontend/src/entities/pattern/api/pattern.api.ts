import {
  PatternSchema,
  type CreatePatternInput,
  type Pattern,
  type UpdatePatternInput,
} from '@repo/contracts/patterns';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Pattern module.
 *
 * Responses are parsed with the Zod schemas from `@repo/contracts/patterns`
 * so the frontend cannot drift away from the backend's actual response shape.
 *
 * - `GET    /api/patterns`        — filterable list.
 * - `GET    /api/patterns/:id`    — single row by id.
 * - `POST   /api/patterns`        — create.
 * - `PATCH  /api/patterns/:id`    — partial update (classificationIds is REPLACE-semantics).
 * - `DELETE /api/patterns/:id`    — soft/hard delete (backend decides).
 */

const PatternListSchema = z.array(PatternSchema);

export async function getPatterns(
  opts: {
    classificationIds?: string[];
    includeInactive?: boolean;
    organisationId?: string | null;
    strict?: boolean;
  } = {},
): Promise<Pattern[]> {
  const params = new URLSearchParams();
  if (opts.classificationIds && opts.classificationIds.length > 0) {
    params.set('classificationIds', opts.classificationIds.join(','));
  }
  if (opts.includeInactive) params.set('includeInactive', '1');
  if (opts.organisationId) params.set('organisationId', opts.organisationId);
  if (opts.strict) params.set('strictClassificationIds', '1');
  const qs = params.toString();
  const raw = await httpClient(`/api/patterns${qs ? `?${qs}` : ''}`);
  return PatternListSchema.parse(raw);
}

export async function getPattern(id: string): Promise<Pattern> {
  const raw = await httpClient(`/api/patterns/${id}`);
  return PatternSchema.parse(raw);
}

export async function createPattern(
  input: CreatePatternInput,
): Promise<Pattern> {
  const raw = await httpClient('/api/patterns', {
    method: 'POST',
    body: input,
  });
  return PatternSchema.parse(raw);
}

export async function updatePattern(
  id: string,
  input: UpdatePatternInput,
): Promise<Pattern> {
  const raw = await httpClient(`/api/patterns/${id}`, {
    method: 'PATCH',
    body: input,
  });
  return PatternSchema.parse(raw);
}

export async function deletePattern(id: string): Promise<void> {
  await httpClient(`/api/patterns/${id}`, { method: 'DELETE' });
}
