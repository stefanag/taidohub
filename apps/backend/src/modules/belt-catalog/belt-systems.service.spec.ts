import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BeltSystemsRepository } from './belt-systems.repository.js';
import { BeltSystemsService } from './belt-systems.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const ROW = {
  id: 's-1',
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function repoStub() {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findByCode: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countRanksUsingSystem: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof BeltSystemsRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      BeltSystemsService,
      { provide: BeltSystemsRepository, useValue: repo },
    ],
  }).compile();
  return module.get(BeltSystemsService);
}

describe('BeltSystemsService', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltSystemsService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('list returns the API shape', async () => {
    repo.findAll.mockResolvedValue([ROW]);
    const out = await service.list();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 's-1', code: 'kyu' });
    expect(out[0]).toHaveProperty('createdAt');
    expect(typeof out[0]?.createdAt).toBe('string');
  });

  it('findById 404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
  });

  it('create persists the input and returns the API shape', async () => {
    repo.insert.mockResolvedValue(ROW);
    const out = await service.create(
      { code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu', sortOrder: 1 },
      sysadmin,
    );
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(out.id).toBe('s-1');
  });

  it('update 404s when missing', async () => {
    repo.update.mockResolvedValue(null);
    await expect(service.update('nope', { sortOrder: 9 }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete 404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
  });

  it('delete refuses with SYSTEM_IN_USE when ranks reference the system', async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.countRanksUsingSystem.mockResolvedValue(3);
    await expect(service.delete('s-1')).rejects.toThrow(ConflictException);
  });

  it('delete succeeds when no ranks reference the system', async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.countRanksUsingSystem.mockResolvedValue(0);
    repo.delete.mockResolvedValue(true);
    await service.delete('s-1');
    expect(repo.delete).toHaveBeenCalledWith('s-1');
  });
});
