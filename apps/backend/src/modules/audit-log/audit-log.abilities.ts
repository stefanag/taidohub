import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Audit log rules: only `role === 'admin'` can read; nothing else mutates
 * it from the HTTP layer (writes go through `AuditLogService.record`
 * called inside transactional mutations).
 */
@Injectable()
export class AuditLogAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (user?.role === 'admin') {
      builder.can('read', 'AuditLog');
    }
  }
}
