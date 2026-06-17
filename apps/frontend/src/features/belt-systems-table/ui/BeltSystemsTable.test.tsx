import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/entities/belt-system/api/belt-system.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-system/api/belt-system.api.js')>();
  return {
    ...actual,
    deleteBeltSystem: vi.fn().mockResolvedValue(undefined),
  };
});

import { deleteBeltSystem } from '@/entities/belt-system/api/belt-system.api.js';

import { BeltSystemsTable } from './BeltSystemsTable.js';

import i18n from '@/i18n';

const mockedDelete = vi.mocked(deleteBeltSystem);

const SYSTEM_FIXTURE = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  code: 'kyu',
  nameEn: 'Kyu System',
  nameSv: 'Kyu System',
  nameFi: 'Kyu System',
  sortOrder: 1,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

function renderTable(onEdit = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <BeltSystemsTable systems={[SYSTEM_FIXTURE]} onEdit={onEdit} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onEdit };
}

describe('<BeltSystemsTable>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedDelete.mockClear();
  });

  it('renders a row with the system code', () => {
    renderTable();
    expect(screen.getByText('kyu')).toBeInTheDocument();
  });

  it('calls onEdit when the edit button is clicked', async () => {
    const { user, onEdit } = renderTable();
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(SYSTEM_FIXTURE);
  });

  it('opens the confirm dialog when the delete button is clicked', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('calls deleteBeltSystem when confirm is clicked in the dialog', async () => {
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
      expect(mockedDelete).toHaveBeenCalledWith(SYSTEM_FIXTURE.id);
    });
  });
});
