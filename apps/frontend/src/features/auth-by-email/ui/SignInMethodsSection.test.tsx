import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth.api.js';

import { SignInMethodsSection } from './SignInMethodsSection.js';

import i18n from '@/i18n';

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SignInMethodsSection email="alex@example.com" />
    </QueryClientProvider>,
  );
}

describe('<SignInMethodsSection>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/profile');
    vi.spyOn(authApi, 'getSignInProviders').mockResolvedValue({ google: true });
  });

  it('offers to connect Google to a password account', async () => {
    vi.spyOn(authApi, 'listSignInAccounts').mockResolvedValue([
      { id: 'a1', providerId: 'credential' },
    ]);
    const link = vi.spyOn(authApi, 'linkGoogle').mockResolvedValue();
    renderSection();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Connect Google' }));
    expect(link).toHaveBeenCalled();
  });

  it('removes Google when there is another way to sign in', async () => {
    vi.spyOn(authApi, 'listSignInAccounts').mockResolvedValue([
      { id: 'a1', providerId: 'credential' },
      { id: 'a2', providerId: 'google' },
    ]);
    const unlink = vi.spyOn(authApi, 'unlinkSignInAccount').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSection();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remove' }));
    expect(unlink).toHaveBeenCalledWith('a2');
    expect(await screen.findByRole('status')).toHaveTextContent('Google is removed');
  });

  it('never offers to remove the only way to sign in, but offers a password', async () => {
    vi.spyOn(authApi, 'listSignInAccounts').mockResolvedValue([{ id: 'a2', providerId: 'google' }]);
    const reset = vi.spyOn(authApi, 'requestPasswordReset').mockResolvedValue();
    renderSection();
    expect(await screen.findByText('Your only way to sign in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add a password' }));
    expect(reset).toHaveBeenCalledWith('alex@example.com');
  });

  it('explains a failed link and cleans the address', async () => {
    window.history.replaceState(
      null,
      '',
      '/profile?error=account_already_linked_to_different_user',
    );
    vi.spyOn(authApi, 'listSignInAccounts').mockResolvedValue([
      { id: 'a1', providerId: 'credential' },
    ]);
    renderSection();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already connected to another TaidoHub account',
    );
    expect(window.location.search).toBe('');
  });

  it('asks for a fresh sign-in when the session is too old to remove a method', async () => {
    vi.spyOn(authApi, 'listSignInAccounts').mockResolvedValue([
      { id: 'a1', providerId: 'credential' },
      { id: 'a2', providerId: 'google' },
    ]);
    vi.spyOn(authApi, 'unlinkSignInAccount').mockRejectedValue(new authApi.SessionNotFreshError());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSection();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('sign out and in again');
  });
});
