import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type AuditLogService } from '../audit-log/audit-log.service.js';

import { FeatureFlagsRepository, type FeatureFlagRow } from './feature-flags.repository.js';
import { FeatureFlagsService } from './feature-flags.service.js';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u1@example.com',
    emailVerified: true,
    name: null,
    image: null,
    role: 'sysadmin',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

function row(overrides: Partial<FeatureFlagRow> = {}): FeatureFlagRow {
  return {
    code: 'grading-history',
    enabled: false,
    updatedAt: new Date(),
    updatedById: null,
    ...overrides,
  } as FeatureFlagRow;
}

// Drizzle db.transaction(cb) calls cb(tx) and returns its result. Fake it.
const FAKE_TX = { __tx: true } as unknown;

describe('FeatureFlagsService', () => {
  let repo: { [K in keyof FeatureFlagsRepository]: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
  let fakeDb: { transaction: ReturnType<typeof vi.fn> };
  let service: FeatureFlagsService;

  beforeEach(() => {
    repo = {
      list: vi.fn(),
      findByCode: vi.fn(),
      updateEnabled: vi.fn(),
    };
    audit = {
      record: vi.fn().mockResolvedValue(undefined),
      list: vi.fn(),
    };
    fakeDb = {
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)),
    };
    service = new FeatureFlagsService(
      repo as unknown as FeatureFlagsRepository,
      audit as unknown as AuditLogService,
      fakeDb as never,
    );
  });

  describe('resolveMap', () => {
    it('returns the DEFAULT_FLAGS shape when the DB is empty', async () => {
      repo.list.mockResolvedValue([]);
      const map = await service.resolveMap();
      expect(map).toEqual({
        'grading-history': false,
        'grading-history-verification': false,
        'instructor-feedback': false,
      });
    });

    it('overrides known codes from DB rows', async () => {
      repo.list.mockResolvedValue([
        row({ code: 'grading-history', enabled: true }),
        row({ code: 'grading-history-verification', enabled: false }),
      ]);
      const map = await service.resolveMap();
      expect(map['grading-history']).toBe(true);
      expect(map['grading-history-verification']).toBe(false);
      expect(map['instructor-feedback']).toBe(false);
    });

    it('ignores DB rows for unknown codes (forward-compat)', async () => {
      repo.list.mockResolvedValue([row({ code: 'unknown-future-flag', enabled: true })]);
      const map = await service.resolveMap();
      expect(Object.keys(map).sort()).toEqual([
        'grading-history',
        'grading-history-verification',
        'instructor-feedback',
      ]);
    });
  });

  describe('isEnabled', () => {
    it('returns true when the row is enabled', async () => {
      repo.findByCode.mockResolvedValue(row({ enabled: true }));
      expect(await service.isEnabled('grading-history')).toBe(true);
    });

    it('returns false when the row is disabled', async () => {
      repo.findByCode.mockResolvedValue(row({ enabled: false }));
      expect(await service.isEnabled('grading-history')).toBe(false);
    });

    it('returns false when the row is missing (treat unknown as off)', async () => {
      repo.findByCode.mockResolvedValue(undefined);
      expect(await service.isEnabled('grading-history')).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('updates an existing flag and records an audit entry', async () => {
      repo.findByCode.mockResolvedValue(row({ enabled: false }));
      repo.updateEnabled.mockResolvedValue(row({ enabled: true, updatedById: 'u-1' }));

      const out = await service.setEnabled('grading-history', true, makeUser());

      expect(out.enabled).toBe(true);
      expect(repo.updateEnabled).toHaveBeenCalledWith(
        'grading-history',
        true,
        'u-1',
        FAKE_TX,
      );
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith({
        tx: FAKE_TX,
        entityType: 'feature_flag',
        entityId: 'grading-history',
        action: 'update',
        userId: 'u-1',
        impersonatedById: null,
        before: { enabled: false },
        after: { enabled: true },
      });
    });

    it('throws NotFound when the code is not seeded and does not audit', async () => {
      repo.findByCode.mockResolvedValue(undefined);
      await expect(service.setEnabled('grading-history', true, makeUser())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.record).not.toHaveBeenCalled();
      expect(repo.updateEnabled).not.toHaveBeenCalled();
      expect(fakeDb.transaction).not.toHaveBeenCalled();
    });
  });
});
