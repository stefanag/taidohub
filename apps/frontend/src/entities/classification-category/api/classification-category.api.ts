import {
  ClassificationCategorySchema,
  type ClassificationCategory,
  type RootCode,
  type UpdateClassificationCategoryInput,
} from '@repo/contracts/classification-category';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Classification Category module.
 *
 * Responses are parsed with the Zod schemas from
 * `@repo/contracts/classification-category` so the frontend cannot drift away
 * from the backend's actual response shape.
 *
 * - `GET   /api/classification-categories?root=...`     — rows for a single root.
 * - `PATCH /api/classification-categories/:id`          — update an editable row.
 */

const ClassificationCategoryListSchema = z.array(ClassificationCategorySchema);

export async function getClassificationCategories(
  root: RootCode,
  opts: { includeInactive?: boolean } = {},
): Promise<ClassificationCategory[]> {
  const params = new URLSearchParams({ root });
  if (opts.includeInactive) params.set('includeInactive', '1');
  const raw = await httpClient(`/api/classification-categories?${params.toString()}`);
  return ClassificationCategoryListSchema.parse(raw);
}

export async function updateClassificationCategory(
  id: string,
  patch: UpdateClassificationCategoryInput,
): Promise<ClassificationCategory> {
  const raw = await httpClient(`/api/classification-categories/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return ClassificationCategorySchema.parse(raw);
}
