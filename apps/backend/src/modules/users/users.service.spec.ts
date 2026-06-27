import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@nestjs/config';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { AuthUserCache } from '../../infrastructure/auth/auth-user.cache.js';
import { UserContextService } from '../../infrastructure/auth/user-context.service.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';
import { BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { EMAIL_SERVICE } from '../../infrastructure/email/email.types.js';
import { AuditLogAbilityRules } from '../audit-log/audit-log.abilities.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { OrganisationsAbilityRules } from '../organisations/organisations.abilities.js';
import { MembershipsAbilityRules } from '../memberships/memberships.abilities.js';

import { UsersAbilityRules } from './users.abilities.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

const sysadmin = {
  id: 'u-admin',
  email: 'admin@example.com',
  emailVerified: true,
  name: null,
  image: null,
  locale: 'en',
  role: 'sysadmin' as const,
  deactivatedAt: null,
  memberships: [],
};
const plainUser = {
  id: 'u-user',
  email: 'user@example.com',
  emailVerified: true,
  name: null,
  image: null,
  locale: 'en',
  role: 'user' as const,
  deactivatedAt: null,
  memberships: [],
};

// DB-shaped row (Date | null timestamps) — the repo stub returns this shape.
const USER_ROW = {
  id: 'u-user',
  email: 'user@example.com',
  name: null as string | null,
  emailVerified: true,
  image: null as string | null,
  role: 'user',
  deactivatedAt: null as Date | null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};
const OTHER_ROW = { ...USER_ROW, id: 'u-other', email: 'other@example.com' };

function repoStub() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    countActiveSysadmins: vi.fn(),
    insert: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    delete: vi.fn(),
  } satisfies Record<keyof UsersRepository, ReturnType<typeof vi.fn>>;
}

function auditStub() {
  return { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
}

function tokensStub() {
  return {
    issueToken: vi.fn().mockResolvedValue('tok-123'),
    consumeToken: vi.fn(),
    hasUnexpiredToken: vi.fn().mockResolvedValue(false),
  };
}

function emailStub() {
  return {
    sendInvite: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendAdminPasswordReset: vi.fn().mockResolvedValue(undefined),
  };
}

function configStub() {
  return {
    get: vi.fn((key: string) => {
      const map: Record<string, unknown> = {
        INVITE_TOKEN_TTL_HOURS: 48,
        RESET_TOKEN_TTL_HOURS: 1,
        WEB_ORIGIN: 'http://localhost:5173',
        WEB_APP_URL: 'http://localhost:5173',
      };
      return map[key];
    }),
  };
}

// Drizzle db.transaction(cb) calls cb(tx) and returns its result. Fake it.
const FAKE_TX = { __tx: true } as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof repoStub>,
  audit: ReturnType<typeof auditStub> = auditStub(),
  tokens: ReturnType<typeof tokensStub> = tokensStub(),
  email: ReturnType<typeof emailStub> = emailStub(),
  config: ReturnType<typeof configStub> = configStub(),
) {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      UsersService,
      AbilityFactory,
      UserContextService,
      AuthUserCache,
      UsersAbilityRules,
      { provide: OrganisationsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: AuditLogAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: MembershipsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: UsersRepository, useValue: repo },
      { provide: AuditLogService, useValue: audit },
      { provide: DRIZZLE, useValue: fakeDb },
      { provide: VerificationTokenService, useValue: tokens },
      { provide: EMAIL_SERVICE, useValue: email },
      { provide: BETTER_AUTH, useValue: {} },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();
  await module.init();
  return module.get(UsersService);
}

describe('UsersService — list', () => {
  it('rejects a non-sysadmin', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.list({ deactivated: 'false', page: 1, perPage: 25 }, plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns a paginated response for a sysadmin', async () => {
    const repo = repoStub();
    repo.list.mockResolvedValue({ rows: [USER_ROW], total: 1 });
    const service = await makeService(repo);

    const out = await service.list({ deactivated: 'false', page: 1, perPage: 25 }, sysadmin);

    expect(out).toMatchObject({ total: 1, page: 1, perPage: 25 });
    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.id).toBe(USER_ROW.id);
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ deactivated: 'false', page: 1, perPage: 25 }),
    );
  });
});

