import { z } from 'zod';

import { PROGRESS_STATUSES } from './progress.js';

export const StudentRosterRowSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  organisations: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
  })),
  progressSummary: z.object(Object.fromEntries(
    PROGRESS_STATUSES.map((s) => [s, z.number().int().nonnegative()]),
  ) as Record<typeof PROGRESS_STATUSES[number], z.ZodNumber>),
}).meta({
  id: 'StudentRosterRow',
  description: 'A student visible to the calling instructor (or any student for sysadmin).',
});

export type StudentRosterRow = z.infer<typeof StudentRosterRowSchema>;

export const StudentsOpenApiRegistry = {
  StudentRosterRow: StudentRosterRowSchema,
} as const;
