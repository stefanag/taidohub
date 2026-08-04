import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PLATFORM_STATS: PlatformStats = {
  scope: { type: 'platform' },
  metrics: {
    membershipCount: { student: 120, instructor: 15, orgadmin: 4 },
    gradingEventsMonthToDate: 42,
    activeUsersLast30Days: 88,
    feedbackThreadsOpenedMonthToDate: 7,
  },
  ranks: [
    { rank: { id: 'r1', nameRomaji: 'Shodan', nameEn: '1st Dan', sortOrder: 10 }, count: 5 },
    { rank: { id: 'r2', nameRomaji: 'Nidan', nameEn: '2nd Dan', sortOrder: 20 }, count: 2 },
  ],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

// Stateful mocks so the rebuild-mutation tests can drive `isPending` /
// `isSuccess` transitions across a `mutate()` click, the way React Query's
// real hook would. `state` is mutated in place and read by the mocked
// hooks on every render, so tests just call `rerender()` after flipping it.
const { state, mutateMock } = vi.hoisted(() => {
  const mutateMock = vi.fn();
  return {
    mutateMock,
    state: {
      platform: {
        data: undefined as PlatformStats | undefined,
        isLoading: true,
        isError: false,
        error: null as unknown,
      },
      rebuild: {
        mutate: mutateMock,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined as RebuildStatsResponse | undefined,
        error: null as unknown,
      },
    },
  };
});

// Mock the public `@/entities/statistic` barrel (not the deep api/lib
// paths) so the FSD `no-public-api-sidestep` rule stays satisfied — mirrors
// `apps/frontend/src/pages/admin-feature-flags/ui/AdminFeatureFlagsPage.test.tsx`.
vi.mock('@/entities/statistic', () => ({
  usePlatformStatsQuery: () => state.platform,
  useRebuildStatsMutation: () => state.rebuild,
}));

import { AdminStatisticsPage } from './AdminStatisticsPage.js';

import type { PlatformStats, RebuildStatsResponse } from '@repo/contracts/statistics';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <AdminStatisticsPage />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), ...utils };
}

describe('<AdminStatisticsPage>', () => {
  afterEach(() => {
    mutateMock.mockClear();
    state.platform.data = undefined;
    state.platform.isLoading = true;
    state.platform.isError = false;
    state.platform.error = null;
    state.rebuild.isPending = false;
    state.rebuild.isSuccess = false;
    state.rebuild.isError = false;
    state.rebuild.data = undefined;
    state.rebuild.error = null;
  });

  it('renders the loading state while the platform query is loading', () => {
    state.platform.isLoading = true;
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders 4 tiles with the correct labels and values once data resolves', () => {
    state.platform.isLoading = false;
    state.platform.data = PLATFORM_STATS;
    renderPage();

    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Instructors')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Active users (30d)')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('Gradings this month')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the rank breakdown with the ranks passed through', () => {
    state.platform.isLoading = false;
    state.platform.data = PLATFORM_STATS;
    renderPage();

    expect(screen.getByText('Belts across the platform')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Shodan');
    expect(items[0]).toHaveTextContent('5');
    expect(items[1]).toHaveTextContent('Nidan');
    expect(items[1]).toHaveTextContent('2');
  });

  it('fires the rebuild mutation on click and disables the button while pending', async () => {
    state.platform.isLoading = false;
    state.platform.data = PLATFORM_STATS;
    const { user, rerender } = renderPage();

    const button = screen.getByRole('button', { name: /rebuild statistics/i });
    await user.click(button);
    expect(mutateMock).toHaveBeenCalledTimes(1);

    state.rebuild.isPending = true;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AdminStatisticsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: /rebuilding/i })).toBeDisabled();
  });

  it('shows a success message with the rebuild duration once the mutation resolves', () => {
    state.platform.isLoading = false;
    state.platform.data = PLATFORM_STATS;
    state.rebuild.isSuccess = true;
    state.rebuild.data = { ok: true, durationMs: 234 };
    renderPage();

    expect(screen.getByText(/rebuilt in 234ms/i)).toBeInTheDocument();
  });
});
