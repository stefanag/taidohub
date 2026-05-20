import { describe, expect, it } from 'vitest';
import { MembershipRoleSchema } from '@repo/contracts/memberships';
import { RoleSchema } from '@repo/contracts/users';

import { membershipRole } from '../../infrastructure/database/schema/memberships.js';
import { USER_ROLES } from '../../infrastructure/database/schema/users.js';

describe('Role enum alignment between @repo/contracts and the Drizzle schema', () => {
  it('user.role: Zod enum matches the USER_ROLES constant', () => {
    const contract = [...RoleSchema.options].sort();
    const db = [...USER_ROLES].sort();
    expect(contract).toEqual(db);
  });

  it('organisation_membership.role: Zod enum matches the pgEnum values', () => {
    const contract = [...MembershipRoleSchema.options].sort();
    const db = [...membershipRole.enumValues].sort();
    expect(contract).toEqual(db);
  });
});
