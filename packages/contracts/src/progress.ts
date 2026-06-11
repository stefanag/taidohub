import { z } from 'zod';

export const PROGRESS_STATUSES = ['not_started', 'learning', 'competent', 'grading_ready'] as const;
export const ProgressStatusSchema = z.enum(PROGRESS_STATUSES);
export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

export const CONTENT_TYPES = ['technique', 'pattern'] as const;
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof ContentTypeSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  contentType: ContentTypeSchema,
  techniqueId: z.string().uuid().nullable(),
  patternId: z.string().uuid().nullable(),
  status: ProgressStatusSchema,
  notes: z.string(),
  lastPracticedAt: IsoDate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({
  id: 'Progress',
  description: 'Per-user progress on a single technique or pattern.',
  example: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-abc',
    contentType: 'technique',
    techniqueId: '550e8400-e29b-41d4-a716-446655440001',
    patternId: null,
    status: 'learning',
    notes: '',
    lastPracticedAt: '2026-06-11',
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  },
});

export const UpsertProgressSchema = z.object({
  status: ProgressStatusSchema,
  notes: z.string().max(2000).default(''),
  lastPracticedAt: IsoDate.nullable().optional(),
}).meta({
  id: 'UpsertProgressInput',
  description: 'Body for PUT /api/progress/{contentType}/:id. Notes default to empty string. lastPracticedAt is optional.',
});

export type Progress = z.infer<typeof ProgressSchema>;
export type UpsertProgressInput = z.infer<typeof UpsertProgressSchema>;

export const ProgressOpenApiRegistry = {
  Progress: ProgressSchema,
  UpsertProgressInput: UpsertProgressSchema,
} as const;
