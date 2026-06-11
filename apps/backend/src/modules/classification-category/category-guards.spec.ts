import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { validateCategoryLinks } from './category-guards.js';
import type { ClassificationCategoryService } from './classification-category.service.js';

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

describe('validateCategoryLinks (pattern)', () => {
  it('passes when ids include the required pattern_type root', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'pattern_type', b: 'hokei_subtype' }), {
        classificationIds: ['a', 'b'],
        kind: 'pattern',
      }),
    ).resolves.toBeUndefined();
  });

  it('BadRequest INVALID_CATEGORY when a technique root is supplied to pattern', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'pattern_type', b: 'technique_type' }), {
        classificationIds: ['a', 'b'],
        kind: 'pattern',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BadRequest MISSING_REQUIRED_CATEGORY when no pattern_type id supplied', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'hokei_subtype' }), {
        classificationIds: ['a'],
        kind: 'pattern',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
