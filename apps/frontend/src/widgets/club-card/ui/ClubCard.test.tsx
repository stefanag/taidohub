import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClubCard } from './ClubCard.js';

import i18n from '@/i18n';

// Deep mocks — the query-options factories capture references at import time.
vi.mock('@/entities/membership/api/membership.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/membership/api/membership.api.js')>();
  return {
    ...actual,
    listMemberships: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'm-1',
          userId: 'u-1',
          organisationId: 'org-club-1',
          role: 'instructor',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
    }),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return {
    ...actual,
    listOrganisations: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'org-club-1',
          type: 'club',
          shortCode: 'KOB',
          slug: 'kobe-dojo',
          country: 'JPN',
          nameEn: 'Kobe Dojo',
          nameSv: 'Kobe Dojo',
          nameFi: 'Kobe Dojo',
          nameJa: '神戸道場',
          parentId: 'org-nat-1',
          headInstructorId: null,
          contactEmail: null,
          logoUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'org-nat-1',
          type: 'nationalFederation',
          shortCode: 'JPN',
          slug: 'japan',
          country: 'JPN',
          nameEn: 'Japan Taido Federation',
          nameSv: 'Japan Taido Federation',
          nameFi: 'Japan Taido Federation',
          nameJa: null,
          parentId: null,
          headInstructorId: null,
          contactEmail: null,
          logoUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 2,
    }),
  };
});

function renderCard(userId = 'u-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ClubCard userId={userId} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe('<ClubCard>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the user\'s club name and parent federation', async () => {
    renderCard();
    expect(await screen.findByText('Kobe Dojo')).toBeInTheDocument();
    expect(screen.getByText('Japan Taido Federation')).toBeInTheDocument();
  });

  it('renders the section heading "Club"', async () => {
    renderCard();
    expect(await screen.findByText(/club/i)).toBeInTheDocument();
  });
});
