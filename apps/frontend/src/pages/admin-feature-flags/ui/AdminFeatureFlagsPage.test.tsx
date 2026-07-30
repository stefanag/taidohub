import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock the entity barrel so the page renders synchronously without touching
// the network. We mock the public barrel (not the deep api/lib paths) so the
// FSD `no-public-api-sidestep` rule stays satisfied.
vi.mock('@/entities/feature-flag', () => ({
  useAdminFeatureFlagsQuery: () => ({
    data: [
      {
        code: 'grading-history',
        enabled: false,
        updatedAt: '2026-06-08T10:00:00.000Z',
        updatedBy: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' },
      },
      {
        code: 'grading-history-verification',
        enabled: true,
        updatedAt: '2026-06-08T10:00:00.000Z',
        // Regression: users with no name fall back to email, not the UUID.
        updatedBy: { id: 'u-2', name: null, email: 'no-name@example.com' },
      },
    ],
    isLoading: false,
  }),
  useUpdateFeatureFlagMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AdminFeatureFlagsPage } from './AdminFeatureFlagsPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminFeatureFlagsPage />
    </QueryClientProvider>,
  );
}

describe('<AdminFeatureFlagsPage>', () => {
  it('renders a row per flag with a toggle button', () => {
    renderPage();
    // The flag code is rendered as raw text, so it's i18n-agnostic.
    expect(screen.getByText('grading-history')).toBeInTheDocument();
    // i18n keys for `admin.featureFlags.*` aren't seeded until Task 11, so
    // asserting on translated button text would be brittle. Instead we check
    // that both toggle buttons are rendered with the right aria-pressed.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the updater name for the last-updated cell (not the UUID)', () => {
    renderPage();
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByText(/u-1/)).not.toBeInTheDocument();
  });

  it('falls back to the updater email when the name is null', () => {
    renderPage();
    expect(screen.getByText(/no-name@example\.com/)).toBeInTheDocument();
    expect(screen.queryByText(/u-2/)).not.toBeInTheDocument();
  });
});
