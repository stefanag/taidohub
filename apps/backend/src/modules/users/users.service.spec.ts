import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';
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
  } satisfies Record<keyof UsersRepository, ReturnType<typeof vi.fn>>;
}

function auditStub() {
  return { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
}

// Drizzle db.transaction(cb) calls cb(tx) and returns its result. Fake it.
const FAKE_TX = { __tx: true } as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof repoStub>,
  audit: ReturnType<typeof auditStub> = auditStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      UsersService,
      AbilityFactory,
      UsersAbilityRules,
      { provide: OrganisationsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: AuditLogAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: MembershipsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: UsersRepository, useValue: repo },
      { provide: AuditLogService, useValue: audit },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
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
