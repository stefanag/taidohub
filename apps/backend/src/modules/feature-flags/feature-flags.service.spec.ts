import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagsRepository, type FeatureFlagRow } from './feature-flags.repository.js';
import { FeatureFlagsService } from './feature-flags.service.js';

function row(overrides: Partial<FeatureFlagRow> = {}): FeatureFlagRow {
  return {
    code: 'grading-history',
    enabled: false,
    updatedAt: new Date(),
    updatedById: null,
    ...overrides,
  } as FeatureFlagRow;
}

describe('FeatureFlagsService', () => {
  let repo: { [K in keyof FeatureFlagsRepository]: ReturnType<typeof vi.fn> };
  let service: FeatureFlagsService;

  beforeEach(() => {
    repo = {
      list: vi.fn(),
      findByCode: vi.fn(),
      updateEnabled: vi.fn(),
    };
    service = new FeatureFlagsService(repo as unknown as FeatureFlagsRepository);
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
    it('updates an existing flag', async () => {
      repo.findByCode.mockResolvedValue(row());
      repo.updateEnabled.mockResolvedValue(row({ enabled: true, updatedById: 'u-1' }));
      const out = await service.setEnabled('grading-history', true, 'u-1');
      expect(out.enabled).toBe(true);
      expect(repo.updateEnabled).toHaveBeenCalledWith('grading-history', true, 'u-1');
    });

    it('throws NotFound when the code is not seeded', async () => {
      repo.findByCode.mockResolvedValue(undefined);
      await expect(service.setEnabled('grading-history', true, 'u-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
