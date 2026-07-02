import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NextRankCard } from './NextRankCard.js';

import type { GradingRequirements } from '@repo/contracts/grading-requirements';
import type { Progress } from '@repo/contracts/progress';
import type { BeltRank } from '@repo/contracts/ranks';

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

function makeRequirements(overrides: Partial<GradingRequirements>): GradingRequirements {
  return { ...EMPTY_REQUIREMENTS, ...overrides };
}

function makeProgress(overrides: Partial<Progress>): Progress {
  return {
    id: 'p-1',
    userId: ACTOR_ID,
    contentType: 'technique',
    techniqueId: null,
    patternId: null,
    status: 'learning',
    studentNotes: '',
    instructorNotes: '',
    lastPracticedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const useNextRankSpy = vi.fn();
const useSessionSpy = vi.fn(() => ({ data: { user: { id: ACTOR_ID } } }));
const requirementsSpy = vi.fn();
const techProgressSpy = vi.fn(
  (_options?: { enabled?: boolean }) => ({ data: [] as Progress[], isPending: false, isError: false }),
);
const patProgressSpy = vi.fn(
  (_options?: { enabled?: boolean }) => ({ data: [] as Progress[], isPending: false, isError: false }),
);
const studentProgressSpy = vi.fn((userId: string | null) => ({
  data: [] as Progress[],
  isPending: false,
  isError: false,
}));

vi.mock('../lib/useNextRank.js', () => ({
  useNextRank: () => useNextRankSpy(),
}));

vi.mock('@/entities/me', () => ({
  useSession: () => useSessionSpy(),
}));

vi.mock('@/entities/rank-requirement', () => ({
  useRequirementsQuery: (rankId: string | null) => requirementsSpy(rankId),
  useRequirementsForUserQuery: (rankId: string | null, userId: string | null) =>
    requirementsSpy(rankId, userId),
}));

vi.mock('@/entities/progress', () => ({
  useProgressListQuery: (
    contentType: 'technique' | 'pattern',
    options?: { enabled?: boolean },
  ) => (contentType === 'technique' ? techProgressSpy(options) : patProgressSpy(options)),
}));

vi.mock('@/entities/student', () => ({
  useStudentProgressQuery: (userId: string | null) => studentProgressSpy(userId),
}));

function renderCard(props: Partial<React.ComponentProps<typeof NextRankCard>> = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <NextRankCard {...props} />
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
  techProgressSpy.mockReset();
  techProgressSpy.mockReturnValue({ data: [], isPending: false, isError: false });
  patProgressSpy.mockReset();
  patProgressSpy.mockReturnValue({ data: [], isPending: false, isError: false });
  studentProgressSpy.mockReset();
  studentProgressSpy.mockReturnValue({ data: [], isPending: false, isError: false });
});

describe('<NextRankCard>', () => {
  it('renders the "X/Y" caption for a non-zero total', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: makeRequirements({ kihon: ['t-1', 't-2'] }),
      isPending: false,
      isError: false,
    });
    techProgressSpy.mockReturnValue({
      data: [makeProgress({ techniqueId: 't-1', status: 'grading_ready' })],
      isPending: false,
      isError: false,
    });

    renderCard();

    expect(screen.getByText('1/2 requirements ready')).toBeInTheDocument();
  });

  it('renders the progress bar with the computed pct as its value', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: makeRequirements({ kihon: ['t-1', 't-2', 't-3', 't-4'] }),
      isPending: false,
      isError: false,
    });
    techProgressSpy.mockReturnValue({
      data: [
        makeProgress({ techniqueId: 't-1', status: 'grading_ready' }),
        makeProgress({ techniqueId: 't-2', status: 'grading_ready' }),
      ],
      isPending: false,
      isError: false,
    });

    renderCard();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('renders the "highest rank" empty state when nextRank is null', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: NEXT_RANK,
      nextRank: null,
      isPending: false,
      isError: false,
      error: null,
    });

    renderCard();

    expect(screen.getByText("You've reached the highest rank")).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders the "no rank yet" empty state when both currentRank and nextRank are null', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: null,
      isPending: false,
      isError: false,
      error: null,
    });

    renderCard();

    expect(
      screen.getByText(
        'No grading history yet — start tracking progress toward your first rank.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("You've reached the highest rank")).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders a loading state while the rank-history/requirements queries are pending', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: null,
      isPending: true,
      isError: false,
      error: null,
    });

    renderCard();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText("You've reached the highest rank")).not.toBeInTheDocument();
  });

  it('passes userId through to useRequirementsForUserQuery when userId prop is set for another user', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: makeRequirements({ kihon: ['t-1'] }),
      isPending: false,
      isError: false,
    });

    renderCard({ userId: 'other-student' });

    expect(requirementsSpy).toHaveBeenCalledWith(NEXT_RANK_ID, 'other-student');
  });

  it('uses the student-scoped progress query (not the actor-scoped one) when userId is set for another user', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: makeRequirements({ kihon: ['t-1'] }),
      isPending: false,
      isError: false,
    });
    studentProgressSpy.mockReturnValue({
      data: [makeProgress({ userId: 'other-student', techniqueId: 't-1', status: 'grading_ready' })],
      isPending: false,
      isError: false,
    });

    renderCard({ userId: 'other-student' });

    // Cross-user progress hook was called with the target student's id...
    expect(studentProgressSpy).toHaveBeenCalledWith('other-student');
    // ...and its data drove the caption, proving the card isn't silently
    // falling back to the actor-scoped `useProgressListQuery` rows (Task 22 gap).
    expect(screen.getByText('1/1 requirements ready')).toBeInTheDocument();
  });

  it('disables the actor-scoped useProgressListQuery calls when viewing another user (Task 25 review)', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: makeRequirements({ kihon: ['t-1'] }),
      isPending: false,
      isError: false,
    });

    renderCard({ userId: 'other-student' });

    expect(techProgressSpy).toHaveBeenCalledWith({ enabled: false });
    expect(patProgressSpy).toHaveBeenCalledWith({ enabled: false });
  });

  it('enables the actor-scoped useProgressListQuery calls for the actor-viewing-self path', () => {
    useNextRankSpy.mockReturnValue({
      currentRank: null,
      nextRank: NEXT_RANK,
      isPending: false,
      isError: false,
      error: null,
    });
    requirementsSpy.mockReturnValue({
      data: makeRequirements({ kihon: ['t-1'] }),
      isPending: false,
      isError: false,
    });

    renderCard();

    expect(techProgressSpy).toHaveBeenCalledWith({ enabled: true });
    expect(patProgressSpy).toHaveBeenCalledWith({ enabled: true });
  });
});
