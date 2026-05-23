import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileForm } from './ProfileForm.js';

import type { UserProfile } from '@/entities/profile';

import i18n from '@/i18n';

// Mock the deep entity-api module so the mutation hook picks up the stub.
vi.mock('@/entities/profile/api/profile.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/profile/api/profile.api.js')>();
  return {
    ...actual,
    updateMyProfile: vi.fn().mockImplementation((input) =>
      Promise.resolve({ ...EMPTY_PROFILE, ...input }),
    ),
  };
});

import { updateMyProfile } from '@/entities/profile/api/profile.api.js';

const EMPTY_PROFILE: UserProfile = {
  userId: 'u-1',
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  taidoStartDate: null,
  addressStreet: null,
  addressPostalCode: null,
  addressCity: null,
  addressCountry: null,
  citizenships: [],
};

const SEEDED: UserProfile = {
  ...EMPTY_PROFILE,
  firstName: 'Ada',
  lastName: 'Lovelace',
  addressCity: 'Stockholm',
  citizenships: ['SWE'],
};

const mockedUpdate = vi.mocked(updateMyProfile);

function renderForm(profile: UserProfile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ProfileForm profile={profile} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<ProfileForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedUpdate.mockClear();
  });

  it('renders the fields seeded from the profile', () => {
    renderForm(SEEDED);
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Lovelace');
    expect(screen.getByLabelText(/city/i)).toHaveValue('Stockholm');
  });

  // 30 s: rendering 250+ SelectItems makes userEvent.type slow under jsdom.
  it('submits an edited field value', async () => {
    const { user } = renderForm(SEEDED);
    const last = screen.getByLabelText(/last name/i);
    await user.clear(last);
    await user.type(last, 'Byron');
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: 'Byron' }),
      expect.anything(),
    );
  }, 30_000);

  it('sends an empty string field as null', async () => {
    const { user } = renderForm(SEEDED);
    const city = screen.getByLabelText(/city/i);
    await user.clear(city);
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ addressCity: null }),
      expect.anything(),
    );
  });

  it('removes a citizenship and submits the shortened list', async () => {
    const { user } = renderForm(SEEDED);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ citizenships: [] }),
      expect.anything(),
    );
  });
});
