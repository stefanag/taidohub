import { CreateRankHistorySchema } from './rank-history.js';
import { z } from './zod-openapi.js';


const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2026-11-24T19:00:00.000Z';

/** Kinds of write an AI client can propose. One entry per supported operation. */
export const PendingOperationTypeSchema = z.enum(['rank_history.create']).meta({
  id: 'PendingOperationType',
  description: 'What a pending operation will do when approved.',
});
export type PendingOperationType = z.infer<typeof PendingOperationTypeSchema>;

export const PendingOperationStatusSchema = z
  .enum(['pending', 'approved', 'rejected', 'failed'])
  .meta({
    id: 'PendingOperationStatus',
    description:
      '`pending` until its proposer decides. `failed` means approval was attempted but the write was refused; nothing was written.',
  });
export type PendingOperationStatus = z.infer<typeof PendingOperationStatusSchema>;

/** Channel a pending operation was proposed through. */
export const PendingOperationViaSchema = z.enum(['mcp']).meta({
  id: 'PendingOperationVia',
  description: 'Where the proposal came from. Only `mcp` (an AI client) today.',
});

/**
 * Parameters of a proposed grading entry: the rank-history create payload
 * plus the student it is for. Strict so an AI client cannot smuggle extra
 * fields through.
 */
export const ProposeRankEntrySchema = z
  .strictObject({
    studentUserId: z.string().min(1),
    ...CreateRankHistorySchema.shape,
  })
  .meta({
    id: 'ProposeRankEntryInput',
    description: 'A grading entry to add to a student’s rank history once approved.',
  });
export type ProposeRankEntryInput = z.infer<typeof ProposeRankEntrySchema>;

/** Readable facts about a proposed grading entry, resolved when it was proposed. */
export const RankEntryPreviewSchema = z
  .object({
    studentUserId: z.string(),
    studentName: z.string().nullable(),
    rankId: z.uuid(),
    rankName: z.string(),
    date: z.string(),
    shogoTitle: z.string().nullable(),
    examinerName: z.string().nullable(),
    organisationName: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .meta({
    id: 'RankEntryPreview',
    description: 'What a proposed grading entry will record, with names resolved for display.',
  });
export type RankEntryPreview = z.infer<typeof RankEntryPreviewSchema>;

export const PendingOperationSchema = z
  .object({
    id: z.uuid(),
    type: PendingOperationTypeSchema,
    status: PendingOperationStatusSchema,
    params: ProposeRankEntrySchema,
    preview: RankEntryPreviewSchema,
    createdByUserId: z.string(),
    createdVia: PendingOperationViaSchema,
    resultEntityId: z.uuid().nullable(),
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .meta({
    id: 'PendingOperation',
    description:
      'A write proposed by an AI client. Nothing is written until the user who proposed it approves it in the web app.',
    example: {
      id: UUID_EXAMPLE,
      type: 'rank_history.create',
      status: 'pending',
      params: { studentUserId: 'usr_123', rankId: UUID_EXAMPLE, date: '2026-11-20' },
      preview: {
        studentUserId: 'usr_123',
        studentName: 'Aino Virtanen',
        rankId: UUID_EXAMPLE,
        rankName: '5 kyu',
        date: '2026-11-20',
        shogoTitle: null,
        examinerName: null,
        organisationName: null,
        notes: null,
      },
      createdByUserId: 'usr_456',
      createdVia: 'mcp',
      resultEntityId: null,
      error: null,
      createdAt: ISO_DATETIME_EXAMPLE,
      decidedAt: null,
    },
  });
export type PendingOperation = z.infer<typeof PendingOperationSchema>;

export const ListPendingOperationsQuerySchema = z
  .object({ status: PendingOperationStatusSchema.optional() })
  .meta({ id: 'ListPendingOperationsQuery' });
export type ListPendingOperationsQuery = z.infer<typeof ListPendingOperationsQuerySchema>;

export const ListPendingOperationsResponseSchema = z
  .object({ data: PendingOperationSchema.array() })
  .meta({
    id: 'ListPendingOperationsResponse',
    description: 'The calling user’s own pending operations, newest first.',
  });
export type ListPendingOperationsResponse = z.infer<typeof ListPendingOperationsResponseSchema>;

export const PendingOperationsOpenApiRegistry = {
  PendingOperation: PendingOperationSchema,
  PendingOperationType: PendingOperationTypeSchema,
  PendingOperationStatus: PendingOperationStatusSchema,
  ProposeRankEntryInput: ProposeRankEntrySchema,
  RankEntryPreview: RankEntryPreviewSchema,
  ListPendingOperationsResponse: ListPendingOperationsResponseSchema,
} as const;
