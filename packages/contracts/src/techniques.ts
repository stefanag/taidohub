import { z } from 'zod';

import {
  ClassificationCategorySchema,
  RootCodeSchema,
} from './classification-category.js';

/** Allowed taxonomy roots a Technique can link against. */
export const TECHNIQUE_ALLOWED_ROOTS = [
  'technique_type',
  'sotai_category',
  'attack_type',
] as const;
export const TECHNIQUE_REQUIRED_ROOT = 'technique_type' as const;

export const TechniqueSchema = z
  .object({
    id: z.string().uuid(),
    createdByOrganisationId: z.string().uuid().nullable(),
    isKihon: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
    minRankId: z.string().uuid().nullable(),
    nameJa: z.string(),
    nameRomaji: z.string(),
    nameSv: z.string(),
    nameEn: z.string(),
    nameFi: z.string(),
    descriptionSv: z.string(),
    descriptionEn: z.string(),
    descriptionFi: z.string(),
    classificationsByRoot: z.object({
      technique_type: z.array(ClassificationCategorySchema),
      sotai_category: z.array(ClassificationCategorySchema),
      attack_type: z.array(ClassificationCategorySchema),
    }),
    classifications: z.array(
      ClassificationCategorySchema.extend({ rootCode: RootCodeSchema }),
    ),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'Technique',
    description:
      'A classified technique catalogue entry. Multiple classifications per dimension allowed.',
    example: {
      id: '22222222-2222-2222-2222-222222222222',
      createdByOrganisationId: null,
      isKihon: true,
      isActive: true,
      sortOrder: 0,
      minRankId: null,
      nameJa: '',
      nameRomaji: 'mae geri',
      nameSv: 'Främre spark',
      nameEn: 'Front kick',
      nameFi: 'Etupotku',
      descriptionSv: '',
      descriptionEn: '',
      descriptionFi: '',
      classificationsByRoot: {
        technique_type: [],
        sotai_category: [],
        attack_type: [],
      },
      classifications: [],
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    },
  });

export const CreateTechniqueSchema = z
  .object({
    classificationIds: z
      .array(z.string().uuid())
      .min(1, 'at least one classification required'),
    organisationId: z.string().uuid().nullable().optional(),
    isKihon: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().nonnegative().default(0),
    minRankId: z.string().uuid().nullable().optional(),
    nameJa: z.string().default(''),
    nameRomaji: z.string().min(1),
    nameSv: z.string().default(''),
    nameEn: z.string().default(''),
    nameFi: z.string().default(''),
    descriptionSv: z.string().default(''),
    descriptionEn: z.string().default(''),
    descriptionFi: z.string().default(''),
  })
  .meta({
    id: 'CreateTechniqueInput',
    description:
      'Body for POST /api/techniques. Backend additionally enforces that at least one classification id resolves to the technique_type root.',
  });

export const UpdateTechniqueSchema = CreateTechniqueSchema.partial().meta({
  id: 'UpdateTechniqueInput',
  description:
    'Body for PATCH /api/techniques/:id. classificationIds is REPLACE-semantics when present.',
});

export type Technique = z.infer<typeof TechniqueSchema>;
export type CreateTechniqueInput = z.infer<typeof CreateTechniqueSchema>;
export type UpdateTechniqueInput = z.infer<typeof UpdateTechniqueSchema>;

export const TechniqueOpenApiRegistry = {
  Technique: TechniqueSchema,
  CreateTechniqueInput: CreateTechniqueSchema,
  UpdateTechniqueInput: UpdateTechniqueSchema,
} as const;
