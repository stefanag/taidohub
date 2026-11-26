import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/auth.api.js';

import { ForgotPasswordForm } from './ForgotPasswordForm.js';

import i18n from '@/i18n';

describe('<ForgotPasswordForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirms without saying whether the account exists', async () => {
    const spy = vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));

    expect(spy).toHaveBeenCalledWith('someone@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If there is an account for someone@example.com',
    );
  });

  it('checks the address before sending', async () => {
    const spy = vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send link' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('says so when the link could not be sent', async () => {
    vi.spyOn(api, 'requestPasswordReset').mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));

    expect(await screen.findByText(/could not be sent/)).toBeInTheDocument();
  });
});
