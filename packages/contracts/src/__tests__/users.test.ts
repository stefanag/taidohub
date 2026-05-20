import { describe, expect, it } from 'vitest';

import { RoleSchema, UserSchema } from '../users.js';

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
