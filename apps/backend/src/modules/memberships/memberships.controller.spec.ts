import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ListMembershipsResponse,
  OrganisationMembership,
} from '@repo/contracts/memberships';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

/**
 * Thin controller: four routes, all delegate to the service.
 * Two delegations carry a subtle twist worth pinning:
 *
 *   - `remove` takes an optional `confirm` query (used to bypass
 *     the "last-orgadmin" soft block) and forwards it as a
 *     positional options object — but only when the query
 *     supplied a value. The spec pins both branches so a future
 *     edit can't silently start passing `{ confirm: undefined }`
 *     to the service.
 *   - `update` is intentionally sysadmin-only at the abilities
 *     level (orgadmins delete + create instead). The controller
 *     itself doesn't enforce that; it just routes to the service.
 *     The abilities spec is what gates this; this spec just
 *     confirms the routing contract.
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

const sampleMembership: OrganisationMembership = {
  id: 'm-1',
  userId: 'u-1',
  organisationId: 'o-1',
  role: 'instructor',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function serviceStub() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<keyof MembershipsService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [MembershipsController],
    providers: [{ provide: MembershipsService, useValue: service }],
  }).compile();
  return module.get(MembershipsController);
}

describe('MembershipsController', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: MembershipsController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  it('list forwards query + user to service.list', async () => {
    const response: ListMembershipsResponse = { data: [sampleMembership], total: 1 };
    service.list.mockResolvedValue(response);
    const query = { userId: 'u-1' };
    const out = await controller.list(query, sysadmin);
    expect(service.list).toHaveBeenCalledWith(query, sysadmin);
    expect(out).toBe(response);
  });

  it('create forwards body + user to service.create', async () => {
    service.create.mockResolvedValue(sampleMembership);
    const body = { userId: 'u-1', organisationId: 'o-1', role: 'instructor' as const };
    const out = await controller.create(body, sysadmin);
    expect(service.create).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(sampleMembership);
  });

  it('update forwards id + body + user to service.update', async () => {
    service.update.mockResolvedValue(sampleMembership);
    const body = { role: 'orgadmin' as const };
    const out = await controller.update('m-1', body, sysadmin);
    expect(service.update).toHaveBeenCalledWith('m-1', body, sysadmin);
    expect(out).toBe(sampleMembership);
  });

  describe('remove', () => {
    it('forwards id + user to service.delete with empty opts when confirm is absent', async () => {
      service.delete.mockResolvedValue(undefined);
      await controller.remove('m-1', {}, sysadmin);
      expect(service.delete).toHaveBeenCalledWith('m-1', sysadmin, {});
    });

    it('forwards `{ confirm: true }` to service.delete when confirm=true', async () => {
      service.delete.mockResolvedValue(undefined);
      await controller.remove('m-1', { confirm: true }, sysadmin);
      expect(service.delete).toHaveBeenCalledWith('m-1', sysadmin, { confirm: true });
    });

    it('forwards `{ confirm: false }` explicitly when confirm=false', async () => {
      service.delete.mockResolvedValue(undefined);
      await controller.remove('m-1', { confirm: false }, sysadmin);
      expect(service.delete).toHaveBeenCalledWith('m-1', sysadmin, { confirm: false });
    });
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.list.mockRejectedValue(error);
    await expect(controller.list({}, sysadmin)).rejects.toBe(error);
  });
});
