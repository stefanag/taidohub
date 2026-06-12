import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

import {
  ProgressRepository,
  type ProgressRow,
} from './progress.repository.js';
import { ProgressService } from './progress.service.js';

// ── Shared fixtures ────────────────────────────────────────────────────
const FAKE_TX = { __tx: true } as unknown;

function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'pr-1',
    userId: 'u-1',
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

interface Harness {
  service: ProgressService;
  repo: { [K in keyof ProgressRepository]: ReturnType<typeof vi.fn> };
  audit: { record: ReturnType<typeof vi.fn> };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
  db: {
    transaction: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
  /** Capture the most recent ability stub so individual tests can introspect. */
  abilityStub: { can: ReturnType<typeof vi.fn>; cannot: ReturnType<typeof vi.fn> };
}

function build(
  initial: {
    canManage?: boolean;
    rowOnFind?: ProgressRow | null;
    /** When `false`, the assertContentExists check returns 0 rows. */
    contentExists?: boolean;
  } = {},
): Harness {
  const canManage = initial.canManage ?? true;

  const repo = {
    findByUserAndContent: vi.fn().mockResolvedValue(initial.rowOnFind ?? null),
    listByUser: vi.fn().mockResolvedValue([]),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  // CASL stub: `cannot` is the inverse of `can`. The service uses `cannot`,
  // but exposing both keeps the stub re-usable if the implementation flips.
  const abilityStub = {
    can: vi.fn().mockReturnValue(canManage),
    cannot: vi.fn().mockReturnValue(!canManage),
  };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(abilityStub),
  };

  // Minimal `db.select(...).from(...).where(...).limit(...)` chain for the
  // assertContentExists check. Returns one row when `contentExists !== false`.
  const contentExists = initial.contentExists ?? true;
  const limit = vi.fn().mockResolvedValue(contentExists ? [{ id: 'exists' }] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const db = {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)),
    select,
  };

  const service = new ProgressService(
    db as never,
    repo as unknown as ProgressRepository,
    audit as unknown as AuditLogService,
    abilities as unknown as AbilityFactory,
  );

  return { service, repo, audit, abilities, db, abilityStub };
}

// ── upsert ─────────────────────────────────────────────────────────────
describe('ProgressService.upsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new row when none exists', async () => {
    const created = row({ id: 'pr-new', status: 'learning' });
    const harness = build({ rowOnFind: null, canManage: true });
    harness.repo.insert.mockResolvedValue(created);

    const out = await harness.service.upsert(makeUser(), 'technique', 't-1', {
      status: 'learning',
      studentNotes: '',
    });

    expect(out.id).toBe('pr-new');
    expect(harness.repo.insert).toHaveBeenCalledTimes(1);
    expect(harness.repo.update).not.toHaveBeenCalled();
    expect(harness.repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        contentType: 'technique',
        techniqueId: 't-1',
        patternId: null,
        status: 'learning',
        studentNotes: '',
        // Self-upsert never touches instructor notes — always seeded to ''.
        instructorNotes: '',
      }),
      FAKE_TX,
    );
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: FAKE_TX,
        entityType: 'progress',
        entityId: 'pr-new',
        action: 'create',
        userId: 'u-1',
        impersonatedById: null,
        actingUserId: null,
        before: null,
      }),
    );
  });

  it('updates an existing row (same id, fresh updated_at)', async () => {
    const existing = row({
      id: 'pr-1',
      status: 'learning',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const updated = row({
      id: 'pr-1',
      status: 'competent',
      updatedAt: new Date('2026-06-11T00:00:00Z'),
    });
    const harness = build({ rowOnFind: existing, canManage: true });
    harness.repo.update.mockResolvedValue(updated);

    const out = await harness.service.upsert(makeUser(), 'technique', 't-1', {
      status: 'competent',
      studentNotes: 'better',
      lastPracticedAt: '2026-06-11',
    });

    expect(out.id).toBe('pr-1');
    expect(harness.repo.insert).not.toHaveBeenCalled();
    expect(harness.repo.update).toHaveBeenCalledTimes(1);
    const [updateId, updatePatch, updateTx] = harness.repo.update.mock.calls[0]!;
    expect(updateId).toBe('pr-1');
    expect(updatePatch).toMatchObject({
      status: 'competent',
      studentNotes: 'better',
      lastPracticedAt: '2026-06-11',
    });
    // Self-upsert MUST NOT touch instructor notes.
    expect(updatePatch).not.toHaveProperty('instructorNotes');
    expect(updatePatch.updatedAt).toBeInstanceOf(Date);
    expect(updateTx).toBe(FAKE_TX);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'progress',
        entityId: 'pr-1',
        actingUserId: null,
        before: expect.objectContaining({ status: 'learning' }),
        after: expect.objectContaining({ status: 'competent' }),
      }),
    );
  });

  it('rejects unknown techniqueId with INVALID_CONTENT 404', async () => {
    const harness = build({ contentExists: false });

    await expect(
      harness.service.upsert(makeUser(), 'technique', 't-missing', {
        status: 'learning',
        studentNotes: '',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.db.transaction).not.toHaveBeenCalled();
    expect(harness.repo.insert).not.toHaveBeenCalled();
    expect(harness.repo.update).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
  });
});

