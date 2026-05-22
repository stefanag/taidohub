import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';

import { AuthService } from './auth.service.js';

const FAKE_TX = { __tx: true } as any;

const TARGET_USER = {
  id: 'u-target',
  email: 'target@example.com',
  name: 'Target',
  emailVerified: false,
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null as Date | null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function tokensStub() {
  return {
    issueToken: vi.fn(),
    consumeToken: vi.fn(),
    hasUnexpiredToken: vi.fn(),
  };
}

function authStub() {
  return {
    $context: Promise.resolve({ password: { hash: vi.fn().mockResolvedValue('hashed-pw') } }),
    api: { signInEmail: vi.fn().mockResolvedValue({ headers: new Headers() }) },
  };
}

/**
 * A fake Drizzle-ish db. `select()` returns a thenable builder whose resolved
 * value is set per-test via `selectResult`. `transaction(cb)` runs cb(FAKE_TX)
 * where the tx object also exposes select/insert/update builders.
 */
function dbStub(opts: {
  userRows: unknown[];
  accountRows: unknown[];
}) {
  let selectCall = 0;
  const makeSelectBuilder = (rows: unknown[]) => {
    const builder: any = {
      from: () => builder,
      where: () => builder,
      limit: () => Promise.resolve(rows),
      then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  };
  const txInsert = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
  const txUpdate = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }));
  const tx = {
    select: vi.fn(() => {
      // first select inside the tx is the credential account lookup
      return makeSelectBuilder(opts.accountRows);
    }),
    insert: txInsert,
    update: txUpdate,
  };
  return {
    select: vi.fn(() => {
      // top-level select is the user lookup
      selectCall += 1;
      return makeSelectBuilder(opts.userRows);
    }),
    transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    __tx: tx,
    __txInsert: txInsert,
    __txUpdate: txUpdate,
    __selectCalls: () => selectCall,
  };
}

async function makeService(
  tokens: ReturnType<typeof tokensStub>,
  auth: ReturnType<typeof authStub>,
  db: ReturnType<typeof dbStub>,
) {
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: VerificationTokenService, useValue: tokens },
      { provide: BETTER_AUTH, useValue: auth },
      { provide: DRIZZLE, useValue: db },
    ],
  }).compile();
  return module.get(AuthService);
}

describe('AuthService — setInitialPassword', () => {
  let tokens: ReturnType<typeof tokensStub>;
  let auth: ReturnType<typeof authStub>;

  beforeEach(() => {
    tokens = tokensStub();
    auth = authStub();
  });

  it('throws INVALID_TOKEN when the token cannot be consumed', async () => {
    tokens.consumeToken.mockResolvedValue(null);
    const db = dbStub({ userRows: [], accountRows: [] });
    const service = await makeService(tokens, auth, db);
    await expect(
      service.setInitialPassword({ token: 'bad', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws INVALID_TOKEN when the identifier has no known prefix', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'weird:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const service = await makeService(tokens, auth, db);
    await expect(
      service.setInitialPassword({ token: 'tok', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws INVALID_TOKEN when the user no longer exists', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const db = dbStub({ userRows: [], accountRows: [] });
    const service = await makeService(tokens, auth, db);
    await expect(
      service.setInitialPassword({ token: 'tok', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hashes, inserts a credential account, and returns sign-in headers for an invite token', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const service = await makeService(tokens, auth, db);

    const headers = await service.setInitialPassword({ token: 'tok', password: 'longenough' });

    expect(headers).toBeInstanceOf(Headers);
    expect(db.__txInsert).toHaveBeenCalled();
    expect(auth.api.signInEmail).toHaveBeenCalledWith({
      returnHeaders: true,
      body: { email: 'target@example.com', password: 'longenough' },
    });
  });

  it('updates the existing credential account for an admin-reset token', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'admin-reset:u-target' });
    const db = dbStub({
      userRows: [TARGET_USER],
      accountRows: [{ id: 'acc-1', userId: 'u-target', providerId: 'credential' }],
    });
    const service = await makeService(tokens, auth, db);

    await service.setInitialPassword({ token: 'tok', password: 'longenough' });

    expect(db.__txUpdate).toHaveBeenCalled();
    expect(db.__txInsert).not.toHaveBeenCalled();
  });

  it('throws INVALID_TOKEN for a deactivated user without writing any state or signing in', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const deactivatedUser = { ...TARGET_USER, deactivatedAt: new Date('2026-03-01T00:00:00.000Z') };
    const db = dbStub({ userRows: [deactivatedUser], accountRows: [] });
    const service = await makeService(tokens, auth, db);

    await expect(
      service.setInitialPassword({ token: 'tok', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);

    expect(db.__txInsert).not.toHaveBeenCalled();
    expect(db.__txUpdate).not.toHaveBeenCalled();
    expect(auth.api.signInEmail).not.toHaveBeenCalled();
  });
});
