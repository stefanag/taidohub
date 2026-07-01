import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminRankRequirementsPage } from './AdminRankRequirementsPage.js';

import type { BeltRank } from '@repo/contracts/ranks';
import type { RequirementSet } from '@repo/contracts';

import i18n from '@/i18n';

const SET_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const RANK_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

const REQUIREMENT_SET: RequirementSet = {
  id: SET_ID,
  name: 'Dan grading 2026',
  organisationId: null,
  effectiveDate: '2026-01-01',
  isActive: true,
  clonedFromId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const BELT_RANK: BeltRank = {
  id: RANK_ID,
  organisationId: null,
  systemId: '11111111-0000-4000-8000-000000000009',
  level: 1,
  sortOrder: 0,
  nameJa: null,
  nameRomaji: '1st Kyu',
  nameEn: '1st Kyu',
  nameSv: '1:a Kyu',
  nameFi: '1. Kyu',
  beltColor: '#000000',
  visuals: { gradient: 'black' },
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Mutable search-param state the mocked router hooks read/write, so
// `useNavigate`'s `search` updater can be exercised without a real router.
let currentSearch: { setId?: string; rankId?: string } = {};
const navigateMock = vi.fn((opts: { search?: (prev: typeof currentSearch) => typeof currentSearch }) => {
  if (opts.search) currentSearch = opts.search(currentSearch);
});

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearch: () => currentSearch,
  };
});

const getRequirementSets = vi.fn();
vi.mock('@/entities/requirement-set/api/requirement-set.api.js', async (orig) => {
  const actual =
    await orig<typeof import('@/entities/requirement-set/api/requirement-set.api.js')>();
  return {
    ...actual,
    getRequirementSets: (...args: unknown[]) => getRequirementSets(...args),
  };
});

const getBeltRanks = vi.fn();
vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    getBeltRanks: (...args: unknown[]) => getBeltRanks(...args),
  };
});

vi.mock('@/features/rank-requirements-editor', () => ({
  RankRequirementsEditor: ({ setId, rankId }: { setId: string; rankId: string }) => (
    <div data-testid="rank-requirements-editor">
      editor:{setId}:{rankId}
    </div>
  ),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AdminRankRequirementsPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe('<AdminRankRequirementsPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    currentSearch = {};
    getRequirementSets.mockResolvedValue([REQUIREMENT_SET]);
    getBeltRanks.mockResolvedValue([BELT_RANK]);
  });

  it('renders both the requirement-set and rank selectors', async () => {
    renderPage();

    expect(await screen.findByLabelText(/select a requirement set/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/select a rank/i)).toBeInTheDocument();
  });

  it('does not render the editor before both a set and a rank are selected', async () => {
    renderPage();

    await screen.findByLabelText(/select a requirement set/i);
    expect(screen.queryByTestId('rank-requirements-editor')).not.toBeInTheDocument();
  });

  it('renders the editor once both setId and rankId are present in the URL search', async () => {
    currentSearch = { setId: SET_ID, rankId: RANK_ID };
    renderPage();

    const editor = await screen.findByTestId('rank-requirements-editor');
    expect(editor).toHaveTextContent(`editor:${SET_ID}:${RANK_ID}`);
  });

  it('does not render the editor when only the set is selected', async () => {
    currentSearch = { setId: SET_ID };
    renderPage();

    await screen.findByLabelText(/select a requirement set/i);
    expect(screen.queryByTestId('rank-requirements-editor')).not.toBeInTheDocument();
  });
});
