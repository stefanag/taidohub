import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidResetTokenError, requestPasswordReset, resetPassword } from './auth.api.js';

// better-auth's client is a proxy that vi.spyOn cannot patch, so the factory
// is mocked instead and hands out these stubs.
const client = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  useSession: vi.fn(),
}));
vi.mock('better-auth/react', () => ({ createAuthClient: () => client }));

const ok = { data: { status: true }, error: null };
const failure = (code: string) => ({ data: null, error: { code, message: code, status: 400 } });

describe('password reset api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for a reset link that lands on /reset-password of this origin', async () => {
    client.requestPasswordReset.mockResolvedValue(ok);

    await requestPasswordReset('a@example.com');

    expect(client.requestPasswordReset).toHaveBeenCalledWith({
      email: 'a@example.com',
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it('throws when the reset request fails', async () => {
    client.requestPasswordReset.mockResolvedValue(failure('RATE_LIMITED'));
    await expect(requestPasswordReset('a@example.com')).rejects.toThrow();
  });

  it('sets the new password with the token', async () => {
    client.resetPassword.mockResolvedValue(ok);
    await resetPassword('tok', 'new-password-1');
    expect(client.resetPassword).toHaveBeenCalledWith({ token: 'tok', newPassword: 'new-password-1' });
  });

  it('reports an unknown or expired token as InvalidResetTokenError', async () => {
    client.resetPassword.mockResolvedValue(failure('INVALID_TOKEN'));
    await expect(resetPassword('old', 'new-password-1')).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});
