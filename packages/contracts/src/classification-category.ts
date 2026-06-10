import { z } from 'zod';

/**
 * Stable handles for the three classification taxonomy roots used by the
 * techniques feature. (Pattern roots — `pattern_type`, `hokei_subtype` —
 * land with Phase 2.)
 */
export const ROOT_CODES = ['technique_type', 'sotai_category', 'attack_type'] as const;
export const RootCodeSchema = z.enum(ROOT_CODES);
export type RootCode = z.infer<typeof RootCodeSchema>;

export const ClassificationCategorySchema = z
  .object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    rootCode: RootCodeSchema.nullable(),
    code: z.string().min(1),
    nameEn: z.string(),
    nameSv: z.string(),
    nameFi: z.string(),
    nameJa: z.string(),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .meta({
    id: 'ClassificationCategory',
    description: 'A node in the classification taxonomy (root or child of a root).',
    example: {
      id: '11111111-1111-1111-1111-111111111111',
      parentId: '00000000-0000-0000-0000-000000000000',
      rootCode: 'attack_type',
      code: 'kick',
      nameEn: 'Kick',
      nameSv: 'Spark',
      nameFi: 'Potku',
      nameJa: '',
      sortOrder: 0,
      isActive: true,
    },
  });

export const UpdateClassificationCategorySchema = z
  .object({
    nameEn: z.string().min(1).optional(),
    nameSv: z.string().min(1).optional(),
    nameFi: z.string().min(1).optional(),
    nameJa: z.string().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .meta({
    id: 'UpdateClassificationCategoryInput',
    description: 'Patch a classification-category row. Code, parent, and id are immutable.',
  });

export type ClassificationCategory = z.infer<typeof ClassificationCategorySchema>;
export type UpdateClassificationCategoryInput = z.infer<typeof UpdateClassificationCategorySchema>;

export const ClassificationCategoryOpenApiRegistry = {
  ClassificationCategory: ClassificationCategorySchema,
  UpdateClassificationCategoryInput: UpdateClassificationCategorySchema,
} as const;
