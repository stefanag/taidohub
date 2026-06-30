import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import { RankRequirementsRepository } from './rank-requirements.repository.js';
import { RankRequirementsService } from './rank-requirements.service.js';
import { RequirementSetsRepository } from './requirement-sets.repository.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-actor',
    email: 'actor@example.com',
    emailVerified: true,
    name: null,
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

function scalarRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'req-1',
    rankId: 'rank-1',
    setId: 's1',
    jissenMinutes: null,
    jissenTested: false,
    minMonthsSincePreviousRank: null,
    requiresTheoricExam: false,
    requiresEssay: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function membershipRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mem-1',
    userId: 'u-target',
    organisationId: 'org-club',
    role: 'student' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    userName: null,
    userEmail: null,
    ...overrides,
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

interface Harness {
  svc: RankRequirementsService;
  repo: { [K in keyof RankRequirementsRepository]: ReturnType<typeof vi.fn> };
  sets: { [K in keyof RequirementSetsRepository]: ReturnType<typeof vi.fn> };
  orgs: { getAncestorIds: ReturnType<typeof vi.fn> };
  memberships: { list: ReturnType<typeof vi.fn> };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
}

function build(opts: { canRead?: boolean } = {}): Harness {
  const { canRead = true } = opts;

  const repo = {
    fetchScalar: vi.fn().mockResolvedValue(null),
    fetchTechniques: vi.fn().mockResolvedValue([]),
    fetchPatternsWithType: vi.fn().mockResolvedValue([]),
    fetchHokeiGroups: vi.fn().mockResolvedValue([]),
    deleteScope: vi.fn().mockResolvedValue(undefined),
    insertScalar: vi.fn(),
    insertTechniques: vi.fn(),
    insertPatterns: vi.fn(),
    insertHokeiGroup: vi.fn(),
    insertHokeiGroupPatterns: vi.fn(),
  };

  const sets = {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setActive: vi.fn(),
    deactivateActiveForOrg: vi.fn(),
    findActiveByOrg: vi.fn().mockResolvedValue(null),
  };

  const orgs = {
    getAncestorIds: vi.fn().mockResolvedValue([]),
  };

  const memberships = {
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const fakeAbility = { can: vi.fn().mockReturnValue(canRead) };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(fakeAbility),
  };

  const svc = new RankRequirementsService(
    repo as unknown as RankRequirementsRepository,
    sets as unknown as RequirementSetsRepository,
    orgs as unknown as OrganisationsRepository,
    memberships as unknown as MembershipsRepository,
    abilities as unknown as AbilityFactory,
  );

  return { svc, repo, sets, orgs, memberships, abilities };
}

// ── Tests: fetchForScope ─────────────────────────────────────────────────────

describe('RankRequirementsService.fetchForScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns emptyRequirements when no scalar row exists', async () => {
    const { svc, repo } = build();
    repo.fetchScalar = vi.fn().mockResolvedValue(null);

    const out = await svc.fetchForScope('rank-1', 'set-1');

    expect(out).toEqual({
      rankId: 'rank-1',
      setId: 'set-1',
      kihon: [],
      kihonTested: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      hokeiGroups: [],
      jissenMinutes: null,
      jissenTested: false,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false,
      requiresEssay: false,
    });
    expect(repo.fetchTechniques).not.toHaveBeenCalled();
  });

  it('splits patterns into kobo vs otherPatterns based on isKobo flag', async () => {
    const { svc, repo } = build();
    repo.fetchScalar = vi.fn().mockResolvedValue(scalarRow());
    repo.fetchTechniques = vi.fn().mockResolvedValue([]);
    repo.fetchHokeiGroups = vi.fn().mockResolvedValue([]);
    repo.fetchPatternsWithType = vi.fn().mockResolvedValue([
      { patternId: 'p-kobo-1', isKobo: true, isTested: true },
      { patternId: 'p-kobo-2', isKobo: true, isTested: false },
      { patternId: 'p-other-1', isKobo: false, isTested: false },
    ]);

    const out = await svc.fetchForScope('rank-1', 's1');

    expect(out.kobo).toEqual(['p-kobo-1', 'p-kobo-2']);
    expect(out.koboTested).toEqual(['p-kobo-1']);
    expect(out.otherPatterns).toEqual(['p-other-1']);
    expect(out.otherPatternsTested).toEqual([]);
  });

  it('projects scalar fields and maps hokei groups with patternIds', async () => {
    const { svc, repo } = build();
    repo.fetchScalar = vi.fn().mockResolvedValue(
      scalarRow({ jissenMinutes: 5, jissenTested: true, requiresTheoricExam: true }),
    );
    repo.fetchTechniques = vi.fn().mockResolvedValue([
      { techniqueId: 'tech-1', isTested: true },
      { techniqueId: 'tech-2', isTested: false },
    ]);
    repo.fetchPatternsWithType = vi.fn().mockResolvedValue([]);
    repo.fetchHokeiGroups = vi.fn().mockResolvedValue([
      {
        id: 'hg-1',
        rankId: 'rank-1',
        setId: 's1',
        groupOrder: 0,
        pickCount: 2,
        isTested: false,
        labelEn: 'Group A',
        labelFi: null,
        labelSv: null,
        patternIds: ['p1', 'p2', 'p3'],
      },
    ]);

    const out = await svc.fetchForScope('rank-1', 's1');

    expect(out.kihon).toEqual(['tech-1', 'tech-2']);
    expect(out.kihonTested).toEqual(['tech-1']);
    expect(out.jissenMinutes).toBe(5);
    expect(out.jissenTested).toBe(true);
    expect(out.requiresTheoricExam).toBe(true);
    expect(out.hokeiGroups).toHaveLength(1);
    expect(out.hokeiGroups[0]!.patternIds).toEqual(['p1', 'p2', 'p3']);
  });
});

