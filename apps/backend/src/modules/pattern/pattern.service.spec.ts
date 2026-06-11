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
  PatternRepository,
  type PatternRow,
} from './pattern.repository.js';
import { PatternService } from './pattern.service.js';

// ── Shared fixtures ────────────────────────────────────────────────────
const FAKE_TX = { __tx: true } as unknown;

function row(overrides: Partial<PatternRow> = {}): PatternRow {
  return {
    id: 'p-1',
    createdByOrganisationId: null,
    createdByUserId: 'u-sys',
    officialBodyOrgId: null,
    isActive: true,
    sortOrder: 0,
    minRankId: null,
    nameJa: '',
    nameRomaji: 'sei no hokei',
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
  service: PatternService;
  repo: { [K in keyof PatternRepository]: ReturnType<typeof vi.fn> };
  classifications: { resolveRootCodes: ReturnType<typeof vi.fn>; getRootMap: ReturnType<typeof vi.fn> };
  classificationRepo: { findManyByIds: ReturnType<typeof vi.fn> };
  audit: { record: ReturnType<typeof vi.fn> };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
  db: { transaction: ReturnType<typeof vi.fn> };
}

function build(
  initial: {
    canManage?: boolean;
    rootMapById?: Record<string, string>; // catId → rootCode
    rowOnFind?: PatternRow | null;
  } = {},
): Harness {
  const repo = {
    createWithLinks: vi.fn().mockResolvedValue('p-new'),
    update: vi.fn(),
    replaceClassifications: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(initial.rowOnFind ?? null),
    listClassifications: vi.fn().mockResolvedValue([]),
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

  const abilities = {
    createForUser: vi.fn().mockReturnValue({
      can: vi.fn().mockReturnValue(initial.canManage ?? true),
    }),
  };

  const db = {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)),
  };

  const service = new PatternService(
    db as never,
    repo as unknown as PatternRepository,
    classifications as unknown as ClassificationCategoryService,
    classificationRepo as unknown as ClassificationCategoryRepository,
    audit as unknown as AuditLogService,
    abilities as unknown as AbilityFactory,
  );

  return { service, repo, classifications, classificationRepo, audit, abilities, db };
}

describe('PatternService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create rejects when actor is a plain user (no orgadmin membership)', async () => {
    const { service } = build({ rootMapById: { a: 'pattern_type' } });
    await expect(
      service.create(makeUser({ role: 'user' }), {
        classificationIds: ['a'],
        nameRomaji: 'sei no hokei',
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
        nameRomaji: 'sei no hokei',
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

  it('create with hokei_subtype-only ids → MISSING_REQUIRED_CATEGORY', async () => {
    const { service, repo } = build({ rootMapById: { h: 'hokei_subtype' } });
    await expect(
      service.create(makeUser({ role: 'sysadmin' }), {
        classificationIds: ['h'],
        nameRomaji: 'sei no hokei',
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
    const created = row({ id: 'p-new' });
    const harness = build({
      rootMapById: { a: 'pattern_type', b: 'hokei_subtype' },
      rowOnFind: created,
    });
    harness.repo.createWithLinks.mockResolvedValue('p-new');
    harness.repo.findById.mockResolvedValue(created);

    const out = await harness.service.create(makeUser({ role: 'sysadmin' }), {
      classificationIds: ['a', 'b'],
      nameRomaji: 'sei no hokei',
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

    expect(out.id).toBe('p-new');
    expect(harness.repo.createWithLinks).toHaveBeenCalledTimes(1);
    expect(harness.audit.record).toHaveBeenCalledTimes(1);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: FAKE_TX,
        entityType: 'pattern',
        entityId: 'p-new',
        action: 'create',
        userId: 'u-1',
        impersonatedById: null,
        before: null,
      }),
    );
  });

  it("update by orgadmin of another org's pattern → Forbidden", async () => {
    const existing = row({ createdByOrganisationId: 'org-B' });
    const harness = build({ rowOnFind: existing, canManage: false });

    const actor = makeUser({
      memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
    });

    await expect(
      harness.service.update(actor, existing.id, { nameSv: 'Sei no hokei' }),
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
      rootMapById: { a: 'pattern_type' },
    });
    harness.repo.update.mockResolvedValue({ ...existing, nameSv: 'Sei no hokei' });

    await harness.service.update(makeUser({ role: 'sysadmin' }), existing.id, {
      classificationIds: ['a'],
      nameSv: 'Sei no hokei',
    });

    expect(harness.repo.replaceClassifications).toHaveBeenCalledWith(
      existing.id,
      ['a'],
      FAKE_TX,
    );
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'pattern',
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
        entityType: 'pattern',
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
});
