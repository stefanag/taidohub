import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { getMyProfile, getUserProfile, updateMyProfile } from './profile.api.js';

import { httpClient } from '@/shared/api';

const PROFILE_RESPONSE = {
  userId: 'u-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  taidoStartDate: '2015-09-01',
  addressStreet: '12 Analytical Way',
  addressPostalCode: '11122',
  addressCity: 'Stockholm',
  addressCountry: 'SWE',
  citizenships: ['SWE', 'GBR'],
};

const mockedHttp = vi.mocked(httpClient);

describe('profile api', () => {
  it('getMyProfile GETs /api/users/me/profile', async () => {
    mockedHttp.mockResolvedValueOnce(PROFILE_RESPONSE);
    const out = await getMyProfile();
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/me/profile');
    expect(out.firstName).toBe('Ada');
  });

  it('updateMyProfile PATCHes /api/users/me/profile with the patch body', async () => {
    mockedHttp.mockResolvedValueOnce(PROFILE_RESPONSE);
    await updateMyProfile({ firstName: 'Ada' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Ada' },
    });
  });

  it('getUserProfile GETs /api/users/:id/profile', async () => {
    mockedHttp.mockResolvedValueOnce(PROFILE_RESPONSE);
    await getUserProfile('u-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/u-1/profile');
  });
});
