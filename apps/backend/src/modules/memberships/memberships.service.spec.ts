import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { AuditLogAbilityRules } from '../audit-log/audit-log.abilities.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';
import { OrganisationsAbilityRules } from '../organisations/organisations.abilities.js';
import { UsersAbilityRules } from '../users/users.abilities.js';
import { MembershipsAbilityRules } from './memberships.abilities.js';
import { MembershipsRepository } from './memberships.repository.js';
import { MembershipsService } from './memberships.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: null,
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const civilian = {
  ...sysadmin,
  id: 'u-user',
  email: 'user@example.com',
  role: 'user' as const,
};

const CLUB = { id: 'club-1', type: 'club', parentId: 'nf-1' };
const NF = { id: 'nf-1', type: 'national_federation', parentId: 'if-1' };

const MEMBERSHIP_ROW = {
  id: 'm-1',
  userId: 'u-target',
  organisationId: 'club-1',
  role: 'orgadmin' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function membershipsRepoStub() {
  return {
    findById: vi.fn(),
    findExact: vi.fn().mockResolvedValue(null),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } satisfies Record<keyof MembershipsRepository, ReturnType<typeof vi.fn>>;
}

function orgsRepoStub() {
  return {
    findById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countChildren: vi.fn(),
    findHeadInstructorOrgIds: vi.fn().mockResolvedValue([] as string[]),
  } satisfies Record<keyof OrganisationsRepository, ReturnType<typeof vi.fn>>;
}

function auditStub() {
  return { record: vi.fn().mockResolvedValue(undefined), list: vi.fn() };
}

const FAKE_TX = { __tx: true } as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof membershipsRepoStub>,
  orgsRepo: ReturnType<typeof orgsRepoStub>,
  audit: ReturnType<typeof auditStub> = auditStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      MembershipsService,
      AbilityFactory,
      UsersAbilityRules,
      OrganisationsAbilityRules,
      AuditLogAbilityRules,
      MembershipsAbilityRules,
      { provide: MembershipsRepository, useValue: repo },
      { provide: OrganisationsRepository, useValue: orgsRepo },
      { provide: AuditLogService, useValue: audit },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return { service: module.get(MembershipsService), audit };
}

