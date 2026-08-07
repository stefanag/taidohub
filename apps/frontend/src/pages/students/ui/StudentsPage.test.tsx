import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Stub the roster query so the page renders synchronously.
vi.mock('@/entities/student', () => ({
  useStudentsQuery: () => ({
    data: [
      {
        userId: 'u-1',
        name: 'Aiko Tanaka',
        email: 'aiko@example.com',
        organisations: [
          { id: '00000000-0000-0000-0000-000000000001', name: 'Helsinki Dojo' },
          { id: '00000000-0000-0000-0000-000000000002', name: 'Espoo Dojo' },
        ],
        progressSummary: {
          not_started: 5,
          learning: 3,
          competent: 2,
          grading_ready: 1,
        },
      },
      {
        userId: 'u-2',
        name: 'Ben Lindqvist',
        email: 'ben@example.com',
        organisations: [
          { id: '00000000-0000-0000-0000-000000000001', name: 'Helsinki Dojo' },
        ],
        progressSummary: {
          not_started: 7,
          learning: 0,
          competent: 0,
          grading_ready: 0,
        },
      },
    ],
    isPending: false,
  }),
}));

// Capture navigate calls from row clicks.
const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

// Per-row coverage query, keyed by userId so each `StudentCoverageCell`
// resolves independently.
vi.mock('@/entities/statistic', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    useUserStatsQuery: (userId: string) => ({
      data: {
        scope: { type: 'user', id: userId, name: null },
        coverageByRank: [
          {
            rank: { id: 'r-4kyu', nameRomaji: 'Yonkyu', nameEn: '4th Kyu', sortOrder: 10 },
            coveragePct: userId === 'u-1' ? 62 : 40,
          },
        ],
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    }),
  };
});

import { StudentsPage } from './StudentsPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <StudentsPage />
    </QueryClientProvider>,
  );
}

describe('<StudentsPage>', () => {
  it('renders one row per student with name, email, and organisations', () => {
    renderPage();

    expect(screen.getByText('Aiko Tanaka')).toBeInTheDocument();
    expect(screen.getByText('aiko@example.com')).toBeInTheDocument();
    expect(
      screen.getByText('Helsinki Dojo, Espoo Dojo'),
    ).toBeInTheDocument();

    expect(screen.getByText('Ben Lindqvist')).toBeInTheDocument();
    expect(screen.getByText('ben@example.com')).toBeInTheDocument();
  });

  it('navigates to the student detail page when a row is clicked', async () => {
    navigateMock.mockReset();
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('Aiko Tanaka'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/students/$userId',
      params: { userId: 'u-1' },
    });
  });

  it('renders one CoverageMeter per student row', () => {
    renderPage();

    const meters = screen.getAllByRole('progressbar');
    expect(meters).toHaveLength(2);
  });
});
