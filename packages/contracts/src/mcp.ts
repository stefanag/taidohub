/**
 * Input and output shapes of the MCP server's tools and resources.
 *
 * Every tool input is a `z.strictObject` so its JSON Schema carries
 * `additionalProperties: false`. Outputs are objects, returned as the tool's
 * `structuredContent`. These are not HTTP bodies and are not part of the
 * OpenAPI document; the MCP server publishes them itself in `tools/list`.
 */

import { GradingRequirementsSchema } from './grading-requirements.js';
import { MembershipRoleSchema } from './memberships.js';
import { OrganisationTypeSchema } from './organisations.js';
import {
  PendingOperationSchema,
  ProposeRankEntrySchema,
  RankEntryPreviewSchema,
} from './pending-operations.js';
import { ProgressSchema } from './progress.js';
import { OrganisationStatsSchema, PlatformStatsSchema } from './statistics.js';
import { StudentRosterRowSchema } from './students.js';
import { RoleSchema } from './users.js';
import { z } from './zod-openapi.js';


// ── Resource: taidohub://me ─────────────────────────────────────────────

export const McpMeSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  role: RoleSchema,
  memberships: z.array(
    z.object({
      organisationId: z.uuid(),
      organisationName: z.string(),
      role: MembershipRoleSchema,
    }),
  ),
});
export type McpMe = z.infer<typeof McpMeSchema>;

// ── Shared inputs ───────────────────────────────────────────────────────

export const McpEmptyInputSchema = z.strictObject({});

export const McpStudentInputSchema = z.strictObject({
  studentUserId: z.string().min(1).describe('User id of the student, from list_students.'),
});

export const McpOperationInputSchema = z.strictObject({
  operationId: z.uuid().describe('Id returned by propose_rank_entry or list_pending_operations.'),
});

// ── list_my_organisations ───────────────────────────────────────────────

export const McpMyOrganisationsOutputSchema = z.object({
  organisations: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      type: OrganisationTypeSchema,
      roles: z.array(MembershipRoleSchema),
    }),
  ),
});

// ── list_students ───────────────────────────────────────────────────────

export const McpListStudentsInputSchema = z.strictObject({
  organisationId: z
    .uuid()
    .optional()
    .describe('Only students in this organisation. Omit for every student you can see.'),
});

export const McpListStudentsOutputSchema = z.object({
  students: z.array(StudentRosterRowSchema),
});

// ── get_student_progress ────────────────────────────────────────────────

export const McpStudentProgressOutputSchema = z.object({
  progress: z.array(ProgressSchema),
});

// ── get_next_rank_requirements ──────────────────────────────────────────

export const McpNextRankRequirementsInputSchema = z.strictObject({
  studentUserId: z.string().min(1).describe('User id of the student, from list_students.'),
  rankId: z
    .uuid()
    .optional()
    .describe('Rank to resolve requirements for. Omit to use the rank after the latest passed one.'),
});

const McpRankRefSchema = z.object({ id: z.uuid(), name: z.string() });

export const McpNextRankRequirementsOutputSchema = z.object({
  currentRank: McpRankRefSchema.nullable(),
  targetRank: McpRankRefSchema.nullable(),
  requirements: GradingRequirementsSchema.nullable(),
  note: z.string().nullable(),
});

// ── get_statistics_summary ──────────────────────────────────────────────

export const McpStatisticsInputSchema = z.strictObject({
  organisationId: z
    .uuid()
    .optional()
    .describe('Organisation to summarise. Omit for platform totals (sysadmin only).'),
});

export const McpStatisticsOutputSchema = z.object({
  scope: z.enum(['platform', 'organisation']),
  platform: PlatformStatsSchema.nullable(),
  organisation: OrganisationStatsSchema.nullable(),
});

// ── Staged writes ───────────────────────────────────────────────────────

/**
 * Input of `propose_rank_entry`: the same fields as the stored proposal, but
 * without the OpenAPI `id`, so the published JSON Schema is the object itself
 * (with `additionalProperties: false`) rather than a `$ref`.
 */
export const McpProposeRankEntryInputSchema = z.strictObject({
  ...ProposeRankEntrySchema.shape,
  studentUserId: z.string().min(1).describe('User id of the student, from list_students.'),
});

/** The one result shape every staged (proposal) tool returns. */
export const McpStagedResultSchema = z.object({
  staged: z.literal(true),
  operationId: z.uuid(),
  preview: RankEntryPreviewSchema,
  message: z.string(),
});
export type McpStagedResult = z.infer<typeof McpStagedResultSchema>;

export const McpPendingOperationsOutputSchema = z.object({
  operations: z.array(PendingOperationSchema),
});

export const McpPendingOperationOutputSchema = z.object({
  operation: PendingOperationSchema,
});
