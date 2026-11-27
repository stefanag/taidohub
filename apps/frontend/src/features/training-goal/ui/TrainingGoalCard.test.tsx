import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainingGoalCard } from './TrainingGoalCard.js';

import i18n from '@/i18n';
import { DEFAULT_FLAGS, FeatureFlagsProvider } from '@/shared/lib/feature-flags';

const goal = vi.fn();
const sessions = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/entities/belt-rank', () => ({
  listBeltRanksQueryOptions: () => ({ queryKey: ['ranks'], queryFn: async () => [] }),
}));

vi.mock('@/entities/training-log', async (orig) => {
  const actual = await orig<typeof import('@/entities/training-log')>();
  return {
    countSessionsThisWeek: actual.countSessionsThisWeek,
    weekStart: actual.weekStart,
    useTrainingGoalQuery: () => goal(),
    useTrainingSessionsQuery: () => sessions(),
  };
});

vi.mock('@/shared/lib/grading-readiness', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/grading-readiness')>()),
  todayIso: () => '2026-11-27',
}));

function renderCard(trainingLog = true) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, 'training-log': trainingLog }}>
        <I18nextProvider i18n={i18n}>
          <TrainingGoalCard />
        </I18nextProvider>
      </FeatureFlagsProvider>
    </QueryClientProvider>,
  );
}

const ok = (data: unknown) => ({ data, isPending: false, isError: false });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  sessions.mockReturnValue(ok([{ date: '2026-11-24' }, { date: '2026-11-26' }]));
});

describe('<TrainingGoalCard>', () => {
  it('renders nothing with the flag off', () => {
    goal.mockReturnValue(ok({ targetRankId: null, targetDate: null, sessionsPerWeek: 3 }));
    const { container } = renderCard(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('invites setting goals when there are none', () => {
    goal.mockReturnValue(ok({ targetRankId: null, targetDate: null, sessionsPerWeek: null }));
    renderCard();
    expect(screen.getByText('Set goals')).toHaveAttribute('href', '/training');
  });

  it('counts this week against the weekly goal and the days to the target date', () => {
    goal.mockReturnValue(ok({ targetRankId: null, targetDate: '2026-12-25', sessionsPerWeek: 3 }));
    renderCard();
    expect(screen.getByTestId('training-goal-week')).toHaveTextContent('2 of 3 sessions this week');
    expect(screen.getByTestId('training-goal-target')).toHaveTextContent('(28 days left)');
  });
});
