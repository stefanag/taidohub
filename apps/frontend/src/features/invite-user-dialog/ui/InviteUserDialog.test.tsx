import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteUserDialog } from './InviteUserDialog.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

// Mock the entity API module by its deep path — user.queries.ts imports the
// fetcher from there directly, so mocking the barrel would not reach it.
vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return { ...actual, inviteUser: vi.fn() };
});

import { inviteUser } from '@/entities/user/api/user.api.js';

const mockedInvite = vi.mocked(inviteUser);

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

describe('<InviteUserDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedInvite.mockReset();
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
});
