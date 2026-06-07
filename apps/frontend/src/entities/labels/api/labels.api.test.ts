import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  attachTag,
  createTag,
  getAttachmentsForTarget,
  getTags,
} from './labels.api.js';

import { httpClient } from '@/shared/api';

const ORG_ID = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';
const TAG_ID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ATTACHMENT_ID = '4d2e9c1b-1f3d-4a9b-9c5e-2e6a7b8c9d0f';

const TAG_RESPONSE = {
  id: TAG_ID,
  organisationId: ORG_ID,
  name: 'competition-team',
  createdByUserId: 'u-1',
  createdAt: '2026-06-07T10:00:00.000Z',
  updatedAt: '2026-06-07T10:00:00.000Z',
};

const TAG_ATTACHMENT_RESPONSE = {
  id: ATTACHMENT_ID,
  tagId: TAG_ID,
  targetType: 'organisation' as const,
  targetId: ORG_ID,
  attachedByUserId: 'u-1',
  attachedAt: '2026-06-07T10:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('labels api', () => {
  it('getTags GETs /api/labels/tags and parses the array', async () => {
    mockedHttp.mockResolvedValueOnce([TAG_RESPONSE]);
    const out = await getTags();
    expect(mockedHttp).toHaveBeenCalledWith('/api/labels/tags');
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('competition-team');
  });

  it('createTag POSTs /api/labels/tags with the input body', async () => {
    mockedHttp.mockResolvedValueOnce(TAG_RESPONSE);
    const created = await createTag({ name: 'competition-team', global: false });
    expect(mockedHttp).toHaveBeenCalledWith('/api/labels/tags', {
      method: 'POST',
      body: { name: 'competition-team', global: false },
    });
    expect(created.id).toBe(TAG_ID);
  });

  it('attachTag POSTs /api/labels/tag-attachments with the input body', async () => {
    mockedHttp.mockResolvedValueOnce(TAG_ATTACHMENT_RESPONSE);
    const attached = await attachTag({
      tagId: TAG_ID,
      targetType: 'organisation',
      targetId: ORG_ID,
    });
    expect(mockedHttp).toHaveBeenCalledWith('/api/labels/tag-attachments', {
      method: 'POST',
      body: { tagId: TAG_ID, targetType: 'organisation', targetId: ORG_ID },
    });
    expect(attached.id).toBe(ATTACHMENT_ID);
    expect(attached.targetType).toBe('organisation');
  });

  it('getAttachmentsForTarget GETs /api/labels/attachments with query params', async () => {
    mockedHttp.mockResolvedValueOnce({ tags: [TAG_ATTACHMENT_RESPONSE], categories: [] });
    const bundle = await getAttachmentsForTarget('organisation', ORG_ID);
    expect(mockedHttp).toHaveBeenCalledWith('/api/labels/attachments', {
      query: { targetType: 'organisation', targetId: ORG_ID },
    });
    expect(bundle.tags).toHaveLength(1);
    expect(bundle.categories).toHaveLength(0);
  });
});
