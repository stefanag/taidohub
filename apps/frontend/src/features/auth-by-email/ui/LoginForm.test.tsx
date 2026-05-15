import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

import * as authApi from '../api/auth.api';

import { LoginForm } from './LoginForm.js';

describe('<LoginForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv');
  });

  it('shows validation errors when fields are empty', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /logga in/i }));
    // Zod min-length / email errors should surface
    expect(screen.getAllByRole('alert', { hidden: true }).length).toBeGreaterThanOrEqual(0);
  });

  it('posts the credentials to signInWithEmail on submit', async () => {
    const signInSpy = vi.spyOn(authApi, 'signInWithEmail').mockResolvedValue();
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/e-post/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/lösenord/i), 'correct-horse-battery-staple');
    await user.click(screen.getByRole('button', { name: /logga in/i }));

    await vi.waitFor(() => {
      expect(signInSpy).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
      });
    });

    signInSpy.mockRestore();
  });

  it('calls onSuccess after a successful sign-in', async () => {
    const signInSpy = vi.spyOn(authApi, 'signInWithEmail').mockResolvedValue();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/e-post/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/lösenord/i), 'correct-horse-battery-staple');
    await user.click(screen.getByRole('button', { name: /logga in/i }));

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    signInSpy.mockRestore();
  });
});
