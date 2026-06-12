import { z } from './zod-openapi.js';

const ISO_DATETIME_EXAMPLE = '2026-05-24T08:00:00.000Z';
const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

/**
 * A belt system — a family of ranks (Kyu, Dan, Mon). Always global; per-org
 * catalogs are expressed by scoping individual `belt_ranks` to an
 * organisation while still pointing at one of these global systems.
 */
export const BeltSystemSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().min(1).max(3),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    sortOrder: z.number().int().min(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({
    id: 'BeltSystem',
    description: 'A family of belt ranks (Kyu, Dan, Mon).',
    example: {
      id: UUID_EXAMPLE,
      code: 'kyu',
      nameEn: 'Kyu',
      nameSv: 'Kyu',
      nameFi: 'Kyu',
      sortOrder: 1,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type BeltSystem = z.infer<typeof BeltSystemSchema>;

export const CreateBeltSystemSchema = z
  .object({
    code: z.string().min(1).max(3),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    sortOrder: z.number().int().min(0).default(0),
  })
  .meta({
    id: 'CreateBeltSystemInput',
    description: 'Create-belt-system payload.',
  });

export type CreateBeltSystemInput = z.infer<typeof CreateBeltSystemSchema>;

export const UpdateBeltSystemSchema = z
  .object({
    code: z.string().min(1).max(3).optional(),
    nameEn: z.string().min(1).max(100).optional(),
    nameSv: z.string().min(1).max(100).optional(),
    nameFi: z.string().min(1).max(100).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .meta({
    id: 'UpdateBeltSystemInput',
    description: 'Update-belt-system patch — omit a field to leave it unchanged.',
  });

export type UpdateBeltSystemInput = z.infer<typeof UpdateBeltSystemSchema>;

export const BeltSystemsOpenApiRegistry = {
  BeltSystem: BeltSystemSchema,
  CreateBeltSystemInput: CreateBeltSystemSchema,
  UpdateBeltSystemInput: UpdateBeltSystemSchema,
} as const;