describe('UsersService — findOne', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: UsersService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('lets a sysadmin read any user', async () => {
    repo.findById.mockResolvedValue(OTHER_ROW);
    const out = await service.findOne('u-other', sysadmin);
    expect(out.id).toBe('u-other');
  });

  it('lets a plain user read their own row', async () => {
    repo.findById.mockResolvedValue(USER_ROW);
    const out = await service.findOne('u-user', plainUser);
    expect(out.id).toBe('u-user');
  });

  it('rejects a plain user reading a different user with ForbiddenException', async () => {
    repo.findById.mockResolvedValue(OTHER_ROW);
    await expect(service.findOne('u-other', plainUser)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when the row is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findOne('u-missing', sysadmin)).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService — update', () => {
  it('rejects a non-sysadmin', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(USER_ROW);
    const service = await makeService(repo);
    await expect(service.update(USER_ROW.id, { name: 'X' }, plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.update('missing', { name: 'X' }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates a name', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(USER_ROW);
    repo.update.mockResolvedValue({ ...USER_ROW, name: 'Renamed' });
    const service = await makeService(repo);
    const out = await service.update(USER_ROW.id, { name: 'Renamed' }, sysadmin);
    expect(out.name).toBe('Renamed');
  });

  it('rejects a sysadmin changing their own role (SELF_DEMOTE)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: sysadmin.id, role: 'sysadmin' });
    const service = await makeService(repo);
    await expect(service.update(sysadmin.id, { role: 'user' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects demoting the last active sysadmin (LAST_SYSADMIN)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'other-sysadmin', role: 'sysadmin' });
    repo.countActiveSysadmins.mockResolvedValue(1);
    const service = await makeService(repo);
    await expect(service.update('other-sysadmin', { role: 'user' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows demoting a sysadmin when others remain', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'other-sysadmin', role: 'sysadmin' });
    repo.countActiveSysadmins.mockResolvedValue(2);
    repo.update.mockResolvedValue({ ...USER_ROW, id: 'other-sysadmin', role: 'user' });
    const service = await makeService(repo);
    const out = await service.update('other-sysadmin', { role: 'user' }, sysadmin);
    expect(out.role).toBe('user');
  });

  it('emits an audit-log update event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(USER_ROW);
    repo.update.mockResolvedValue({ ...USER_ROW, name: 'Renamed' });
    const audit = auditStub();
    const service = await makeService(repo, audit);
    await service.update(USER_ROW.id, { name: 'Renamed' }, sysadmin);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: USER_ROW.id,
      action: 'update',
      userId: sysadmin.id,
    });
  });
});

describe('UsersService — deactivate / reactivate', () => {
  it('deactivates an active user and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'u-target' });
    repo.deactivate.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      deactivatedAt: new Date('2026-05-21T00:00:00.000Z'),
    });
    const audit = auditStub();
    const service = await makeService(repo, audit);

    const out = await service.deactivate('u-target', sysadmin);

    expect(out.deactivatedAt).toBe('2026-05-21T00:00:00.000Z');
    expect(repo.deactivate).toHaveBeenCalledWith('u-target', FAKE_TX);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'deactivate',
      userId: sysadmin.id,
    });
  });

  it('rejects deactivating yourself (SELF_DEACTIVATE)', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.deactivate(sysadmin.id, sysadmin)).rejects.toThrow(ConflictException);
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.deactivate('missing', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('rejects deactivating an already-deactivated user (ALREADY_DEACTIVATED)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const service = await makeService(repo);
    await expect(service.deactivate('u-target', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('rejects deactivating the last active sysadmin (LAST_SYSADMIN)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'other-sysadmin',
      role: 'sysadmin',
    });
    repo.countActiveSysadmins.mockResolvedValue(1);
    const service = await makeService(repo);
    await expect(service.deactivate('other-sysadmin', sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('reactivates a deactivated user and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    repo.reactivate.mockResolvedValue({ ...USER_ROW, id: 'u-target', deactivatedAt: null });
    const audit = auditStub();
    const service = await makeService(repo, audit);

    const out = await service.reactivate('u-target', sysadmin);

    expect(out.deactivatedAt).toBeNull();
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'reactivate',
    });
  });

  it('rejects reactivating an already-active user (ALREADY_ACTIVE)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'u-target', deactivatedAt: null });
    const service = await makeService(repo);
    await expect(service.reactivate('u-target', sysadmin)).rejects.toThrow(ConflictException);
  });
});

