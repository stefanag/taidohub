import { describe, expect, it } from 'vitest';

import {
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  RoleSchema,
  UpdateUserSchema,
  UserSchema,
} from '../users.js';

const VALID_USER = {
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  emailVerified: true,
  image: null,
  role: 'sysadmin' as const,
  deactivatedAt: null,
  createdAt: '2026-05-18T08:00:00.000Z',
  updatedAt: '2026-05-18T08:00:00.000Z',
};

describe('RoleSchema', () => {
  it('accepts sysadmin and user', () => {
    expect(RoleSchema.safeParse('sysadmin').success).toBe(true);
    expect(RoleSchema.safeParse('user').success).toBe(true);
  });

  it('rejects legacy admin and unknown values', () => {
    expect(RoleSchema.safeParse('admin').success).toBe(false);
    expect(RoleSchema.safeParse('orgadmin').success).toBe(false);
    expect(RoleSchema.safeParse('').success).toBe(false);
  });
});

describe('UserSchema (role + deactivatedAt)', () => {
  it('accepts a fully populated user', () => {
    expect(UserSchema.safeParse(VALID_USER).success).toBe(true);
  });

  it('accepts deactivatedAt as ISO datetime', () => {
    const result = UserSchema.safeParse({ ...VALID_USER, deactivatedAt: '2026-05-18T09:00:00.000Z' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(UserSchema.safeParse({ ...VALID_USER, role: 'admin' }).success).toBe(false);
  });

  it('requires deactivatedAt to be present (null is valid)', () => {
    const { deactivatedAt: _, ...withoutField } = VALID_USER;
    expect(UserSchema.safeParse(withoutField).success).toBe(false);
  });
});

describe('ListUsersQuerySchema', () => {
  it('defaults deactivated=false, page=1, perPage=25', () => {
    const parsed = ListUsersQuerySchema.parse({});
    expect(parsed.deactivated).toBe('false');
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(25);
  });

  it('coerces query-string numbers', () => {
    const parsed = ListUsersQuerySchema.parse({ page: '3', perPage: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(50);
  });

  it('accepts the three deactivated values', () => {
    for (const v of ['true', 'false', 'all']) {
      expect(ListUsersQuerySchema.safeParse({ deactivated: v }).success).toBe(true);
    }
  });

  it('rejects an unknown deactivated value and perPage > 100', () => {
    expect(ListUsersQuerySchema.safeParse({ deactivated: 'maybe' }).success).toBe(false);
    expect(ListUsersQuerySchema.safeParse({ perPage: 200 }).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(ListUsersQuerySchema.safeParse({ role: 'admin' }).success).toBe(false);
  });
});

describe('UpdateUserSchema', () => {
  it('accepts a name-only patch', () => {
    expect(UpdateUserSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('accepts a role-only patch', () => {
    expect(UpdateUserSchema.safeParse({ role: 'sysadmin' }).success).toBe(true);
  });

  it('accepts an empty patch', () => {
    expect(UpdateUserSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown role and an empty name', () => {
    expect(UpdateUserSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('ListUsersResponseSchema', () => {
  it('accepts an empty page', () => {
    expect(
      ListUsersResponseSchema.safeParse({ data: [], total: 0, page: 1, perPage: 25 }).success,
    ).toBe(true);
  });
});
