import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RankHistoryAuthService } from '../rank-history/rank-history.auth.service.js';
import { RankHistoryRepository } from '../rank-history/rank-history.repository.js';

import { GradingHistoryService } from './grading-history.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const UUID = '11111111-1111-1111-1111-111111111111';

function joinedExternal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    row: {
      id: 'r-1',
      userId: 'u-1',
      rankId: UUID,
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-recorder',
      examinerName: 'Sensei Tanaka',
      organisationName: 'Kobe Dojo',
      notes: null,
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: null,
      updatedByUserId: null,
      ...overrides,
    },
    rank: { id: UUID, systemId: UUID, level: 1 },
    verifiedBy: null,
  };
}

function joinedEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    row: {
      ...joinedExternal().row,
      id: 'r-2',
      source: 'event',
      eventId: 'ev-1',
      examinerName: null,
      organisationName: null,
      verified: true,
      verifiedByUserId: 'u-event',
      verifiedAt: new Date(),
      ...overrides,
    },
    rank: { id: UUID, systemId: UUID, level: 1 },
    verifiedBy: { id: 'u-event', name: 'Event Creator' },
  };
}

function repoStub() {
  return {
    findById: vi.fn(),
    findByIdJoined: vi.fn(),
    listByUser: vi.fn(),
    listByUserJoined: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findHighestVerifiedShogo: vi.fn(),
  } satisfies Record<keyof RankHistoryRepository, ReturnType<typeof vi.fn>>;
}

function authStub() {
  return {
    loadRoleContext: vi.fn().mockResolvedValue({
      isSysadmin: true,
      headInstructorOf: new Set<string>(),
      subjectOrgIds: new Set<string>(),
      sharesOrgWithSubject: false,
      instructorLinks: new Set<string>(),
      gradingOfficerCaps: new Map<string, number>(),
      subjectUserId: 'u-1',
    }),
    canRead: vi.fn(),
    canVerify: vi.fn(),
    canEdit: vi.fn(),
    canDelete: vi.fn(),
    canReadWithCtx: vi.fn().mockReturnValue(true),
    canEditWithCtx: vi.fn().mockReturnValue(true),
    canVerifyWithCtx: vi.fn().mockReturnValue(false),
  };
}

async function makeService(
  repo: ReturnType<typeof repoStub>,
  auth: ReturnType<typeof authStub> = authStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      GradingHistoryService,
      { provide: RankHistoryRepository, useValue: repo },
      { provide: RankHistoryAuthService, useValue: auth },
    ],
  }).compile();
  return { service: module.get(GradingHistoryService), auth };
}

describe('GradingHistoryService.list', () => {
  let repo: ReturnType<typeof repoStub>;

  beforeEach(() => {
    repo = repoStub();
  });

  it('loads the role context exactly once per request', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedExternal(), joinedExternal({ id: 'r-3' })]);
    const auth = authStub();
    const { service } = await makeService(repo, auth);
    await service.list('u-1', sysadmin);
    expect(auth.loadRoleContext).toHaveBeenCalledTimes(1);
  });

  it('hydrates examiner / organisationName from row columns when source=external', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedExternal()]);
    const { service } = await makeService(repo);
    const out = await service.list('u-1', sysadmin);
    expect(out[0]).toMatchObject({
      source: 'external',
      examiner: 'Sensei Tanaka',
      organisationName: 'Kobe Dojo',
    });
  });

  it('returns null examiner/organisationName when source=event (D1 deferred)', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedEvent()]);
    const { service } = await makeService(repo);
    const out = await service.list('u-1', sysadmin);
    expect(out[0]).toMatchObject({
      source: 'event',
      examiner: null,
      organisationName: null,
    });
  });

  it('propagates canVerify / canEdit per row from the context', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedExternal()]);
    const auth = authStub();
    auth.canVerifyWithCtx.mockReturnValue(true);
    auth.canEditWithCtx.mockReturnValue(true);
    const { service } = await makeService(repo, auth);
    const out = await service.list('u-1', sysadmin);
    expect(out[0]?.canVerify).toBe(true);
    expect(out[0]?.canEdit).toBe(true);
  });
});
