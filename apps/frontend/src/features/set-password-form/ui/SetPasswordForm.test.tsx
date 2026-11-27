import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SetPasswordForm } from './SetPasswordForm.js';

import { acceptLinkWithGoogle, setInitialPassword } from '@/entities/user/api/user.api.js';
import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return { ...actual, setInitialPassword: vi.fn(), acceptLinkWithGoogle: vi.fn() };
});

const mockedSet = vi.mocked(setInitialPassword);

function renderForm() {
  render(
    <I18nextProvider i18n={i18n}>
      <SetPasswordForm token="tok-abc" />
    </I18nextProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<SetPasswordForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedSet.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders password and confirm fields', () => {
    renderForm();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('shows a mismatch error and does not submit when the passwords differ', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'different22');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('submits matching, long-enough passwords and navigates to /dashboard', async () => {
    mockedSet.mockResolvedValueOnce(undefined);
    const assignMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign: assignMock });
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough1');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => {
      expect(mockedSet).toHaveBeenCalledWith({ token: 'tok-abc', password: 'longenough1' });
    });
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows the invalid-token message when the API rejects with INVALID_TOKEN', async () => {
    mockedSet.mockRejectedValueOnce(
      new HttpError(400, { code: 'INVALID_TOKEN', message: 'bad' }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough1');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });

  it('requires the applicable terms and privacy notice and sends what was shown', async () => {
    mockedSet.mockResolvedValueOnce(undefined);
    vi.stubGlobal('location', { ...window.location, assign: vi.fn() });
    const doc = (kind: 'terms' | 'privacy', versionId: string, title: string) => ({
      documentId: versionId,
      kind,
      audience: 'members' as const,
      organisationId: kind === 'terms' ? null : 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
      versionId,
      version: 1,
      publishedAt: '2026-11-26T10:00:00.000Z',
      authoritativeLocale: 'sv' as const,
      availableLocales: ['sv' as const],
      translation: { locale: 'sv' as const, revision: 1, title, body: { ops: [] } },
      isFallback: false,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <SetPasswordForm
          token="tok-abc"
          legalTexts={[
            doc('terms', '11111111-1111-4111-8111-111111111111', 'Villkor'),
            doc('privacy', '22222222-2222-4222-8222-222222222222', 'Integritet'),
          ]}
        />
      </I18nextProvider>,
    );
    const user = userEvent.setup();
    expect(screen.getByRole('link', { name: 'Integritet' })).toHaveAttribute(
      'href',
      '/legal/c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e/privacy',
    );
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough1');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/accept the terms/i);
    expect(mockedSet).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('I accept the terms of use'));
    await user.click(screen.getByLabelText('I have read the privacy notice'));
    await user.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() =>
      expect(mockedSet).toHaveBeenCalledWith({
        token: 'tok-abc',
        password: 'longenough1',
        acknowledgements: [
          { versionId: '11111111-1111-4111-8111-111111111111', locale: 'sv' },
          { versionId: '22222222-2222-4222-8222-222222222222', locale: 'sv' },
        ],
      }),
    );
  });

  it('offers Google only when the page supplies it', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SetPasswordForm token="tok-abc" />
      </I18nextProvider>,
    );
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it('accepts the link and texts without a password, then continues with Google', async () => {
    vi.mocked(acceptLinkWithGoogle).mockResolvedValueOnce(undefined);
    const onGoogle = vi.fn().mockResolvedValue(undefined);
    const terms = {
      documentId: '11111111-1111-4111-8111-111111111111',
      kind: 'terms' as const,
      audience: 'members' as const,
      organisationId: null,
      versionId: '11111111-1111-4111-8111-111111111111',
      version: 1,
      publishedAt: '2026-11-26T10:00:00.000Z',
      authoritativeLocale: 'sv' as const,
      availableLocales: ['sv' as const],
      translation: { locale: 'sv' as const, revision: 1, title: 'Villkor', body: { ops: [] } },
      isFallback: false,
    };
    render(
      <I18nextProvider i18n={i18n}>
        <SetPasswordForm token="tok-abc" legalTexts={[terms]} onContinueWithGoogle={onGoogle} />
      </I18nextProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/accept the terms/i);
    expect(acceptLinkWithGoogle).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('I accept the terms of use'));
    await user.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(onGoogle).toHaveBeenCalled());
    expect(acceptLinkWithGoogle).toHaveBeenCalledWith({
      token: 'tok-abc',
      acknowledgements: [{ versionId: terms.versionId, locale: 'sv' }],
    });
    expect(mockedSet).not.toHaveBeenCalled();
  });
});
