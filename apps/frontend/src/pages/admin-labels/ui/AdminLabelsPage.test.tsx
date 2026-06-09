import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AdminLabelsPage } from './AdminLabelsPage.js';

// Stub the React Query hooks the lists consume so they immediately fall out
// of their loading state. Override at the labels entity's public barrel.
vi.mock('@/entities/label', async (orig) => {
  const actual = await orig<typeof import('@/entities/label')>();
  return {
    ...actual,
    useTagsQuery: () => ({
      data: [
        // Globals only — admin page should render this row.
        {
          id: 't-global',
          organisationId: null,
          name: 'platform-banned',
          createdByUserId: 'admin',
          createdAt: '2026-06-09T10:00:00.000Z',
          updatedAt: '2026-06-09T10:00:00.000Z',
        },
        // Org-scoped — admin page should NOT render this row.
        {
          id: 't-org',
          organisationId: 'org-1',
          name: 'my-club-tag',
          createdByUserId: 'u-1',
          createdAt: '2026-06-09T10:00:00.000Z',
          updatedAt: '2026-06-09T10:00:00.000Z',
        },
      ],
      isLoading: false,
      isPending: false,
      error: null,
    }),
    useCategoriesQuery: () => ({
      data: [],
      isLoading: false,
      isPending: false,
      error: null,
    }),
  };
});

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminLabelsPage />
    </QueryClientProvider>,
  );
}

describe('<AdminLabelsPage>', () => {
  it('renders both tabs', () => {
    renderPage();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /^Tags$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /^Categories$/i }),
    ).toBeInTheDocument();
  });

  it('shows global tags only, omitting org-scoped rows', () => {
    renderPage();
    expect(screen.getByText('platform-banned')).toBeInTheDocument();
    expect(screen.queryByText('my-club-tag')).not.toBeInTheDocument();
  });
});
