import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddUserResponse, ListUsersResponse, User } from '@repo/contracts/users';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * The users controller is a thin façade with nine endpoints. Only the
 * delegation contract matters at the controller layer — the
 * service owns business rules, the abilities own access control,
 * and the guard owns auth. Each test below pins exactly that one
 * contract: "this HTTP route routes its DTOs + `@CurrentUser`
 * unchanged to this service method, and returns the service result
 * unchanged."
 *
 * The `me` endpoint is the one exception worth a separate case: it
 * carries a defensive null-check that throws on a missing
 * `@CurrentUser` because the AuthGuard should have already
 * rejected the request — the spec pins that defence.
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

const sampleUser: User = {
  id: 'u-1',
  email: 'one@example.com',
  name: 'One',
  emailVerified: true,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function serviceStub() {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    invite: vi.fn(),
    addUser: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    delete: vi.fn(),
    sendPasswordReset: vi.fn(),
  } as unknown as Record<keyof UsersService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [{ provide: UsersService, useValue: service }],
  }).compile();
  return module.get(UsersController);
}

describe('UsersController', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: UsersController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  describe('me', () => {
    it('returns service.findOne with the current user id', async () => {
      service.findOne.mockResolvedValue(sampleUser);
      const out = await controller.me(sysadmin);
      expect(service.findOne).toHaveBeenCalledWith(sysadmin.id, sysadmin);
      expect(out).toBe(sampleUser);
    });

    it('throws when @CurrentUser is missing (defensive — AuthGuard should have caught it)', () => {
      // The defence throws synchronously before constructing a
      // promise, so `.rejects.toThrow` would never catch it. Wrap
      // the call so `.toThrow` sees the synchronous exception.
      expect(() => controller.me(undefined)).toThrow(/CurrentUser missing/);
      expect(service.findOne).not.toHaveBeenCalled();
    });
  });

  it('list forwards query + user to service.list', async () => {
    const response: ListUsersResponse = {
      data: [sampleUser],
      page: 1,
      perPage: 25,
      total: 1,
    };
    service.list.mockResolvedValue(response);
    const query = { page: 1, perPage: 25, deactivated: 'false' as const };
    const out = await controller.list(query, sysadmin);
    expect(service.list).toHaveBeenCalledWith(query, sysadmin);
    expect(out).toBe(response);
  });

  it('invite forwards body + user to service.invite', async () => {
    service.invite.mockResolvedValue(sampleUser);
    const body = { email: 'new@example.com' };
    const out = await controller.invite(body, sysadmin);
    expect(service.invite).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(sampleUser);
  });

  it('add forwards body + user to service.addUser', async () => {
    const response: AddUserResponse = { user: sampleUser, setPasswordUrl: 'https://example/reset?token=x' };
    service.addUser.mockResolvedValue(response);
    const body = { email: 'new@example.com', name: 'New', role: 'user' as const };
    const out = await controller.add(body, sysadmin);
    expect(service.addUser).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(response);
  });

  it('findOne forwards the id param + user to service.findOne', async () => {
    service.findOne.mockResolvedValue(sampleUser);
    const out = await controller.findOne('u-1', sysadmin);
    expect(service.findOne).toHaveBeenCalledWith('u-1', sysadmin);
    expect(out).toBe(sampleUser);
  });

  it('update forwards id + body + user to service.update', async () => {
    service.update.mockResolvedValue(sampleUser);
    const body = { name: 'Renamed' };
    const out = await controller.update('u-1', body, sysadmin);
    expect(service.update).toHaveBeenCalledWith('u-1', body, sysadmin);
    expect(out).toBe(sampleUser);
  });

  it('deactivate forwards id + user to service.deactivate', async () => {
    service.deactivate.mockResolvedValue(sampleUser);
    const out = await controller.deactivate('u-1', sysadmin);
    expect(service.deactivate).toHaveBeenCalledWith('u-1', sysadmin);
    expect(out).toBe(sampleUser);
  });

  it('reactivate forwards id + user to service.reactivate', async () => {
    service.reactivate.mockResolvedValue(sampleUser);
    const out = await controller.reactivate('u-1', sysadmin);
    expect(service.reactivate).toHaveBeenCalledWith('u-1', sysadmin);
    expect(out).toBe(sampleUser);
  });

  it('delete forwards id + user to service.delete', async () => {
    service.delete.mockResolvedValue(undefined);
    await controller.delete('u-1', sysadmin);
    expect(service.delete).toHaveBeenCalledWith('u-1', sysadmin);
  });

  it('sendPasswordReset forwards id + user to service.sendPasswordReset', async () => {
    service.sendPasswordReset.mockResolvedValue(undefined);
    await controller.sendPasswordReset('u-1', sysadmin);
    expect(service.sendPasswordReset).toHaveBeenCalledWith('u-1', sysadmin);
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.findOne.mockRejectedValue(error);
    await expect(controller.findOne('u-1', sysadmin)).rejects.toBe(error);
  });
});
