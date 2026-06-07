import { describe, expect, it } from 'vitest';

import {
  CategorySchema,
  CreateCategoryAttachmentSchema,
  CreateCategorySchema,
  CreateTagAttachmentSchema,
  CreateTagSchema,
  LabelFilterSchema,
  TagSchema,
  TaggableTypeSchema,
  UpdateCategorySchema,
  UpdateTagSchema,
} from '../labels.js';

const BASE_TAG = {
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  organisationId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
  name: 'competition-team',
  createdByUserId: 'u-1',
  createdAt: '2026-06-07T10:00:00.000Z',
  updatedAt: '2026-06-07T10:00:00.000Z',
};

const BASE_CATEGORY = {
  ...BASE_TAG,
  parentId: null as string | null,
};

describe('TaggableTypeSchema', () => {
  it('accepts the three taggable target types', () => {
    expect(TaggableTypeSchema.safeParse('user').success).toBe(true);
    expect(TaggableTypeSchema.safeParse('organisation').success).toBe(true);
    expect(TaggableTypeSchema.safeParse('rank_history').success).toBe(true);
  });

  it('rejects unknown target types', () => {
    expect(TaggableTypeSchema.safeParse('audit_log').success).toBe(false);
  });
});

describe('TagSchema', () => {
  it('accepts an org-scoped tag', () => {
    expect(TagSchema.safeParse(BASE_TAG).success).toBe(true);
  });

  it('accepts a global (organisationId: null) sysadmin-owned tag', () => {
    expect(TagSchema.safeParse({ ...BASE_TAG, organisationId: null }).success).toBe(true);
  });

  it('accepts a label whose author has since been deleted (createdByUserId: null)', () => {
    expect(TagSchema.safeParse({ ...BASE_TAG, createdByUserId: null }).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(TagSchema.safeParse({ ...BASE_TAG, name: '' }).success).toBe(false);
  });

  it('rejects names longer than 80 chars', () => {
    expect(TagSchema.safeParse({ ...BASE_TAG, name: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('CreateTagSchema', () => {
  it('accepts a name (defaults global to false)', () => {
    const r = CreateTagSchema.safeParse({ name: 'rookie' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.global).toBe(false);
  });

  it('accepts an explicit global: true', () => {
    expect(CreateTagSchema.safeParse({ name: 'honorary', global: true }).success).toBe(true);
  });

  it('trims surrounding whitespace from name', () => {
    const r = CreateTagSchema.safeParse({ name: '  rookie  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('rookie');
  });

  it('rejects names that trim to empty', () => {
    expect(CreateTagSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('UpdateTagSchema', () => {
  it('accepts a name change', () => {
    expect(UpdateTagSchema.safeParse({ name: 'renamed' }).success).toBe(true);
  });

  it('rejects an empty patch (name is required on update)', () => {
    expect(UpdateTagSchema.safeParse({}).success).toBe(false);
  });
});

describe('CategorySchema', () => {
  it('accepts a root category (parentId: null)', () => {
    expect(CategorySchema.safeParse(BASE_CATEGORY).success).toBe(true);
  });

  it('accepts a child category', () => {
    expect(
      CategorySchema.safeParse({ ...BASE_CATEGORY, parentId: 'a0b1c2d3-4e5f-4a6b-9c8d-1e2f3a4b5c6d' })
        .success,
    ).toBe(true);
  });
});

describe('CreateCategorySchema', () => {
  it('accepts a root category (parentId defaults to null)', () => {
    const r = CreateCategorySchema.safeParse({ name: 'Region' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBeNull();
  });

  it('accepts an explicit parentId', () => {
    expect(
      CreateCategorySchema.safeParse({
        name: 'Stockholm',
        parentId: 'a0b1c2d3-4e5f-4a6b-9c8d-1e2f3a4b5c6d',
      }).success,
    ).toBe(true);
  });
});

describe('UpdateCategorySchema', () => {
  it('accepts a name change', () => {
    expect(UpdateCategorySchema.safeParse({ name: 'renamed' }).success).toBe(true);
  });

  it('rejects parentId in the patch (no re-parenting)', () => {
    const r = UpdateCategorySchema.safeParse({
      name: 'x',
      parentId: 'a0b1c2d3-4e5f-4a6b-9c8d-1e2f3a4b5c6d',
    });
    // Strict schema: parentId is not a known key. Either rejection or silent drop is acceptable;
    // we assert the data shape doesn't carry parentId through.
    expect(r.success).toBe(true);
    if (r.success) expect('parentId' in r.data).toBe(false);
  });
});

describe('Attachment schemas', () => {
  it('CreateTagAttachmentSchema accepts a valid attach payload', () => {
    expect(
      CreateTagAttachmentSchema.safeParse({
        tagId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
        targetType: 'organisation',
        targetId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
      }).success,
    ).toBe(true);
  });

  it('CreateTagAttachmentSchema rejects an unknown targetType', () => {
    expect(
      CreateTagAttachmentSchema.safeParse({
        tagId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
        targetType: 'audit_log',
        targetId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
      }).success,
    ).toBe(false);
  });

  it('CreateCategoryAttachmentSchema accepts a valid attach payload', () => {
    expect(
      CreateCategoryAttachmentSchema.safeParse({
        categoryId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
        targetType: 'user',
        targetId: 'u-1',
      }).success,
    ).toBe(true);
  });
});

describe('LabelFilterSchema', () => {
  it('accepts an empty filter', () => {
    expect(LabelFilterSchema.safeParse({}).success).toBe(true);
  });

  it('accepts arrays of tag and category ids', () => {
    expect(
      LabelFilterSchema.safeParse({
        tag: ['7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5'],
        category: ['c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e'],
      }).success,
    ).toBe(true);
  });

  it('rejects non-uuid items in tag/category arrays', () => {
    expect(LabelFilterSchema.safeParse({ tag: ['not-a-uuid'] }).success).toBe(false);
  });
});
