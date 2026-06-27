import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

import { AccountController } from './account.controller.js';
import { AuthService } from './auth.service.js';

/**
 * `AccountController` is one of the few controllers in the codebase
 * that does more than pure delegation: it consumes the
 * better-auth-style `Headers` object returned by
 * `AuthService.setInitialPassword` and forwards every Set-Cookie
 * header onto the express `Response` so the user is signed in by
 * the same HTTP round-trip that consumed the token.
 *
 * The behaviour worth pinning:
 *
 *   1. The body is forwarded verbatim to the service.
 *   2. Each cookie from `headers.getSetCookie()` is appended (NOT
 *      replaced) on `res`. Wrong here means a multi-cookie response
 *      (session + csrf, for example) silently drops one of them and
 *      the user appears signed-in but can't make authenticated
 *      requests.
 *   3. The response body is always `{ ok: true }` — no token data
 *      leaks back through the JSON envelope.
 *   4. Errors from the service propagate untransformed so the
 *      global filter does the envelope work.
 */

function serviceStub() {
  return {
    setInitialPassword: vi.fn(),
    requestPasswordReset: vi.fn(),
    triggerPasswordReset: vi.fn(),
  } as unknown as Record<keyof AuthService, ReturnType<typeof vi.fn>>;
}

function makeResponseStub() {
  return {
    append: vi.fn(),
  } as unknown as Response & { append: ReturnType<typeof vi.fn> };
}

/**
 * Stand-in for `Headers.getSetCookie()`. The platform implementation is
 * a real `Headers` instance; for the controller's purposes we only need
 * an object with a `getSetCookie()` method that returns the array.
 */
function makeHeadersStub(cookies: string[]): Headers {
  return { getSetCookie: () => cookies } as unknown as Headers;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [AccountController],
    providers: [{ provide: AuthService, useValue: service }],
  }).compile();
  return module.get(AccountController);
}

describe('AccountController.setPassword', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: AccountController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  it('forwards the body to AuthService.setInitialPassword', async () => {
    service.setInitialPassword.mockResolvedValue(makeHeadersStub([]));
    const res = makeResponseStub();
    const body = { token: 'tkn-1', password: 'a-strong-passw0rd!' };
    await controller.setPassword(body, res);
    expect(service.setInitialPassword).toHaveBeenCalledTimes(1);
    expect(service.setInitialPassword).toHaveBeenCalledWith(body);
  });

  it('appends every set-cookie header from the service onto the response', async () => {
    const cookies = [
      'better-auth.session_token=abc; HttpOnly; Path=/; SameSite=Lax',
      'better-auth.csrf_token=xyz; HttpOnly; Path=/',
    ];
    service.setInitialPassword.mockResolvedValue(makeHeadersStub(cookies));
    const res = makeResponseStub();

    await controller.setPassword({ token: 't', password: 'p' }, res);

    expect(res.append).toHaveBeenCalledTimes(2);
    expect(res.append).toHaveBeenNthCalledWith(1, 'set-cookie', cookies[0]);
    expect(res.append).toHaveBeenNthCalledWith(2, 'set-cookie', cookies[1]);
  });

  it('does not call res.append when the service returns no cookies', async () => {
    service.setInitialPassword.mockResolvedValue(makeHeadersStub([]));
    const res = makeResponseStub();
    await controller.setPassword({ token: 't', password: 'p' }, res);
    expect(res.append).not.toHaveBeenCalled();
  });

  it('returns { ok: true } and leaks no token state into the body', async () => {
    service.setInitialPassword.mockResolvedValue(makeHeadersStub([]));
    const res = makeResponseStub();
    const out = await controller.setPassword({ token: 't', password: 'p' }, res);
    expect(out).toEqual({ ok: true });
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('invalid token');
    service.setInitialPassword.mockRejectedValue(error);
    const res = makeResponseStub();
    await expect(
      controller.setPassword({ token: 't', password: 'p' }, res),
    ).rejects.toBe(error);
    expect(res.append).not.toHaveBeenCalled();
  });
});
