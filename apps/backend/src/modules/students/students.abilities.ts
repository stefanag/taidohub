import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * Student CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Sysadmin: unconditional `manage Student` so admin tooling sees every
 *    student in every organisation.
 *  - Any user who is an `instructor` in at least one organisation gets:
 *      • conditional `manage Student` scoped to students whose
 *        `organisationIds` array overlaps the instructor's instructor-org set
 *        (CASL evaluates `$in` against an array-valued field as
 *        Mongo-style overlap — matches when any element of the row's array
 *        is in the query array).
 *      • unconditional `read Student` for routing / controller-level checks
 *        (the row-level write check still gates writes).
 *  - Regular users without an instructor membership get nothing — the
 *    StudentsController is only useful to instructors and sysadmins.
 */
@Injectable()
export class StudentAbilityRules implements AbilityRuleContributor {
  contributeTo(
    builder: AbilityBuilder<AppAbility>,
    user: AuthenticatedUser | null,
  ): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('manage', 'Student');
      return;
    }

    const instructorOrgs = user.memberships
      .filter((m) => m.role === 'instructor')
      .map((m) => m.organisationId);

    if (instructorOrgs.length > 0) {
      // CASL's TS types model `$in` against the field's declared element type,
      // and `StudentSubjectShape.organisationIds` is `readonly string[]` — so
      // the inferred element type is the array itself. At runtime CASL's
      // ConditionsMatcher applies `$in` against array-valued fields as
      // Mongo-style overlap (matches when any element of the row's array is
      // in the query array), which is exactly what we want. The `as never`
      // cast bridges the TS type vs runtime semantic gap.
      builder.can('manage', 'Student', {
        organisationIds: { $in: instructorOrgs },
      } as never);
      builder.can('read', 'Student');
    }
  }
}
