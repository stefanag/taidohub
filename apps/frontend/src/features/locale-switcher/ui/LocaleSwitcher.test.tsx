import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as authApi from '@/features/auth-by-email';
import i18n from '@/i18n';

// Replace the auth.api module's `authClient` with a plain object whose
// `updateUser` we can spy on. better-auth's real React client is a Proxy
// whose `get` trap always resolves to a dynamic dispatcher, so assigning
// to `authClient.updateUser` from the test would silently no-op. The real
// `useSession` is preserved so individual tests can `vi.spyOn` it.
vi.mock('@/features/auth-by-email/api/auth.api', async () => {
  const actual =
    await vi.importActual<typeof import('@/features/auth-by-email/api/auth.api')>(
      '@/features/auth-by-email/api/auth.api',
    );
  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      updateUser: vi.fn().mockResolvedValue({ data: { user: {} } }),
    },
  };
});

import { LocaleSwitcher } from './LocaleSwitcher.js';

describe('<LocaleSwitcher>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    vi.mocked(
      authApi.authClient as unknown as { updateUser: ReturnType<typeof vi.fn> },
    ).updateUser.mockClear();
  });

  it('renders three options: English, Svenska, Suomi', () => {
    render(<LocaleSwitcher />);
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Svenska' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Suomi' })).toBeInTheDocument();
  });

  it('switches i18n.language and writes localStorage when selected (anonymous)', async () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.selectOptions(screen.getByRole('combobox'), 'sv');

    expect(i18n.language).toBe('sv');
    expect(localStorage.getItem('i18nextLng')).toBe('sv');
  });

  it('calls authClient.updateUser when selected by an authenticated user', async () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b', locale: 'en' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);
    const updateUser = (
      authApi.authClient as unknown as { updateUser: ReturnType<typeof vi.fn> }
    ).updateUser;

    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.selectOptions(screen.getByRole('combobox'), 'fi');

    expect(i18n.language).toBe('fi');
    expect(updateUser).toHaveBeenCalledWith({ locale: 'fi' });
  });
});
