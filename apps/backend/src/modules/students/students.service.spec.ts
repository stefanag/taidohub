import { ForbiddenException } from '@nestjs/common';
import type { StudentRosterRow } from '@repo/contracts/students';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  ProgressRepository,
  type ProgressRow,
} from '../progress/progress.repository.js';
import { ProgressService } from '../progress/progress.service.js';

import { StudentsRepository } from './students.repository.js';
import { StudentsService } from './students.service.js';

// ── Shared fixtures ────────────────────────────────────────────────────
function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u@example.com',
    emailVerified: true,
    name: null,
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'pr-1',
    userId: 'student-1',
    contentType: 'technique',
    techniqueId: 't-1',
    patternId: null,
    status: 'learning',
    studentNotes: '',
    instructorNotes: '',
    lastPracticedAt: null,
    createdAt: new Date('2026-06-10T00:00:00Z'),
    updatedAt: new Date('2026-06-10T00:00:00Z'),
    ...overrides,
  };
}

function rosterRow(overrides: Partial<StudentRosterRow> = {}): StudentRosterRow {
  return {
    userId: 'student-1',
    name: 'Stu Dent',
    email: 'stu@example.com',
    organisations: [{ id: 'org-a', name: 'Org A' }],
    progressSummary: {
      not_started: 0,
      learning: 0,
      competent: 0,
      grading_ready: 0,
    },
    ...overrides,
  };
}

interface Harness {
  service: StudentsService;
  repo: {
    listStudentIdsInOrgs: ReturnType<typeof vi.fn>;
    listRosterByUserIds: ReturnType<typeof vi.fn>;
    listAllRoster: ReturnType<typeof vi.fn>;
    listOrgIdsForUser: ReturnType<typeof vi.fn>;
  };
  progress: {
    toApi: ReturnType<typeof vi.fn>;
    upsertOnBehalfOf: ReturnType<typeof vi.fn>;
    deleteOnBehalfOf: ReturnType<typeof vi.fn>;
  };
  progressRepo: {
    listByUser: ReturnType<typeof vi.fn>;
  };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
  abilityStub: { can: ReturnType<typeof vi.fn>; cannot: ReturnType<typeof vi.fn> };
}

function build(
  opts: {
    canManage?: boolean;
    orgIdsForStudent?: string[];
  } = {},
): Harness {
  const canManage = opts.canManage ?? true;

  const repo = {
    listStudentIdsInOrgs: vi.fn().mockResolvedValue([]),
    listRosterByUserIds: vi.fn().mockResolvedValue([]),
    listAllRoster: vi.fn().mockResolvedValue([]),
    listOrgIdsForUser: vi
      .fn()
      .mockResolvedValue(opts.orgIdsForStudent ?? ['org-a']),
  };

  const progress = {
    toApi: vi.fn((row: ProgressRow) => ({
      id: row.id,
      userId: row.userId,
      contentType: row.contentType,
      techniqueId: row.techniqueId,
      patternId: row.patternId,
      status: row.status,
      studentNotes: row.studentNotes,
      instructorNotes: row.instructorNotes,
      lastPracticedAt: row.lastPracticedAt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    upsertOnBehalfOf: vi.fn(),
    deleteOnBehalfOf: vi.fn().mockResolvedValue(undefined),
  };

  const progressRepo = {
    listByUser: vi.fn().mockResolvedValue([]),
  };

  const abilityStub = {
    can: vi.fn().mockReturnValue(canManage),
    cannot: vi.fn().mockReturnValue(!canManage),
  };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(abilityStub),
  };

  const service = new StudentsService(
    repo as unknown as StudentsRepository,
    progress as unknown as ProgressService,
    progressRepo as unknown as ProgressRepository,
    abilities as unknown as AbilityFactory,
  );

  return { service, repo, progress, progressRepo, abilities, abilityStub };
}

// ── listRoster ─────────────────────────────────────────────────────────
describe('StudentsService.listRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists students from the caller's instructor orgs only (excluding self)", async () => {
    const harness = build();
    harness.repo.listStudentIdsInOrgs.mockResolvedValue(['s-1', 's-2']);
    const rows = [
      rosterRow({ userId: 's-1', name: 'A' }),
      rosterRow({ userId: 's-2', name: 'B' }),
    ];
    harness.repo.listRosterByUserIds.mockResolvedValue(rows);

    const actor = makeUser({
      id: 'instr-1',
      memberships: [
        { organisationId: 'org-a', role: 'instructor' },
        { organisationId: 'org-b', role: 'orgadmin' },
      ],
    });

    const out = await harness.service.listRoster(actor);

    expect(harness.repo.listStudentIdsInOrgs).toHaveBeenCalledWith(
      ['org-a'],
      'instr-1',
    );
    expect(harness.repo.listRosterByUserIds).toHaveBeenCalledWith(['s-1', 's-2']);
    expect(harness.repo.listAllRoster).not.toHaveBeenCalled();
    expect(out).toEqual(rows);
  });

  it('sysadmin gets the unfiltered roster', async () => {
    const harness = build();
    const rows = [rosterRow({ userId: 's-1' })];
    harness.repo.listAllRoster.mockResolvedValue(rows);

    const out = await harness.service.listRoster(
      makeUser({ role: 'sysadmin' }),
    );

    expect(harness.repo.listAllRoster).toHaveBeenCalledTimes(1);
    expect(harness.repo.listStudentIdsInOrgs).not.toHaveBeenCalled();
    expect(harness.repo.listRosterByUserIds).not.toHaveBeenCalled();
    expect(out).toEqual(rows);
  });

  it('throws Forbidden when the caller has no instructor memberships', async () => {
    const harness = build();
    const actor = makeUser({
      memberships: [{ organisationId: 'org-a', role: 'orgadmin' }],
    });

    await expect(harness.service.listRoster(actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(harness.repo.listStudentIdsInOrgs).not.toHaveBeenCalled();
    expect(harness.repo.listAllRoster).not.toHaveBeenCalled();
  });
});

// ── getStudentProgress (CASL boundary) ─────────────────────────────────
describe('StudentsService.getStudentProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('403s when the caller cannot manage the target student', async () => {
    const harness = build({ canManage: false });

    await expect(
      harness.service.getStudentProgress(
        makeUser({ id: 'instr-1' }),
        'student-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.progressRepo.listByUser).not.toHaveBeenCalled();
  });

  it('returns mapped progress rows when the caller can manage the student', async () => {
    const harness = build({ canManage: true });
    harness.progressRepo.listByUser.mockResolvedValue([
      progressRow({ id: 'pr-1' }),
      progressRow({ id: 'pr-2' }),
    ]);

    const out = await harness.service.getStudentProgress(
      makeUser({ id: 'instr-1' }),
      'student-1',
    );

    expect(harness.progressRepo.listByUser).toHaveBeenCalledWith('student-1');
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('pr-1');
  });
});

