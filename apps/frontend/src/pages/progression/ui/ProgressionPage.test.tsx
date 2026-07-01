import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressionPage } from './ProgressionPage.js';

import type { GradingRequirements } from '@repo/contracts/grading-requirements';
import type { Pattern } from '@repo/contracts/patterns';
import type { Progress } from '@repo/contracts/progress';
import type { BeltRank } from '@repo/contracts/ranks';
import type { Technique } from '@repo/contracts/techniques';

import i18n from '@/i18n';

const ACTOR_ID = 'actor-user-1';
const NEXT_RANK_ID = 'rank-2';

const NEXT_RANK: BeltRank = {
  id: NEXT_RANK_ID,
  organisationId: null,
  systemId: 'system-1',
  level: 2,
  sortOrder: 20,
  nameJa: null,
  nameRomaji: 'Kukyu',
  nameEn: '9th Kyu',
  nameSv: '9 Kyu',
  nameFi: '9. Kyu',
  beltColor: '#FFFF00',
  visuals: { gradient: 'yellow' } as BeltRank['visuals'],
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

const TECH: Technique = {
  id: 't-1',
  createdByOrganisationId: null,
  isKihon: true,
  isActive: true,
  sortOrder: 0,
  minRankId: null,
  nameJa: '前蹴り',
  nameRomaji: 'Mae geri',
  nameSv: 'Framre spark',
  nameEn: 'Front kick',
  nameFi: 'Etupotku',
  descriptionSv: '',
  descriptionEn: '',
  descriptionFi: '',
  classificationsByRoot: { technique_type: [], sotai_category: [], attack_type: [] },
  classifications: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PATTERN: Pattern = {
  id: 'p-1',
  createdByOrganisationId: null,
  officialBodyOrgId: null,
  isActive: true,
  sortOrder: 0,
  minRankId: null,
  nameJa: '整の型',
  nameRomaji: 'Sei no hokei',
  nameSv: 'Sei no hokei',
  nameEn: 'Sei no hokei',
  nameFi: 'Sei no hokei',
  descriptionSv: '',
  descriptionEn: '',
  descriptionFi: '',
  classificationsByRoot: { pattern_type: [], hokei_subtype: [] },
  classifications: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const EMPTY_REQUIREMENTS: GradingRequirements = {
  rankId: NEXT_RANK_ID,
  setId: null,
  hokeiGroups: [],
  kobo: [],
  koboTested: [],
  otherPatterns: [],
  otherPatternsTested: [],
  kihon: [],
  kihonTested: [],
  jissenMinutes: null,
  jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false,
  requiresEssay: false,
};

const useNextRankSpy = vi.fn();
const useSessionSpy = vi.fn(() => ({ data: { user: { id: ACTOR_ID } } }));
const requirementsSpy = vi.fn();
const techniquesSpy = vi.fn();
const patternsSpy = vi.fn();
const techProgressSpy = vi.fn(() => ({ data: [] as Progress[], isPending: false, isError: false }));
const patProgressSpy = vi.fn(() => ({ data: [] as Progress[], isPending: false, isError: false }));

vi.mock('@/features/next-rank-card', async (orig) => {
  const actual = await orig<typeof import('@/features/next-rank-card')>();
  return {
    ...actual,
    useNextRank: () => useNextRankSpy(),
    NextRankCard: () => <div data-testid="next-rank-card-stub" />,
  };
});

vi.mock('@/entities/me', async (orig) => {
  const actual = await orig<typeof import('@/entities/me')>();
  return {
    ...actual,
    useSession: () => useSessionSpy(),
  };
});

vi.mock('@/entities/rank-requirement', async (orig) => {
  const actual = await orig<typeof import('@/entities/rank-requirement')>();
  return {
    ...actual,
    useRequirementsQuery: (rankId: string | null) => requirementsSpy(rankId),
  };
});

vi.mock('@/entities/technique', async (orig) => {
  const actual = await orig<typeof import('@/entities/technique')>();
  return {
    ...actual,
    useTechniquesQuery: () => techniquesSpy(),
  };
});

vi.mock('@/entities/pattern', async (orig) => {
  const actual = await orig<typeof import('@/entities/pattern')>();
  return {
    ...actual,
    usePatternsQuery: () => patternsSpy(),
  };
});

vi.mock('@/entities/progress', async (orig) => {
  const actual = await orig<typeof import('@/entities/progress')>();
  return {
    ...actual,
    useProgressListQuery: (contentType: 'technique' | 'pattern') =>
      contentType === 'technique' ? techProgressSpy() : patProgressSpy(),
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ProgressionPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useNextRankSpy.mockReset();
  useSessionSpy.mockReset();
  useSessionSpy.mockReturnValue({ data: { user: { id: ACTOR_ID } } });
  requirementsSpy.mockReset();
  requirementsSpy.mockReturnValue({ data: undefined, isPending: false, isError: false });
  techniquesSpy.mockReset();
  techniquesSpy.mockReturnValue({ data: [TECH], isPending: false, isError: false });
  patternsSpy.mockReset();
  patternsSpy.mockReturnValue({ data: [PATTERN], isPending: false, isError: false });
  techProgressSpy.mockReset();
  techProgressSpy.mockReturnValue({ data: [], isPending: false, isError: false });
  patProgressSpy.mockReset();
  patProgressSpy.mockReturnValue({ data: [], isPending: false, isError: false });
});

describe('<ProgressionPage>', () => {
  it('renders the NextRankCard at the top', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: null,
      isPending: true,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByTestId('next-rank-card-stub')).toBeInTheDocument();
  });

  it('renders the RankRequirementsDisplay when a next rank is resolved', async () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: { ...EMPTY_REQUIREMENTS, kihon: [TECH.id] },
      isPending: false,
      isError: false,
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: /kihon/i })).toBeInTheDocument();
    expect(screen.getByText('Mae geri')).toBeInTheDocument();
  });

  it('hides the requirements display when the student is at the highest rank', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: NEXT_RANK,
      nextRank: null,
      isPending: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.queryByRole('heading', { name: /kihon/i })).not.toBeInTheDocument();
    expect(requirementsSpy).toHaveBeenCalledWith(null);
  });

  it('shows a loading indicator while requirements/techniques/patterns are still pending', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});
