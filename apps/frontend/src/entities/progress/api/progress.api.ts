import {
  ProgressSchema,
  type ContentType,
  type Progress,
  type UpsertProgressInput,
} from '@repo/contracts/progress';
import { z } from 'zod';

import { httpClient, HttpError } from '@/shared/api';

/**
 * Network surface for the Progress module.
 *
 * Responses are parsed with the Zod schemas from `@repo/contracts/progress`
 * so the frontend cannot drift away from the backend's actual response shape.
 *
 * - `GET    /api/progress`                    — list current user's rows (optionally filtered by contentType).
 * - `GET    /api/progress/techniques/:id`     — single row by technique id (404 → `null`).
 * - `GET    /api/progress/patterns/:id`       — single row by pattern id (404 → `null`).
 * - `PUT    /api/progress/techniques/:id`     — upsert per-user progress on a technique.
 * - `PUT    /api/progress/patterns/:id`       — upsert per-user progress on a pattern.
 * - `DELETE /api/progress/techniques/:id`     — delete row.
 * - `DELETE /api/progress/patterns/:id`       — delete row.
 *
 * The "no progress yet" state is surfaced as `null` rather than a thrown 404
 * so callers (pill, dialog) can render an empty state without a try/catch.
 */

const ProgressListSchema = z.array(ProgressSchema);

export async function getProgressList(
  contentType?: ContentType,
): Promise<Progress[]> {
  const qs = contentType ? `?contentType=${contentType}` : '';
  const raw = await httpClient(`/api/progress${qs}`);
  return ProgressListSchema.parse(raw);
}

async function getProgressByPath(path: string): Promise<Progress | null> {
  try {
    const raw = await httpClient(path);
    return ProgressSchema.parse(raw);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

export async function getTechniqueProgress(
  techniqueId: string,
): Promise<Progress | null> {
  return getProgressByPath(`/api/progress/techniques/${techniqueId}`);
}

export async function getPatternProgress(
  patternId: string,
): Promise<Progress | null> {
  return getProgressByPath(`/api/progress/patterns/${patternId}`);
}

export async function upsertTechniqueProgress(
  techniqueId: string,
  input: UpsertProgressInput,
): Promise<Progress> {
  const raw = await httpClient(`/api/progress/techniques/${techniqueId}`, {
    method: 'PUT',
    body: input,
  });
  return ProgressSchema.parse(raw);
}

export async function upsertPatternProgress(
  patternId: string,
  input: UpsertProgressInput,
): Promise<Progress> {
  const raw = await httpClient(`/api/progress/patterns/${patternId}`, {
    method: 'PUT',
    body: input,
  });
  return ProgressSchema.parse(raw);
}

export async function deleteTechniqueProgress(
  techniqueId: string,
): Promise<void> {
  await httpClient(`/api/progress/techniques/${techniqueId}`, {
    method: 'DELETE',
  });
}

export async function deletePatternProgress(patternId: string): Promise<void> {
  await httpClient(`/api/progress/patterns/${patternId}`, { method: 'DELETE' });
}