// ── Tests: resolveForUser ────────────────────────────────────────────────────

describe('RankRequirementsService.resolveForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns emptyRequirements when target has no student membership', async () => {
    const { svc, memberships } = build();
    // Only instructor membership, no student
    memberships.list.mockResolvedValue({
      data: [membershipRow({ role: 'instructor' })],
      total: 1,
    });

    const actor = makeUser({ id: 'u-target' }); // actor === target, bypass auth
    const out = await svc.resolveForUser('rank-1', 'u-target', actor);

    expect(out).toEqual(svc.emptyRequirements('rank-1', null));
  });

  it('walks the ancestor chain and returns the first non-empty set', async () => {
    const { svc, repo, sets, orgs, memberships } = build();

    // Target is a student at org-club
    memberships.list.mockResolvedValue({
      data: [membershipRow({ organisationId: 'org-club', role: 'student' })],
      total: 1,
    });

    // Ancestors: club → nf → if (self-first)
    orgs.getAncestorIds.mockResolvedValue(['org-club', 'org-nf', 'org-if']);

    // club has active set s_club, but NO scalar for rank-1
    // nf has active set s_nf WITH scalar for rank-1
    const setClub = { id: 's-club', organisationId: 'org-club', isActive: true };
    const setNf = { id: 's-nf', organisationId: 'org-nf', isActive: true };

    sets.findActiveByOrg.mockImplementation((orgId: string | null) => {
      if (orgId === 'org-club') return Promise.resolve(setClub);
      if (orgId === 'org-nf') return Promise.resolve(setNf);
      return Promise.resolve(null);
    });

    repo.fetchScalar.mockImplementation((rankId: string, setId: string | null) => {
      if (setId === 's-nf') return Promise.resolve(scalarRow({ rankId, setId: 's-nf' }));
      return Promise.resolve(null);
    });
    repo.fetchTechniques.mockResolvedValue([]);
    repo.fetchPatternsWithType.mockResolvedValue([]);
    repo.fetchHokeiGroups.mockResolvedValue([]);

    const actor = makeUser({ id: 'u-target' }); // actor === target
    const out = await svc.resolveForUser('rank-1', 'u-target', actor);

    expect(out.setId).toBe('s-nf');
    expect(out.rankId).toBe('rank-1');
  });

  it('returns emptyRequirements when no ancestor has an active set with the rank', async () => {
    const { svc, memberships, orgs, sets } = build();

    memberships.list.mockResolvedValue({
      data: [membershipRow({ organisationId: 'org-club', role: 'student' })],
      total: 1,
    });

    orgs.getAncestorIds.mockResolvedValue(['org-club']);
    sets.findActiveByOrg.mockResolvedValue(null); // no active set anywhere

    const actor = makeUser({ id: 'u-target' });
    const out = await svc.resolveForUser('rank-1', 'u-target', actor);

    expect(out).toEqual(svc.emptyRequirements('rank-1', null));
  });

  it('throws ForbiddenException when actor is not target and ability denies read', async () => {
    const { svc, memberships, abilities } = build({ canRead: false });

    // actor is different from target
    const actor = makeUser({ id: 'u-actor', memberships: [] });

    // target has some membership
    memberships.list.mockResolvedValue({
      data: [membershipRow({ organisationId: 'org-1', role: 'student' })],
      total: 1,
    });

    // ability always denies
    abilities.createForUser.mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    await expect(svc.resolveForUser('rank-1', 'u-target', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows actor === targetUserId without ability check', async () => {
    const { svc, repo, memberships, orgs, sets, abilities } = build();

    const actor = makeUser({ id: 'u-target' });
    // ability is deny-all — but should not be called since actor === target
    abilities.createForUser.mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    memberships.list.mockResolvedValue({
      data: [membershipRow({ organisationId: 'org-club', role: 'student' })],
      total: 1,
    });
    orgs.getAncestorIds.mockResolvedValue(['org-club']);
    sets.findActiveByOrg.mockResolvedValue(null);
    repo.fetchScalar.mockResolvedValue(null);

    // Should NOT throw even though ability denies
    await expect(svc.resolveForUser('rank-1', 'u-target', actor)).resolves.toBeDefined();
  });

  it('falls back to the global active set (organisationId IS NULL) when no ancestor org has a hit', async () => {
    const { svc, repo, sets, orgs, memberships } = build();

    // Target user has a student membership in 'org-club'
    memberships.list.mockResolvedValue({
      data: [membershipRow({ userId: 'u-target', organisationId: 'org-club', role: 'student' })],
      total: 1,
    });

    // Ancestor walk returns [org-club, org-root]
    orgs.getAncestorIds.mockResolvedValue(['org-club', 'org-root']);

    // No active set in either ancestor, but global set exists
    sets.findActiveByOrg.mockImplementation((orgId: string | null) => {
      if (orgId === null) return Promise.resolve({ id: 's-global', organisationId: null });
      return Promise.resolve(null);
    });

    // Scalar exists for the global set
    repo.fetchScalar.mockImplementation((rankId: string, setId: string | null) => {
      if (setId === 's-global') {
        return Promise.resolve(
          scalarRow({
            rankId,
            setId: 's-global',
            jissenMinutes: null,
            jissenTested: false,
            minMonthsSincePreviousRank: null,
            requiresTheoricExam: false,
            requiresEssay: false,
          }),
        );
      }
      return Promise.resolve(null);
    });

    // Other fetch methods return empty arrays
    repo.fetchTechniques.mockResolvedValue([]);
    repo.fetchPatternsWithType.mockResolvedValue([]);
    repo.fetchHokeiGroups.mockResolvedValue([]);

    const actor = makeUser({ id: 'u-target' });
    const result = await svc.resolveForUser('rank-1', 'u-target', actor);

    expect(sets.findActiveByOrg).toHaveBeenCalledWith(null); // the key contract pin
    expect(result.setId).toBe('s-global');
  });
});

// ── Tests: resolveForSet ─────────────────────────────────────────────────────

describe('RankRequirementsService.resolveForSet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundException when the set does not exist', async () => {
    const { svc, sets } = build();
    sets.findById = vi.fn().mockResolvedValue(null);

    const actor = makeUser({ id: 'u-actor' });

    const NotFoundException = await import('@nestjs/common').then((m) => m.NotFoundException);
    await expect(svc.resolveForSet('rank-1', 'set-missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the projection when the set exists', async () => {
    const { svc, repo, sets } = build();
    sets.findById = vi.fn().mockResolvedValue({ id: 'set-1', organisationId: 'org-A' });
    repo.fetchScalar = vi.fn().mockResolvedValue(null); // empty scope
    repo.fetchTechniques.mockResolvedValue([]);
    repo.fetchPatternsWithType.mockResolvedValue([]);
    repo.fetchHokeiGroups.mockResolvedValue([]);

    const actor = makeUser({ id: 'u-actor' });
    const result = await svc.resolveForSet('rank-1', 'set-1', actor);

    expect(result).toEqual(svc.emptyRequirements('rank-1', 'set-1'));
  });
});
