import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { UserContextService } from '../../infrastructure/auth/user-context.service.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';
import { AuditLogAbilityRules } from '../audit-log/audit-log.abilities.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { LabelsService } from '../labels/labels.service.js';
import { UsersAbilityRules } from '../users/users.abilities.js';
import { OrganisationsAbilityRules } from './organisations.abilities.js';
import { OrganisationsRepository } from './organisations.repository.js';
import { OrganisationsService } from './organisations.service.js';

const admin = {
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
const civilian = {
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

const IF_ROW = {
  id: 'if-1', parentId: null, type: 'international_federation', shortCode: 'WTF',
  slug: null, country: null, nameEn: 'WTF', nameSv: 'WTF', nameFi: 'WTF', nameJa: null,
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const NF_ROW = { ...IF_ROW, id: 'nf-1', parentId: 'if-1', type: 'national_federation', shortCode: 'STF', country: 'SWE' };
const CLUB_ROW = { ...IF_ROW, id: 'club-1', parentId: 'nf-1', type: 'club', shortCode: 'STK', country: 'SWE' };
const SUBCLUB_ROW = { ...CLUB_ROW, id: 'club-2', parentId: 'club-1', shortCode: 'STK2' };

function repoStub() {
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

function labelsStub() {
  return {
    filterTargetsByLabels: vi
      .fn()
      .mockResolvedValue({ targetIds: undefined as string[] | undefined }),
    detachAllForTarget: vi.fn().mockResolvedValue(undefined),
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
  labels: ReturnType<typeof labelsStub> = labelsStub(),
  currentUser: AuthenticatedUser = admin,
) {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      OrganisationsService,
      AbilityFactory,
      UserContextService,
      OrganisationsAbilityRules,
      { provide: UsersAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: AuditLogAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: OrganisationsRepository, useValue: repo },
      { provide: AuditLogService, useValue: audit },
      { provide: DRIZZLE, useValue: fakeDb },
      { provide: LabelsService, useValue: labels },
    ],
  }).compile();
  await module.init();
  // `setForTesting` is the spec-only fallback that bypasses
  // AsyncLocalStorage — see `UserContextService` for the rationale.
  // Each `makeService` call returns a fresh DI module with its own
  // UserContextService instance, so the test fallback is scoped to
  // this service tree.
  const userContext = module.get(UserContextService);
  userContext.setForTesting(currentUser);
  return { service: module.get(OrganisationsService), audit, labels, userContext };
}

describe('OrganisationsService — hierarchy', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('creates an IF with parentId=null', async () => {
    repo.create.mockResolvedValue(IF_ROW);
    const out = await service.create({ ...IF_ROW, parentId: null, type: 'international_federation' } as any, admin);
    expect(out.id).toBe('if-1');
  });

  it('rejects an IF with a parent', async () => {
    await expect(
      service.create({ ...IF_ROW, parentId: 'nf-1', type: 'international_federation' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an NF without a parent', async () => {
    await expect(
      service.create({ ...NF_ROW, parentId: null, type: 'national_federation' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an NF whose parent is not an IF', async () => {
    repo.findById.mockResolvedValue(NF_ROW);
    await expect(
      service.create({ ...NF_ROW, parentId: 'nf-1', type: 'national_federation' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an NF whose parent is an IF', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    repo.create.mockResolvedValue(NF_ROW);
    const out = await service.create({ ...NF_ROW, parentId: 'if-1', type: 'national_federation' } as any, admin);
    expect(out.type).toBe('national_federation');
  });

  it('accepts a club whose parent is another club', async () => {
    repo.findById.mockResolvedValue(CLUB_ROW);
    repo.create.mockResolvedValue(SUBCLUB_ROW);
    const out = await service.create({ ...SUBCLUB_ROW, parentId: 'club-1', type: 'club' } as any, admin);
    expect(out.type).toBe('club');
  });

  it('rejects a club whose parent is an IF', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    await expect(
      service.create({ ...CLUB_ROW, parentId: 'if-1', type: 'club' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OrganisationsService — country/type rule on update', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('rejects setting a country on an international federation', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    await expect(service.update('if-1', { country: 'JPN' as any }, admin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects clearing the country on a national federation', async () => {
    repo.findById.mockResolvedValue(NF_ROW);
    await expect(service.update('nf-1', { country: null }, admin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a country change between two valid ISO codes on a club', async () => {
    repo.findById.mockResolvedValue(CLUB_ROW);
    repo.update.mockResolvedValue({ ...CLUB_ROW, country: 'FIN' });
    const out = await service.update('club-1', { country: 'FIN' as any }, admin);
    expect(out.country).toBe('FIN');
  });
});

describe('OrganisationsService — cycle detection', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('rejects reparenting a node under one of its descendants', async () => {
    repo.findById.mockImplementation(async (id: string) => {
      if (id === 'club-1') return CLUB_ROW;
      if (id === 'club-2') return SUBCLUB_ROW;
      return null;
    });
    await expect(service.update('club-1', { parentId: 'club-2' }, admin)).rejects.toThrow(BadRequestException);
  });
});

describe('OrganisationsService — delete', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('returns 409 when target has children', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    repo.countChildren.mockResolvedValue(2);
    await expect(service.delete('if-1', admin)).rejects.toThrow(ConflictException);
  });

  it('deletes when childless', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    repo.countChildren.mockResolvedValue(0);
    repo.delete.mockResolvedValue(true);
    await expect(service.delete('if-1', admin)).resolves.toBeUndefined();
  });

  it('404s when target not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope', admin)).rejects.toThrow(NotFoundException);
  });
});

describe('OrganisationsService — authorization', () => {
  it('non-admin cannot create', async () => {
    const repo = repoStub();
    const { service } = await makeService(repo, undefined, undefined, civilian);
    await expect(
      service.create({ ...IF_ROW, parentId: null, type: 'international_federation' } as any, civilian),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('OrganisationsService — org-scoped authorization', () => {
  const orgadminOfClub1 = {
    ...civilian,
    id: 'u-orgadmin',
    memberships: [{ organisationId: 'club-1', role: 'orgadmin' as const }],
  };

  it('orgadmin can update their bound organisation', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(CLUB_ROW);
    repo.update.mockResolvedValue({ ...CLUB_ROW, nameEn: 'X' });
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    const out = await service.update('club-1', { nameEn: 'X' }, orgadminOfClub1);
    expect(out.nameEn).toBe('X');
  });

  it('orgadmin cannot update a different organisation', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(NF_ROW);
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    await expect(service.update('nf-1', { nameEn: 'X' }, orgadminOfClub1)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('orgadmin cannot delete a different organisation', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(NF_ROW);
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    await expect(service.delete('nf-1', orgadminOfClub1)).rejects.toThrow(ForbiddenException);
  });

  it('orgadmin cannot create an organisation', async () => {
    const repo = repoStub();
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    await expect(
      service.create({ ...CLUB_ROW, parentId: 'nf-1', type: 'club' } as any, orgadminOfClub1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('orgadmin can read their bound organisation', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(CLUB_ROW);
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    const out = await service.findOne('club-1', orgadminOfClub1);
    expect(out.id).toBe('club-1');
  });

  it('orgadmin cannot read a different organisation', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(NF_ROW);
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    await expect(service.findOne('nf-1', orgadminOfClub1)).rejects.toThrow(ForbiddenException);
  });

  it('list filters to organisations the orgadmin can read', async () => {
    const repo = repoStub();
    repo.list.mockResolvedValue({ data: [CLUB_ROW, NF_ROW], total: 2 });
    const { service } = await makeService(repo, undefined, undefined, orgadminOfClub1);
    const out = await service.list({} as any, orgadminOfClub1);
    expect(out.data.map((o) => o.id)).toEqual(['club-1']);
    expect(out.total).toBe(1);
  });

  it('sysadmin list returns everything', async () => {
    const repo = repoStub();
    repo.list.mockResolvedValue({ data: [CLUB_ROW, NF_ROW], total: 2 });
    const { service } = await makeService(repo);
    const out = await service.list({} as any, admin);
    expect(out.data.map((o) => o.id)).toEqual(['club-1', 'nf-1']);
    expect(out.total).toBe(2);
  });
});

describe('OrganisationsService — audit', () => {
  it('emits a create audit row inside the tx', async () => {
    const repo = repoStub();
    const audit = auditStub();
    repo.create.mockResolvedValue(IF_ROW);
    const { service } = await makeService(repo, audit);

    await service.create(
      { ...IF_ROW, parentId: null, type: 'international_federation' } as any,
      admin,
    );

    expect(audit.record).toHaveBeenCalledTimes(1);
    const [call] = audit.record.mock.calls;
    expect(call?.[0]).toMatchObject({
      tx: FAKE_TX,
      entityType: 'organisation',
      entityId: 'if-1',
      action: 'create',
      userId: 'u-admin',
      before: null,
    });
  });

  it('emits a `move` audit row when only parentId changes', async () => {
    const repo = repoStub();
    const audit = auditStub();
    repo.findById
      .mockResolvedValueOnce({ ...CLUB_ROW, parentId: 'nf-1' })  // requireById
      .mockResolvedValueOnce({ ...NF_ROW, id: 'nf-2' });          // validateHierarchy
    repo.update.mockResolvedValue({ ...CLUB_ROW, parentId: 'nf-2' });
    const { service } = await makeService(repo, audit);

    await service.update('club-1', { parentId: 'nf-2' }, admin);

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0]?.[0].action).toBe('move');
  });

  it('emits an `update` audit row when other fields change', async () => {
    const repo = repoStub();
    const audit = auditStub();
    repo.findById.mockResolvedValue(CLUB_ROW);
    repo.update.mockResolvedValue({ ...CLUB_ROW, nameEn: 'Renamed' });
    const { service } = await makeService(repo, audit);

    await service.update('club-1', { nameEn: 'Renamed' }, admin);

    expect(audit.record.mock.calls[0]?.[0].action).toBe('update');
  });

  it('emits a delete audit row with before snapshot', async () => {
    const repo = repoStub();
    const audit = auditStub();
    repo.findById.mockResolvedValue(IF_ROW);
    repo.countChildren.mockResolvedValue(0);
    repo.delete.mockResolvedValue(true);
    const { service } = await makeService(repo, audit);

    await service.delete('if-1', admin);

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: 'delete',
      entityId: 'if-1',
      after: null,
    });
    expect(audit.record.mock.calls[0]?.[0].before).toBeTruthy();
  });
});

describe('OrganisationsService — labels integration', () => {
  it('list filters organisations by the tag/category sets returned by LabelsService', async () => {
    const repo = repoStub();
    const labels = labelsStub();
    labels.filterTargetsByLabels.mockResolvedValue({ targetIds: ['club-1', 'nf-1'] });
    repo.list.mockResolvedValue({ data: [CLUB_ROW, NF_ROW], total: 2 });
    const { service } = await makeService(repo, auditStub(), labels);

    await service.list(
      { tag: ['t-1'], category: ['c-1'] } as any,
      admin,
    );

    expect(labels.filterTargetsByLabels).toHaveBeenCalledWith('organisation', {
      tagIds: ['t-1'],
      categoryIds: ['c-1'],
    });
    expect(repo.list).toHaveBeenCalledWith(
      expect.anything(),
      ['club-1', 'nf-1'],
    );
  });

  it('list passes no idIn filter when neither tag nor category is supplied', async () => {
    const repo = repoStub();
    const labels = labelsStub();
    labels.filterTargetsByLabels.mockResolvedValue({ targetIds: undefined });
    repo.list.mockResolvedValue({ data: [], total: 0 });
    const { service } = await makeService(repo, auditStub(), labels);

    await service.list({} as any, admin);

    expect(repo.list).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it('delete triggers detachAllForTarget before removing the org row', async () => {
    const repo = repoStub();
    const labels = labelsStub();
    repo.findById.mockResolvedValue(IF_ROW);
    repo.countChildren.mockResolvedValue(0);
    repo.delete.mockResolvedValue(true);
    const { service } = await makeService(repo, auditStub(), labels);

    await service.delete('if-1', admin);

    expect(labels.detachAllForTarget).toHaveBeenCalledWith('organisation', 'if-1');
    expect(repo.delete).toHaveBeenCalledWith('if-1', FAKE_TX);
    const detachIdx = labels.detachAllForTarget.mock.invocationCallOrder[0]!;
    const deleteIdx = repo.delete.mock.invocationCallOrder[0]!;
    expect(detachIdx).toBeLessThan(deleteIdx);
  });
});
