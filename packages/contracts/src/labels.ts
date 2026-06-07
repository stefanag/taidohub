import { z } from 'zod';

export const TaggableTypeSchema = z.enum(['user', 'organisation', 'rank_history']);
export type TaggableType = z.infer<typeof TaggableTypeSchema>;

// ── Tag ──────────────────────────────────────────────────────────────────
export const TagSchema = z
  .object({
    id: z.guid(),
    organisationId: z.guid().nullable(),
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
      id: '11111111-1111-1111-1111-111111111111',
      organisationId: '22222222-2222-2222-2222-222222222222',
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
    id: z.guid(),
    organisationId: z.guid().nullable(),
    parentId: z.guid().nullable(),
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
      id: '11111111-1111-1111-1111-111111111111',
      organisationId: '22222222-2222-2222-2222-222222222222',
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
    parentId: z.guid().nullable().default(null),
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
    id: z.guid(),
    tagId: z.guid(),
    targetType: TaggableTypeSchema,
    targetId: z.string(),
    attachedByUserId: z.string(),
    attachedAt: z.iso.datetime(),
  })
  .meta({ id: 'TagAttachment' });

export const CategoryAttachmentSchema = z
  .object({
    id: z.guid(),
    categoryId: z.guid(),
    targetType: TaggableTypeSchema,
    targetId: z.string(),
    attachedByUserId: z.string(),
    attachedAt: z.iso.datetime(),
  })
  .meta({ id: 'CategoryAttachment' });

export const CreateTagAttachmentSchema = z
  .object({
    tagId: z.guid(),
    targetType: TaggableTypeSchema,
    targetId: z.string().min(1),
  })
  .meta({ id: 'CreateTagAttachmentInput' });

export const CreateCategoryAttachmentSchema = z
  .object({
    categoryId: z.guid(),
    targetType: TaggableTypeSchema,
    targetId: z.string().min(1),
  })
  .meta({ id: 'CreateCategoryAttachmentInput' });

// ── List-query mixin for integrating modules ─────────────────────────────
export const LabelFilterSchema = z
  .object({
    tag: z.array(z.guid()).optional(),
    category: z.array(z.guid()).optional(),
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
