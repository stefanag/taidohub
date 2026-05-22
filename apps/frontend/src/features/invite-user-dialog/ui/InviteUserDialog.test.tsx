import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteUserDialog } from './InviteUserDialog.js';

import { addUser, inviteUser } from '@/entities/user/api/user.api.js';
import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

// Mock the entity API module by its deep path — user.queries.ts imports the
// fetcher from there directly, so mocking the barrel would not reach it.
vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return { ...actual, inviteUser: vi.fn(), addUser: vi.fn() };
});


const mockedInvite = vi.mocked(inviteUser);
const mockedAdd = vi.mocked(addUser);

function renderDialog(overrides: Partial<React.ComponentProps<typeof InviteUserDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onInvited = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <InviteUserDialog open onOpenChange={onOpenChange} onInvited={onInvited} {...overrides} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange, onInvited, user: userEvent.setup() };
}

const INVITED_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'new@example.com',
  name: null,
  emailVerified: false,
  image: null,
  role: 'user' as const,
  deactivatedAt: null,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const ADD_RESPONSE = {
  user: INVITED_USER,
  setPasswordUrl: 'http://localhost:5173/set-password?token=abc',
};

describe('<InviteUserDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedInvite.mockReset();
    mockedAdd.mockReset();
  });

  it('renders an email and a name field', () => {
    renderDialog();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('submits the entered email to inviteUser', async () => {
    mockedInvite.mockResolvedValueOnce(INVITED_USER);
    const { user, onInvited } = renderDialog();
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() => {
      expect(mockedInvite).toHaveBeenCalledWith({ email: 'new@example.com' }, expect.anything());
    });
    expect(onInvited).toHaveBeenCalledWith(INVITED_USER);
  });

  it('shows the mapped error when the API rejects with EMAIL_IN_USE', async () => {
    mockedInvite.mockRejectedValueOnce(
      new HttpError(409, { code: 'EMAIL_IN_USE', message: 'in use' }),
    );
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('clicking "Add directly" reveals the role select', async () => {
    const { user } = renderDialog();
    // Role field should not be visible in invite mode
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
    // Switch to add mode
    await user.click(screen.getByRole('button', { name: /add directly/i }));
    // Role field should now be visible
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  it('in add mode, submitting calls addUser with email and role', async () => {
    mockedAdd.mockResolvedValueOnce(ADD_RESPONSE);
    const { user } = renderDialog();
    await user.click(screen.getByRole('button', { name: /add directly/i }));
    await user.type(screen.getByLabelText(/email/i), 'direct@example.com');
    await user.click(screen.getByRole('button', { name: /add user/i }));
    await waitFor(() => {
      expect(mockedAdd).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'direct@example.com', role: 'user' }),
        expect.anything(),
      );
    });
  });

  it('after successful addUser the dialog shows the set-password link', async () => {
    mockedAdd.mockResolvedValueOnce(ADD_RESPONSE);
    const { user } = renderDialog();
    await user.click(screen.getByRole('button', { name: /add directly/i }));
    await user.type(screen.getByLabelText(/email/i), 'direct@example.com');
    await user.click(screen.getByRole('button', { name: /add user/i }));
    expect(
      await screen.findByDisplayValue(/set-password\?token=abc/),
    ).toBeInTheDocument();
  });
});
