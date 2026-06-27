import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BeltSystem } from '@repo/contracts/belt-systems';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { BeltSystemsController } from './belt-systems.controller.js';
import { BeltSystemsService } from './belt-systems.service.js';

/**
 * Thin controller: five routes, all delegate. Each test pins one
 * delegation contract — the service receives exactly the params,
 * body, and `@CurrentUser` the controller was called with, and
 * returns the service result unchanged. Plus an error-propagation
 * case so the global filter does the envelope work.
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

const sample: BeltSystem = {
  id: 's-1',
  code: 'kyu',
  nameEn: 'Kyu/Dan',
  nameSv: 'Kyu/Dan',
  nameFi: 'Kyu/Dan',
  sortOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function serviceStub() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findByKey: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<keyof BeltSystemsService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [BeltSystemsController],
    providers: [{ provide: BeltSystemsService, useValue: service }],
  }).compile();
  return module.get(BeltSystemsController);
}

describe('BeltSystemsController', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: BeltSystemsController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  it('list forwards to service.list', async () => {
    service.list.mockResolvedValue([sample]);
    const out = await controller.list();
    expect(service.list).toHaveBeenCalledWith();
    expect(out).toEqual([sample]);
  });

  it('create forwards body + user to service.create', async () => {
    service.create.mockResolvedValue(sample);
    const body = { code: 'kyu', nameEn: 'Kyu/Dan', nameSv: 'Kyu/Dan', nameFi: 'Kyu/Dan', sortOrder: 0 };
    const out = await controller.create(body, sysadmin);
    expect(service.create).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(sample);
  });

  it('update forwards id + body + user to service.update', async () => {
    service.update.mockResolvedValue(sample);
    const body = { sortOrder: 9 };
    const out = await controller.update('s-1', body, sysadmin);
    expect(service.update).toHaveBeenCalledWith('s-1', body, sysadmin);
    expect(out).toBe(sample);
  });

  it('remove (DELETE) forwards id to service.delete', async () => {
    service.delete.mockResolvedValue(undefined);
    await controller.remove('s-1');
    expect(service.delete).toHaveBeenCalledWith('s-1');
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.create.mockRejectedValue(error);
    await expect(
      controller.create({ code: 'x', nameEn: 'x', nameSv: 'x', nameFi: 'x', sortOrder: 0 }, sysadmin),
    ).rejects.toBe(error);
  });
});
