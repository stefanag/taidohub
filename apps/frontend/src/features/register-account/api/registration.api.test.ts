import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  getRegistrationFederations,
  getRegistrationLegalTexts,
  registerAccount,
} from './registration.api.js';

import { httpClient } from '@/shared/api';

const mockedHttp = vi.mocked(httpClient);
const FED = '22222222-2222-4222-8222-222222222222';

describe('registration api', () => {
  it('lists federations', async () => {
    mockedHttp.mockResolvedValueOnce([
      { id: FED, nameEn: 'Fed', nameSv: 'Förbund', nameFi: 'Liitto', country: 'SWE' },
    ]);
    const out = await getRegistrationFederations();
    expect(mockedHttp).toHaveBeenCalledWith('/api/registration/federations');
    expect(out[0]?.nameSv).toBe('Förbund');
  });

  it('asks for the texts in a language', async () => {
    mockedHttp.mockResolvedValueOnce({ documents: [] });
    await getRegistrationLegalTexts('fi');
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/registration/legal-texts', {
      query: { locale: 'fi' },
    });
  });

  it('posts a registration and parses the neutral answer', async () => {
    mockedHttp.mockResolvedValueOnce({ status: 'verification_sent' });
    const input = {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'long-enough',
      locale: 'sv' as const,
      dateOfBirth: '1990-12-10',
      federationId: FED,
    };
    await expect(registerAccount(input)).resolves.toEqual({ status: 'verification_sent' });
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/registration', {
      method: 'POST',
      body: input,
    });
  });
});
