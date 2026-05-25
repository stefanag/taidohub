import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../infrastructure/database/client.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';
import { RankHistoryRepository } from './rank-history.repository.js';
import { RankHistoryService } from './rank-history.service.js';

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
const user = { ...sysadmin, id: 'u-actor', role: 'user' as const };
const owner = { ...sysadmin, id: 'u-subject', role: 'user' as const };

const UUID = '11111111-1111-1111-1111-111111111111';

function externalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r-1',
    userId: 'u-subject',
    rankId: UUID,
    shogoTitle: null,
    date: '2024-09-01',
    result: 'pass',
    source: 'external',
    eventId: null,
    recordedByUserId: 'u-actor',
    examinerName: null,
    organisationName: null,
    notes: null,
    verified: false,
    verifiedByUserId: null,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return externalRow({
    source: 'event',
    eventId: 'ev-1',
    recordedByUserId: 'u-event',
    verified: true,
    verifiedByUserId: 'u-event',
    verifiedAt: new Date(),
    ...overrides,
  });
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
    findHighestVerifiedShogo: vi.fn().mockResolvedValue(null),
  } satisfies Record<keyof RankHistoryRepository, ReturnType<typeof vi.fn>>;
}

function authStub() {
  return {
    loadRoleContext: vi.fn().mockResolvedValue({
      isSysadmin: true,
      headInstructorOf: new Set<string>(),
      sharesOrgWithSubject: false,
      instructorLinks: new Set<string>(),
      gradingOfficerCaps: new Map<string, number>(),
      subjectUserId: 'u-subject',
    }),
    canRead: vi.fn().mockResolvedValue(true),
    canVerify: vi.fn().mockResolvedValue(true),
    canEdit: vi.fn().mockReturnValue(true),
    canDelete: vi.fn().mockReturnValue(true),
    canReadWithCtx: vi.fn().mockReturnValue(true),
    canEditWithCtx: vi.fn().mockReturnValue(true),
    canVerifyWithCtx: vi.fn().mockReturnValue(true),
  };
}

const FAKE_TX = {
  __tx: true,
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  }),
} as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof repoStub>,
  auth: ReturnType<typeof authStub> = authStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      RankHistoryService,
      { provide: RankHistoryRepository, useValue: repo },
      { provide: RankHistoryAuthService, useValue: auth },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return { service: module.get(RankHistoryService), auth };
}

describe('RankHistoryService — create', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    repo.insert.mockResolvedValue(externalRow());
    ({ service } = await makeService(repo));
  });

  it('stamps source=external, result=pass, verified=false, recorded by actor', async () => {
    await service.create('u-subject', { rankId: UUID, date: '2024-09-01' }, user);
    expect(repo.insert).toHaveBeenCalledTimes(1);
    const insertedRow = repo.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow.userId).toBe('u-subject');
    expect(insertedRow.source).toBe('external');
    expect(insertedRow.result).toBe('pass');
    expect(insertedRow.verified).toBe(false);
    expect(insertedRow.eventId).toBe(null);
    expect(insertedRow.recordedByUserId).toBe('u-actor');
  });
});

describe('RankHistoryService — update', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update('nope', { notes: 'x' }, user)).rejects.toThrow(NotFoundException);
  });

  it('rejects event-sourced rows with SOURCE_EVENT', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.update('r-1', { notes: 'x' }, user)).rejects.toThrow(BadRequestException);
  });

  it('preserves verification when only notes change', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-sys', verifiedAt: new Date() }));
    repo.update.mockResolvedValue(externalRow({ notes: 'updated', verified: true }));
    await service.update('r-1', { notes: 'updated' }, sysadmin);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.notes).toBe('updated');
    expect(patch.verified).toBeUndefined();
    expect(patch.verifiedByUserId).toBeUndefined();
  });

  it('clears verification when date changes on a verified row', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-sys', verifiedAt: new Date(), shogoTitle: null }));
    repo.update.mockResolvedValue(externalRow({ date: '2024-10-01', verified: false }));
    await service.update('r-1', { date: '2024-10-01' }, sysadmin);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.verified).toBe(false);
    expect(patch.verifiedByUserId).toBe(null);
    expect(patch.verifiedAt).toBe(null);
  });

  it('clears verification when shogo changes on a verified row and recomputes shogo', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-sys', verifiedAt: new Date(), shogoTitle: 'kyoshi' }));
    repo.update.mockResolvedValue(externalRow({ shogoTitle: 'renshi', verified: false }));
    repo.findHighestVerifiedShogo.mockResolvedValue('renshi');
    await service.update('r-1', { shogoTitle: 'renshi' }, sysadmin);
    expect(repo.findHighestVerifiedShogo).toHaveBeenCalledWith('u-subject', FAKE_TX);
  });
});

