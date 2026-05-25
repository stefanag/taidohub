import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../infrastructure/database/client.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';

const subjectUserId = 'u-subject';

function actor(role: 'sysadmin' | 'user', id = 'u-actor') {
  return {
    id,
    email: `${id}@example.com`,
    emailVerified: true,
    name: id,
    image: null,
    role,
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
  };
}

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r-1',
    userId: subjectUserId,
    rankId: 'rk-1',
    shogoTitle: null,
    date: '2024-09-01',
    result: 'pass',
    source: 'event',
    eventId: 'ev-1',
    recordedByUserId: 'u-event-creator',
    examinerName: null,
    organisationName: null,
    notes: null,
    verified: true,
    verifiedByUserId: 'u-event-creator',
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

function externalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return eventRow({
    source: 'external',
    eventId: null,
    recordedByUserId: 'u-actor',
    verified: false,
    verifiedByUserId: null,
    verifiedAt: null,
    ...overrides,
  });
}

const orgsRepoStub = () => ({
  findById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  countChildren: vi.fn(),
  // Extension added in Task 16 if not present — for the spec we stub the
  // method that loads orgs headed by an actor:
  findHeadInstructorOrgIds: vi.fn().mockResolvedValue([] as string[]),
});

const membershipsRepoStub = () => ({
  findById: vi.fn(),
  findExact: vi.fn(),
  list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

const fakeDb = {
  transaction: vi.fn(),
};

async function makeService(
  orgsRepo: ReturnType<typeof orgsRepoStub>,
  membersRepo: ReturnType<typeof membershipsRepoStub>,
) {
  const module = await Test.createTestingModule({
    providers: [
      RankHistoryAuthService,
      { provide: OrganisationsRepository, useValue: orgsRepo },
      { provide: MembershipsRepository, useValue: membersRepo },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return module.get(RankHistoryAuthService);
}

describe('RankHistoryAuthService — loadRoleContext', () => {
  it('marks sysadmin actors', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(ctx.isSysadmin).toBe(true);
  });

  it('populates headInstructorOf from organisations', async () => {
    const orgsRepo = orgsRepoStub();
    orgsRepo.findHeadInstructorOrgIds.mockResolvedValue(['org-1', 'org-2']);
    const service = await makeService(orgsRepo, membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    expect(ctx.headInstructorOf.has('org-1')).toBe(true);
    expect(ctx.headInstructorOf.has('org-2')).toBe(true);
  });

  it('sets sharesOrgWithSubject true when the actor and subject share an org', async () => {
    const members = membershipsRepoStub();
    // Subject has membership in org-1; actor has membership in org-1 → share.
    members.list.mockImplementation(async (filter: { userId?: string }) => {
      if (filter.userId === 'u-actor') {
        return { data: [{ organisationId: 'org-1', role: 'instructor' }], total: 1 };
      }
      if (filter.userId === subjectUserId) {
        return { data: [{ organisationId: 'org-1', role: 'orgadmin' }], total: 1 };
      }
      return { data: [], total: 0 };
    });
    const service = await makeService(orgsRepoStub(), members);
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    expect(ctx.sharesOrgWithSubject).toBe(true);
  });

  it('leaves instructorLinks and gradingOfficerCaps empty (D2/D3 deferred)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    expect(ctx.instructorLinks.size).toBe(0);
    expect(ctx.gradingOfficerCaps.size).toBe(0);
  });
});

describe('RankHistoryAuthService — canVerifyWithCtx', () => {
  it('returns false for event-sourced rows', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canVerifyWithCtx(actor('sysadmin'), eventRow(), ctx)).toBe(false);
  });

  it('returns false when the actor is the recorder', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const sysCtx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    const row = externalRow({ recordedByUserId: 'u-actor' });
    expect(service.canVerifyWithCtx(actor('sysadmin'), row, sysCtx)).toBe(false);
  });

  it('returns true for sysadmin on an external row not recorded by them', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    const row = externalRow({ recordedByUserId: subjectUserId });
    expect(service.canVerifyWithCtx(actor('sysadmin'), row, ctx)).toBe(true);
  });

  it("returns true for head instructor of the subject's org", async () => {
    const orgsRepo = orgsRepoStub();
    orgsRepo.findHeadInstructorOrgIds.mockResolvedValue(['org-1']);
    const members = membershipsRepoStub();
    members.list.mockImplementation(async (filter: { userId?: string }) => {
      if (filter.userId === subjectUserId) {
        return { data: [{ organisationId: 'org-1', role: 'orgadmin' }], total: 1 };
      }
      return { data: [], total: 0 };
    });
    const service = await makeService(orgsRepo, members);
    const userActor = actor('user');
    const ctx = await service.loadRoleContext(userActor, subjectUserId);
    const row = externalRow({ recordedByUserId: subjectUserId });
    expect(service.canVerifyWithCtx(userActor, row, ctx)).toBe(true);
  });
});

describe('RankHistoryAuthService — canEditWithCtx', () => {
  it('returns false for event rows', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canEditWithCtx(actor('sysadmin'), eventRow(), ctx)).toBe(false);
  });

  it("returns true when actor is the row's recorder (external)", async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    const row = externalRow({ recordedByUserId: 'u-actor' });
    expect(service.canEditWithCtx(actor('user'), row, ctx)).toBe(true);
  });

  it('returns true when actor is the subject user (external)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user', subjectUserId), subjectUserId);
    const row = externalRow({ recordedByUserId: 'u-other' });
    expect(service.canEditWithCtx(actor('user', subjectUserId), row, ctx)).toBe(true);
  });

  it('returns true for sysadmin (external)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canEditWithCtx(actor('sysadmin'), externalRow(), ctx)).toBe(true);
  });
});

describe('RankHistoryAuthService — canReadWithCtx', () => {
  it('returns true for the subject themselves', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const self = actor('user', subjectUserId);
    const ctx = await service.loadRoleContext(self, subjectUserId);
    expect(service.canReadWithCtx(self, ctx)).toBe(true);
  });

  it('returns true for sysadmin', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canReadWithCtx(actor('sysadmin'), ctx)).toBe(true);
  });

  it('returns true when actor shares an org with the subject', async () => {
    const members = membershipsRepoStub();
    members.list.mockImplementation(async (filter: { userId?: string }) => {
      if (filter.userId === 'u-actor') {
        return { data: [{ organisationId: 'org-1', role: 'instructor' }], total: 1 };
      }
      if (filter.userId === subjectUserId) {
        return { data: [{ organisationId: 'org-1', role: 'orgadmin' }], total: 1 };
      }
      return { data: [], total: 0 };
    });
    const service = await makeService(orgsRepoStub(), members);
    const a = actor('user');
    const ctx = await service.loadRoleContext(a, subjectUserId);
    expect(service.canReadWithCtx(a, ctx)).toBe(true);
  });

  it('returns false otherwise', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const a = actor('user');
    const ctx = await service.loadRoleContext(a, subjectUserId);
    expect(service.canReadWithCtx(a, ctx)).toBe(false);
  });
});
