import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, hasDatabase } from '../../../test/helpers/app-factory.js';

import { VerificationTokenService } from './verification-token.service.js';

describe.skipIf(!hasDatabase())('VerificationTokenService (integration)', () => {
  let close: () => Promise<void>;
  let tokens: VerificationTokenService;

  beforeAll(async () => {
    const built = await buildTestApp();
    close = built.close;
    tokens = built.app.get(VerificationTokenService);
  });

  afterAll(async () => {
    await close();
  });

  it('issues a token that consume resolves to its identifier exactly once', async () => {
    const identifier = `test:${Date.now()}-a`;
    const value = await tokens.issueToken(identifier, 1);
    expect(value).toMatch(/^[0-9a-f]{64}$/);

    const first = await tokens.consumeToken(value);
    expect(first).toEqual({ identifier });

    const second = await tokens.consumeToken(value);
    expect(second).toBeNull();
  });

  it('invalidates the previous token when re-issuing for the same identifier', async () => {
    const identifier = `test:${Date.now()}-b`;
    const firstValue = await tokens.issueToken(identifier, 1);
    const secondValue = await tokens.issueToken(identifier, 1);
    expect(secondValue).not.toBe(firstValue);

    expect(await tokens.consumeToken(firstValue)).toBeNull();
    expect(await tokens.consumeToken(secondValue)).toEqual({ identifier });
  });

  it('reports hasUnexpiredToken true after issue and false after consume', async () => {
    const identifier = `test:${Date.now()}-c`;
    const value = await tokens.issueToken(identifier, 1);
    expect(await tokens.hasUnexpiredToken(identifier)).toBe(true);

    await tokens.consumeToken(value);
    expect(await tokens.hasUnexpiredToken(identifier)).toBe(false);
  });

  it('returns null for an unknown token value', async () => {
    expect(await tokens.consumeToken('deadbeef-not-a-real-token')).toBeNull();
  });
});
