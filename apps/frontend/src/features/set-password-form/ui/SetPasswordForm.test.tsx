import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SetPasswordForm } from './SetPasswordForm.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return { ...actual, setInitialPassword: vi.fn() };
});

import { setInitialPassword } from '@/entities/user/api/user.api.js';

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
});
