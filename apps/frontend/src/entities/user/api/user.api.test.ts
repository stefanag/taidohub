import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  deactivateUser,
  deleteUser,
  inviteUser,
  reactivateUser,
  sendPasswordReset,
  setInitialPassword,
} from './user.api.js';

import { httpClient } from '@/shared/api';


const USER_RESPONSE = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'new@example.com',
  name: 'New User',
  emailVerified: false,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('user lifecycle api', () => {
  it('inviteUser POSTs to /api/users/invite', async () => {
    mockedHttp.mockResolvedValueOnce(USER_RESPONSE);
    await inviteUser({ email: 'new@example.com', name: 'New User' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/invite', {
      method: 'POST',
      body: { email: 'new@example.com', name: 'New User' },
    });
  });

  it('deactivateUser PATCHes /api/users/:id/deactivate', async () => {
    mockedHttp.mockResolvedValueOnce({ ...USER_RESPONSE, deactivatedAt: '2026-05-21T01:00:00.000Z' });
    await deactivateUser(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/users/${USER_RESPONSE.id}/deactivate`, {
      method: 'PATCH',
    });
  });

  it('reactivateUser PATCHes /api/users/:id/reactivate', async () => {
    mockedHttp.mockResolvedValueOnce(USER_RESPONSE);
    await reactivateUser(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/users/${USER_RESPONSE.id}/reactivate`, {
      method: 'PATCH',
    });
  });

  it('deleteUser DELETEs /api/users/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteUser(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/users/${USER_RESPONSE.id}`, {
      method: 'DELETE',
    });
  });

  it('sendPasswordReset POSTs /api/users/:id/send-password-reset', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await sendPasswordReset(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/users/${USER_RESPONSE.id}/send-password-reset`,
      { method: 'POST' },
    );
  });

  it('setInitialPassword POSTs /api/auth/set-initial-password', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await setInitialPassword({ token: 'tok', password: 'longenough' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/auth/set-initial-password', {
      method: 'POST',
      body: { token: 'tok', password: 'longenough' },
    });
  });
});
