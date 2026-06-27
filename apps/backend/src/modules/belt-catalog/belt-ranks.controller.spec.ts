import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BeltRank } from '@repo/contracts/ranks';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { BeltRanksController } from './belt-ranks.controller.js';
import { BeltRanksService } from './belt-ranks.service.js';

/**
 * BeltRanks is the bespoke one — its service carries level-collision
 * checks, slug-requires-publiclyVisible refines, and the
 * `findPublicBySlug` hydrated read used by the public controller.
 * None of that lives in the controller itself; this spec just pins
 * the routing layer (five endpoints) and leaves the business-rule
 * checks to `belt-ranks.service.spec.ts`.
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

const sample: BeltRank = {
  id: 'r-1',
  organisationId: null,
  systemId: 's-1',
  level: 1,
  sortOrder: 1,
  nameJa: null,
  nameRomaji: 'shodan',
  nameEn: 'Shodan',
  nameSv: 'Shodan',
  nameFi: 'Shodan',
  beltColor: '#000000',
  visuals: { gradient: 'white' },
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function serviceStub() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findPublicBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<keyof BeltRanksService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [BeltRanksController],
    providers: [{ provide: BeltRanksService, useValue: service }],
  }).compile();
  return module.get(BeltRanksController);
}

describe('BeltRanksController', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: BeltRanksController;

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

  it('findOne forwards id to service.findById', async () => {
    service.findById.mockResolvedValue(sample);
    const out = await controller.findOne('r-1');
    expect(service.findById).toHaveBeenCalledWith('r-1');
    expect(out).toBe(sample);
  });

  it('create forwards body + user to service.create', async () => {
    service.create.mockResolvedValue(sample);
    const body = {
      organisationId: null,
      systemId: 's-1',
      level: 1,
      sortOrder: 0,
      nameJa: null,
      nameRomaji: 'shodan',
      nameEn: 'Shodan',
      nameSv: 'Shodan',
      nameFi: 'Shodan',
      beltColor: '#000000',
      visuals: { gradient: 'white' as const },
      imageUrl: null,
      descriptionEn: null,
      descriptionSv: null,
      descriptionFi: null,
      publiclyVisible: false,
      slug: null,
      minAge: null,
      nextRankId: null,
    };
    const out = await controller.create(body, sysadmin);
    expect(service.create).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(sample);
  });

  it('update forwards id + body + user to service.update', async () => {
    service.update.mockResolvedValue(sample);
    const body = { sortOrder: 9 };
    const out = await controller.update('r-1', body, sysadmin);
    expect(service.update).toHaveBeenCalledWith('r-1', body, sysadmin);
    expect(out).toBe(sample);
  });

  it('remove (DELETE) forwards id to service.delete', async () => {
    service.delete.mockResolvedValue(undefined);
    await controller.remove('r-1');
    expect(service.delete).toHaveBeenCalledWith('r-1');
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.findById.mockRejectedValue(error);
    await expect(controller.findOne('r-1')).rejects.toBe(error);
  });
});
