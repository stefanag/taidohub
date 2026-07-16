import { describe, expect, it } from 'vitest';

import {
  CreateMembershipSchema,
  ListMembershipsQuerySchema,
  ListMembershipsResponseSchema,
  MembershipRoleSchema,
  OrganisationMembershipSchema,
  UpdateMembershipSchema,
} from '../memberships.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-18T08:00:00.000Z';

describe('MembershipRoleSchema', () => {
  it('accepts the three allowed values', () => {
    expect(MembershipRoleSchema.safeParse('orgadmin').success).toBe(true);
    expect(MembershipRoleSchema.safeParse('instructor').success).toBe(true);
    expect(MembershipRoleSchema.safeParse('student').success).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(MembershipRoleSchema.safeParse('sysadmin').success).toBe(false);
    expect(MembershipRoleSchema.safeParse('').success).toBe(false);
  });

  it('exposes options for cross-package reuse', () => {
    expect([...MembershipRoleSchema.options].sort()).toEqual([
      'instructor',
      'orgadmin',
      'student',
    ]);
  });
});

describe('OrganisationMembershipSchema', () => {
  const valid = {
    id: UUID,
    userId: 'u-1',
    organisationId: UUID,
    role: 'orgadmin' as const,
    createdAt: ISO,
    updatedAt: ISO,
  };

  it('accepts a valid row', () => {
    expect(OrganisationMembershipSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(OrganisationMembershipSchema.safeParse({ ...valid, id: 'nope' }).success).toBe(false);
  });

  it('rejects a non-uuid organisationId', () => {
    expect(OrganisationMembershipSchema.safeParse({ ...valid, organisationId: 'nope' }).success).toBe(false);
  });
});

describe('CreateMembershipSchema', () => {
  it('requires userId, organisationId, role', () => {
    expect(
      CreateMembershipSchema.safeParse({ userId: 'u-1', organisationId: UUID, role: 'orgadmin' }).success,
    ).toBe(true);
    expect(CreateMembershipSchema.safeParse({ userId: 'u-1', organisationId: UUID }).success).toBe(false);
  });
});

describe('UpdateMembershipSchema', () => {
  it('accepts a single-field role update', () => {
    expect(UpdateMembershipSchema.safeParse({ role: 'instructor' }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(UpdateMembershipSchema.safeParse({}).success).toBe(false);
  });
});

describe('ListMembershipsQuerySchema', () => {
  it('accepts userId only, organisationId only, both, or neither', () => {
    expect(ListMembershipsQuerySchema.safeParse({}).success).toBe(true);
    expect(ListMembershipsQuerySchema.safeParse({ userId: 'u-1' }).success).toBe(true);
    expect(ListMembershipsQuerySchema.safeParse({ organisationId: UUID }).success).toBe(true);
    expect(ListMembershipsQuerySchema.safeParse({ userId: 'u-1', organisationId: UUID }).success).toBe(true);
  });

  it('rejects a non-uuid organisationId', () => {
    expect(ListMembershipsQuerySchema.safeParse({ organisationId: 'nope' }).success).toBe(false);
  });
});

describe('ListMembershipsResponseSchema', () => {
  it('accepts an empty list', () => {
    expect(ListMembershipsResponseSchema.safeParse({ data: [], total: 0 }).success).toBe(true);
  });

  it('rejects a list whose item fails OrganisationMembershipSchema', () => {
    expect(
      ListMembershipsResponseSchema.safeParse({
        data: [{ id: 'nope', userId: 'u-1', organisationId: 'nope', role: 'orgadmin', createdAt: 'nope', updatedAt: 'nope' }],
        total: 1,
      }).success,
    ).toBe(false);
  });
});
