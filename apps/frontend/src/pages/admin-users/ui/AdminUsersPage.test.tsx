import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersPage } from './AdminUsersPage.js';

import i18n from '@/i18n';

// Mock the entity API modules by their deep paths — the query-options
// factories capture the fetchers directly from these modules.
vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return {
    ...actual,
    listUsers: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, perPage: 25 }),
    inviteUser: vi.fn(),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});
vi.mock('@/entities/membership/api/membership.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/membership/api/membership.api.js')>();
  return { ...actual, listMemberships: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});

// useSession is consumed for the current user id.
vi.mock('@/features/auth-by-email', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email')>();
  return {
    ...actual,
    useSession: () => ({ data: { user: { id: 'current-admin' } } }),
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AdminUsersPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<AdminUsersPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('opens the invite dialog when "Invite user" is clicked', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /invite user/i }));
    expect(
      await screen.findByRole('heading', { name: /invite a new user/i }),
    ).toBeInTheDocument();
  });
});