describe('UsersService — delete', () => {
  it('hard-deletes a user and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'u-target' });
    repo.delete.mockResolvedValue(undefined);
    const audit = auditStub();
    const service = await makeService(repo, audit);

    await service.delete('u-target', sysadmin);

    expect(repo.delete).toHaveBeenCalledWith('u-target', FAKE_TX);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'delete',
      userId: sysadmin.id,
    });
    expect(audit.record.mock.calls[0]?.[0]?.after).toBeNull();
  });

  it('rejects deleting yourself (SELF_DELETE)', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.delete(sysadmin.id, sysadmin)).rejects.toThrow(ConflictException);
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.delete('missing', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('rejects deleting the last active sysadmin (LAST_SYSADMIN)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'other-sysadmin',
      role: 'sysadmin',
      deactivatedAt: null,
    });
    repo.countActiveSysadmins.mockResolvedValue(1);
    const service = await makeService(repo);
    await expect(service.delete('other-sysadmin', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('allows deleting a deactivated sysadmin when another active one remains', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'old-sysadmin',
      role: 'sysadmin',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    repo.delete.mockResolvedValue(undefined);
    const service = await makeService(repo);
    await expect(service.delete('old-sysadmin', sysadmin)).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith('old-sysadmin', FAKE_TX);
  });
});

