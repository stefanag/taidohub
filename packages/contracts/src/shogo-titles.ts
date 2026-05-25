import { z } from './zod-openapi.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

/**
 * Honorary titles overlaid on Dan ranks (Renshi, Kyoshi, Hanshi). `code` is
 * the stable identifier; `sortOrder` defines the "highest verified" ordering
 * used by the shogo recompute path (renshi < kyoshi < hanshi).
 */
export const ShogoTitleSchema = z
  .object({
    code: z.string().min(1).max(30),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    nameJa: z.string().min(1).max(100),
    minRankId: z.string().uuid(),
    sortOrder: z.number().int().min(0),
  })
  .meta({
    id: 'ShogoTitle',
    description: 'Honorary title (Renshi / Kyoshi / Hanshi).',
    example: {
      code: 'renshi',
      nameEn: 'Renshi',
      nameSv: 'Renshi',
      nameFi: 'Renshi',
      nameJa: '錬士',
      minRankId: UUID_EXAMPLE,
      sortOrder: 1,
    },
  });

export type ShogoTitle = z.infer<typeof ShogoTitleSchema>;

export const CreateShogoTitleSchema = z
  .object({
    code: z.string().min(1).max(30),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    nameJa: z.string().min(1).max(100),
    minRankId: z.string().uuid(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .meta({
    id: 'CreateShogoTitleInput',
    description: 'Create-shogo-title payload.',
  });

export type CreateShogoTitleInput = z.infer<typeof CreateShogoTitleSchema>;

export const UpdateShogoTitleSchema = z
  .object({
    nameEn: z.string().min(1).max(100).optional(),
    nameSv: z.string().min(1).max(100).optional(),
    nameFi: z.string().min(1).max(100).optional(),
    nameJa: z.string().min(1).max(100).optional(),
    minRankId: z.string().uuid().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .meta({
    id: 'UpdateShogoTitleInput',
    description: 'Update-shogo-title patch — omit a field to leave it unchanged.',
  });

export type UpdateShogoTitleInput = z.infer<typeof UpdateShogoTitleSchema>;

export const ShogoTitlesOpenApiRegistry = {
  ShogoTitle: ShogoTitleSchema,
  CreateShogoTitleInput: CreateShogoTitleSchema,
  UpdateShogoTitleInput: UpdateShogoTitleSchema,
} as const;
