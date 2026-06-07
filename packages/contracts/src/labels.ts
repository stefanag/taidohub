import { z } from 'zod';

export const TaggableTypeSchema = z.enum(['user', 'organisation', 'rank_history']);
export type TaggableType = z.infer<typeof TaggableTypeSchema>;

// ── Tag ──────────────────────────────────────────────────────────────────
export const TagSchema = z
  .object({
    id: z.uuid(),
    organisationId: z.uuid().nullable(),
    name: z.string().min(1).max(80),
    createdByUserId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'Tag',
    description:
      'A flat label attachable to any taggable entity. organisationId=null means a sysadmin-owned global.',
    example: {
      id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      organisationId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
      name: 'competition-team',
      createdByUserId: 'u-1',
      createdAt: '2026-06-07T10:00:00.000Z',
      updatedAt: '2026-06-07T10:00:00.000Z',
    },
  });

export const CreateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** Sysadmin-only when true; server rejects with 403 if the caller is not sysadmin. */
    global: z.boolean().default(false),
  })
  .meta({ id: 'CreateTagInput' });

export const UpdateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .meta({ id: 'UpdateTagInput' });

// ── Category ─────────────────────────────────────────────────────────────
export const CategorySchema = z
  .object({
    id: z.uuid(),
    organisationId: z.uuid().nullable(),
    parentId: z.uuid().nullable(),
    name: z.string().min(1).max(80),
    createdByUserId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'Category',
    description:
      'A label with one-level parent/child hierarchy. organisationId=null means a sysadmin-owned global.',
    example: {
      id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      organisationId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
      parentId: null,
      name: 'Region',
      createdByUserId: 'u-1',
      createdAt: '2026-06-07T10:00:00.000Z',
      updatedAt: '2026-06-07T10:00:00.000Z',
    },
  });

export const CreateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    parentId: z.uuid().nullable().default(null),
    global: z.boolean().default(false),
  })
  .meta({ id: 'CreateCategoryInput' });

export const UpdateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .meta({ id: 'UpdateCategoryInput' });

// ── Attachments ──────────────────────────────────────────────────────────
export const TagAttachmentSchema = z
  .object({
    id: z.uuid(),
    tagId: z.uuid(),
    targetType: TaggableTypeSchema,
    targetId: z.string(),
    attachedByUserId: z.string(),
    attachedAt: z.iso.datetime(),
  })
  .meta({ id: 'TagAttachment' });

export const CategoryAttachmentSchema = z
  .object({
    id: z.uuid(),
    categoryId: z.uuid(),
    targetType: TaggableTypeSchema,
    targetId: z.string(),
    attachedByUserId: z.string(),
    attachedAt: z.iso.datetime(),
  })
  .meta({ id: 'CategoryAttachment' });

export const CreateTagAttachmentSchema = z
  .object({
    tagId: z.uuid(),
    targetType: TaggableTypeSchema,
    targetId: z.string().min(1),
  })
  .meta({ id: 'CreateTagAttachmentInput' });

export const CreateCategoryAttachmentSchema = z
  .object({
    categoryId: z.uuid(),
    targetType: TaggableTypeSchema,
    targetId: z.string().min(1),
  })
  .meta({ id: 'CreateCategoryAttachmentInput' });

// ── List-query mixin for integrating modules ─────────────────────────────
export const LabelFilterSchema = z
  .object({
    tag: z.array(z.uuid()).optional(),
    category: z.array(z.uuid()).optional(),
  })
  .meta({ id: 'LabelFilter' });

// ── Inferred types (re-exported for backend + frontend) ──────────────────
export type Tag = z.infer<typeof TagSchema>;
export type CreateTagInput = z.input<typeof CreateTagSchema>;
export type UpdateTagInput = z.input<typeof UpdateTagSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.input<typeof UpdateCategorySchema>;
export type TagAttachment = z.infer<typeof TagAttachmentSchema>;
export type CategoryAttachment = z.infer<typeof CategoryAttachmentSchema>;
export type CreateTagAttachmentInput = z.input<typeof CreateTagAttachmentSchema>;
export type CreateCategoryAttachmentInput = z.input<typeof CreateCategoryAttachmentSchema>;
export type LabelFilter = z.input<typeof LabelFilterSchema>;

export const LabelsOpenApiRegistry = {
  Tag: TagSchema,
  Category: CategorySchema,
  TagAttachment: TagAttachmentSchema,
  CategoryAttachment: CategoryAttachmentSchema,
  CreateTagInput: CreateTagSchema,
  UpdateTagInput: UpdateTagSchema,
  CreateCategoryInput: CreateCategorySchema,
  UpdateCategoryInput: UpdateCategorySchema,
  CreateTagAttachmentInput: CreateTagAttachmentSchema,
  CreateCategoryAttachmentInput: CreateCategoryAttachmentSchema,
  LabelFilter: LabelFilterSchema,
} as const;
