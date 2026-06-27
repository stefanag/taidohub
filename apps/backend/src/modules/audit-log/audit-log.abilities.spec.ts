import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbilityTuple } from '@repo/contracts/casl';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { AuditLogAbilityRules } from './audit-log.abilities.js';

/**
 * The audit-log access matrix is the hard part of the chunk:
 * a `sysadmin` sees everything; an `orgadmin` sees ONLY rows whose
 * `entityType` is `'organisation'` and whose `entityId` matches one
 * of their orgadmin memberships; a plain user and an unauthenticated
 * caller see nothing. Bugs here silently leak audit data — exactly
 * the case where a test gap is most expensive. The rules contributor
 * is a pure function of `(builder, user)`, so we exercise it directly
 * by building a fresh `AppAbility` per role + checking `.can()`
 * against representative subjects.
 */
type AppAbility = MongoAbility<AppAbilityTuple>;

const baseUser = {
  id: 'u',
  email: 'u@x.test',
  emailVerified: true,
  name: null,
  image: null,
  locale: 'en',
  deactivatedAt: null,
};

function buildAbility(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new AuditLogAbilityRules().contributeTo(builder, user);
  return builder.build();
}

function auditLogSubject(attrs: { entityType: string; entityId: string }) {
  // CASL's `.can(action, subject, ...)` accepts an object with the
  // subject's `__caslSubjectType__` symbol set, OR a tuple of
  // (name, fields). The builder's MongoDB-style `conditions` match
  // against the second form. The `as const` pins the literal type
  // so it matches `AuditLogSubjectShape['__caslSubjectType__']`.
  return { ...attrs, __caslSubjectType__: 'AuditLog' as const };
}

describe('AuditLogAbilityRules', () => {
  it('grants no rules when the user is unauthenticated', () => {
    const ability = buildAbility(null);
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-1' }))).toBe(false);
    // Also `bare` subject string — would be `true` if any unscoped rule existed.
    expect(ability.can('read', 'AuditLog')).toBe(false);
  });

  it('grants no rules for a plain user', () => {
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    expect(ability.can('read', 'AuditLog')).toBe(false);
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-1' }))).toBe(false);
  });

  it('grants unscoped read for a sysadmin', () => {
    const ability = buildAbility({ ...baseUser, role: 'sysadmin', memberships: [] });
    expect(ability.can('read', 'AuditLog')).toBe(true);
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-1' }))).toBe(true);
    expect(ability.can('read', auditLogSubject({ entityType: 'rank_history', entityId: 'rh-9' }))).toBe(true);
  });

  it('grants org-scoped read for orgadmin memberships only', () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [
        { organisationId: 'org-a', role: 'orgadmin' },
        { organisationId: 'org-b', role: 'instructor' },
      ],
    });
    // Can read their org-a audit rows.
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-a' }))).toBe(true);
    // Cannot read a different org's audit rows.
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-x' }))).toBe(false);
    // Cannot read audit rows for the org they're only an instructor in.
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-b' }))).toBe(false);
    // Cannot read non-organisation audit rows even within their scope.
    expect(ability.can('read', auditLogSubject({ entityType: 'rank_history', entityId: 'rh-9' }))).toBe(false);
  });

  it('grants read across every orgadmin membership when the user has more than one', () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [
        { organisationId: 'org-a', role: 'orgadmin' },
        { organisationId: 'org-c', role: 'orgadmin' },
      ],
    });
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-a' }))).toBe(true);
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-c' }))).toBe(true);
    expect(ability.can('read', auditLogSubject({ entityType: 'organisation', entityId: 'org-b' }))).toBe(false);
  });

  it('forbids non-read actions for every role', () => {
    const sysadmin = buildAbility({ ...baseUser, role: 'sysadmin', memberships: [] });
    const orgadmin = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [{ organisationId: 'org-a', role: 'orgadmin' }],
    });
    for (const action of ['create', 'update', 'delete', 'manage'] as const) {
      expect(sysadmin.can(action, 'AuditLog')).toBe(false);
      expect(orgadmin.can(action, auditLogSubject({ entityType: 'organisation', entityId: 'org-a' }))).toBe(false);
    }
  });
});
