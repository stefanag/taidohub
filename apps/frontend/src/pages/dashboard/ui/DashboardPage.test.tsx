import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

// Mock NextRankCard to avoid complex query dependencies
vi.mock('@/features/next-rank-card', () => ({
  NextRankCard: () => <div data-testid="next-rank-card" />,
  PracticeReminders: () => <div data-testid="practice-reminders" />,
}));
vi.mock('@/features/join-club', () => ({ JoinClubCard: () => null }));
vi.mock('@/features/review-join-requests', () => ({ JoinRequestsReview: () => null }));
vi.mock('@/features/training-goal', () => ({
  TrainingGoalCard: () => <div data-testid="training-goal-card" />,
}));

const memberships = vi.hoisted(() => ({ value: { isSuccess: true, data: [{ role: 'student' }] } }));
vi.mock('@/entities/me', () => ({ useMyMembershipsQuery: () => memberships.value }));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('DashboardPage', () => {
  it('renders the page title', () => {
    render(<DashboardPage />);
    expect(screen.getByText('dashboard.title')).toBeInTheDocument();
  });

  it('renders NextRankCard', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('next-rank-card')).toBeInTheDocument();
  });

  it('tells a user without a club that their gradings are self-reported', () => {
    memberships.value = { isSuccess: true, data: [] };
    render(<DashboardPage />);
    expect(screen.getByRole('note')).toHaveTextContent('dashboard.withoutClub');
  });

  it('says nothing about clubs to club members', () => {
    memberships.value = { isSuccess: true, data: [{ role: 'student' }] };
    render(<DashboardPage />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
