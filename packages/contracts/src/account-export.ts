import { z } from 'zod';

import { OrganisationMembershipSchema } from './memberships.js';
import { UserProfileSchema } from './profile.js';
import { ProgressSchema } from './progress.js';
import { RankHistorySchema } from './rank-history.js';
import { TrainingGoalSchema, TrainingSessionSchema } from './training-log.js';

/**
 * Everything the platform stores about the signed-in user, for their own use
 * and for data portability (GDPR art. 20). See
 * docs/superpowers/plans/2026-11-26-self-registration.md (phase 3).
 */

export const AccountExportAcknowledgementSchema = z
  .object({
    versionId: z.uuid(),
    type: z.enum(['accepted', 'received']),
    displayedLocale: z.string(),
    authoritativeContentHash: z.string(),
    acknowledgedAt: z.iso.datetime(),
  })
  .meta({ id: 'AccountExportAcknowledgement', description: 'A legal text the user accepted or received.' });

export const AccountExportSchema = z
  .object({
    exportedAt: z.iso.datetime(),
    account: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
      locale: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
    profile: UserProfileSchema,
    memberships: z.array(OrganisationMembershipSchema),
    gradingHistory: z.array(RankHistorySchema),
    progress: z.array(ProgressSchema),
    trainingSessions: z.array(TrainingSessionSchema),
    trainingGoal: TrainingGoalSchema,
    legalAcknowledgements: z.array(AccountExportAcknowledgementSchema),
  })
  .meta({ id: 'AccountExport', description: 'The signed-in user’s own data, as JSON.' });
export type AccountExport = z.infer<typeof AccountExportSchema>;

export const AccountExportOpenApiRegistry = {
  AccountExportAcknowledgement: AccountExportAcknowledgementSchema,
  AccountExport: AccountExportSchema,
} as const;
