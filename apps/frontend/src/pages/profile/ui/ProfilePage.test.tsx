import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilePage } from './ProfilePage.js';

import type { UserStats, StatsTrendResponse } from '@repo/contracts/statistics';

import i18n from '@/i18n';


const USER_ID = 'user-1';

// The page's own `useQuery(myProfileQueryOptions())` call is stubbed to stay
// permanently pending — the profile form itself is out of scope here (it's
// covered by `ProfileForm.test.tsx`); this file only exercises the new
// "Your progression" section, which renders independently of the profile
// query's state.
vi.mock('@tanstack/react-query', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({ isPending: true, isError: false, data: undefined, error: undefined }),
  };
});

vi.mock('@/entities/me', () => ({
  useSession: () => ({ data: { user: { id: USER_ID } } }),
}));

vi.mock('@/entities/profile', () => ({
  myProfileQueryOptions: () => ({ queryKey: ['profile'] }),
}));

vi.mock('@/features/auth-by-email', () => ({
  authClient: { getSession: vi.fn() },
}));

vi.mock('@/features/profile-form', () => ({
  ProfileForm: () => <div data-testid="profile-form-stub" />,
}));

const useUserStatsQuerySpy = vi.fn<
  (...args: unknown[]) => { data: UserStats | undefined; isLoading: boolean; isError: boolean }
>(() => ({ data: undefined, isLoading: true, isError: false }));

const useUserTrendsQuerySpy = vi.fn<
  (...args: unknown[]) => { data: StatsTrendResponse | undefined; isLoading: boolean }
>(() => ({ data: undefined, isLoading: true }));

vi.mock('@/entities/statistic', () => ({
  useUserStatsQuery: (...args: unknown[]) => useUserStatsQuerySpy(...args),
  useUserTrendsQuery: (...args: unknown[]) => useUserTrendsQuerySpy(...args),
}));


function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <ProfilePage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useUserStatsQuerySpy.mockReset();
  useUserTrendsQuerySpy.mockReset();
  useUserStatsQuerySpy.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  useUserTrendsQuerySpy.mockReturnValue({ data: undefined, isLoading: true });
});

describe('<ProfilePage>', () => {
  it('renders a CoverageMeter for the current (highest-sortOrder) rank once stats resolve', () => {
    useUserStatsQuerySpy.mockReturnValue({
      data: {
        scope: { type: 'user', id: USER_ID, name: 'Aiko Tanaka' },
        coverageByRank: [
          {
            rank: { id: 'r-5kyu', nameRomaji: 'Gokyu', nameEn: '5th Kyu', sortOrder: 5 },
            coveragePct: 90,
          },
          {
            rank: { id: 'r-4kyu', nameRomaji: 'Yonkyu', nameEn: '4th Kyu', sortOrder: 10 },
            coveragePct: 62,
          },
        ],
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByText('Your progression')).toBeInTheDocument();
    const meter = screen.getByRole('progressbar', { name: '4th Kyu' });
    expect(meter).toHaveAttribute('aria-valuenow', '62');
    expect(screen.getByText('62%')).toBeInTheDocument();
    // Once a current rank has resolved, the trend query is enabled and
    // scoped to that rank's dimensionKey.
    expect(useUserTrendsQuerySpy).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ dimensionKey: 'r-4kyu' }),
      { enabled: true },
    );
  });

  it('hides the progression section entirely when the user has no coverage data', () => {
    useUserStatsQuerySpy.mockReturnValue({
      data: {
        scope: { type: 'user', id: USER_ID, name: null },
        coverageByRank: [],
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.queryByText('Your progression')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // No current rank resolved -> the trend query must be disabled rather
    // than firing a request with an empty dimensionKey.
    expect(useUserTrendsQuerySpy).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ dimensionKey: '' }),
      { enabled: false },
    );
  });
});
