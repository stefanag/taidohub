import {
  CategoryAttachmentSchema,
  CategorySchema,
  TagAttachmentSchema,
  TagSchema,
  type Category,
  type CategoryAttachment,
  type CreateCategoryAttachmentInput,
  type CreateCategoryInput,
  type CreateTagAttachmentInput,
  type CreateTagInput,
  type Tag,
  type TagAttachment,
  type TaggableType,
  type UpdateCategoryInput,
  type UpdateTagInput,
} from '@repo/contracts/labels';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the Labels module (tags, categories, attachments).
 *
 * Every response is parsed with the Zod schemas from `@repo/contracts/labels`
 * so the frontend cannot drift away from the backend's actual response shape.
 *
 * Backend routes live under `/api/labels/*`; there is no `LabelsRoutes`
 * helper in `@repo/contracts/routes` yet — paths are inlined here.
 */

const TagListSchema = z.array(TagSchema);
const CategoryListSchema = z.array(CategorySchema);
const AttachmentBundleSchema = z.object({
  tags: z.array(TagAttachmentSchema),
  categories: z.array(CategoryAttachmentSchema),
});

// ── Tags ───────────────────────────────────────────────────────────────────
export async function getTags(): Promise<Tag[]> {
  const raw = await httpClient('/api/labels/tags');
  return TagListSchema.parse(raw);
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
  const raw = await httpClient('/api/labels/tags', { method: 'POST', body: input });
  return TagSchema.parse(raw);
}

export async function updateTag(id: string, input: UpdateTagInput): Promise<Tag> {
  const raw = await httpClient(`/api/labels/tags/${id}`, {
    method: 'PATCH',
    body: input,
  });
  return TagSchema.parse(raw);
}

export async function deleteTag(id: string): Promise<void> {
  await httpClient(`/api/labels/tags/${id}`, { method: 'DELETE' });
}

// ── Categories ─────────────────────────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  const raw = await httpClient('/api/labels/categories');
  return CategoryListSchema.parse(raw);
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const raw = await httpClient('/api/labels/categories', {
    method: 'POST',
    body: input,
  });
  return CategorySchema.parse(raw);
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const raw = await httpClient(`/api/labels/categories/${id}`, {
    method: 'PATCH',
    body: input,
  });
  return CategorySchema.parse(raw);
}

export async function deleteCategory(id: string): Promise<void> {
  await httpClient(`/api/labels/categories/${id}`, { method: 'DELETE' });
}

// ── Attachments ────────────────────────────────────────────────────────────
export async function getAttachmentsForTarget(
  targetType: TaggableType,
  targetId: string,
): Promise<{ tags: TagAttachment[]; categories: CategoryAttachment[] }> {
  const raw = await httpClient('/api/labels/attachments', {
    query: { targetType, targetId },
  });
  return AttachmentBundleSchema.parse(raw);
}

export async function attachTag(input: CreateTagAttachmentInput): Promise<TagAttachment> {
  const raw = await httpClient('/api/labels/tag-attachments', {
    method: 'POST',
    body: input,
  });
  return TagAttachmentSchema.parse(raw);
}

export async function attachCategory(
  input: CreateCategoryAttachmentInput,
): Promise<CategoryAttachment> {
  const raw = await httpClient('/api/labels/category-attachments', {
    method: 'POST',
    body: input,
  });
  return CategoryAttachmentSchema.parse(raw);
}

export async function detachTag(id: string): Promise<void> {
  await httpClient(`/api/labels/tag-attachments/${id}`, { method: 'DELETE' });
}

export async function detachCategory(id: string): Promise<void> {
  await httpClient(`/api/labels/category-attachments/${id}`, { method: 'DELETE' });
}
