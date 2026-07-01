import { GradingRequirementsSchema } from './grading-requirements.js';
import { z } from './zod-openapi.js';

const ISO_DATETIME_EXAMPLE = '2026-05-24T08:00:00.000Z';
const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Named colours the BeltGraphic component understands. */
export const BELT_COLORS = ['yellow', 'magenta', 'green', 'brown', 'black', 'white'] as const;
export const BeltColorSchema = z.enum(BELT_COLORS);
export type BeltColor = z.infer<typeof BeltColorSchema>;

/**
 * Per-rank visual spec consumed by `<BeltGraphic>`. The `gradient` is the
 * belt's base colour; the optional fields paint extras (kyu badges, mon
 * stripes, shogo overlay).
 */
export const BeltVisualsSchema = z
  .object({
    gradient: BeltColorSchema,
    badge: z.boolean().optional(),
    stripe: BeltColorSchema.optional(),
    midLine: BeltColorSchema.optional(),
    midLineGradient: z.boolean().optional(),
    overlayTopHalf: BeltColorSchema.optional(),
  })
  .meta({
    id: 'BeltVisuals',
    description: 'Visual specification for a belt rank graphic.',
    example: { gradient: 'yellow', badge: true },
  });

export type BeltVisuals = z.infer<typeof BeltVisualsSchema>;

const slugRequiredWhenPublic = (v: Record<string, unknown>): boolean => {
  if (v['publiclyVisible'] !== true) return true;
  return typeof v['slug'] === 'string' && v['slug'].length > 0;
};

const SLUG_RULE_MSG = 'Slug required when publicly visible.';

/**
 * A specific rank inside a belt system (5th Kyu, 3rd Dan). `level` ascends
 * within the system (1 = lowest). `sortOrder` is the global display order
 * across systems. `nextRankId` is an explicit "next in ladder" override.
 */
export const CreateBeltRankSchema = z
  .object({
    organisationId: z.string().uuid().nullable().optional(),
    systemId: z.string().uuid(),
    level: z.number().int().nonnegative(),
    sortOrder: z.number().int().min(0).default(0),
    nameJa: z.string().max(100).nullable().default(null),
    nameRomaji: z.string().min(1).max(100),
    nameEn: z.string().max(100).default(''),
    nameSv: z.string().max(100).default(''),
    nameFi: z.string().max(100).default(''),
    beltColor: z.string().regex(HEX_COLOR_REGEX, 'Must be a six-digit hex colour, e.g. #FFD700.'),
    visuals: BeltVisualsSchema.default({ gradient: 'white' }),
    imageUrl: z.string().url().nullable().optional(),
    descriptionEn: z.string().nullable().default(null),
    descriptionSv: z.string().nullable().default(null),
    descriptionFi: z.string().nullable().default(null),
    publiclyVisible: z.boolean().default(false),
    slug: z
      .string()
      .regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, and hyphens only.')
      .nullable()
      .optional(),
    minAge: z.number().int().min(0).nullable().optional(),
    nextRankId: z.string().uuid().nullable().optional(),
  })
  .refine(slugRequiredWhenPublic, { path: ['slug'], message: SLUG_RULE_MSG })
  .meta({
    id: 'CreateBeltRankInput',
    description: 'Create-belt-rank payload.',
  });

export type CreateBeltRankInput = z.infer<typeof CreateBeltRankSchema>;

export const UpdateBeltRankSchema = z
  .object({
    organisationId: z.string().uuid().nullable().optional(),
    systemId: z.string().uuid().optional(),
    level: z.number().int().nonnegative().optional(),
    sortOrder: z.number().int().min(0).optional(),
    nameJa: z.string().max(100).nullable().optional(),
    nameRomaji: z.string().min(1).max(100).optional(),
    nameEn: z.string().max(100).optional(),
    nameSv: z.string().max(100).optional(),
    nameFi: z.string().max(100).optional(),
    beltColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'Must be a six-digit hex colour, e.g. #FFD700.')
      .optional(),
    visuals: BeltVisualsSchema.optional(),
    imageUrl: z.string().url().nullable().optional(),
    descriptionEn: z.string().nullable().optional(),
    descriptionSv: z.string().nullable().optional(),
    descriptionFi: z.string().nullable().optional(),
    publiclyVisible: z.boolean().optional(),
    slug: z
      .string()
      .regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, and hyphens only.')
      .nullable()
      .optional(),
    minAge: z.number().int().min(0).nullable().optional(),
    nextRankId: z.string().uuid().nullable().optional(),
  })
  .refine(slugRequiredWhenPublic, { path: ['slug'], message: SLUG_RULE_MSG })
  .meta({
    id: 'UpdateBeltRankInput',
    description: 'Update-belt-rank patch — omit a field to leave it unchanged.',
  });

