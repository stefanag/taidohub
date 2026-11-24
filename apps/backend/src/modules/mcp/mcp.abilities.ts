import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * MCP CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Active sysadmin: `use Mcp` (also covered by `manage all`; stated here so
 *    the rule reads on its own).
 *  - A user with an `orgadmin` membership in at least one organisation:
 *    `use Mcp`. Which data their tools can see is decided by each tool's own
 *    ability and the owning service, not by this rule.
 *  - Everyone else (instructors, students, plain users): nothing. Their
 *    tokens are refused with 403 even if one was issued.
 *
 * The same rule gates the OAuth consent step (`canConnectMcpClient` in
 * `infrastructure/auth/mcp-access.ts`); keep the two in step.
 */
@AbilityContributor()
@Injectable()
export class McpAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user || user.deactivatedAt !== null) return;
    const isOrgadmin = user.memberships.some((m) => m.role === 'orgadmin');
    if (user.role === 'sysadmin' || isOrgadmin) {
      builder.can('use', 'Mcp');
    }
  }
}
