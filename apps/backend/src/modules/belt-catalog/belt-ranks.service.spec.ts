import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RankRequirementsService } from '../grading-requirements/rank-requirements.service.js';
import { RequirementSetsRepository } from '../grading-requirements/requirement-sets.repository.js';

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
  visuals: { gradient: 'white' as const },
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
    findByKey: vi.fn(),
    findAll: vi.fn(),
    findBySystemAndLevel: vi.fn().mockResolvedValue(null),
    findPublicBySlug: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countHistoryUsingRank: vi.fn().mockResolvedValue(0),
    countNextRankPointers: vi.fn().mockResolvedValue(0),
    countShogosUsingRank: vi.fn().mockResolvedValue(0),
    countUserProfilesUsingRank: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof BeltRanksRepository, ReturnType<typeof vi.fn>>;
}

function rankRequirementsStub() {
  return {
    fetchForScope: vi.fn(),
  } as unknown as Record<keyof RankRequirementsService, ReturnType<typeof vi.fn>>;
}

function requirementSetsStub() {
  return {
    findActiveByOrg: vi.fn().mockResolvedValue(null),
  } as unknown as Record<keyof RequirementSetsRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(
  repo: ReturnType<typeof repoStub>,
  rankRequirements: ReturnType<typeof rankRequirementsStub> = rankRequirementsStub(),
  requirementSets: ReturnType<typeof requirementSetsStub> = requirementSetsStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      BeltRanksService,
      { provide: BeltRanksRepository, useValue: repo },
      { provide: RankRequirementsService, useValue: rankRequirements },
      { provide: RequirementSetsRepository, useValue: requirementSets },
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
  visuals: { gradient: 'white' as const },
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

describe('BeltRanksService.findPublicBySlug', () => {
  let repo: ReturnType<typeof repoStub>;
  let rankRequirements: ReturnType<typeof rankRequirementsStub>;
  let requirementSets: ReturnType<typeof requirementSetsStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    rankRequirements = rankRequirementsStub();
    requirementSets = requirementSetsStub();
    service = await makeService(repo, rankRequirements, requirementSets);
  });

  it('throws NotFoundException for an unknown slug', async () => {
    repo.findPublicBySlug.mockResolvedValue(null);
    await expect(service.findPublicBySlug('does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('returns the hydrated payload when the rank exists and is publicly visible', async () => {
    repo.findPublicBySlug.mockResolvedValue({
      ...ROW,
      publiclyVisible: true,
      slug: 'jukyu',
      systemCode: 'kyu',
      systemNameEn: 'Kyu',
      systemNameSv: 'Kyu',
      systemNameFi: 'Kyu',
      orgShortCode: null,
      orgNameEn: null,
      orgNameSv: null,
      orgNameFi: null,
    });
    const out = await service.findPublicBySlug('jukyu');
    expect(out.rank.slug).toBe('jukyu');
    expect(out.system.code).toBe('kyu');
    expect(out.organisation).toBeNull();
  });

  it('returns requirements: null when the rank\'s organisation has no active requirement set', async () => {
    repo.findPublicBySlug.mockResolvedValue({
      ...ROW,
      publiclyVisible: true,
      slug: 'jukyu',
      systemCode: 'kyu',
      systemNameEn: 'Kyu',
      systemNameSv: 'Kyu',
      systemNameFi: 'Kyu',
      orgShortCode: null,
      orgNameEn: null,
      orgNameSv: null,
      orgNameFi: null,
    });
    requirementSets.findActiveByOrg.mockResolvedValue(null);

    const out = await service.findPublicBySlug('jukyu');

    expect(requirementSets.findActiveByOrg).toHaveBeenCalledWith(ROW.organisationId);
    expect(rankRequirements.fetchForScope).not.toHaveBeenCalled();
    expect(out.requirements).toBeNull();
  });

  it('resolves requirements via RankRequirementsService.fetchForScope when an active set exists', async () => {
    repo.findPublicBySlug.mockResolvedValue({
      ...ROW,
      publiclyVisible: true,
      slug: 'jukyu',
      systemCode: 'kyu',
      systemNameEn: 'Kyu',
      systemNameSv: 'Kyu',
      systemNameFi: 'Kyu',
      orgShortCode: null,
      orgNameEn: null,
      orgNameSv: null,
      orgNameFi: null,
    });
    requirementSets.findActiveByOrg.mockResolvedValue({ id: 'set-1' });
    const projected = {
      rankId: RANK_UUID,
      setId: 'set-1',
      hokeiGroups: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      kihon: ['t-1'],
      kihonTested: [],
      jissenMinutes: null,
      jissenTested: false,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false,
      requiresEssay: false,
    };
    rankRequirements.fetchForScope.mockResolvedValue(projected);

    const out = await service.findPublicBySlug('jukyu');

    expect(rankRequirements.fetchForScope).toHaveBeenCalledWith(RANK_UUID, 'set-1');
    expect(out.requirements).toBe(projected);
  });
});