describe('UsersService — invite', () => {
  it('creates a new user, emits a create audit event, and sends an invite email', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue(null);
    repo.insert.mockResolvedValue({
      ...USER_ROW,
      id: 'u-new',
      email: 'new@example.com',
      name: 'New User',
      emailVerified: false,
    });
    const audit = auditStub();
    const tokens = tokensStub();
    const email = emailStub();
    const service = await makeService(repo, audit, tokens, email);

    const out = await service.invite({ email: 'new@example.com', name: 'New User' }, sysadmin);

    expect(out.email).toBe('new@example.com');
    expect(repo.insert).toHaveBeenCalled();
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      action: 'create',
      userId: sysadmin.id,
    });
    expect(tokens.issueToken).toHaveBeenCalledWith('invite:u-new', 48);
    expect(email.sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        setPasswordUrl: 'http://localhost:5173/set-password?token=tok-123',
        inviterName: sysadmin.name,
      }),
    );
  });

  it('re-sends the invite for a pending user without creating a new row', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-pending',
      email: 'pending@example.com',
      emailVerified: false,
      deactivatedAt: null,
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(true);
    const email = emailStub();
    const service = await makeService(repo, auditStub(), tokens, email);

    const out = await service.invite({ email: 'pending@example.com' }, sysadmin);

    expect(out.id).toBe('u-pending');
    expect(repo.insert).not.toHaveBeenCalled();
    expect(tokens.issueToken).toHaveBeenCalledWith('invite:u-pending', 48);
    expect(email.sendInvite).toHaveBeenCalled();
  });

  it('rejects inviting an email already in use by an active user (EMAIL_IN_USE)', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-active',
      email: 'active@example.com',
      deactivatedAt: null,
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(false);
    const service = await makeService(repo, auditStub(), tokens);

    await expect(service.invite({ email: 'active@example.com' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects inviting an email belonging to a deactivated user (EMAIL_DEACTIVATED)', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-deact',
      email: 'deact@example.com',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(false);
    const service = await makeService(repo, auditStub(), tokens);

    await expect(service.invite({ email: 'deact@example.com' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects a deactivated user even if they still have a live invite token', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-deact',
      email: 'deact@example.com',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(true);
    const email = emailStub();
    const service = await makeService(repo, auditStub(), tokens, email);

    await expect(service.invite({ email: 'deact@example.com' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
    expect(tokens.issueToken).not.toHaveBeenCalled();
    expect(email.sendInvite).not.toHaveBeenCalled();
  });

  it('rejects a non-sysadmin caller', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.invite({ email: 'x@example.com' }, plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('UsersService — addUser', () => {
  it('creates a sysadmin-role user, returns a setPasswordUrl, and audits create', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue(null);
    repo.insert.mockResolvedValue({
      ...USER_ROW,
      id: 'u-new',
      email: 'new@example.com',
      name: 'New',
      role: 'sysadmin',
      emailVerified: false,
    });
    const audit = auditStub();
    const tokens = tokensStub();
    const service = await makeService(repo, audit, tokens);

    const out = await service.addUser({ email: 'new@example.com', name: 'New', role: 'sysadmin' }, sysadmin);

    expect(out.user.email).toBe('new@example.com');
    expect(out.setPasswordUrl).toContain('/set-password?token=');
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'sysadmin' }),
      FAKE_TX,
    );
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      action: 'create',
      userId: sysadmin.id,
    });
    expect(tokens.issueToken).toHaveBeenCalled();
  });

  it('rejects an email already in use by an active user (EMAIL_IN_USE)', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-active',
      email: 'active@example.com',
      deactivatedAt: null,
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(false);
    const service = await makeService(repo, auditStub(), tokens);

    await expect(
      service.addUser({ email: 'active@example.com', role: 'user' }, sysadmin),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an email belonging to a deactivated user (EMAIL_DEACTIVATED)', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-deact',
      email: 'deact@example.com',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const service = await makeService(repo);

    await expect(
      service.addUser({ email: 'deact@example.com', role: 'user' }, sysadmin),
    ).rejects.toThrow(ConflictException);
  });

  it('re-issues a link for a still-pending user without creating a new row', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-pending',
      email: 'pending@example.com',
      emailVerified: false,
      deactivatedAt: null,
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(true);
    const service = await makeService(repo, auditStub(), tokens);

    const out = await service.addUser({ email: 'pending@example.com', role: 'user' }, sysadmin);

    expect(out.setPasswordUrl).toContain('/set-password?token=');
    expect(repo.insert).not.toHaveBeenCalled();
    expect(tokens.issueToken).toHaveBeenCalledWith('invite:u-pending', 48);
  });

  it('rejects a non-sysadmin caller', async () => {
    const repo = repoStub();
    const service = await makeService(repo);

    await expect(
      service.addUser({ email: 'x@example.com', role: 'user' }, plainUser),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('UsersService — sendPasswordReset', () => {
  it('issues an admin-reset token, sends an email, and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      email: 'target@example.com',
      locale: 'sv',
    });
    const audit = auditStub();
    const tokens = tokensStub();
    const email = emailStub();
    const service = await makeService(repo, audit, tokens, email);

    await service.sendPasswordReset('u-target', sysadmin);

    expect(tokens.issueToken).toHaveBeenCalledWith('admin-reset:u-target', 1);
    expect(email.sendAdminPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'target@example.com',
        locale: 'sv',
        resetUrl: 'http://localhost:5173/set-password?token=tok-123',
        adminName: sysadmin.name,
      }),
    );
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'password_reset_triggered',
      userId: sysadmin.id,
      before: null,
      after: { triggeredBy: sysadmin.id },
    });
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.sendPasswordReset('missing', sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a non-sysadmin caller', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.sendPasswordReset('u-target', plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
