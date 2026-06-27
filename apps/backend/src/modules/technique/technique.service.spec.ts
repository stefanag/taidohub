import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { ClassificationCategoryRepository } from '../classification-category/classification-category.repository.js';
import { ClassificationCategoryService } from '../classification-category/classification-category.service.js';

import {
  TechniqueRepository,
  type TechniqueRow,
} from './technique.repository.js';
import { TechniqueService } from './technique.service.js';

// ── Shared fixtures ────────────────────────────────────────────────────
const FAKE_TX = { __tx: true } as unknown;

function row(overrides: Partial<TechniqueRow> = {}): TechniqueRow {
  return {
    id: 't-1',
    createdByOrganisationId: null,
    createdByUserId: 'u-sys',
    isKihon: false,
    isActive: true,
    sortOrder: 0,
    minRankId: null,
    nameJa: '',
    nameRomaji: 'mae geri',
    nameSv: '',
    nameEn: '',
    nameFi: '',
    descriptionSv: '',
    descriptionEn: '',
    descriptionFi: '',
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
  service: TechniqueService;
  repo: { [K in keyof TechniqueRepository]: ReturnType<typeof vi.fn> };
  classifications: { resolveRootCodes: ReturnType<typeof vi.fn>; getRootMap: ReturnType<typeof vi.fn> };
  classificationRepo: { findManyByIds: ReturnType<typeof vi.fn> };
  audit: { record: ReturnType<typeof vi.fn> };
  abilities: {
    createForUser: ReturnType<typeof vi.fn>;
    forCurrentRequest: ReturnType<typeof vi.fn>;
  };
  db: { transaction: ReturnType<typeof vi.fn> };
}

function build(
  initial: {
    canManage?: boolean;
    rootMapById?: Record<string, string>; // catId → rootCode
    rowOnFind?: TechniqueRow | null;
  } = {},
): Harness {
  const repo = {
    createWithLinks: vi.fn().mockResolvedValue('t-new'),
    update: vi.fn(),
    replaceClassifications: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(initial.rowOnFind ?? null),
    listClassifications: vi.fn().mockResolvedValue([]),
    listClassificationsByTechniqueIds: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const classifications = {
    resolveRootCodes: vi
      .fn()
      .mockImplementation(async (ids: string[]) =>
        new Map(ids.map((id) => [id, initial.rootMapById?.[id] ?? null])),
      ),
    getRootMap: vi.fn().mockResolvedValue(new Map()),
  };

  const classificationRepo = {
    findManyByIds: vi.fn().mockResolvedValue([]),
  };

  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  // The row-level `assertCanManage` now reads from
  // `forCurrentRequest()` (the request-cached path); the older
  // `createForUser` mock stays in place for any future call site
  // that hasn't been migrated. Both mocks return the same fake
  // ability so existing assertions stay valid.
  const fakeAbility = {
    can: vi.fn().mockReturnValue(initial.canManage ?? true),
  };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(fakeAbility),
    forCurrentRequest: vi.fn().mockReturnValue(fakeAbility),
  };

  const db = {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)),
  };

  const service = new TechniqueService(
    db as never,
    repo as unknown as TechniqueRepository,
    classifications as unknown as ClassificationCategoryService,
    classificationRepo as unknown as ClassificationCategoryRepository,
    audit as unknown as AuditLogService,
    abilities as unknown as AbilityFactory,
  );

  return { service, repo, classifications, classificationRepo, audit, abilities, db };
}