// ── delete ─────────────────────────────────────────────────────────────
describe('ProgressService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a row when present', async () => {
    const existing = row({ id: 'pr-1' });
    const harness = build({ rowOnFind: existing, canManage: true });

    await harness.service.delete(makeUser(), 'technique', 't-1');

    expect(harness.repo.delete).toHaveBeenCalledWith('pr-1', FAKE_TX);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entityType: 'progress',
        entityId: 'pr-1',
        actingUserId: null,
        after: null,
      }),
    );
  });

  it('404s when absent', async () => {
    const harness = build({ rowOnFind: null });

    await expect(
      harness.service.delete(makeUser(), 'technique', 't-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.repo.delete).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
    expect(harness.db.transaction).not.toHaveBeenCalled();
  });
});

// ── list ───────────────────────────────────────────────────────────────
describe('ProgressService.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the caller's rows (calls repo.listByUser with actor.id)", async () => {
    const harness = build();
    harness.repo.listByUser.mockResolvedValue([
      row({ id: 'pr-1', userId: 'u-1' }),
      row({ id: 'pr-2', userId: 'u-1', contentType: 'pattern', techniqueId: null, patternId: 'p-1' }),
    ]);

    const out = await harness.service.list(makeUser({ id: 'u-1' }));

    expect(harness.repo.listByUser).toHaveBeenCalledWith('u-1', undefined);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.userId === 'u-1')).toBe(true);
  });
});