describe('MembershipsService — create', () => {
  let repo: ReturnType<typeof membershipsRepoStub>;
  let orgsRepo: ReturnType<typeof orgsRepoStub>;
  let service: MembershipsService;

  beforeEach(async () => {
    repo = membershipsRepoStub();
    orgsRepo = orgsRepoStub();
    ({ service } = await makeService(repo, orgsRepo));
  });

  it('rejects creation by a non-sysadmin', async () => {
    await expect(
      service.create({ userId: 'u-target', organisationId: 'club-1', role: 'orgadmin' }, civilian),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates an orgadmin membership on any org type', async () => {
    orgsRepo.findById.mockResolvedValue(NF);
    repo.create.mockResolvedValue({ ...MEMBERSHIP_ROW, organisationId: 'nf-1' });

    const out = await service.create(
      { userId: 'u-target', organisationId: 'nf-1', role: 'orgadmin' },
      sysadmin,
    );
    expect(out.role).toBe('orgadmin');
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an instructor membership on a non-club org', async () => {
    orgsRepo.findById.mockResolvedValue(NF);

    await expect(
      service.create({ userId: 'u-target', organisationId: 'nf-1', role: 'instructor' }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates an instructor membership on a club', async () => {
    orgsRepo.findById.mockResolvedValue(CLUB);
    repo.create.mockResolvedValue({ ...MEMBERSHIP_ROW, role: 'instructor' });

    const out = await service.create(
      { userId: 'u-target', organisationId: 'club-1', role: 'instructor' },
      sysadmin,
    );
    expect(out.role).toBe('instructor');
  });

  it('rejects when the organisation does not exist', async () => {
    orgsRepo.findById.mockResolvedValue(null);

    await expect(
      service.create({ userId: 'u-target', organisationId: 'nope', role: 'orgadmin' }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate (userId, organisationId, role) tuples', async () => {
    orgsRepo.findById.mockResolvedValue(CLUB);
    repo.findExact.mockResolvedValue(MEMBERSHIP_ROW);

    await expect(
      service.create({ userId: 'u-target', organisationId: 'club-1', role: 'orgadmin' }, sysadmin),
    ).rejects.toThrow(ConflictException);
  });

  it('emits an audit-log create event inside the tx', async () => {
    orgsRepo.findById.mockResolvedValue(CLUB);
    repo.create.mockResolvedValue(MEMBERSHIP_ROW);
    const audit = auditStub();
    ({ service } = await makeService(repo, orgsRepo, audit));

    await service.create(
      { userId: 'u-target', organisationId: 'club-1', role: 'orgadmin' },
      sysadmin,
    );

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      tx: FAKE_TX,
      entityType: 'organisation_membership',
      entityId: 'm-1',
      action: 'create',
      userId: 'u-sys',
      before: null,
    });
  });
});

describe('MembershipsService — update', () => {
  let repo: ReturnType<typeof membershipsRepoStub>;
  let orgsRepo: ReturnType<typeof orgsRepoStub>;
  let service: MembershipsService;

  beforeEach(async () => {
    repo = membershipsRepoStub();
    orgsRepo = orgsRepoStub();
    ({ service } = await makeService(repo, orgsRepo));
  });

  it('rejects update by a non-sysadmin', async () => {
    await expect(service.update('m-1', { role: 'instructor' }, civilian)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s when the membership is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update('nope', { role: 'instructor' }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('re-validates the instructor→club invariant against the unchanged org', async () => {
    repo.findById.mockResolvedValue({ ...MEMBERSHIP_ROW, organisationId: 'nf-1' });
    orgsRepo.findById.mockResolvedValue(NF);

    await expect(service.update('m-1', { role: 'instructor' }, sysadmin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('preserves id and createdAt on a successful role change', async () => {
    repo.findById.mockResolvedValue(MEMBERSHIP_ROW);
    orgsRepo.findById.mockResolvedValue(CLUB);
    repo.update.mockResolvedValue({ ...MEMBERSHIP_ROW, role: 'instructor' });

    const out = await service.update('m-1', { role: 'instructor' }, sysadmin);
    expect(out.id).toBe('m-1');
    expect(out.role).toBe('instructor');
  });

  it('emits an audit-log update with before/after roles', async () => {
    repo.findById.mockResolvedValue(MEMBERSHIP_ROW);
    orgsRepo.findById.mockResolvedValue(CLUB);
    repo.update.mockResolvedValue({ ...MEMBERSHIP_ROW, role: 'instructor' });
    const audit = auditStub();
    ({ service } = await makeService(repo, orgsRepo, audit));

    await service.update('m-1', { role: 'instructor' }, sysadmin);

    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: 'update',
      entityId: 'm-1',
    });
    expect(audit.record.mock.calls[0]?.[0].before).toMatchObject({ role: 'orgadmin' });
    expect(audit.record.mock.calls[0]?.[0].after).toMatchObject({ role: 'instructor' });
  });
});

describe('MembershipsService — delete', () => {
  let repo: ReturnType<typeof membershipsRepoStub>;
  let service: MembershipsService;

  beforeEach(async () => {
    repo = membershipsRepoStub();
    const orgsRepo = orgsRepoStub();
    ({ service } = await makeService(repo, orgsRepo));
  });

  it('rejects delete by a non-sysadmin', async () => {
    await expect(service.delete('m-1', civilian)).rejects.toThrow(ForbiddenException);
  });

  it('404s when the membership is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('emits an audit-log delete with the before snapshot', async () => {
    repo.findById.mockResolvedValue(MEMBERSHIP_ROW);
    repo.delete.mockResolvedValue(true);
    const audit = auditStub();
    const orgsRepo = orgsRepoStub();
    ({ service } = await makeService(repo, orgsRepo, audit));

    await service.delete('m-1', sysadmin);

    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: 'delete',
      entityId: 'm-1',
      after: null,
    });
    expect(audit.record.mock.calls[0]?.[0].before).toMatchObject({ role: 'orgadmin' });
  });
});

describe('MembershipsService — list', () => {
  let repo: ReturnType<typeof membershipsRepoStub>;
  let service: MembershipsService;

  beforeEach(async () => {
    repo = membershipsRepoStub();
    const orgsRepo = orgsRepoStub();
    ({ service } = await makeService(repo, orgsRepo));
  });

  it('sysadmin can list anyone', async () => {
    repo.list.mockResolvedValue({ data: [MEMBERSHIP_ROW], total: 1 });
    const out = await service.list({ userId: 'u-target' }, sysadmin);
    expect(out.total).toBe(1);
  });

  it('non-sysadmin can only filter by their own userId', async () => {
    await expect(service.list({ userId: 'u-other' }, civilian)).rejects.toThrow(ForbiddenException);
  });

  it('non-sysadmin sees their own memberships', async () => {
    repo.list.mockResolvedValue({ data: [], total: 0 });
    const out = await service.list({ userId: civilian.id }, civilian);
    expect(out.total).toBe(0);
  });

  it('rejects an anonymous (null) caller', async () => {
    await expect(service.list({}, null)).rejects.toThrow(ForbiddenException);
  });
});
