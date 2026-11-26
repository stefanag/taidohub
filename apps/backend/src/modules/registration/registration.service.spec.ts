import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FixedWindowLimiter } from './rate-limiter.js';
import { RegistrationService } from './registration.service.js';

const FED = '22222222-2222-4222-8222-222222222222';

function isoYearsAgo(years: number, plusDays = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

function setup() {
  const internalAdapter = { deleteUser: vi.fn(), deleteUserSessions: vi.fn() };
  const auth = {
    api: {
      signUpEmail: vi.fn().mockResolvedValue({ user: { id: 'u-new' } }),
      sendVerificationEmail: vi.fn().mockResolvedValue({ status: true }),
    },
    $context: Promise.resolve({ internalAdapter }),
  };
  const db = { transaction: vi.fn((fn: (tx: unknown) => unknown) => fn('tx')) };
  const config = { get: vi.fn().mockReturnValue('https://taidohub.se') };
  const legal = {
    applicableForSelfRegistration: vi.fn().mockResolvedValue({ documents: [] }),
    prepareAcknowledgements: vi.fn().mockResolvedValue([{ userId: '', versionId: 'v-1' }]),
    recordAcknowledgements: vi.fn(),
  };
  const organisations = {
    isNationalFederation: vi.fn().mockResolvedValue(true),
    listNationalFederations: vi.fn(),
  };
  const profiles = { initialiseSelfRegistered: vi.fn() };
  const users = {
    verifyOwnPassword: vi.fn(),
    deleteOwnAccount: vi.fn(),
    forgetCachedUser: vi.fn(),
  };
  const rankHistory = { deleteAllForUser: vi.fn() };
  const service = new RegistrationService(
    auth as never,
    db as never,
    config as never,
    legal as never,
    organisations as never,
    profiles as never,
    users as never,
    rankHistory as never,
  );
  return { service, auth, internalAdapter, db, legal, organisations, profiles, users, rankHistory };
}

const input = (over: Record<string, unknown> = {}) => ({
  name: 'Ada',
  email: ' Ada@Example.com ',
  password: 'long-enough',
  locale: 'sv' as const,
  dateOfBirth: isoYearsAgo(30),
  federationId: FED,
  ...over,
});

describe('FixedWindowLimiter', () => {
  it('allows up to the limit per window and per key', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(2, 1000, () => now);
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.allow('b')).toBe(true);
    now = 1000;
    expect(limiter.allow('a')).toBe(true);
  });
});

describe('RegistrationService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  describe('register', () => {
    it('refuses anyone under 13, accepting the 13th birthday itself', async () => {
      await expect(
        ctx.service.register(input({ dateOfBirth: isoYearsAgo(13, 1) }), 'ip'),
      ).rejects.toMatchObject({
        response: { error: { code: 'TOO_YOUNG' } },
      });
      await expect(
        ctx.service.register(input({ dateOfBirth: isoYearsAgo(13) }), 'ip'),
      ).resolves.toEqual({
        status: 'verification_sent',
      });
    });

    it('refuses a birth date in the future', async () => {
      await expect(
        ctx.service.register(input({ dateOfBirth: isoYearsAgo(-1) }), 'ip'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses an organisation that is not a national federation', async () => {
      ctx.organisations.isNationalFederation.mockResolvedValue(false);
      await expect(ctx.service.register(input(), 'ip')).rejects.toThrow(BadRequestException);
      expect(ctx.auth.api.signUpEmail).not.toHaveBeenCalled();
    });

    it('checks the texts before creating the account', async () => {
      ctx.legal.prepareAcknowledgements.mockRejectedValue(new BadRequestException('missing'));
      await expect(ctx.service.register(input(), 'ip')).rejects.toThrow(BadRequestException);
      expect(ctx.auth.api.signUpEmail).not.toHaveBeenCalled();
    });

    it('creates the account, its profile and acknowledgements, and sends the confirmation', async () => {
      await ctx.service.register(input(), 'ip');
      expect(ctx.auth.api.signUpEmail).toHaveBeenCalledWith({
        body: { email: 'ada@example.com', password: 'long-enough', name: 'Ada', locale: 'sv' },
      });
      expect(ctx.internalAdapter.deleteUserSessions).toHaveBeenCalledWith('u-new');
      expect(ctx.profiles.initialiseSelfRegistered).toHaveBeenCalledWith(
        'u-new',
        { dateOfBirth: input().dateOfBirth, referenceFederationId: FED },
        'tx',
      );
      expect(ctx.legal.recordAcknowledgements).toHaveBeenCalledWith('tx', [
        { userId: 'u-new', versionId: 'v-1' },
      ]);
      expect(ctx.auth.api.sendVerificationEmail).toHaveBeenCalledWith({
        body: { email: 'ada@example.com', callbackURL: 'https://taidohub.se/verify-email' },
      });
    });

    it('answers an existing address like a new one, without sending anything', async () => {
      ctx.auth.api.signUpEmail.mockRejectedValue({
        body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
      });
      await expect(ctx.service.register(input(), 'ip')).resolves.toEqual({
        status: 'verification_sent',
      });
      expect(ctx.auth.api.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('removes the account again when the profile cannot be written', async () => {
      ctx.profiles.initialiseSelfRegistered.mockRejectedValue(new Error('db down'));
      await expect(ctx.service.register(input(), 'ip')).rejects.toThrow('db down');
      expect(ctx.internalAdapter.deleteUser).toHaveBeenCalledWith('u-new');
      expect(ctx.auth.api.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('limits attempts per address', async () => {
      for (let i = 0; i < 5; i += 1) await ctx.service.register(input(), 'same-ip');
      await expect(ctx.service.register(input(), 'same-ip')).rejects.toThrow(HttpException);
      await expect(ctx.service.register(input(), 'other-ip')).resolves.toBeDefined();
    });
  });

  describe('deleteOwnAccount', () => {
    const actor = { id: 'u-1' } as never;

    it('requires the current password', async () => {
      ctx.users.verifyOwnPassword.mockResolvedValue(false);
      await expect(ctx.service.deleteOwnAccount(actor, 'wrong')).rejects.toMatchObject({
        response: { error: { code: 'INVALID_PASSWORD' } },
      });
      expect(ctx.users.deleteOwnAccount).not.toHaveBeenCalled();
    });

    it('removes the own grading history before the user, in one transaction', async () => {
      ctx.users.verifyOwnPassword.mockResolvedValue(true);
      await ctx.service.deleteOwnAccount(actor, 'right');
      expect(ctx.rankHistory.deleteAllForUser).toHaveBeenCalledWith('u-1', 'tx');
      expect(ctx.users.deleteOwnAccount).toHaveBeenCalledWith(actor, 'tx');
      expect(ctx.rankHistory.deleteAllForUser.mock.invocationCallOrder[0]).toBeLessThan(
        ctx.users.deleteOwnAccount.mock.invocationCallOrder[0]!,
      );
      expect(ctx.users.forgetCachedUser).toHaveBeenCalledWith('u-1');
    });

    it('explains when gradings recorded for others keep the account', async () => {
      ctx.users.verifyOwnPassword.mockResolvedValue(true);
      ctx.users.deleteOwnAccount.mockRejectedValue({ cause: { code: '23503' } });
      await expect(ctx.service.deleteOwnAccount(actor, 'right')).rejects.toThrow(ConflictException);
    });
  });
});
