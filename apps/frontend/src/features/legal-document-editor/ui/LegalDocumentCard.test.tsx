import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/entities/legal-document', async (orig) => {
  const actual = await orig<typeof import('@/entities/legal-document')>();
  return {
    ...actual,
    createLegalDocumentVersion: vi.fn().mockResolvedValue(undefined),
    publishLegalDocumentVersion: vi.fn().mockResolvedValue(undefined),
  };
});

import { LegalDocumentCard } from './LegalDocumentCard.js';

import type { LegalDocument, LegalDocumentVersion } from '@repo/contracts/legal-documents';

import { createLegalDocumentVersion, publishLegalDocumentVersion } from '@/entities/legal-document';
import i18n from '@/i18n';

const DOC_ID = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';

function version(over: Partial<LegalDocumentVersion>): LegalDocumentVersion {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    documentId: DOC_ID,
    version: 1,
    status: 'published',
    authoritativeLocale: 'sv',
    requiresReacceptance: false,
    changeSummary: null,
    publishedAt: '2026-11-26T10:00:00.000Z',
    translations: [
      {
        locale: 'sv',
        revision: 1,
        title: 'Villkor',
        body: { ops: [{ insert: 'Text\n' }] },
        contentHash: 'h',
        needsReview: false,
        createdAt: '2026-11-26T10:00:00.000Z',
      },
    ],
    ...over,
  };
}

function renderCard(doc: LegalDocument) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LegalDocumentCard document={doc} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const base: LegalDocument = {
  id: DOC_ID,
  kind: 'terms',
  organisationId: null,
  audience: 'members',
  createdAt: '2026-11-26T10:00:00.000Z',
  published: null,
  draft: null,
};

describe('<LegalDocumentCard>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.mocked(createLegalDocumentVersion).mockClear();
    vi.mocked(publishLegalDocumentVersion).mockClear();
  });

  it('offers to start writing a text that has nothing yet', async () => {
    const user = renderCard(base);
    expect(screen.getByText('Nothing published yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start writing' }));
    await waitFor(() =>
      expect(createLegalDocumentVersion).toHaveBeenCalledWith(DOC_ID, {
        authoritativeLocale: 'sv',
        copyFromPublished: true,
      }),
    );
  });

  it('keeps the binding text of a published version read-only', async () => {
    const user = renderCard({ ...base, published: version({}) });
    expect(
      screen.getByText(/Version 1, published .* Legally binding language: Swedish\./),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Correct a translation'));
    expect(screen.getByText(/cannot be changed/)).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeDisabled();
  });

  it('flags copied translations and publishes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const draft = version({
      id: '22222222-2222-4222-8222-222222222222',
      version: 2,
      status: 'draft',
      publishedAt: null,
      translations: version({}).translations.map((t) => ({ ...t, needsReview: true })),
    });
    const user = renderCard({ ...base, published: version({}), draft });
    const draftSection = screen.getByRole('heading', { name: 'Draft' }).parentElement!;
    expect(within(draftSection).getByText('Copied, not reviewed')).toBeInTheDocument();
    expect(within(draftSection).getByLabelText(/users must accept again/)).toBeInTheDocument();
    await user.click(within(draftSection).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(publishLegalDocumentVersion).toHaveBeenCalledWith(draft.id));
  });
});
