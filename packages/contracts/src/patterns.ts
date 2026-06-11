import { z } from 'zod';

import {
  ClassificationCategorySchema,
  RootCodeSchema,
} from './classification-category.js';

/** Allowed taxonomy roots a Pattern can link against. */
export const PATTERN_ALLOWED_ROOTS = ['pattern_type', 'hokei_subtype'] as const;
export const PATTERN_REQUIRED_ROOT = 'pattern_type' as const;

export const PatternSchema = z
  .object({
    id: z.string().uuid(),
    createdByOrganisationId: z.string().uuid().nullable(),
    officialBodyOrgId: z.string().uuid().nullable(),
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
      pattern_type: z.array(ClassificationCategorySchema),
      hokei_subtype: z.array(ClassificationCategorySchema),
    }),
    classifications: z.array(
      ClassificationCategorySchema.extend({ rootCode: RootCodeSchema }),
    ),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'Pattern',
    description:
      'A classified pattern catalogue entry. Multiple classifications per dimension allowed.',
    example: {
      id: '33333333-3333-4333-8333-333333333333',
      createdByOrganisationId: null,
      officialBodyOrgId: null,
      isActive: true,
      sortOrder: 0,
      minRankId: null,
      nameJa: '',
      nameRomaji: 'sei no hokei',
      nameSv: 'Sei no hokei',
      nameEn: 'Sei no hokei',
      nameFi: 'Sei no hokei',
      descriptionSv: '',
      descriptionEn: '',
      descriptionFi: '',
      classificationsByRoot: { pattern_type: [], hokei_subtype: [] },
      classifications: [],
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    },
  });

export const CreatePatternSchema = z
  .object({
    classificationIds: z
      .array(z.string().uuid())
      .min(1, 'at least one classification required'),
    organisationId: z.string().uuid().nullable().optional(),
    officialBodyOrgId: z.string().uuid().nullable().optional(),
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
    id: 'CreatePatternInput',
    description:
      'Body for POST /api/patterns. Backend additionally enforces that at least one classification id resolves to the pattern_type root.',
  });

export const UpdatePatternSchema = CreatePatternSchema.partial().meta({
  id: 'UpdatePatternInput',
  description:
    'Body for PATCH /api/patterns/:id. classificationIds is REPLACE-semantics when present.',
});

export type Pattern = z.infer<typeof PatternSchema>;
export type CreatePatternInput = z.infer<typeof CreatePatternSchema>;
export type UpdatePatternInput = z.infer<typeof UpdatePatternSchema>;

export const PatternOpenApiRegistry = {
  Pattern: PatternSchema,
  CreatePatternInput: CreatePatternSchema,
  UpdatePatternInput: UpdatePatternSchema,
} as const;
