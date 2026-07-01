import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';

// Mock NextRankCard to avoid complex query dependencies
vi.mock('@/features/next-rank-card', () => ({
  NextRankCard: () => <div data-testid="next-rank-card" />,
}));

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
});
