import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Stub the route params hook so the page knows which student to render.
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ userId: 'u-1' }),
}));

vi.mock('@/entities/student', () => ({
  useStudentProgressQuery: () => ({
    data: [],
    isPending: false,
    isError: false,
    error: null,
  }),
  useStudentsQuery: () => ({
    data: [
      {
        userId: 'u-1',
        name: 'Aiko Tanaka',
        email: 'aiko@example.com',
        organisations: [],
        progressSummary: {
          not_started: 0,
          learning: 0,
          competent: 0,
          grading_ready: 0,
        },
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/entities/technique', () => ({
  useTechniquesQuery: () => ({
    data: [
      {
        id: 't-1',
        nameRomaji: 'mae geri',
        nameJa: '',
        nameEn: 'Front kick',
        nameSv: '',
        nameFi: '',
        classifications: [],
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/entities/pattern', () => ({
  usePatternsQuery: () => ({
    data: [
      {
        id: 'p-1',
        nameRomaji: 'hokei sho',
        nameJa: '',
        nameEn: 'Hokei sho',
        nameSv: '',
        nameFi: '',
        classifications: [],
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/entities/rank-requirement', () => ({
  useRequirementsForUserQuery: () => ({
    data: {
      rankId: 'rank-2',
      setId: 'set-1',
      hokeiGroups: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      kihon: ['t-1'],
      kihonTested: [],
      jissenMinutes: null,
      jissenTested: false,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false,
      requiresEssay: false,
    },
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/features/next-rank-card', () => ({
  NextRankCard: ({ userId }: { userId?: string }) => (
    <div data-testid="next-rank-card">next-rank-card:{userId}</div>
  ),
  useNextRank: () => ({
    currentRank: null,
    nextRank: { id: 'rank-2', nameRomaji: 'Kukyu' },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// Lightweight dialog stub — renders a recognisable marker when open.
vi.mock('@/features/student-progress-editor-dialog', () => ({
  StudentProgressEditorDialog: ({
    open,
    contentLabel,
  }: {
    open: boolean;
    contentLabel?: string;
  }) =>
    open ? (
      <div role="dialog" aria-label="student-progress-editor">
        Editing: {contentLabel}
      </div>
    ) : null,
}));

import { StudentDetailPage } from './StudentDetailPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <StudentDetailPage />
    </QueryClientProvider>,
  );
}

describe('<StudentDetailPage>', () => {
  it('renders the techniques and patterns sections with progress pills', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Techniques' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Patterns' }),
    ).toBeInTheDocument();
    // 'mae geri' also appears in the RankRequirementsDisplay section (its
    // kihon requirement label), so use getAllByText here.
    expect(screen.getAllByText('mae geri').length).toBeGreaterThan(0);
    expect(screen.getByText('hokei sho')).toBeInTheDocument();
  });

  it('renders the NextRankCard for the viewed student', () => {
    renderPage();

    const card = screen.getByTestId('next-rank-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('next-rank-card:u-1');
  });

  it('renders the RankRequirementsDisplay section for the student\'s next rank', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Next rank requirements' }),
    ).toBeInTheDocument();
    // 't-1' is the only kihon requirement id in the mocked requirements
    // payload, and 'mae geri' is its label from the mocked technique catalogue.
    expect(
      screen.getByRole('heading', { name: 'Kihon (techniques)' }),
    ).toBeInTheDocument();
  });

  it('opens the StudentProgressEditorDialog when a progress pill is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // ProgressPill renders as a button — click the first one (technique row).
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Editing: mae geri/)).toBeInTheDocument();
  });
});
