import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return {
    ...actual,
    createShogoTitle: vi.fn().mockResolvedValue({
      code: 'renshi',
      nameEn: 'Renshi',
      nameSv: 'Renshi',
      nameFi: 'Renshi',
      nameJa: '錬士',
      minRankId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', // matches the rank fixture id
      sortOrder: 1,
    }),
  };
});
vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    getBeltRanks: vi.fn().mockResolvedValue([
      {
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
      },
    ]),
  };
});

import { createShogoTitle } from '@/entities/shogo-title/api/shogo-title.api.js';

import { ShogoTitleForm } from './ShogoTitleForm.js';

import i18n from '@/i18n';

const mockedCreate = vi.mocked(createShogoTitle);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ShogoTitleForm onSaved={onSaved} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('<ShogoTitleForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedCreate.mockClear();
  });

  it('submits valid input', async () => {
    const { user, onSaved } = renderForm();
    await user.type(screen.getByLabelText(/code/i), 'renshi');
    await user.type(screen.getByLabelText(/name \(english\)/i), 'Renshi');
    await user.type(screen.getByLabelText(/name \(swedish\)/i), 'Renshi');
    await user.type(screen.getByLabelText(/name \(finnish\)/i), 'Renshi');
    await user.type(screen.getByLabelText(/name \(japanese\)/i), '錬士');
    await user.click(screen.getByRole('combobox', { name: /minimum rank/i }));
    await user.click(await screen.findByRole('option', { name: /Jukyu/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
