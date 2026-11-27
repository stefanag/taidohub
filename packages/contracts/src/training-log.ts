import { z } from 'zod';

import { ContentTypeSchema } from './progress.js';

/**
 * The training log and personal training goals of the signed-in user. See
 * docs/superpowers/plans/2026-11-26-self-registration.md (phase 2).
 */

const UUID_EXAMPLE = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';

export const TRAINING_SESSION_KINDS = ['club', 'own', 'camp', 'seminar'] as const;
export const TrainingSessionKindSchema = z
  .enum(TRAINING_SESSION_KINDS)
  .meta({ id: 'TrainingSessionKind', description: 'Club session, own training, camp or seminar.' });
export type TrainingSessionKind = z.infer<typeof TrainingSessionKindSchema>;

export const TrainingSessionItemSchema = z
  .object({ contentType: ContentTypeSchema, contentId: z.uuid() })
  .meta({
    id: 'TrainingSessionItem',
    description: 'A technique or pattern practised in a session.',
  });
export type TrainingSessionItem = z.infer<typeof TrainingSessionItemSchema>;

export const TrainingSessionSchema = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    durationMinutes: z.number().int().positive().nullable(),
    kind: TrainingSessionKindSchema,
    notes: z.string().nullable(),
    items: z.array(TrainingSessionItemSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'TrainingSession',
    description: 'One entry in the training log.',
    example: {
      id: UUID_EXAMPLE,
      date: '2026-11-26',
      durationMinutes: 90,
      kind: 'club',
      notes: 'Worked on sen-un.',
      items: [{ contentType: 'pattern', contentId: UUID_EXAMPLE }],
      createdAt: '2026-11-26T19:00:00.000Z',
      updatedAt: '2026-11-26T19:00:00.000Z',
    },
  });
export type TrainingSession = z.infer<typeof TrainingSessionSchema>;

export const SaveTrainingSessionSchema = z
  .object({
    date: z.iso.date(),
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .nullable()
      .optional(),
    kind: TrainingSessionKindSchema,
    notes: z.string().trim().max(4000).nullable().optional(),
    items: z.array(TrainingSessionItemSchema).max(100).default([]),
  })
  .meta({
    id: 'SaveTrainingSessionInput',
    description:
      'Create or replace a session. The practised items get their "last practised" date moved up to the session date.',
  });
export type SaveTrainingSessionInput = z.infer<typeof SaveTrainingSessionSchema>;

export const ListTrainingSessionsQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .meta({ id: 'ListTrainingSessionsQuery', description: 'Inclusive date range; newest first.' });
export type ListTrainingSessionsQuery = z.infer<typeof ListTrainingSessionsQuerySchema>;

export const TrainingGoalSchema = z
  .object({
    targetRankId: z.uuid().nullable(),
    targetDate: z.iso.date().nullable(),
    sessionsPerWeek: z.number().int().min(1).max(14).nullable(),
  })
  .meta({
    id: 'TrainingGoal',
    description:
      'Personal goals: a rank to reach by a date, and how many sessions a week. All optional.',
    example: { targetRankId: UUID_EXAMPLE, targetDate: '2027-09-01', sessionsPerWeek: 3 },
  });
export type TrainingGoal = z.infer<typeof TrainingGoalSchema>;

export const TrainingLogOpenApiRegistry = {
  TrainingSessionKind: TrainingSessionKindSchema,
  TrainingSessionItem: TrainingSessionItemSchema,
  TrainingSession: TrainingSessionSchema,
  SaveTrainingSessionInput: SaveTrainingSessionSchema,
  ListTrainingSessionsQuery: ListTrainingSessionsQuerySchema,
  TrainingGoal: TrainingGoalSchema,
} as const;
