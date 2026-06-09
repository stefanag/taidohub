import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '../database/client.js';

import { AuthGuard } from './auth.guard.js';
import { type AuthenticatedUser } from './auth.types.js';
import { type Auth } from './better-auth.js';

type Req = { headers: Record<string, string>; user?: AuthenticatedUser };

function fakeCtx(req: Req): ExecutionContext {
  return {
    getHandler: () => (() => undefined) as unknown as () => void,
    getClass: () => class Fake {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    switchToWs: () => ({}) as ReturnType<ExecutionContext['switchToWs']>,
    switchToRpc: () => ({}) as ReturnType<ExecutionContext['switchToRpc']>,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
  } as unknown as ExecutionContext;
}

/**
 * Build a minimal `db.select(...).from(...).where(...).limit(...)`-ish chain
 * that returns the queued result arrays in order. The first select call yields
 * the user row, the second yields the memberships rows.
 */
function makeDb(results: ReadonlyArray<unknown[]>): {
  db: DrizzleDb;
  selectMock: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const selectMock = vi.fn(() => {
    const rows = results[i++] ?? [];
    const thenable = {
      from: () => thenable,
      where: () => thenable,
      limit: () => Promise.resolve(rows),
      then: (resolve: (value: unknown[]) => void) => resolve(rows),
    };
    return thenable;
  });
  return { db: { select: selectMock } as unknown as DrizzleDb, selectMock };
}

describe('AuthGuard', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let getSession: ReturnType<typeof vi.fn>;
  let auth: Auth;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    getSession = vi.fn();
    auth = { api: { getSession } } as unknown as Auth;
  });

  it('hydrates impersonatedBy on req.user when the session carries it', async () => {
    getSession.mockResolvedValue({
      user: {
        id: 'target',
        email: 't@x',
        role: 'user',
        emailVerified: true,
        name: null,
        image: null,
        locale: 'en',
      },
      session: {
        id: 's',
        expiresAt: '2030-01-01T00:00:00.000Z',
        impersonatedBy: 'sysadmin-1',
      },
    });

    const { db } = makeDb([
      [{ role: 'user', deactivatedAt: null }],
      [],
    ]);

    const guard = new AuthGuard(reflector as unknown as Reflector, auth, db);
    const req: Req = { headers: {} };

    await expect(guard.canActivate(fakeCtx(req))).resolves.toBe(true);
    expect(req.user?.impersonatedBy).toBe('sysadmin-1');
  });

  it('leaves impersonatedBy undefined for non-impersonation sessions', async () => {
    getSession.mockResolvedValue({
      user: {
        id: 'u',
        email: 'u@x',
        role: 'user',
        emailVerified: true,
        name: null,
        image: null,
        locale: 'en',
      },
      session: {
        id: 's',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });

    const { db } = makeDb([
      [{ role: 'user', deactivatedAt: null }],
      [],
    ]);

    const guard = new AuthGuard(reflector as unknown as Reflector, auth, db);
    const req: Req = { headers: {} };

    await expect(guard.canActivate(fakeCtx(req))).resolves.toBe(true);
    expect(req.user?.impersonatedBy).toBeUndefined();
  });
});
