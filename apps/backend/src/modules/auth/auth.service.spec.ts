import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';
import { LegalDocumentsService } from '../legal-documents/legal-documents.service.js';

import { AuthService } from './auth.service.js';

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
  const stub = {
    issueToken: vi.fn(),
    consumeToken: vi.fn(),
    // By default a peek sees what a consume would return, without consuming.
    peekToken: vi.fn((value: string) => stub.consumeToken.getMockImplementation()?.(value) ?? stub.consumeToken(value)),
    hasUnexpiredToken: vi.fn(),
  };
  return stub;
}

function legalStub() {
  return {
    applicableForMember: vi.fn().mockResolvedValue({ documents: [] }),
    prepareAcknowledgements: vi.fn().mockResolvedValue([]),
    recordAcknowledgements: vi.fn().mockResolvedValue(undefined),
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
    const builder: Record<string, unknown> = {
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
  legal: ReturnType<typeof legalStub> = legalStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: VerificationTokenService, useValue: tokens },
      { provide: BETTER_AUTH, useValue: auth },
      { provide: DRIZZLE, useValue: db },
      { provide: LegalDocumentsService, useValue: legal },
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

  it('records the accepted texts of an invitation in the password transaction', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const legal = legalStub();
    const rows = [{ userId: 'u-target', versionId: 'v-1' }];
    legal.prepareAcknowledgements.mockResolvedValue(rows);
    const service = await makeService(tokens, auth, db, legal);
    const acknowledgements = [{ versionId: '0b0c2c1e-8f0a-4c41-9a3e-2b8f7e6d5c4b', locale: 'sv' as const }];

    await service.setInitialPassword({ token: 'tok', password: 'longenough', acknowledgements });

    expect(legal.applicableForMember).toHaveBeenCalledWith('u-target');
    expect(legal.prepareAcknowledgements).toHaveBeenCalledWith(
      'u-target',
      { documents: [] },
      acknowledgements,
      'invitation',
    );
    expect(legal.recordAcknowledgements).toHaveBeenCalledWith(expect.anything(), rows);
  });

  it('keeps the invitation link when the texts were not accepted', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const legal = legalStub();
    legal.prepareAcknowledgements.mockRejectedValue(new BadRequestException('LEGAL_ACKNOWLEDGEMENT_REQUIRED'));
    const service = await makeService(tokens, auth, db, legal);

    await expect(service.setInitialPassword({ token: 'tok', password: 'longenough' })).rejects.toThrow(
      BadRequestException,
    );
    expect(tokens.consumeToken).not.toHaveBeenCalled();
  });

  it('asks for no texts on a password reset', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'admin-reset:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const legal = legalStub();
    const service = await makeService(tokens, auth, db, legal);

    await service.setInitialPassword({ token: 'tok', password: 'longenough' });

    expect(legal.applicableForMember).not.toHaveBeenCalled();
    expect(legal.recordAcknowledgements).not.toHaveBeenCalled();
  });
});
