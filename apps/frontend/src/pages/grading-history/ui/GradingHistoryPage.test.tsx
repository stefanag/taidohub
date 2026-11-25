import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GradingHistoryPage } from './GradingHistoryPage';

import type { ComponentProps } from 'react';

// Mock NextRankCard to avoid complex query dependencies
vi.mock('@/features/next-rank-card', () => ({
  NextRankCard: () => <div data-testid="next-rank-card" />,
}));

// Mock ClubCard to avoid complex dependencies
vi.mock('@/widgets/club-card', () => ({
  ClubCard: () => <div data-testid="club-card" />,
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optionsOrDefault?: string | { defaultValue?: string }) => {
      if (typeof optionsOrDefault === 'string') {
        return optionsOrDefault;
      }
      if (optionsOrDefault?.defaultValue) {
        return optionsOrDefault.defaultValue;
      }
      return key;
    },
  }),
}));

// Mock auth
vi.mock('@/features/auth-by-email', () => ({
  useSession: () => ({
    data: { user: { id: 'test-user-id' } },
  }),
}));

// Mock react-query properly to include queryOptions
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (queryOptions: { queryKey?: readonly unknown[] }) => {
      // Return appropriate data structure based on query
      if (queryOptions?.queryKey?.[0] === 'gradingHistory') {
        return { data: { data: [] }, isPending: false, isError: false };
      }
      return { data: [], isPending: false, isError: false };
    },
  };
});

// Mock grading timeline
vi.mock('@/features/grading-timeline', () => ({
  GradingTimeline: () => <div data-testid="grading-timeline" />,
}));

// Mock rank history form dialog
vi.mock('@/features/rank-history-form', () => ({
  RankHistoryFormDialog: () => <div data-testid="rank-history-form-dialog" />,
}));

// Mock feature flag
vi.mock('@/shared/lib/feature-flags', () => ({
  FeatureFlag: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useFeatureFlag: () => true,
}));

// Mock button
vi.mock('@/shared/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

// Mock rank history mutations and query options
vi.mock('@/entities/rank-history', () => ({
  gradingHistoryQueryOptions: () => ({}),
  useVerifyRankHistory: () => ({
    mutate: vi.fn(),
  }),
  useUnverifyRankHistory: () => ({
    mutate: vi.fn(),
  }),
}));

// Mock belt rank
vi.mock('@/entities/belt-rank', () => ({
  listBeltRanksQueryOptions: () => ({}),
}));

// Mock belt system
vi.mock('@/entities/belt-system', () => ({
  listBeltSystemsQueryOptions: () => ({}),
}));

// Mock shogo title
vi.mock('@/entities/shogo-title', () => ({
  listShogoTitlesQueryOptions: () => ({}),
}));

describe('GradingHistoryPage', () => {
  it('renders the page title', () => {
    render(<GradingHistoryPage />);
    expect(screen.getByText(/Grading history/i)).toBeInTheDocument();
  });

  it('renders NextRankCard', () => {
    render(<GradingHistoryPage />);
    expect(screen.getByTestId('next-rank-card')).toBeInTheDocument();
  });
});