describe('TechniqueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create rejects when actor is a plain user (no orgadmin membership)', async () => {
    const { service } = build({ rootMapById: { a: 'technique_type' } });
    await expect(
      service.create(makeUser({ role: 'user' }), {
        classificationIds: ['a'],
        nameRomaji: 'mae geri',
        isKihon: false,
        isActive: true,
        sortOrder: 0,
        nameJa: '',
        nameSv: '',
        nameEn: '',
        nameFi: '',
        descriptionSv: '',
        descriptionEn: '',
        descriptionFi: '',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create with empty classificationIds → MISSING_REQUIRED_CATEGORY', async () => {
    const { service, repo } = build();
    await expect(
      service.create(makeUser({ role: 'sysadmin' }), {
        classificationIds: [],
        nameRomaji: 'mae geri',
        isKihon: false,
        isActive: true,
        sortOrder: 0,
        nameJa: '',
        nameSv: '',
        nameEn: '',
        nameFi: '',
        descriptionSv: '',
        descriptionEn: '',
        descriptionFi: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createWithLinks).not.toHaveBeenCalled();
  });

  it('create with sotai-only ids → MISSING_REQUIRED_CATEGORY', async () => {
    const { service, repo } = build({ rootMapById: { s: 'sotai_category' } });
    await expect(
      service.create(makeUser({ role: 'sysadmin' }), {
        classificationIds: ['s'],
        nameRomaji: 'mae geri',
        isKihon: false,
        isActive: true,
        sortOrder: 0,
        nameJa: '',
        nameSv: '',
        nameEn: '',
        nameFi: '',
        descriptionSv: '',
        descriptionEn: '',
        descriptionFi: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createWithLinks).not.toHaveBeenCalled();
  });

  it('create with allowed mix succeeds and emits an audit row', async () => {
    const created = row({ id: 't-new' });
    const harness = build({
      rootMapById: { a: 'technique_type', b: 'attack_type' },
      rowOnFind: created,
    });
    harness.repo.createWithLinks.mockResolvedValue('t-new');
    // Override default no-op
    harness.repo.findById.mockResolvedValue(created);

    const out = await harness.service.create(makeUser({ role: 'sysadmin' }), {
      classificationIds: ['a', 'b'],
      nameRomaji: 'mae geri',
      isKihon: false,
      isActive: true,
      sortOrder: 0,
      nameJa: '',
      nameSv: '',
      nameEn: '',
      nameFi: '',
      descriptionSv: '',
      descriptionEn: '',
      descriptionFi: '',
    });

    expect(out.id).toBe('t-new');
    expect(harness.repo.createWithLinks).toHaveBeenCalledTimes(1);
    expect(harness.audit.record).toHaveBeenCalledTimes(1);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: FAKE_TX,
        entityType: 'technique',
        entityId: 't-new',
        action: 'create',
        userId: 'u-1',
        impersonatedById: null,
        before: null,
      }),
    );
  });

  it("update by orgadmin of another org's technique → Forbidden", async () => {
    const existing = row({ createdByOrganisationId: 'org-B' });
    const harness = build({ rowOnFind: existing, canManage: false });

    const actor = makeUser({
      memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
    });

    await expect(
      harness.service.update(actor, existing.id, { nameSv: 'Front kick' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.repo.update).not.toHaveBeenCalled();
    expect(harness.repo.replaceClassifications).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
  });

  it('update replaces classifications when array is present', async () => {
    const existing = row({ createdByOrganisationId: null });
    const harness = build({
      rowOnFind: existing,
      canManage: true,
      rootMapById: { a: 'technique_type' },
    });
    harness.repo.update.mockResolvedValue({ ...existing, nameSv: 'Front kick' });

    await harness.service.update(makeUser({ role: 'sysadmin' }), existing.id, {
      classificationIds: ['a'],
      nameSv: 'Front kick',
    });

    expect(harness.repo.replaceClassifications).toHaveBeenCalledWith(
      existing.id,
      ['a'],
      FAKE_TX,
    );
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'technique',
        entityId: existing.id,
      }),
    );
  });

  it('update with empty classificationIds → MISSING_REQUIRED_CATEGORY, no DB write', async () => {
    const existing = row({ createdByOrganisationId: null });
    const harness = build({ rowOnFind: existing, canManage: true });

    await expect(
      harness.service.update(makeUser({ role: 'sysadmin' }), existing.id, {
        classificationIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.repo.update).not.toHaveBeenCalled();
    expect(harness.repo.replaceClassifications).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
    expect(harness.db.transaction).not.toHaveBeenCalled();
  });

  it('delete removes the row and emits a delete audit entry', async () => {
    const existing = row({ createdByOrganisationId: null });
    const harness = build({ rowOnFind: existing, canManage: true });
    harness.repo.listClassifications.mockResolvedValue([
      { classificationCategoryId: 'a', sortOrder: 0 },
    ]);

    await harness.service.delete(makeUser({ role: 'sysadmin' }), existing.id);

    expect(harness.repo.delete).toHaveBeenCalledWith(existing.id, FAKE_TX);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entityType: 'technique',
        entityId: existing.id,
        before: expect.objectContaining({ classificationIds: ['a'] }),
        after: null,
      }),
    );
  });

  it('findOne throws NotFound when the row is gone', async () => {
    const harness = build({ rowOnFind: null });
    await expect(
      harness.service.findOne(makeUser({ role: 'sysadmin' }), 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── Batched-hydration contract (Chunk 1.5) ──────────────────────────
  //
  // The list path used to hydrate per-row inside a `Promise.all`, calling
  // `repo.listClassifications(rowId)` N times. The new shape pulls every
  // junction in a single `listClassificationsByTechniqueIds` call.
  // These tests pin that contract so a regression that re-introduces the
  // 1+N pattern fails the build.

  it('list hydrates a multi-row response with a single batched junction call', async () => {
    const harness = build();
    const rows = [
      row({ id: 't-1' }),
      row({ id: 't-2' }),
      row({ id: 't-3' }),
    ];
    harness.repo.list.mockResolvedValue(rows);
    harness.repo.listClassificationsByTechniqueIds.mockResolvedValue([
      { techniqueId: 't-1', classificationCategoryId: 'a', sortOrder: 0 },
      { techniqueId: 't-2', classificationCategoryId: 'b', sortOrder: 0 },
      { techniqueId: 't-3', classificationCategoryId: 'a', sortOrder: 0 },
    ]);

    await harness.service.list(makeUser({ role: 'sysadmin' }), {
      classificationIds: [],
      includeInactive: false,
      organisationId: null,
      strict: false,
    });

    expect(harness.repo.listClassificationsByTechniqueIds).toHaveBeenCalledTimes(1);
    expect(harness.repo.listClassificationsByTechniqueIds).toHaveBeenCalledWith(
      ['t-1', 't-2', 't-3'],
    );
    // Per-row method MUST NOT be called from the list path — that's the
    // 1+N regression we're guarding against.
    expect(harness.repo.listClassifications).not.toHaveBeenCalled();
  });

  it('list calls findManyByIds with the de-duplicated category set', async () => {
    const harness = build();
    harness.repo.list.mockResolvedValue([row({ id: 't-1' }), row({ id: 't-2' })]);
    harness.repo.listClassificationsByTechniqueIds.mockResolvedValue([
      { techniqueId: 't-1', classificationCategoryId: 'a', sortOrder: 0 },
      { techniqueId: 't-1', classificationCategoryId: 'b', sortOrder: 1 },
      { techniqueId: 't-2', classificationCategoryId: 'a', sortOrder: 0 },
    ]);

    await harness.service.list(makeUser({ role: 'sysadmin' }), {
      classificationIds: [],
      includeInactive: false,
      organisationId: null,
      strict: false,
    });

    expect(harness.classificationRepo.findManyByIds).toHaveBeenCalledTimes(1);
    const calledWith = harness.classificationRepo.findManyByIds.mock.calls[0]![0] as string[];
    expect([...calledWith].sort()).toEqual(['a', 'b']);
  });

  it('list returns [] without firing any junction lookup when the page is empty', async () => {
    const harness = build();
    harness.repo.list.mockResolvedValue([]);

    const out = await harness.service.list(makeUser({ role: 'sysadmin' }), {
      classificationIds: [],
      includeInactive: false,
      organisationId: null,
      strict: false,
    });

    expect(out).toEqual([]);
    expect(harness.repo.listClassificationsByTechniqueIds).not.toHaveBeenCalled();
    expect(harness.classificationRepo.findManyByIds).not.toHaveBeenCalled();
  });

  it('findOne still uses the per-row hydration path (single-row reads stay simple)', async () => {
    const existing = row({ id: 't-find' });
    const harness = build({ rowOnFind: existing });

    await harness.service.findOne(makeUser({ role: 'sysadmin' }), existing.id);

    expect(harness.repo.listClassifications).toHaveBeenCalledTimes(1);
    expect(harness.repo.listClassifications).toHaveBeenCalledWith(existing.id);
    expect(harness.repo.listClassificationsByTechniqueIds).not.toHaveBeenCalled();
  });
});
