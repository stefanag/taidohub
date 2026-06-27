import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ListOrganisationsResponse,
  Organisation,
} from '@repo/contracts/organisations';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { OrganisationsController } from './organisations.controller.js';
import { OrganisationsService } from './organisations.service.js';

/**
 * Thin controller — five routes that all delegate to the service.
 * The spec pins the delegation contract for each route (the
 * service receives exactly the params, body, and `@CurrentUser`
 * that the controller was called with, and returns the service
 * result unchanged) plus untransformed error propagation so the
 * global `AllExceptionsFilter` does the envelope work.
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

const sampleOrg: Organisation = {
  id: 'o-1',
  parentId: null,
  type: 'international_federation',
  shortCode: 'WTF',
  slug: 'world-taido-federation',
  country: null,
  nameEn: 'World Taido Federation',
  nameSv: 'Världstaidoförbundet',
  nameFi: 'Maailman Taidoliitto',
  nameJa: '世界躰道連盟',
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function serviceStub() {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Record<keyof OrganisationsService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [OrganisationsController],
    providers: [{ provide: OrganisationsService, useValue: service }],
  }).compile();
  return module.get(OrganisationsController);
}

describe('OrganisationsController', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: OrganisationsController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  it('list forwards query + user to service.list', async () => {
    const response: ListOrganisationsResponse = { data: [sampleOrg], total: 1 };
    service.list.mockResolvedValue(response);
    const query = { type: 'club' as const };
    const out = await controller.list(query, sysadmin);
    expect(service.list).toHaveBeenCalledWith(query, sysadmin);
    expect(out).toBe(response);
  });

  it('findOne forwards the id param + user to service.findOne', async () => {
    service.findOne.mockResolvedValue(sampleOrg);
    const out = await controller.findOne('o-1', sysadmin);
    expect(service.findOne).toHaveBeenCalledWith('o-1', sysadmin);
    expect(out).toBe(sampleOrg);
  });

  it('create forwards body + user to service.create', async () => {
    service.create.mockResolvedValue(sampleOrg);
    const body = {
      parentId: null,
      type: 'international_federation' as const,
      shortCode: 'WTF',
      slug: 'world-taido-federation',
      country: null,
      nameEn: 'World Taido Federation',
      nameSv: 'Världstaidoförbundet',
      nameFi: 'Maailman Taidoliitto',
      nameJa: null,
      logoUrl: null,
      address: null,
      headInstructorId: null,
    };
    const out = await controller.create(body, sysadmin);
    expect(service.create).toHaveBeenCalledWith(body, sysadmin);
    expect(out).toBe(sampleOrg);
  });

  it('update forwards id + body + user to service.update', async () => {
    service.update.mockResolvedValue(sampleOrg);
    const body = { nameEn: 'Renamed' };
    const out = await controller.update('o-1', body, sysadmin);
    expect(service.update).toHaveBeenCalledWith('o-1', body, sysadmin);
    expect(out).toBe(sampleOrg);
  });

  it('remove (DELETE) forwards id + user to service.delete', async () => {
    service.delete.mockResolvedValue(undefined);
    await controller.remove('o-1', sysadmin);
    expect(service.delete).toHaveBeenCalledWith('o-1', sysadmin);
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.findOne.mockRejectedValue(error);
    await expect(controller.findOne('o-1', sysadmin)).rejects.toBe(error);
  });
});
