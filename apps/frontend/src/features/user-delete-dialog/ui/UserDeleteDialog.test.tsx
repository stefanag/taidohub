import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserDeleteDialog } from './UserDeleteDialog.js';

import type { User } from '@/entities/user';

import i18n from '@/i18n';

const TARGET: User = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'doomed@example.com',
  name: 'Doomed User',
  emailVerified: true,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof UserDeleteDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(
    <I18nextProvider i18n={i18n}>
      <UserDeleteDialog
        user={TARGET}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { onOpenChange, onConfirm, user: userEvent.setup() };
}

describe('<UserDeleteDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('disables Delete until the exact email is typed', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled();
  });

  it('keeps Delete disabled when the wrong email is typed', async () => {
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type the email/i), 'wrong@example.com');
    expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled();
  });

  it('enables Delete when the exact email is typed', async () => {
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type the email/i), TARGET.email);
    expect(screen.getByRole('button', { name: /delete user/i })).not.toBeDisabled();
  });

  it('calls onConfirm when Delete is clicked after typing the email', async () => {
    const { user, onConfirm, onOpenChange } = renderDialog();
    await user.type(screen.getByLabelText(/type the email/i), TARGET.email);
    await user.click(screen.getByRole('button', { name: /delete user/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows error and keeps dialog open when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('delete failed'));
    const { user, onOpenChange } = renderDialog({ onConfirm });
    await user.type(screen.getByLabelText(/type the email/i), TARGET.email);
    await user.click(screen.getByRole('button', { name: /delete user/i }));
    await screen.findByText(/delete failed/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
