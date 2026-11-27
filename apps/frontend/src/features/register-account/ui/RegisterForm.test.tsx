import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/registration.api.js', () => ({
  createGoogleRegistrationIntent: vi.fn(),
  getRegistrationFederations: vi.fn(),
  getRegistrationLegalTexts: vi.fn(),
  registerAccount: vi.fn(),
}));

import {
  createGoogleRegistrationIntent,
  getRegistrationFederations,
  getRegistrationLegalTexts,
  registerAccount,
} from '../api/registration.api.js';

import { RegisterForm } from './RegisterForm.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

const FED = '22222222-2222-4222-8222-222222222222';
const TERMS = '11111111-1111-4111-8111-111111111111';

function yearsAgo(years: number, plusDays = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

function renderForm(onRegisterWithGoogle?: (intent: string) => Promise<void>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RegisterForm onRegisterWithGoogle={onRegisterWithGoogle} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function fill(user: ReturnType<typeof userEvent.setup>, dateOfBirth: string) {
  await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password'), 'long-enough');
  await user.type(screen.getByLabelText('Confirm password'), 'long-enough');
  await user.type(screen.getByLabelText('Date of birth'), dateOfBirth);
  await user.selectOptions(await screen.findByLabelText('National federation'), FED);
}

describe('<RegisterForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.mocked(getRegistrationFederations).mockResolvedValue([
      {
        id: FED,
        nameEn: 'Swedish Taido Federation',
        nameSv: 'Svenska Taidoförbundet',
        nameFi: 'Ruotsin',
        country: 'SWE',
      },
    ]);
    vi.mocked(getRegistrationLegalTexts).mockResolvedValue({
      documents: [
        {
          documentId: TERMS,
          kind: 'terms',
          audience: 'self_registered',
          organisationId: null,
          versionId: TERMS,
          version: 1,
          publishedAt: '2026-11-26T10:00:00.000Z',
          authoritativeLocale: 'sv',
          availableLocales: ['sv'],
          translation: { locale: 'sv', revision: 1, title: 'Användarvillkor', body: { ops: [] } },
          isFallback: true,
        },
      ],
    });
    vi.mocked(registerAccount).mockReset();
  });

  it('refuses anyone under 13 before sending anything', async () => {
    const user = renderForm();
    await screen.findByRole('option', { name: 'Swedish Taido Federation' });
    await fill(user, yearsAgo(13, 1));
    await user.click(await screen.findByLabelText('I accept the terms of use'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/at least 13/)).toBeInTheDocument();
    expect(registerAccount).not.toHaveBeenCalled();
  });

  it('requires the terms, then registers and asks the user to check their email', async () => {
    vi.mocked(registerAccount).mockResolvedValue({ status: 'verification_sent' });
    const user = renderForm();
    await screen.findByRole('option', { name: 'Swedish Taido Federation' });
    await fill(user, '1990-12-10');
    expect(await screen.findByRole('link', { name: 'Användarvillkor' })).toHaveAttribute(
      'href',
      '/legal/platform/terms?audience=self_registered',
    );

    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/Accept the terms and confirm/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('I accept the terms of use'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(registerAccount).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'long-enough',
        locale: 'en',
        dateOfBirth: '1990-12-10',
        federationId: FED,
        acknowledgements: [{ versionId: TERMS, locale: 'sv' }],
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('ada@example.com');
  });

  it('shows the server’s age refusal too', async () => {
    vi.mocked(registerAccount).mockRejectedValue(
      new HttpError(400, { code: 'TOO_YOUNG', message: 'x' }),
    );
    const user = renderForm();
    await screen.findByRole('option', { name: 'Swedish Taido Federation' });
    await fill(user, '1990-12-10');
    await user.click(await screen.findByLabelText('I accept the terms of use'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/at least 13/)).toBeInTheDocument();
  });

  it('offers Google only when the page supplies it', async () => {
    renderForm();
    await screen.findByRole('option', { name: 'Swedish Taido Federation' });
    expect(screen.queryByRole('button', { name: 'Register with Google' })).not.toBeInTheDocument();
  });

  it('checks age, federation and terms before handing the intent to Google', async () => {
    vi.mocked(createGoogleRegistrationIntent).mockResolvedValue({ intent: 'intent-1' });
    const onGoogle = vi.fn().mockResolvedValue(undefined);
    const user = renderForm(onGoogle);
    await screen.findByRole('option', { name: 'Swedish Taido Federation' });

    await user.click(screen.getByRole('button', { name: 'Register with Google' }));
    expect(screen.getByText('Fill in every field.')).toBeInTheDocument();
    expect(createGoogleRegistrationIntent).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Date of birth'), '1990-12-10');
    await user.selectOptions(screen.getByLabelText('National federation'), FED);
    await user.click(await screen.findByLabelText('I accept the terms of use'));
    await user.click(screen.getByRole('button', { name: 'Register with Google' }));

    await waitFor(() => expect(onGoogle).toHaveBeenCalledWith('intent-1'));
    expect(createGoogleRegistrationIntent).toHaveBeenCalledWith({
      locale: 'en',
      dateOfBirth: '1990-12-10',
      federationId: FED,
      acknowledgements: [{ versionId: TERMS, locale: 'sv' }],
    });
    expect(registerAccount).not.toHaveBeenCalled();
  });
});
