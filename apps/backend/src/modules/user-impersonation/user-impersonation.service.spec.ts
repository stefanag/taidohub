import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { UserImpersonationService } from './user-impersonation.service.js';

function makeAuthApi() {
  return {
    impersonateUser: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Set-Cookie': 'x=y' },
      }),
    ),
    stopImpersonating: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  };
}

function makeDb(targetRow?: { id: string; role: string }) {
  const limit = vi.fn().mockResolvedValue(targetRow ? [targetRow] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const transaction = vi
    .fn()
    .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}));
  return { select, transaction, _limit: limit };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function build(
  authApi: ReturnType<typeof makeAuthApi>,
  db: ReturnType<typeof makeDb>,
  audit: ReturnType<typeof makeAudit>,
): UserImpersonationService {
  return new UserImpersonationService(
    { api: authApi } as never,
    db as never,
    audit as never,
  );
}

describe('UserImpersonationService.start', () => {
  it('throws Forbidden for non-sysadmin callers', async () => {
    const service = build(makeAuthApi(), makeDb({ id: 't-1', role: 'user' }), makeAudit());
    await expect(
      service.start({ id: 'u-1', role: 'user', memberships: [] } as never, 't-1', new Headers()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when target does not exist', async () => {
    const service = build(makeAuthApi(), makeDb(undefined), makeAudit());
    await expect(
      service.start(
        { id: 's-1', role: 'sysadmin', memberships: [] } as never,
        't-x',
        new Headers(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when target is a sysadmin', async () => {
    const service = build(makeAuthApi(), makeDb({ id: 't-1', role: 'sysadmin' }), makeAudit());
    await expect(
      service.start(
        { id: 's-1', role: 'sysadmin', memberships: [] } as never,
        't-1',
        new Headers(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emits start audit + returns the Response on success', async () => {
    const authApi = makeAuthApi();
    const audit = makeAudit();
    const service = build(authApi, makeDb({ id: 't-1', role: 'user' }), audit);
    const res = await service.start(
      { id: 's-1', role: 'sysadmin', memberships: [] } as never,
      't-1',
      new Headers(),
    );
    expect(res.status).toBe(200);
    expect(authApi.impersonateUser).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'user_impersonation',
        entityId: 't-1',
        action: 'create',
        userId: 's-1',
        impersonatedById: null,
      }),
    );
  });
});

describe('UserImpersonationService.stop', () => {
  it('throws Forbidden when not impersonating', async () => {
    const service = build(makeAuthApi(), makeDb(), makeAudit());
    await expect(
      service.stop({ id: 'u-1', role: 'user', memberships: [] } as never, new Headers()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emits stop audit + returns the Response on success', async () => {
    const authApi = makeAuthApi();
    const audit = makeAudit();
    const service = build(authApi, makeDb(), audit);
    const res = await service.stop(
      { id: 't-1', role: 'user', memberships: [], impersonatedBy: 's-1' } as never,
      new Headers(),
    );
    expect(res.status).toBe(200);
    expect(authApi.stopImpersonating).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'user_impersonation',
        entityId: 't-1',
        action: 'delete',
        userId: 's-1',
      }),
    );
  });
});
