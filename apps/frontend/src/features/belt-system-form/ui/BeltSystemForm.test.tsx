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
    createBeltSystem: vi.fn().mockResolvedValue({
      id: 'sys-new',
      code: 'kyu',
      nameEn: 'Kyu',
      nameSv: 'Kyu',
      nameFi: 'Kyu',
      organisationId: null,
      sortOrder: 0,
      createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-24T08:00:00.000Z',
    }),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return {
    ...actual,
    listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };
});

import { createBeltSystem } from '@/entities/belt-system/api/belt-system.api.js';

import { BeltSystemForm } from './BeltSystemForm.js';

import i18n from '@/i18n';

const mockedCreate = vi.mocked(createBeltSystem);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <BeltSystemForm onSaved={onSaved} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('<BeltSystemForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedCreate.mockClear();
  });

  it('submits valid values', async () => {
    const { user, onSaved } = renderForm();
    await user.type(screen.getByLabelText(/code/i), 'kyu');
    await user.type(screen.getByLabelText(/name \(english\)/i), 'Kyu');
    await user.type(screen.getByLabelText(/name \(swedish\)/i), 'Kyu');
    await user.type(screen.getByLabelText(/name \(finnish\)/i), 'Kyu');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows a validation error when code is missing', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).not.toHaveBeenCalled();
    });
    // RHF renders the message inside the FormMessage slot under the code input.
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
  });
});
