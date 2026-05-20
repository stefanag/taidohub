import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { AuditLogAbilityRules } from '../audit-log/audit-log.abilities.js';
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
  } satisfies Record<keyof UsersRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      UsersService,
      AbilityFactory,
      UsersAbilityRules,
      { provide: OrganisationsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: AuditLogAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: MembershipsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: UsersRepository, useValue: repo },
    ],
  }).compile();
  return module.get(UsersService);
}

describe('UsersService — list', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: UsersService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('returns all rows for a sysadmin', async () => {
    repo.list.mockResolvedValue([USER_ROW, OTHER_ROW]);
    const out = await service.list(sysadmin);
    expect(out.map((u) => u.id)).toEqual(['u-user', 'u-other']);
  });

  it('rejects a plain user with ForbiddenException', async () => {
    await expect(service.list(plainUser)).rejects.toThrow(ForbiddenException);
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('rejects an anonymous (null) user with ForbiddenException', async () => {
    await expect(service.list(null)).rejects.toThrow(ForbiddenException);
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