// ── CASL boundary ──────────────────────────────────────────────────────
describe('ProgressService CASL boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('regular user can manage own row (no Forbidden)', async () => {
    const ownRow = row({ id: 'pr-1', userId: 'u-1' });
    const harness = build({ rowOnFind: ownRow, canManage: true });

    await expect(
      harness.service.findOne(makeUser({ id: 'u-1' }), 'technique', 't-1'),
    ).resolves.toMatchObject({ id: 'pr-1', userId: 'u-1' });
  });

  it("regular user cannot manage another user's row (throws Forbidden)", async () => {
    const otherRow = row({ id: 'pr-2', userId: 'u-other' });
    const harness = build({ rowOnFind: otherRow, canManage: false });

    // Pre-condition: `findByUserAndContent` SQL filters by userId, so a real
    // call would return null and we'd 404 first. To exercise the CASL guard
    // directly we override the repo to surface the foreign row.
    harness.repo.findByUserAndContent.mockResolvedValue(otherRow);

    await expect(
      harness.service.findOne(makeUser({ id: 'u-1' }), 'technique', 't-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── upsertOnBehalfOf / deleteOnBehalfOf ────────────────────────────────
describe('ProgressService.upsertOnBehalfOf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new row owned by the student with instructor_notes set and student_notes empty', async () => {
    const actor = makeUser({ id: 'instr-1', role: 'user' });
    const created = row({
      id: 'pr-new',
      userId: 'student-1',
      studentNotes: '',
      instructorNotes: 'work on stance',
    });
    const harness = build({ rowOnFind: null });
    harness.repo.insert.mockResolvedValue(created);

    const out = await harness.service.upsertOnBehalfOf(
      actor,
      'student-1',
      'technique',
      't-1',
      { status: 'learning', instructorNotes: 'work on stance' },
    );

    expect(out.id).toBe('pr-new');
    expect(harness.repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'student-1',
        contentType: 'technique',
        techniqueId: 't-1',
        patternId: null,
        status: 'learning',
        studentNotes: '',
        instructorNotes: 'work on stance',
      }),
      FAKE_TX,
    );
  });

  it('audit row carries actingUserId=actor.id and userId=subjectUserId', async () => {
    const actor = makeUser({ id: 'instr-1', role: 'user' });
    const created = row({ id: 'pr-new', userId: 'student-1' });
    const harness = build({ rowOnFind: null });
    harness.repo.insert.mockResolvedValue(created);

    await harness.service.upsertOnBehalfOf(
      actor,
      'student-1',
      'technique',
      't-1',
      { status: 'learning', instructorNotes: '' },
    );

    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'progress',
        entityId: 'pr-new',
        action: 'create',
        userId: 'student-1',
        actingUserId: 'instr-1',
        impersonatedById: null,
      }),
    );
  });

  it('update path does NOT touch student_notes (only status/instructorNotes/lastPracticedAt/updatedAt)', async () => {
    const actor = makeUser({ id: 'instr-1', role: 'user' });
    const existing = row({
      id: 'pr-1',
      userId: 'student-1',
      studentNotes: 'student wrote this',
      instructorNotes: 'old instructor note',
    });
    const updated = row({
      id: 'pr-1',
      userId: 'student-1',
      studentNotes: 'student wrote this',
      instructorNotes: 'new instructor note',
      status: 'competent',
    });
    const harness = build({ rowOnFind: existing });
    harness.repo.update.mockResolvedValue(updated);

    await harness.service.upsertOnBehalfOf(
      actor,
      'student-1',
      'technique',
      't-1',
      {
        status: 'competent',
        instructorNotes: 'new instructor note',
        lastPracticedAt: '2026-06-12',
      },
    );

    expect(harness.repo.update).toHaveBeenCalledTimes(1);
    const [, updatePatch] = harness.repo.update.mock.calls[0]!;
    expect(updatePatch).toMatchObject({
      status: 'competent',
      instructorNotes: 'new instructor note',
      lastPracticedAt: '2026-06-12',
    });
    expect(updatePatch).not.toHaveProperty('studentNotes');
  });
});

describe('ProgressService.deleteOnBehalfOf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the row + emits audit row with actingUserId=actor.id and userId=subjectUserId', async () => {
    const actor = makeUser({ id: 'instr-1', role: 'user' });
    const existing = row({ id: 'pr-1', userId: 'student-1' });
    const harness = build({ rowOnFind: existing });

    await harness.service.deleteOnBehalfOf(
      actor,
      'student-1',
      'technique',
      't-1',
    );

    expect(harness.repo.delete).toHaveBeenCalledWith('pr-1', FAKE_TX);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entityType: 'progress',
        entityId: 'pr-1',
        userId: 'student-1',
        actingUserId: 'instr-1',
        after: null,
      }),
    );
  });

  it('404s when row absent', async () => {
    const actor = makeUser({ id: 'instr-1', role: 'user' });
    const harness = build({ rowOnFind: null });

    await expect(
      harness.service.deleteOnBehalfOf(actor, 'student-1', 'technique', 't-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.repo.delete).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
  });
});
