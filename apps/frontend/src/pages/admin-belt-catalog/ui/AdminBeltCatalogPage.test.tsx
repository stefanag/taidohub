import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the entity API modules so no real HTTP calls are made.
vi.mock('@/entities/belt-system/api/belt-system.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-system/api/belt-system.api.js')>();
  return { ...actual, getBeltSystems: vi.fn().mockResolvedValue([]) };
});
vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return { ...actual, getBeltRanks: vi.fn().mockResolvedValue([]) };
});
vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return { ...actual, getShogoTitles: vi.fn().mockResolvedValue([]) };
});
// BeltSystemForm fetches orgs — mock to prevent noise.
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual =
    await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});

import { AdminBeltCatalogPage } from './AdminBeltCatalogPage.js';

import i18n from '@/i18n';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AdminBeltCatalogPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<AdminBeltCatalogPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the three tab triggers', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /systems/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ranks/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /shogo titles/i })).toBeInTheDocument();
  });

  it('shows the "Add system" button on the Systems tab by default', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /add system/i })).toBeInTheDocument();
  });

  it('clicking "Add system" renders the belt system form', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: /add system/i }));
    // The BeltSystemForm contains a Code field
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
  });

  it('clicking "Add rank" (after switching tab) renders the belt rank form', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: /^ranks$/i }));
    await user.click(screen.getByRole('button', { name: /add rank/i }));
    // BeltRankForm contains a Level field
    expect(screen.getByLabelText(/level/i)).toBeInTheDocument();
  });

  it('clicking "Add shogo title" (after switching tab) renders the shogo title form', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: /shogo titles/i }));
    await user.click(screen.getByRole('button', { name: /add shogo title/i }));
    // ShogoTitleForm contains a Sort order field
    expect(screen.getByLabelText(/sort order/i)).toBeInTheDocument();
  });
});
