import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListAuditLogResponse } from '@repo/contracts/audit-log';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';

/**
 * The controller is thin — its only job is to route the query DTO +
 * the authenticated user to `service.list()`. The spec pins:
 *
 *   1. The expected delegation contract (service receives the exact
 *      query and user it was called with).
 *   2. The list endpoint returns whatever the service produces (no
 *      enveloping or filtering happens at the controller layer).
 *   3. Service errors propagate untransformed so the global
 *      `AllExceptionsFilter` can do its envelope work.
 *
 * Pairing this with the abilities spec means a future change to
 * the controller surface (a new endpoint, a renamed param, a
 * stripped field) fails one of these two specs before it can ship.
 */

const sysadmin: AuthenticatedUser = {
  id: 'u-admin',
  email: 'admin@example.com',
  emailVerified: true,
  name: null,
  image: null,
  locale: 'en',
  role: 'sysadmin',
  deactivatedAt: null,
  memberships: [],
};

function serviceStub() {
  return {
    record: vi.fn(),
    list: vi.fn(),
  } satisfies Record<keyof AuditLogService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [AuditLogController],
    providers: [{ provide: AuditLogService, useValue: service }],
  }).compile();
  return module.get(AuditLogController);
}

describe('AuditLogController.list', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: AuditLogController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  const baseQuery = { page: 1, perPage: 25 };

  it('forwards the query DTO + the current user to service.list', async () => {
    const response: ListAuditLogResponse = { data: [], page: 1, perPage: 25, total: 0 };
    service.list.mockResolvedValue(response);

    const out = await controller.list(baseQuery, sysadmin);

    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.list).toHaveBeenCalledWith(baseQuery, sysadmin);
    expect(out).toBe(response);
  });

  it('returns the service response unchanged (no enveloping at the controller)', async () => {
    const response: ListAuditLogResponse = {
      data: [
        {
          id: 'log-1',
          entityType: 'organisation',
          entityId: 'org-1',
          action: 'create',
          user: { id: 'u-admin', name: 'Ada Lovelace', email: 'ada@example.com' },
          before: null,
          after: { name: 'New org' },
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      page: 1,
      perPage: 25,
      total: 1,
    };
    service.list.mockResolvedValue(response);
    const out = await controller.list(baseQuery, sysadmin);
    expect(out).toEqual(response);
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.list.mockRejectedValue(error);
    await expect(controller.list(baseQuery, sysadmin)).rejects.toBe(error);
  });
});
