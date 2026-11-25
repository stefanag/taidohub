import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthConsentPage } from './OAuthConsentPage.js';

import * as authFeature from '@/features/auth-by-email';
import i18n from '@/i18n';


const CLIENT_ID = 'https://claude.ai/oauth/mcp-client-metadata';

describe('<OAuthConsentPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the client by its host and lists the requested scopes', () => {
    render(<OAuthConsentPage clientId={CLIENT_ID} scopes={['openid', 'offline_access']} />);

    expect(screen.getByText(/claude\.ai wants to access TaidoHub/i)).toBeInTheDocument();
    expect(screen.getByText(CLIENT_ID)).toBeInTheDocument();
    expect(screen.getByText('openid')).toBeInTheDocument();
    expect(screen.getByText('offline_access')).toBeInTheDocument();
  });

  it.each([
    ['Allow', true],
    ['Deny', false],
  ] as const)('sends the answer on %s and follows the redirect', async (button, accept) => {
    const respond = vi
      .spyOn(authFeature, 'respondToOAuthConsent')
      .mockResolvedValue('https://claude.ai/callback?code=abc');
    const onRedirect = vi.fn();
    const user = userEvent.setup();
    render(<OAuthConsentPage clientId={CLIENT_ID} scopes={[]} onRedirect={onRedirect} />);

    await user.click(screen.getByRole('button', { name: button }));

    await vi.waitFor(() => {
      expect(respond).toHaveBeenCalledWith(accept);
      expect(onRedirect).toHaveBeenCalledWith('https://claude.ai/callback?code=abc');
    });
  });

  it('explains when the user may not connect an AI client, and disables the buttons', async () => {
    vi.spyOn(authFeature, 'respondToOAuthConsent').mockRejectedValue(
      new authFeature.OAuthConsentNotAllowedError(),
    );
    const onRedirect = vi.fn();
    const user = userEvent.setup();
    render(<OAuthConsentPage clientId={CLIENT_ID} scopes={[]} onRedirect={onRedirect} />);

    await user.click(screen.getByRole('button', { name: 'Allow' }));

    expect(
      await screen.findByText(/Only sysadmins and organisation admins can connect/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
    expect(onRedirect).not.toHaveBeenCalled();
  });

  it('shows a generic error when the request fails', async () => {
    vi.spyOn(authFeature, 'respondToOAuthConsent').mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<OAuthConsentPage clientId={CLIENT_ID} scopes={[]} onRedirect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Deny' }));

    expect(await screen.findByText(/Something went wrong/i)).toBeInTheDocument();
  });
});
