import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsLabelsPage } from './SettingsLabelsPage.js';

// Stub the React Query hooks the lists consume so they immediately fall out
// of their loading state. We override the hooks at the labels entity's
// public barrel (not the deep api path) so the FSD `no-public-api-sidestep`
// rule stays satisfied. Mocking the deep `getTags` / `getCategories` would
// not work because `hooks.ts` binds to those functions via its own local
// `import * as api from '../api/...'`, which vitest's public-barrel mock
// cannot reach.
vi.mock('@/entities/label', async (orig) => {
  const actual = await orig<typeof import('@/entities/label')>();
  return {
    ...actual,
    useTagsQuery: () => ({
      data: [],
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

// useSession is consumed inside SettingsLabelsPage to derive the `isSysadmin`
// prop it threads down to <TagsList /> / <CategoriesList />. A non-sysadmin
// session is the safe default for the smoke test.
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
