import { z } from './zod-openapi.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2026-05-24T08:00:00.000Z';

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD form.')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Date is not a real calendar date.');

export const RankHistoryResultSchema = z.enum(['pass', 'fail']).meta({
  id: 'RankHistoryResult',
  description: 'Outcome of a grading: pass or fail.',
});

export type RankHistoryResult = z.infer<typeof RankHistoryResultSchema>;

export const RankHistorySourceSchema = z.enum(['event', 'external']).meta({
  id: 'RankHistorySource',
  description: 'Origin of a rank-history row: a grading event or a manual external entry.',
});

export type RankHistorySource = z.infer<typeof RankHistorySourceSchema>;

/**
 * Payload for creating a manual external rank-history entry. The server
 * stamps `source='external'`, `result='pass'`, `recordedByUserId=actor`,
 * `verified=false`, and `eventId=null`.
 */
export const CreateRankHistorySchema = z
  .object({
    rankId: z.string().uuid(),
    shogoTitle: z.string().min(1).max(50).nullable().optional(),
    date: DateStringSchema,
    examinerName: z.string().max(200).nullable().optional(),
    organisationName: z.string().max(200).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .meta({
    id: 'CreateRankHistoryInput',
    description: 'Create-external-rank-history payload.',
  });

export type CreateRankHistoryInput = z.infer<typeof CreateRankHistorySchema>;

/**
 * Patch for updating an external rank-history entry. Touching `rankId`,
 * `date`, or `shogoTitle` on a verified row clears its verification atomically
 * (service-layer rule).
 */
export const UpdateRankHistorySchema = z
  .object({
    rankId: z.string().uuid().optional(),
    shogoTitle: z.string().min(1).max(50).nullable().optional(),
    date: DateStringSchema.optional(),
    examinerName: z.string().max(200).nullable().optional(),
    organisationName: z.string().max(200).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .meta({
    id: 'UpdateRankHistoryInput',
    description: 'Update-external-rank-history patch.',
  });

export type UpdateRankHistoryInput = z.infer<typeof UpdateRankHistorySchema>;

/**
 * Full read-row shape for a single `rank_history` record. Used by the
 * direct `GET /api/rank-history/:userId` admin endpoint (no projection
 * hydration). The unified projection uses `GradingHistoryRowSchema` instead.
 */
export const RankHistorySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string(),
    rankId: z.string().uuid(),
    shogoTitle: z.string().nullable(),
    date: DateStringSchema,
    result: RankHistoryResultSchema,
    source: RankHistorySourceSchema,
    eventId: z.string().uuid().nullable(),
    recordedByUserId: z.string(),
    examinerName: z.string().nullable(),
    organisationName: z.string().nullable(),
    notes: z.string().nullable(),
    verified: z.boolean(),
    verifiedByUserId: z.string().nullable(),
    verifiedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().nullable(),
    updatedByUserId: z.string().nullable(),
  })
  .meta({
    id: 'RankHistory',
    description: 'A single grading record (external or event-sourced).',
    example: {
      id: UUID_EXAMPLE,
      userId: 'u-1',
      rankId: UUID_EXAMPLE,
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-1',
      examinerName: 'Sensei Tanaka',
      organisationName: 'Kobe Dojo',
      notes: null,
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: null,
      updatedByUserId: null,
    },
  });

export type RankHistory = z.infer<typeof RankHistorySchema>;

/**
 * One row of the unified `GET /api/grading-events/history/:userId` projection.
 * Examiner and organisationName are hydrated server-side (from the event
 * join when `source='event'`; from row columns when `source='external'`).
 * `canVerify` / `canEdit` are per-row capability flags computed for the
 * current actor.
 */
export const GradingHistoryRowSchema = z
  .object({
    id: z.string().uuid(),
    source: RankHistorySourceSchema,
    userId: z.string(),
    rankId: z.string().uuid(),
    shogoTitle: z.string().nullable(),
    date: DateStringSchema,
    result: RankHistoryResultSchema,
    notes: z.string().nullable(),
    examiner: z.string().nullable(),
    organisationName: z.string().nullable(),
    verified: z.boolean(),
    verifiedBy: z
      .object({ id: z.string(), name: z.string() })
      .nullable(),
    verifiedAt: z.string().datetime().nullable(),
    canVerify: z.boolean(),
    canEdit: z.boolean(),
    updatedAt: z.string().datetime().nullable(),
    updatedByUserId: z.string().nullable(),
  })
  .meta({
    id: 'GradingHistoryRow',
    description: 'One unified-projection row including per-actor capability flags.',
  });

export type GradingHistoryRow = z.infer<typeof GradingHistoryRowSchema>;

export const GradingHistoryResponseSchema = z
  .object({
    data: GradingHistoryRowSchema.array(),
  })
  .meta({
    id: 'GradingHistoryResponse',
    description: 'Response envelope for the unified grading-history projection.',
  });

export type GradingHistoryResponse = z.infer<typeof GradingHistoryResponseSchema>;

export const RankHistoryOpenApiRegistry = {
  RankHistoryResult: RankHistoryResultSchema,
  RankHistorySource: RankHistorySourceSchema,
  RankHistory: RankHistorySchema,
  CreateRankHistoryInput: CreateRankHistorySchema,
  UpdateRankHistoryInput: UpdateRankHistorySchema,
  GradingHistoryRow: GradingHistoryRowSchema,
  GradingHistoryResponse: GradingHistoryResponseSchema,
} as const;
