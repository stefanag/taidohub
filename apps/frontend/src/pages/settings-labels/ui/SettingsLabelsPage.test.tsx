import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsLabelsPage } from './SettingsLabelsPage.js';

// Mock the labels API at its deep path so the React Query hooks resolve
// against fixtures rather than real HTTP. The page itself just renders the
// tabs/tab content; the lists handle their own loading state.
vi.mock('@/entities/labels/api/labels.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/labels/api/labels.api.js')>();
  return {
    ...actual,
    getTags: vi.fn().mockResolvedValue([]),
    getCategories: vi.fn().mockResolvedValue([]),
  };
});

// useSession is consumed inside TagsList / CategoriesList to gate global-label
// editing. A non-sysadmin session is the safe default for the smoke test.
vi.mock('@/features/auth-by-email', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email')>();
  return {
    ...actual,
    useSession: () => ({
      data: { user: { id: 'u-1', email: 'a@b', role: 'user' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    }),
  };
});

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SettingsLabelsPage />
    </QueryClientProvider>,
  );
}

describe('<SettingsLabelsPage>', () => {
  it('renders both tabs', () => {
    renderPage();
    // i18n keys for settings.labels.* land in Task 13, so the tabs render the
    // translated en strings ("Tags" / "Categories").
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(
      screen.getByRole('tab', { name: /^Tags$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /^Categories$/i }),
    ).toBeInTheDocument();
  });
});
