import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth.api.js';

import { GoogleSignInButton } from './GoogleSignInButton.js';

import i18n from '@/i18n';

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <GoogleSignInButton />
    </QueryClientProvider>,
  );
}

describe('<GoogleSignInButton>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
  });

  it('is not shown when the server has no Google sign-in', async () => {
    const providers = vi.spyOn(authApi, 'getSignInProviders').mockResolvedValue({ google: false });
    renderButton();
    await vi.waitFor(() => expect(providers).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('starts the Google sign-in', async () => {
    vi.spyOn(authApi, 'getSignInProviders').mockResolvedValue({ google: true });
    const signIn = vi.spyOn(authApi, 'signInWithGoogle').mockResolvedValue();
    renderButton();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Sign in with Google' }));
    expect(signIn).toHaveBeenCalled();
  });
});
