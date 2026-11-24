import { Injectable } from '@nestjs/common';
import {
  McpEmptyInputSchema,
  McpListStudentsInputSchema,
  McpListStudentsOutputSchema,
  type McpMe,
  McpMyOrganisationsOutputSchema,
  McpNextRankRequirementsInputSchema,
  McpNextRankRequirementsOutputSchema,
  McpStatisticsInputSchema,
  McpStatisticsOutputSchema,
  McpStudentInputSchema,
  McpStudentProgressOutputSchema,
} from '@repo/contracts/mcp';


import { type AuthenticatedUser } from '../../../infrastructure/auth/auth.types.js';
import { BeltRanksService } from '../../belt-catalog/belt-ranks.service.js';
import { RankRequirementsService } from '../../grading-requirements/rank-requirements.service.js';
import { OrganisationsService } from '../../organisations/organisations.service.js';
import { RankHistoryService } from '../../rank-history/rank-history.service.js';
import { StatisticsService } from '../../statistics/statistics.service.js';
import { StudentsService } from '../../students/students.service.js';
import { defineTool, type McpToolDefinition } from '../mcp.types.js';

import type { MembershipRole } from '@repo/contracts/memberships';

/**
 * The read-only tools. Each one is a thin wrapper over an existing service
 * method, so it gets exactly the checks the matching HTTP endpoint gets.
 */
@Injectable()
export class McpReadTools {
  constructor(
    private readonly organisations: OrganisationsService,
    private readonly students: StudentsService,
    private readonly rankHistory: RankHistoryService,
    private readonly ranks: BeltRanksService,
    private readonly requirements: RankRequirementsService,
    private readonly statistics: StatisticsService,
  ) {}

  /** The actor and their memberships, with organisation names. Backs `taidohub://me`. */
  async me(actor: AuthenticatedUser): Promise<McpMe> {
    const names = await this.organisationNames(actor);
    return {
      id: actor.id,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      memberships: actor.memberships.map((m) => ({
        organisationId: m.organisationId,
        organisationName: names.get(m.organisationId)?.name ?? '',
        role: m.role,
      })),
    };
  }

  definitions(): McpToolDefinition[] {
    return [
      defineTool({
        name: 'list_my_organisations',
        title: 'List my organisations',
        description:
          'Use to find the organisations the user belongs to and their role in each. Call this before tools that take an organisationId.',
        inputSchema: McpEmptyInputSchema,
        outputSchema: McpMyOrganisationsOutputSchema,
        ability: ['use', 'Mcp'],
        kind: 'read',
        handler: async (_input, { actor }) => {
          const names = await this.organisationNames(actor);
          const roles = new Map<string, MembershipRole[]>();
          for (const m of actor.memberships) {
            roles.set(m.organisationId, [...(roles.get(m.organisationId) ?? []), m.role]);
          }
          return {
            organisations: [...roles].flatMap(([id, orgRoles]) => {
              const org = names.get(id);
              return org ? [{ id, name: org.name, type: org.type, roles: orgRoles }] : [];
            }),
          };
        },
      }),
      defineTool({
        name: 'list_students',
        title: 'List students',
        description:
          'Use to list students the user may see: in organisations where they are orgadmin or instructor, or all for a sysadmin. Includes a progress summary per student.',
        inputSchema: McpListStudentsInputSchema,
        outputSchema: McpListStudentsOutputSchema,
        ability: ['read', 'Student'],
        kind: 'read',
        handler: async ({ organisationId }, { actor }) => {
          const roster = await this.students.listRoster(actor);
          return {
            students: organisationId
              ? roster.filter((s) => s.organisations.some((o) => o.id === organisationId))
              : roster,
          };
        },
      }),
      defineTool({
        name: 'get_student_progress',
        title: 'Get student progress',
        description:
          'Use to see how far a student has come with each technique and pattern. Get the studentUserId from list_students first.',
        inputSchema: McpStudentInputSchema,
        outputSchema: McpStudentProgressOutputSchema,
        ability: ['read', 'Student'],
        kind: 'read',
        handler: async ({ studentUserId }, { actor }) => ({
          progress: await this.students.getStudentProgress(actor, studentUserId),
        }),
      }),
      defineTool({
        name: 'get_next_rank_requirements',
        title: 'Get next rank requirements',
        description:
          "Use to see what a student must show for their next belt rank, resolved for the student's own organisation. Without rankId it uses the rank after their latest passed grading.",
        inputSchema: McpNextRankRequirementsInputSchema,
        outputSchema: McpNextRankRequirementsOutputSchema,
        ability: ['read', 'Student'],
        kind: 'read',
        handler: async ({ studentUserId, rankId }, { actor }) => {
          await this.students.assertCanReadStudent(actor, studentUserId);
          const history = await this.rankHistory.list(studentUserId, actor);
          const latest = history
            .filter((row) => row.result === 'pass')
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          const current = latest ? await this.ranks.findById(latest.rankId) : null;
          const currentRank = current ? { id: current.id, name: rankName(current) } : null;

          const targetId = rankId ?? current?.nextRankId ?? null;
          if (!targetId) {
            return {
              currentRank,
              targetRank: null,
              requirements: null,
              note: current
                ? 'The student holds the highest rank in their belt system.'
                : 'No passed grading is recorded for this student. Pass rankId to choose a rank.',
            };
          }
          const target = await this.ranks.findById(targetId);
          return {
            currentRank,
            targetRank: { id: target.id, name: rankName(target) },
            requirements: await this.requirements.resolveForUser(targetId, studentUserId, actor),
            note: null,
          };
        },
      }),
      defineTool({
        name: 'get_statistics_summary',
        title: 'Get statistics summary',
        description:
          'Use for member and grading statistics for one organisation (or its descendants via an ancestor orgadmin role). Without organisationId it returns platform totals, which only a sysadmin may see.',
        inputSchema: McpStatisticsInputSchema,
        outputSchema: McpStatisticsOutputSchema,
        ability: ['use', 'Mcp'],
        kind: 'read',
        handler: async ({ organisationId }, { actor }) =>
          organisationId
            ? {
                scope: 'organisation' as const,
                platform: null,
                organisation: await this.statistics.getOrganisationStats(organisationId, actor),
              }
            : {
                scope: 'platform' as const,
                platform: await this.statistics.getPlatformStats(actor),
                organisation: null,
              },
      }),
    ];
  }

  private async organisationNames(
    actor: AuthenticatedUser,
  ): Promise<Map<string, { name: string; type: McpOrganisationType }>> {
    const { data } = await this.organisations.list({}, actor);
    return new Map(data.map((o) => [o.id, { name: o.nameEn, type: o.type }]));
  }
}

type McpOrganisationType = Awaited<
  ReturnType<OrganisationsService['findOne']>
>['type'];

function rankName(rank: { nameEn: string; nameRomaji: string }): string {
  return rank.nameEn || rank.nameRomaji;
}
