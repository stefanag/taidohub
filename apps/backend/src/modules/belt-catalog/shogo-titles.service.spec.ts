import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShogoTitlesRepository } from './shogo-titles.repository.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

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

const UUID = '11111111-1111-1111-1111-111111111111';

const ROW = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: UUID,
  sortOrder: 1,
  visuals: { gradient: 'black' as const, overlayTopHalf: 'magenta' as const },
};

function repoStub() {
  return {
    findByCode: vi.fn(),
    findAll: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countHistoryUsingShogo: vi.fn().mockResolvedValue(0),
    countProfilesUsingShogo: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof ShogoTitlesRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      ShogoTitlesService,
      { provide: ShogoTitlesRepository, useValue: repo },
    ],
  }).compile();
  return module.get(ShogoTitlesService);
}

describe('ShogoTitlesService', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: ShogoTitlesService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('list returns the API shape', async () => {
    repo.findAll.mockResolvedValue([ROW]);
    const out = await service.list();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'renshi', sortOrder: 1 });
  });

  it('findByCode 404s when missing', async () => {
    repo.findByCode.mockResolvedValue(null);
    await expect(service.findByCode('nope')).rejects.toThrow(NotFoundException);
  });

  it('create inserts and returns the API shape', async () => {
    repo.insert.mockResolvedValue(ROW);
    const out = await service.create(ROW, sysadmin);
    expect(out.code).toBe('renshi');
  });

  it('update 404s when missing', async () => {
    repo.update.mockResolvedValue(null);
    await expect(service.update('nope', { sortOrder: 9 }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete refuses with SHOGO_IN_USE when rank_history references it', async () => {
    repo.findByCode.mockResolvedValue(ROW);
    repo.countHistoryUsingShogo.mockResolvedValue(2);
    await expect(service.delete('renshi')).rejects.toThrow(ConflictException);
  });

  it('delete refuses with SHOGO_IN_USE when user_profile references it', async () => {
    repo.findByCode.mockResolvedValue(ROW);
    repo.countProfilesUsingShogo.mockResolvedValue(1);
    await expect(service.delete('renshi')).rejects.toThrow(ConflictException);
  });

  it('delete succeeds when both guards are clear', async () => {
    repo.findByCode.mockResolvedValue(ROW);
    repo.delete.mockResolvedValue(true);
    await service.delete('renshi');
    expect(repo.delete).toHaveBeenCalledWith('renshi');
  });

  it('delete 404s when missing', async () => {
    repo.findByCode.mockResolvedValue(null);
    await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
  });
});
