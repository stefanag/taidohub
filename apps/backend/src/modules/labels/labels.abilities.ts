import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Labels CASL rules.
 *
 * - `sysadmin` can `manage` every label subject.
 * - Any authenticated user can `read` tags/categories scoped to one of their
 *   organisations OR sysadmin-owned globals (`organisationId === null`).
 * - Any authenticated user can `create` tags/categories; the service layer
 *   resolves and authorises the owning organisation (and forbids non-sysadmins
 *   from creating globals).
 * - Authors can `update` / `delete` their own org-scoped labels — never
 *   sysadmin-owned globals. Defence-in-depth: `LabelsService.assertCanMutateLabel`
 *   additionally verifies that the author is still a member of the owning org.
 * - Any authenticated user can `create` attachments; the controller is expected
 *   to additionally delegate to the target's CASL subject (e.g. must be able
 *   to update the Organisation in order to label it).
 * - Users can `delete` attachments they themselves created.
 */
@Injectable()
export class LabelsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('manage', 'Tag');
      builder.can('manage', 'Category');
      builder.can('manage', 'TagAttachment');
      builder.can('manage', 'CategoryAttachment');
      return;
    }

    const userOrgIds = user.memberships.map((m) => m.organisationId);

    // Read: own-org labels + sysadmin globals.
    for (const orgId of userOrgIds) {
      builder.can('read', 'Tag', { organisationId: orgId });
      builder.can('read', 'Category', { organisationId: orgId });
    }
    builder.can('read', 'Tag', { organisationId: null });
    builder.can('read', 'Category', { organisationId: null });

    // Create: any authenticated user; the service validates membership +
    // activeOrganisationId, and forbids non-sysadmin globals.
    builder.can('create', 'Tag');
    builder.can('create', 'Category');

    // Update / delete: only labels the user authored AND that are org-scoped
    // (not global). Membership is enforced at the service layer
    // (`assertCanMutateLabel` adds a residual membership check).
    for (const orgId of userOrgIds) {
      builder.can('update', 'Tag', { createdByUserId: user.id, organisationId: orgId });
      builder.can('delete', 'Tag', { createdByUserId: user.id, organisationId: orgId });
      builder.can('update', 'Category', { createdByUserId: user.id, organisationId: orgId });
      builder.can('delete', 'Category', { createdByUserId: user.id, organisationId: orgId });
    }

    // Attachments: any authenticated user can create; the controller
    // additionally authorises the target subject. Detach is limited to the
    // user who attached.
    builder.can('create', 'TagAttachment');
    builder.can('create', 'CategoryAttachment');
    builder.can('delete', 'TagAttachment', { attachedByUserId: user.id });
    builder.can('delete', 'CategoryAttachment', { attachedByUserId: user.id });
  }
}
