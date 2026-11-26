import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  getInvitationLegalTexts,
  getPublishedLegalDocument,
  listLegalDocuments,
  saveLegalTranslation,
} from './legal-documents.api.js';

import { httpClient } from '@/shared/api';

const mockedHttp = vi.mocked(httpClient);
const ID = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';

const PUBLISHED = {
  documentId: ID,
  kind: 'terms',
  audience: 'members',
  organisationId: null,
  versionId: ID,
  version: 1,
  publishedAt: '2026-11-26T10:00:00.000Z',
  authoritativeLocale: 'sv',
  availableLocales: ['en', 'sv'],
  translation: { locale: 'en', revision: 1, title: 'Terms', body: { ops: [] } },
  isFallback: false,
};

describe('legal documents api', () => {
  it('reads a platform text without an organisation id', async () => {
    mockedHttp.mockResolvedValueOnce(PUBLISHED);
    const out = await getPublishedLegalDocument({ owner: 'platform', kind: 'terms', locale: 'en' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/legal/published', {
      query: { kind: 'terms', audience: undefined, locale: 'en', organisationId: undefined },
    });
    expect(out.translation.title).toBe('Terms');
  });

  it('reads an organisation text by id', async () => {
    mockedHttp.mockResolvedValueOnce(PUBLISHED);
    await getPublishedLegalDocument({ owner: ID, kind: 'privacy' });
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/legal/published', {
      query: { kind: 'privacy', audience: undefined, locale: undefined, organisationId: ID },
    });
  });

  it('asks which texts an invitation needs', async () => {
    mockedHttp.mockResolvedValueOnce({ documents: [PUBLISHED] });
    const out = await getInvitationLegalTexts('tok', 'sv');
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/legal/invitation', {
      query: { token: 'tok', locale: 'sv' },
    });
    expect(out.documents).toHaveLength(1);
  });

  it('rejects a response that does not match the contract', async () => {
    mockedHttp.mockResolvedValueOnce([{ id: 'not-a-document' }]);
    await expect(listLegalDocuments('platform')).rejects.toThrow();
  });

  it('saves one language of a version', async () => {
    mockedHttp.mockResolvedValueOnce({
      id: ID,
      kind: 'terms',
      organisationId: null,
      audience: 'members',
      createdAt: '2026-11-26T10:00:00.000Z',
      published: null,
      draft: null,
    });
    await saveLegalTranslation(ID, 'fi', { title: 'Ehdot', body: { ops: [] } });
    expect(mockedHttp).toHaveBeenLastCalledWith(
      `/api/legal-documents/versions/${ID}/translations/fi`,
      {
        method: 'PUT',
        body: { title: 'Ehdot', body: { ops: [] } },
      },
    );
  });
});
