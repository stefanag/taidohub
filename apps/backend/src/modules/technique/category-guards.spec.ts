import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ClassificationCategoryService } from '../classification-category/classification-category.service.js';

import { validateCategoryLinks } from './category-guards.js';

function makeSvc(map: Record<string, string | null>): ClassificationCategoryService {
  return {
    resolveRootCodes: vi.fn().mockResolvedValue(new Map(Object.entries(map))),
  } as unknown as ClassificationCategoryService;
}

describe('validateCategoryLinks (technique)', () => {
  it('passes when ids include the required root', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', b: 'attack_type' }), {
        classificationIds: ['a', 'b'],
        kind: 'technique',
      }),
    ).resolves.toBeUndefined();
  });

  it('NotFound when an id has no row', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', x: null }), {
        classificationIds: ['a', 'x'],
        kind: 'technique',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('BadRequest INVALID_CATEGORY when a root is not allowed', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', b: 'pattern_type' }), {
        classificationIds: ['a', 'b'],
        kind: 'technique',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BadRequest MISSING_REQUIRED_CATEGORY when no technique_type id supplied', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'sotai_category' }), {
        classificationIds: ['a'],
        kind: 'technique',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dedupes duplicate ids (passes when single id appears multiple times)', async () => {
    const svc = makeSvc({ a: 'technique_type' });
    await expect(
      validateCategoryLinks(svc, { classificationIds: ['a', 'a', 'a'], kind: 'technique' }),
    ).resolves.toBeUndefined();
    // resolveRootCodes called with deduped array.
    expect(svc.resolveRootCodes).toHaveBeenCalledWith(['a']);
  });

  it('passes with only required root', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type' }), {
        classificationIds: ['a'],
        kind: 'technique',
      }),
    ).resolves.toBeUndefined();
  });

  it('passes with multiple required-root ids', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', b: 'technique_type' }), {
        classificationIds: ['a', 'b'],
        kind: 'technique',
      }),
    ).resolves.toBeUndefined();
  });

  it('passes with all three allowed roots represented', async () => {
    await expect(
      validateCategoryLinks(
        makeSvc({ a: 'technique_type', b: 'sotai_category', c: 'attack_type' }),
        { classificationIds: ['a', 'b', 'c'], kind: 'technique' },
      ),
    ).resolves.toBeUndefined();
  });
});
