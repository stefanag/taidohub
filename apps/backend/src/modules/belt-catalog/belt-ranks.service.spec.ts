import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BeltRanksRepository } from './belt-ranks.repository.js';
import { BeltRanksService } from './belt-ranks.service.js';

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

const SYSTEM_UUID = '11111111-1111-1111-1111-111111111111';
const RANK_UUID = '22222222-2222-2222-2222-222222222222';

const ROW = {
  id: RANK_UUID,
  organisationId: null,
  systemId: SYSTEM_UUID,
  level: 1,
  sortOrder: 10,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
  beltColor: '#FFFFFF',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function repoStub() {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findBySystemAndLevel: vi.fn().mockResolvedValue(null),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countHistoryUsingRank: vi.fn().mockResolvedValue(0),
    countNextRankPointers: vi.fn().mockResolvedValue(0),
    countShogosUsingRank: vi.fn().mockResolvedValue(0),
    countUserProfilesUsingRank: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof BeltRanksRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      BeltRanksService,
      { provide: BeltRanksRepository, useValue: repo },
    ],
  }).compile();
  return module.get(BeltRanksService);
}

const MIN_CREATE = {
  systemId: SYSTEM_UUID,
  level: 1,
  sortOrder: 10,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
  beltColor: '#FFFFFF',
  publiclyVisible: false,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
};

describe('BeltRanksService — create', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('inserts a rank when (system, level) is free', async () => {
    repo.insert.mockResolvedValue(ROW);
    const out = await service.create(MIN_CREATE, sysadmin);
    expect(out.id).toBe(RANK_UUID);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects publiclyVisible:true with no slug (service-layer defence)', async () => {
    await expect(
      service.create({ ...MIN_CREATE, publiclyVisible: true, slug: null }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a (system, level) collision', async () => {
    repo.findBySystemAndLevel.mockResolvedValue(ROW);
    await expect(service.create(MIN_CREATE, sysadmin)).rejects.toThrow(ConflictException);
  });
});

describe('BeltRanksService — update', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update(RANK_UUID, { sortOrder: 9 }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a nextRankId equal to the row\'s own id (self-reference)', async () => {
    repo.findById.mockResolvedValue(ROW);
    await expect(
      service.update(RANK_UUID, { nextRankId: RANK_UUID }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects publiclyVisible:true with no slug', async () => {
    repo.findById.mockResolvedValue(ROW);
    await expect(
      service.update(RANK_UUID, { publiclyVisible: true, slug: null }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates and returns the API shape', async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue({ ...ROW, sortOrder: 99 });
    const out = await service.update(RANK_UUID, { sortOrder: 99 }, sysadmin);
    expect(out.sortOrder).toBe(99);
  });
});

describe('BeltRanksService — delete guards (RANK_IN_USE)', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
    repo.findById.mockResolvedValue(ROW);
  });

  it('refuses when rank_history references the rank', async () => {
    repo.countHistoryUsingRank.mockResolvedValue(2);
    await expect(service.delete(RANK_UUID)).rejects.toThrow(ConflictException);
  });

  it('refuses when another rank references it via next_rank_id', async () => {
    repo.countNextRankPointers.mockResolvedValue(1);
    await expect(service.delete(RANK_UUID)).rejects.toThrow(ConflictException);
  });

  it('refuses when a shogo references it via min_rank_id', async () => {
    repo.countShogosUsingRank.mockResolvedValue(1);
    await expect(service.delete(RANK_UUID)).rejects.toThrow(ConflictException);
  });

  it('succeeds when all guards are clear', async () => {
    repo.delete.mockResolvedValue(true);
    await service.delete(RANK_UUID);
    expect(repo.delete).toHaveBeenCalledWith(RANK_UUID);
  });

  it('404s when the rank is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
  });
});
