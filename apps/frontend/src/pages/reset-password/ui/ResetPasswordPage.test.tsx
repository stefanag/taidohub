import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPasswordPage } from './ResetPasswordPage.js';

import i18n from '@/i18n';

// better-auth's client is a proxy that vi.spyOn cannot patch, so the factory
// is mocked instead and hands out this stub.
const client = vi.hoisted(() => ({ resetPassword: vi.fn(), useSession: vi.fn() }));
vi.mock('better-auth/react', () => ({ createAuthClient: () => client }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

describe('<ResetPasswordPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets the new password and offers to sign in', async () => {
    client.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<ResetPasswordPage token="tok" />);

    await user.type(screen.getByLabelText('Password'), 'new-password-1');
    await user.type(screen.getByLabelText('Confirm password'), 'new-password-1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(client.resetPassword).toHaveBeenCalledWith({ token: 'tok', newPassword: 'new-password-1' });
    expect(await screen.findByRole('status')).toHaveTextContent('Your password has been changed.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('refuses passwords that do not match', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage token="tok" />);

    await user.type(screen.getByLabelText('Password'), 'new-password-1');
    await user.type(screen.getByLabelText('Confirm password'), 'new-password-2');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(client.resetPassword).not.toHaveBeenCalled();
  });

  it.each([
    ['better-auth reports the link as expired', { token: undefined, error: 'INVALID_TOKEN' }],
    ['the link has no token', { token: undefined, error: undefined }],
  ])('offers a new link when %s', (_label, props) => {
    render(<ResetPasswordPage {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('This link is invalid or has expired.');
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('offers a new link when the token is rejected on submit', async () => {
    client.resetPassword.mockResolvedValue({ data: null, error: { code: 'INVALID_TOKEN', status: 400 } });
    const user = userEvent.setup();
    render(<ResetPasswordPage token="used" />);

    await user.type(screen.getByLabelText('Password'), 'new-password-1');
    await user.type(screen.getByLabelText('Confirm password'), 'new-password-1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This link is invalid or has expired.');
  });
});
