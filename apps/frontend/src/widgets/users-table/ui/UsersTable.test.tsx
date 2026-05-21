import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UsersTable } from './UsersTable.js';

import type { User } from '@/entities/user';

import i18n from '@/i18n';


const USER_A: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  emailVerified: true,
  image: null,
  role: 'sysadmin',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const USER_B: User = {
  ...USER_A,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'grace@example.com',
  name: 'Grace Hopper',
  role: 'user',
  deactivatedAt: '2026-02-01T00:00:00.000Z',
};

describe('<UsersTable>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the empty state when there are no users', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UsersTable users={[]} onEdit={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/no users/i)).toBeInTheDocument();
  });

  it('renders one row per user with email and name', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UsersTable users={[USER_A, USER_B]} onEdit={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('calls onEdit with the user when a row is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <UsersTable users={[USER_A]} onEdit={onEdit} />
      </I18nextProvider>,
    );
    await user.click(screen.getByText('ada@example.com'));
    expect(onEdit).toHaveBeenCalledWith(USER_A);
  });
});