describe('RankHistoryService — delete', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('rejects event-sourced rows with SOURCE_EVENT', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.delete('r-1', sysadmin)).rejects.toThrow(BadRequestException);
  });

  it('deletes external rows', async () => {
    repo.findById.mockResolvedValue(externalRow());
    repo.delete.mockResolvedValue(true);
    await service.delete('r-1', sysadmin);
    expect(repo.delete).toHaveBeenCalledWith('r-1', FAKE_TX);
  });
});

describe('RankHistoryService — verify', () => {
  let repo: ReturnType<typeof repoStub>;
  let auth: ReturnType<typeof authStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    auth = authStub();
    ({ service } = await makeService(repo, auth));
  });

  it('rejects event-sourced rows with SOURCE_EVENT', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.verify('r-1', sysadmin)).rejects.toThrow(BadRequestException);
  });

  it('rejects already-verified rows with 409', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-x', verifiedAt: new Date() }));
    await expect(service.verify('r-1', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('rejects self-verify (recorder !== verifier)', async () => {
    repo.findById.mockResolvedValue(externalRow({ recordedByUserId: 'u-sys' }));
    await expect(service.verify('r-1', sysadmin)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when auth.canVerify returns false', async () => {
    repo.findById.mockResolvedValue(externalRow({ recordedByUserId: 'u-other' }));
    auth.canVerify.mockResolvedValue(false);
    await expect(service.verify('r-1', user)).rejects.toThrow(ForbiddenException);
  });

  it('marks the row verified and recomputes shogo when the row carries one', async () => {
    repo.findById
      .mockResolvedValueOnce(externalRow({ shogoTitle: 'kyoshi', recordedByUserId: 'u-other' }))
      .mockResolvedValueOnce(externalRow({ shogoTitle: 'kyoshi', verified: true, verifiedByUserId: sysadmin.id, verifiedAt: new Date() }));
    repo.update.mockResolvedValue(externalRow({ shogoTitle: 'kyoshi', verified: true }));
    repo.findHighestVerifiedShogo.mockResolvedValue('kyoshi');

    await service.verify('r-1', sysadmin);

    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.verified).toBe(true);
    expect(patch.verifiedByUserId).toBe(sysadmin.id);
    expect(patch.verifiedAt).toBeInstanceOf(Date);
    expect(repo.findHighestVerifiedShogo).toHaveBeenCalledWith('u-subject', FAKE_TX);
  });
});

describe('RankHistoryService — unverify', () => {
  let repo: ReturnType<typeof repoStub>;
  let auth: ReturnType<typeof authStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    auth = authStub();
    ({ service } = await makeService(repo, auth));
  });

  it('rejects event-sourced rows', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.unverify('r-1', sysadmin)).rejects.toThrow(BadRequestException);
  });

  it('rejects already-unverified rows with 409 ALREADY_UNVERIFIED', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: false }));
    await expect(service.unverify('r-1', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('clears verification triple and recomputes shogo when the row had one', async () => {
    repo.findById.mockResolvedValueOnce(
      externalRow({ shogoTitle: 'kyoshi', verified: true, verifiedByUserId: 'u-x', verifiedAt: new Date(), recordedByUserId: 'u-other' }),
    );
    repo.update.mockResolvedValue(externalRow({ shogoTitle: 'kyoshi', verified: false }));
    await service.unverify('r-1', sysadmin);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.verified).toBe(false);
    expect(patch.verifiedByUserId).toBe(null);
    expect(patch.verifiedAt).toBe(null);
    expect(repo.findHighestVerifiedShogo).toHaveBeenCalledWith('u-subject', FAKE_TX);
  });
});
