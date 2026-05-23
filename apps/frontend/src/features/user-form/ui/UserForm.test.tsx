import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserForm } from './UserForm.js';

import type { User } from '@/entities/user';

import i18n from '@/i18n';

// Mock the underlying API modules so the query-options factories pick up the
// stubs. Mocking the barrel alone wouldn't reach the captured references.
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});
vi.mock('@/entities/membership/api/membership.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/membership/api/membership.api.js')>();
  return { ...actual, listMemberships: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});
vi.mock('@/entities/profile/api/profile.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/profile/api/profile.api.js')>();
  return {
    ...actual,
    getUserProfile: vi.fn().mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1990-12-10',
      taidoStartDate: '2015-09-01',
      addressStreet: '12 Analytical Way',
      addressPostalCode: '11122',
      addressCity: 'Stockholm',
      addressCountry: 'SWE',
      citizenships: ['SWE', 'GBR'],
    }),
  };
});

const TARGET: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  emailVerified: true,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderForm(overrides: Partial<React.ComponentProps<typeof UserForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <UserForm
          user={TARGET}
          currentUserId="some-other-admin"
          onSubmit={onSubmit}
          {...overrides}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('<UserForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the email read-only', () => {
    renderForm();
    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveValue('ada@example.com');
    expect(email).toBeDisabled();
  });

  it('submits a changed name', async () => {
    const { onSubmit, user } = renderForm();
    const name = screen.getByLabelText(/name/i);
    await user.clear(name);
    await user.type(name, 'Ada L.');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada L.' });
  });

  it('disables the role select when editing yourself', () => {
    renderForm({ currentUserId: TARGET.id });
    expect(screen.getByRole('combobox', { name: /role/i })).toBeDisabled();
  });

  it('enables the role select when editing someone else', () => {
    renderForm({ currentUserId: 'some-other-admin' });
    expect(screen.getByRole('combobox', { name: /role/i })).not.toBeDisabled();
  });

  it('hides the lifecycle section when editing yourself', () => {
    renderForm({ currentUserId: TARGET.id });
    expect(screen.queryByText(/account lifecycle/i)).not.toBeInTheDocument();
  });

  it('shows the lifecycle section when editing someone else', () => {
    renderForm({ currentUserId: 'some-other-admin' });
    expect(screen.getByText(/account lifecycle/i)).toBeInTheDocument();
  });

  it('shows Deactivate for an active user', () => {
    renderForm({ currentUserId: 'some-other-admin' });
    expect(screen.getByRole('button', { name: /^deactivate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reactivate$/i })).not.toBeInTheDocument();
  });

  it('shows Reactivate for a deactivated user', () => {
    renderForm({
      currentUserId: 'some-other-admin',
      user: { ...TARGET, deactivatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(screen.getByRole('button', { name: /^reactivate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^deactivate$/i })).not.toBeInTheDocument();
  });

  it('clicking Deactivate calls onDeactivate', async () => {
    const onDeactivate = vi.fn();
    const { user } = renderForm({ currentUserId: 'some-other-admin', onDeactivate });
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('clicking Reactivate calls onReactivate', async () => {
    const onReactivate = vi.fn();
    const { user } = renderForm({
      currentUserId: 'some-other-admin',
      user: { ...TARGET, deactivatedAt: '2026-01-01T00:00:00.000Z' },
      onReactivate,
    });
    await user.click(screen.getByRole('button', { name: /^reactivate$/i }));
    expect(onReactivate).toHaveBeenCalledTimes(1);
  });

  it('clicking Send password reset calls onSendPasswordReset', async () => {
    const onSendPasswordReset = vi.fn();
    const { user } = renderForm({ currentUserId: 'some-other-admin', onSendPasswordReset });
    await user.click(screen.getByRole('button', { name: /send password reset/i }));
    expect(onSendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('clicking Delete calls onDelete', async () => {
    const onDelete = vi.fn();
    const { user } = renderForm({ currentUserId: 'some-other-admin', onDelete });
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error message when a lifecycle callback rejects', async () => {
    const onDeactivate = vi.fn().mockRejectedValue(new Error('boom'));
    const { user } = renderForm({ currentUserId: 'some-other-admin', onDeactivate });
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/boom/i);
  });

  it('renders the fetched profile read-only in the Profile tab', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('tab', { name: /profile/i }));
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Stockholm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
  });
});
