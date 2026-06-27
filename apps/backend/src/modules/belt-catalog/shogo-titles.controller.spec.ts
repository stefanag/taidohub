import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShogoTitle } from '@repo/contracts/shogo-titles';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ShogoTitlesController } from './shogo-titles.controller.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

/**
 * Thin controller: four routes (no `findByCode` exposed). Each test
 * pins one delegation contract — the service receives the params,
 * body, and `@CurrentUser` exactly as the controller was called.
 * The natural key is `code` (the textual shogo identifier), not a
 * UUID, so the route params are unparametrised strings.
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

const sample: ShogoTitle = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: 'r-1',
  sortOrder: 1,
  visuals: { gradient: 'white' as const },
};

function serviceStub() {
  return {
    list: vi.fn(),
    findByCode: vi.fn(),
    findByKey: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<keyof ShogoTitlesService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [ShogoTitlesController],
    providers: [{ provide: ShogoTitlesService, useValue: service }],
  }).compile();
  return module.get(ShogoTitlesController);
}

describe('ShogoTitlesController', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: ShogoTitlesController;

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
    const body = {
      code: 'renshi',
      nameEn: 'Renshi',
      nameSv: 'Renshi',
      nameFi: 'Renshi',
      nameJa: '錬士',
      minRankId: 'r-1',
      sortOrder: 0,
      visuals: { gradient: 'white' as const },
    };
    const out = await controller.create(body, sysadmin);
    expect(service.create).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(sample);
  });

  it('update forwards code + body + user to service.update', async () => {
    service.update.mockResolvedValue(sample);
    const body = { sortOrder: 9 };
    const out = await controller.update('renshi', body, sysadmin);
    expect(service.update).toHaveBeenCalledWith('renshi', body, sysadmin);
    expect(out).toBe(sample);
  });

  it('remove (DELETE) forwards code to service.delete', async () => {
    service.delete.mockResolvedValue(undefined);
    await controller.remove('renshi');
    expect(service.delete).toHaveBeenCalledWith('renshi');
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.create.mockRejectedValue(error);
    await expect(
      controller.create(
        {
          code: 'renshi',
          nameEn: 'x',
          nameSv: 'x',
          nameFi: 'x',
          nameJa: 'x',
          minRankId: 'r-1',
          sortOrder: 0,
          visuals: { gradient: 'white' as const },
        },
        sysadmin,
      ),
    ).rejects.toBe(error);
  });
});
