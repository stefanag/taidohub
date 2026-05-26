import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the API module so no real HTTP calls are made.
vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return { ...actual, getPublicRank: vi.fn() };
});

// Partial-mock TanStack Router so Link renders as a plain anchor and
// useParams returns a controllable slug.
vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children: React.ReactNode;
    } & Record<string, unknown>) => <a href={to} {...rest}>{children}</a>,
    useParams: () => ({ slug: 'jukyu' }),
  };
});

import { getPublicRank } from '@/entities/belt-rank/api/belt-rank.api.js';
import i18n from '@/i18n';

import { PublicRankPage } from './PublicRankPage.js';

type GetPublicRankMock = ReturnType<typeof vi.fn>;

const MOCK_PAYLOAD = {
  rank: {
    id: '00000000-0000-0000-0000-000000000001',
    organisationId: null,
    systemId: '00000000-0000-0000-0000-000000000002',
    level: 1,
    sortOrder: 10,
    nameJa: '十級',
    nameRomaji: 'Jukyu',
    nameEn: '10th Kyu',
    nameSv: '10 Kyu',
    nameFi: '10. Kyu',
    beltColor: '#FFFFFF',
    imageUrl: null,
    descriptionEn: 'The first rank.',
    descriptionSv: null,
    descriptionFi: null,
    publiclyVisible: true,
    slug: 'jukyu',
    minAge: null,
    nextRankId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  system: {
    id: '00000000-0000-0000-0000-000000000002',
    code: 'kyu',
    nameEn: 'Kyu',
    nameSv: 'Kyu',
    nameFi: 'Kyu',
  },
  organisation: null,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <PublicRankPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe('<PublicRankPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the rank name and BeltGraphic when query returns data', async () => {
    (getPublicRank as GetPublicRankMock).mockResolvedValueOnce(MOCK_PAYLOAD);

    renderPage();

    // Rank name should appear
    expect(await screen.findByText('10th Kyu')).toBeInTheDocument();
  });

  it('renders the Japanese name when present', async () => {
    (getPublicRank as GetPublicRankMock).mockResolvedValueOnce(MOCK_PAYLOAD);

    renderPage();

    expect(await screen.findByText('十級')).toBeInTheDocument();
  });

  it('renders the description when present', async () => {
    (getPublicRank as GetPublicRankMock).mockResolvedValueOnce(MOCK_PAYLOAD);

    renderPage();

    expect(await screen.findByText('The first rank.')).toBeInTheDocument();
  });

  it('renders a not-found message when query errors', async () => {
    (getPublicRank as GetPublicRankMock).mockRejectedValueOnce(
      new Error('404 Not Found'),
    );

    renderPage();

    expect(await screen.findByText(/rank not available/i)).toBeInTheDocument();
  });

  it('renders a back-to-home link after data loads', async () => {
    (getPublicRank as GetPublicRankMock).mockResolvedValueOnce(MOCK_PAYLOAD);

    renderPage();

    const link = await screen.findByRole('link', { name: /back to home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
