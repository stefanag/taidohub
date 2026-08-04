import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * Statistics CASL rules.
 *
 * `Statistics` rows have no persistent id — they're addressed by
 * `scopeType` + `scopeId` (see `StatisticsSubjectShape` in
 * `@repo/contracts/casl`). Unlike `Organisation`/`RequirementSet`, this is a
 * brand-new subject with no other module already granting sysadmin a
 * `manage all`/`manage Statistics` rule, so — mirroring every other
 * per-subject contributor in this codebase (`FeatureFlagsAbilityRules`,
 * `OrganisationsAbilityRules`, `StudentAbilityRules`, ...) — sysadmin's
 * unconditional grant lives right here, not "elsewhere".
 *
 * Every rule below is FLAT: it matches only the user's own membership
 * org id, exactly like `OrganisationsAbilityRules` ("Flat — no
 * inheritance to children") and `GradingRequirementsAbilityRules`.
 * `AbilityRuleContributor.contributeTo` is synchronous and has no DB
 * access, so it cannot walk the organisation ancestor tree
 * (`OrganisationsRepository.getAncestorIds` is async). The two rollup
 * behaviours that DO require ancestor awareness —
 *   1. an orgadmin of a descendant org reading an ANCESTOR org's
 *      aggregated statistics (its numbers already roll up there), and
 *   2. an orgadmin of a org reading a STUDENT's statistics when the
 *      student's club is a descendant of that org ("including subtree")
 * — are resolved at the service layer (`StatisticsService.assertCanReadOrg`
 * / `assertCanReadUser`), which falls back to
 * `OrganisationsRepository.getAncestorIds` only when the flat CASL check
 * below doesn't already grant access. See `statistics.service.spec.ts`
 * for the rollup coverage; `statistics.abilities.spec.ts` covers exactly
 * what this flat contributor grants on its own.
 *
 * Rules:
 * - `sysadmin`: `manage` everything.
 * - Each `orgadmin` membership → `read` on `{ scopeType: 'organisation',
 *   scopeId: <that org> }` AND on `{ scopeType: 'user', organisationId:
 *   <that org> }` (so an orgadmin can read both the org's own rollup and
 *   any of its direct members' individual stats).
 * - Each `instructor` membership → `read` on `{ scopeType: 'user',
 *   organisationId: <that club> }` (their students' individual stats).
 * - Every authenticated user → `read` on `{ scopeType: 'user', scopeId:
 *   <their own id> }` (their own stats).
 */
@AbilityContributor()
@Injectable()
export class StatisticsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('manage', 'Statistics');
      return;
    }

    for (const m of user.memberships) {
      if (m.role === 'orgadmin') {
        builder.can('read', 'Statistics', {
          scopeType: 'organisation',
          scopeId: m.organisationId,
        });
        builder.can('read', 'Statistics', {
          scopeType: 'user',
          organisationId: m.organisationId,
        });
      } else if (m.role === 'instructor') {
        builder.can('read', 'Statistics', {
          scopeType: 'user',
          organisationId: m.organisationId,
        });
      }
    }

    builder.can('read', 'Statistics', { scopeType: 'user', scopeId: user.id });
  }
}
