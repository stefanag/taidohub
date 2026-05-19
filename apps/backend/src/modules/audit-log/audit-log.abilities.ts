import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Audit log rules:
 * - `sysadmin` can read everything.
 * - Each `orgadmin` membership grants `read` scoped to audit-log entries
 *   for that specific organisation (`entityType = 'organisation'` + matching
 *   entityId).
 * - Writes never reach this guard — audit rows are inserted by service
 *   code via `AuditLogService.record`.
 */
@Injectable()
export class AuditLogAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('read', 'AuditLog');
      return;
    }

    for (const m of user.memberships) {
      if (m.role === 'orgadmin') {
        builder.can('read', 'AuditLog', {
          entityType: 'organisation',
          entityId: m.organisationId,
        });
      }
    }
  }
}