// ── upsertStudentProgress ──────────────────────────────────────────────
describe('StudentsService.upsertStudentProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to progress.upsertOnBehalfOf with instructor notes (never student notes)', async () => {
    const harness = build({ canManage: true });
    const created = progressRow({
      id: 'pr-new',
      instructorNotes: 'work on stance',
    });
    harness.progress.upsertOnBehalfOf.mockResolvedValue({
      id: created.id,
      userId: created.userId,
      contentType: created.contentType,
      techniqueId: created.techniqueId,
      patternId: created.patternId,
      status: created.status,
      studentNotes: created.studentNotes,
      instructorNotes: created.instructorNotes,
      lastPracticedAt: created.lastPracticedAt,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });

    const actor = makeUser({ id: 'instr-1' });
    const input = { status: 'learning' as const, instructorNotes: 'work on stance' };

    const out = await harness.service.upsertStudentProgress(
      actor,
      'student-1',
      'technique',
      't-1',
      input,
    );

    expect(harness.progress.upsertOnBehalfOf).toHaveBeenCalledTimes(1);
    const [callActor, callStudent, callType, callId, callInput] =
      harness.progress.upsertOnBehalfOf.mock.calls[0]!;
    expect(callActor).toBe(actor);
    expect(callStudent).toBe('student-1');
    expect(callType).toBe('technique');
    expect(callId).toBe('t-1');
    expect(callInput).toMatchObject({ instructorNotes: 'work on stance' });
    expect(callInput).not.toHaveProperty('studentNotes');
    expect(out.id).toBe('pr-new');
  });

  it('passes the actor through so the audit row records actingUserId', async () => {
    const harness = build({ canManage: true });
    harness.progress.upsertOnBehalfOf.mockResolvedValue({} as never);

    const actor = makeUser({ id: 'instr-1' });
    await harness.service.upsertStudentProgress(
      actor,
      'student-1',
      'technique',
      't-1',
      { status: 'learning', instructorNotes: '' },
    );

    // The actor object is forwarded verbatim — `upsertOnBehalfOf` stamps
    // `actingUserId = actor.id` on the audit row. Asserting on the actor
    // identity here is the closest the service spec can get without
    // re-implementing ProgressService.
    const [forwardedActor] = harness.progress.upsertOnBehalfOf.mock.calls[0]!;
    expect(forwardedActor).toBe(actor);
    expect((forwardedActor as AuthenticatedUser).id).toBe('instr-1');
  });

  it('403s before touching ProgressService when CASL denies', async () => {
    const harness = build({ canManage: false });

    await expect(
      harness.service.upsertStudentProgress(
        makeUser({ id: 'instr-1' }),
        'student-1',
        'technique',
        't-1',
        { status: 'learning', instructorNotes: '' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.progress.upsertOnBehalfOf).not.toHaveBeenCalled();
  });
});

// ── deleteStudentProgress ──────────────────────────────────────────────
describe('StudentsService.deleteStudentProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the manage-student check first, then delegates to progress.deleteOnBehalfOf', async () => {
    const harness = build({ canManage: true });
    const actor = makeUser({ id: 'instr-1' });

    await harness.service.deleteStudentProgress(
      actor,
      'student-1',
      'technique',
      't-1',
    );

    expect(harness.abilities.createForUser).toHaveBeenCalledWith(actor);
    expect(harness.repo.listOrgIdsForUser).toHaveBeenCalledWith('student-1');
    expect(harness.progress.deleteOnBehalfOf).toHaveBeenCalledWith(
      actor,
      'student-1',
      'technique',
      't-1',
    );

    // Order check: ability must be queried BEFORE delegating.
    const cannotOrder = harness.abilityStub.cannot.mock.invocationCallOrder[0]!;
    const deleteOrder =
      harness.progress.deleteOnBehalfOf.mock.invocationCallOrder[0]!;
    expect(cannotOrder).toBeLessThan(deleteOrder);
  });

  it('403s and skips the delete when CASL denies', async () => {
    const harness = build({ canManage: false });

    await expect(
      harness.service.deleteStudentProgress(
        makeUser({ id: 'instr-1' }),
        'student-1',
        'technique',
        't-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.progress.deleteOnBehalfOf).not.toHaveBeenCalled();
  });
});