export type UpdateBeltRankInput = z.infer<typeof UpdateBeltRankSchema>;

export const BeltRankSchema = z
  .object({
    id: z.string().uuid(),
    organisationId: z.string().uuid().nullable(),
    systemId: z.string().uuid(),
    level: z.number().int().nonnegative(),
    sortOrder: z.number().int().min(0),
    nameJa: z.string().nullable(),
    nameRomaji: z.string(),
    nameEn: z.string(),
    nameSv: z.string(),
    nameFi: z.string(),
    beltColor: z.string(),
    visuals: BeltVisualsSchema,
    imageUrl: z.string().nullable(),
    descriptionEn: z.string().nullable(),
    descriptionSv: z.string().nullable(),
    descriptionFi: z.string().nullable(),
    publiclyVisible: z.boolean(),
    slug: z.string().nullable(),
    minAge: z.number().int().nullable(),
    nextRankId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({
    id: 'BeltRank',
    description: 'A specific rank inside a belt system.',
    example: {
      id: UUID_EXAMPLE,
      organisationId: null,
      systemId: UUID_EXAMPLE,
      level: 1,
      sortOrder: 10,
      nameJa: null,
      nameRomaji: 'Jukyu',
      nameEn: '10th Kyu',
      nameSv: '10 Kyu',
      nameFi: '10. Kyu',
      beltColor: '#FFFFFF',
      visuals: { gradient: 'white' },
      imageUrl: null,
      descriptionEn: null,
      descriptionSv: null,
      descriptionFi: null,
      publiclyVisible: false,
      slug: null,
      minAge: null,
      nextRankId: null,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type BeltRank = z.infer<typeof BeltRankSchema>;

/**
 * Public response for `GET /api/public/ranks/:slug`. Embeds the rank itself
 * plus the system (so the page can compute BeltGraphic visuals) and a small
 * organisation summary (for footer attribution). Returned only when
 * `publiclyVisible=true`; the controller 404s otherwise.
 *
 * `requirements` is the resolved `GradingRequirements` projection for the
 * rank's organisation's active `RequirementSet`, or `null` when the
 * organisation (or the global default) has no active set — e.g. the
 * requirements editor hasn't been used yet for this rank.
 */
export const PublicRankResponseSchema = z
  .object({
    rank: BeltRankSchema,
    system: z.object({
      id: z.string().uuid(),
      code: z.string(),
      nameEn: z.string(),
      nameSv: z.string(),
      nameFi: z.string(),
    }),
    organisation: z
      .object({
        id: z.string().uuid(),
        shortCode: z.string(),
        nameEn: z.string(),
        nameSv: z.string(),
        nameFi: z.string(),
      })
      .nullable(),
    requirements: GradingRequirementsSchema.nullable(),
  })
  .meta({
    id: 'PublicRankResponse',
    description:
      'A publicly-visible rank plus its system, an (optional) organisation summary, and the resolved grading requirements for its active requirement set (null when none is active).',
  });

export type PublicRankResponse = z.infer<typeof PublicRankResponseSchema>;

export const BeltRanksOpenApiRegistry = {
  BeltRank: BeltRankSchema,
  BeltVisuals: BeltVisualsSchema,
  CreateBeltRankInput: CreateBeltRankSchema,
  UpdateBeltRankInput: UpdateBeltRankSchema,
  PublicRankResponse: PublicRankResponseSchema,
} as const;
