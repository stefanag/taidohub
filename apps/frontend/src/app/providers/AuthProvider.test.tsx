import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '@/features/auth-by-email';
import i18n from '@/i18n';

import { AuthProvider } from './AuthProvider.js';

describe('<AuthProvider>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  // `vi.spyOn(i18n, 'changeLanguage')` rewires the method on the singleton; if
  // we don't restore between tests, the spy persists and accumulates calls
  // from every test's `beforeEach`-driven `changeLanguage('en')`.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call changeLanguage when there is no session', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);
    const spy = vi.spyOn(i18n, 'changeLanguage');

    render(<AuthProvider>x</AuthProvider>);

    expect(spy).not.toHaveBeenCalled();
  });

  it('reconciles to the DB locale when the session resolves', async () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b', locale: 'fi' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    render(<AuthProvider>x</AuthProvider>);

    // useEffect runs after render — wait a tick.
    await Promise.resolve();
    expect(i18n.language).toBe('fi');
  });

  it('does not call changeLanguage when DB locale already matches', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b', locale: 'en' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);
    const spy = vi.spyOn(i18n, 'changeLanguage');

    render(<AuthProvider>x</AuthProvider>);

    expect(spy).not.toHaveBeenCalled();
  });
});
