import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return {
    ...actual,
    deleteShogoTitle: vi.fn().mockResolvedValue(undefined),
  };
});

import { deleteShogoTitle } from '@/entities/shogo-title/api/shogo-title.api.js';

import { ShogoTitlesTable } from './ShogoTitlesTable.js';

import i18n from '@/i18n';

const mockedDelete = vi.mocked(deleteShogoTitle);

const RANK_FIXTURE = {
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  organisationId: null,
  systemId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  level: 1,
  sortOrder: 0,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '',
  nameSv: '',
  nameFi: '',
  beltColor: '#FFFFFF',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

const SHOGO_FIXTURE = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  sortOrder: 1,
};

function renderTable(onEdit = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ShogoTitlesTable shogos={[SHOGO_FIXTURE]} ranks={[RANK_FIXTURE]} onEdit={onEdit} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onEdit };
}

describe('<ShogoTitlesTable>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedDelete.mockClear();
  });

  it('renders a row with the shogo code', () => {
    renderTable();
    expect(screen.getByText('renshi')).toBeInTheDocument();
  });

  it('renders the min rank romaji via the ranks lookup', () => {
    renderTable();
    expect(screen.getByText('Jukyu')).toBeInTheDocument();
  });

  it('calls onEdit when the edit button is clicked', async () => {
    const { user, onEdit } = renderTable();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(SHOGO_FIXTURE);
  });

  it('opens the confirm dialog when the delete button is clicked', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('calls deleteShogoTitle when confirm is clicked in the dialog', async () => {
    const { user } = renderTable();
    // Open dialog
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // Click confirm button inside dialog
    const dialogDeleteBtn = screen.getAllByRole('button', { name: /delete/i }).find(
      (btn) => btn.closest('[role="dialog"]'),
    );
    await user.click(dialogDeleteBtn!);
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(SHOGO_FIXTURE.code);
    });
  });
});
