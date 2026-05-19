import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { UsersAbilityRules } from '../users/users.abilities.js';
import { OrganisationsAbilityRules } from '../organisations/organisations.abilities.js';
import { AuditLogAbilityRules } from './audit-log.abilities.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { AuditLogService } from './audit-log.service.js';

const admin = {
  id: 'u-admin', email: 'admin@example.com', emailVerified: true,
  name: null, image: null, locale: 'en', role: 'sysadmin' as const,
  deactivatedAt: null, memberships: [],
};
const civilian = { ...admin, id: 'u-user', email: 'user@example.com', role: 'user' as const };

function repoStub() {
  return {
    insert: vi.fn(),
    list: vi.fn(),
  } satisfies Record<keyof AuditLogRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      AuditLogService,
      AbilityFactory,
      AuditLogAbilityRules,
      { provide: UsersAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: OrganisationsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: AuditLogRepository, useValue: repo },
    ],
  }).compile();
  return module.get(AuditLogService);
}

const FAKE_TX = { __tx: true } as any; // Drizzle tx shape doesn't matter for unit tests

describe('AuditLogService.record', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: AuditLogService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('inserts an audit row via the provided tx', async () => {
    repo.insert.mockResolvedValue(undefined);

    await service.record({
      tx: FAKE_TX,
      entityType: 'organisation',
      entityId: 'org-1',
      action: 'create',
      userId: 'u-1',
      before: null,
      after: { id: 'org-1', name: 'X' },
    });

    expect(repo.insert).toHaveBeenCalledTimes(1);
    const [row, tx] = repo.insert.mock.calls[0]!;
    expect(tx).toBe(FAKE_TX);
    expect(row).toMatchObject({
      entityType: 'organisation',
      entityId: 'org-1',
      action: 'create',
      userId: 'u-1',
      before: null,
      after: { id: 'org-1', name: 'X' },
    });
  });
});

describe('AuditLogService.list', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: AuditLogService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('returns the paginated list for an admin', async () => {
    repo.list.mockResolvedValue({
      data: [{
        id: '00000000-0000-4000-8000-000000000001',
        entityType: 'organisation', entityId: 'org-1', action: 'create',
        userId: 'u-1', before: null, after: { id: 'org-1' },
        createdAt: new Date('2026-05-17T08:00:00.000Z'),
      }],
      total: 1,
    });

    const out = await service.list({ page: 1, perPage: 25 }, admin);

    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.entityType).toBe('organisation');
    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.perPage).toBe(25);
  });

  it('rejects non-admin readers', async () => {
    await expect(service.list({ page: 1, perPage: 25 }, civilian)).rejects.toThrow(ForbiddenException);
  });

  it('rejects anonymous readers', async () => {
    await expect(service.list({ page: 1, perPage: 25 }, null)).rejects.toThrow(ForbiddenException);
  });
});
