import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Radix UI Select uses pointer-capture and scrollIntoView APIs that jsdom does not implement.
// Stub them so the dropdown can open and dismiss in tests.
window.Element.prototype.hasPointerCapture = vi.fn() as unknown as typeof window.Element.prototype.hasPointerCapture;
window.Element.prototype.setPointerCapture = vi.fn() as unknown as typeof window.Element.prototype.setPointerCapture;
window.Element.prototype.releasePointerCapture = vi.fn() as unknown as typeof window.Element.prototype.releasePointerCapture;
window.Element.prototype.scrollIntoView = vi.fn() as unknown as typeof window.Element.prototype.scrollIntoView;

vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    createBeltRank: vi.fn().mockResolvedValue({
      id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
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
      publiclyVisible: true,
      slug: 'jukyu',
      minAge: null,
      nextRankId: null,
      createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-24T08:00:00.000Z',
    }),
    getBeltRanks: vi.fn().mockResolvedValue([]),
  };
});
vi.mock('@/entities/belt-system/api/belt-system.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-system/api/belt-system.api.js')>();
  return {
    ...actual,
    getBeltSystems: vi.fn().mockResolvedValue([
      {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        code: 'kyu',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
        organisationId: null,
        sortOrder: 1,
        createdAt: '2026-05-24T08:00:00.000Z',
        updatedAt: '2026-05-24T08:00:00.000Z',
      },
    ]),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});

import { createBeltRank } from '@/entities/belt-rank/api/belt-rank.api.js';

import { BeltRankForm } from './BeltRankForm.js';

import i18n from '@/i18n';

const mockedCreate = vi.mocked(createBeltRank);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <BeltRankForm onSaved={onSaved} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('<BeltRankForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedCreate.mockClear();
  });

  it('rejects publiclyVisible=true with no slug', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/romaji/i), 'Jukyu');
    await user.click(screen.getByLabelText(/publicly visible/i));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).not.toHaveBeenCalled();
    });
  });

  it('submits when publicly visible with a valid slug', async () => {
    const { user, onSaved } = renderForm();
    // Pick the (only) system option via the Select trigger.
    await user.click(screen.getByRole('combobox', { name: /system/i }));
    await user.click(await screen.findByRole('option', { name: /Kyu \(kyu\)/i }));

    await user.type(screen.getByLabelText(/romaji/i), 'Jukyu');
    await user.click(screen.getByLabelText(/publicly visible/i));
    await user.type(screen.getByLabelText(/url slug/i), 'jukyu');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
