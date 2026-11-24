import { describe, expect, it } from 'vitest';

import { type DrizzleDb } from '../client.js';

import { assertDemoSeedAllowed, seedDemoData } from './demo-data.seed.js';

describe('assertDemoSeedAllowed', () => {
  it.each(['https://taidohub.se', 'https://www.taidohub.se'])('refuses production (%s)', (url) => {
    expect(() => assertDemoSeedAllowed({ BETTER_AUTH_URL: url })).toThrow(/production/);
  });

  it.each(['https://staging.taidohub.se', 'http://localhost:3001'])('allows %s', (url) => {
    expect(() => assertDemoSeedAllowed({ BETTER_AUTH_URL: url })).not.toThrow();
  });
});

describe('seedDemoData', () => {
  it('refuses a short shared password before touching the database', async () => {
    await expect(
      seedDemoData({} as DrizzleDb, {
        signUpEmail: async () => undefined,
        sysadminEmail: 'admin@example.com',
        password: 'short',
      }),
    ).rejects.toThrow(/at least 12/);
  });
});
