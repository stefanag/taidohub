import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

const FAKE_TX = { __tx: true } as unknown;

interface Harness {
  svc: RankRequirementsService;
  repo: { [K in keyof RankRequirementsRepository]: ReturnType<typeof vi.fn> };
  sets: { [K in keyof RequirementSetsRepository]: ReturnType<typeof vi.fn> };
  orgs: { getAncestorIds: ReturnType<typeof vi.fn> };
  memberships: { list: ReturnType<typeof vi.fn> };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
  fakeDb: { transaction: ReturnType<typeof vi.fn> };
}

function build(opts: { canRead?: boolean; canManage?: boolean } = {}): Harness {
  const { canRead = true, canManage = true } = opts;

  const repo = {
    fetchScalar: vi.fn().mockResolvedValue(null),
    fetchTechniques: vi.fn().mockResolvedValue([]),
    fetchPatternsWithType: vi.fn().mockResolvedValue([]),
    fetchHokeiGroups: vi.fn().mockResolvedValue([]),
    deleteScope: vi.fn().mockResolvedValue(undefined),
    insertScalar: vi.fn().mockResolvedValue({ id: 'scalar-1' }),
    insertTechniques: vi.fn().mockResolvedValue(undefined),
    insertPatterns: vi.fn().mockResolvedValue(undefined),
    insertHokeiGroup: vi.fn().mockResolvedValue({ id: 'hg-1' }),
    insertHokeiGroupPatterns: vi.fn().mockResolvedValue(undefined),
    distinctRankIdsForSet: vi.fn().mockResolvedValue([]),
  };

  const sets = {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 's-1', organisationId: 'orgA' }),
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

  const fakeAbility = { can: vi.fn().mockReturnValue(canRead && canManage) };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(fakeAbility),
  };

  const fakeDb = {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)),
  };

  const svc = new RankRequirementsService(
    fakeDb as never,
    repo as unknown as RankRequirementsRepository,
    sets as unknown as RequirementSetsRepository,
    orgs as unknown as OrganisationsRepository,
    memberships as unknown as MembershipsRepository,
    abilities as unknown as AbilityFactory,
  );

  return { svc, repo, sets, orgs, memberships, abilities, fakeDb };
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

// ── Tests: replace ───────────────────────────────────────────────────────────

describe('RankRequirementsService.replace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects 400 when setId is missing', async () => {
    const { svc } = build();
    const user = makeUser();
    await expect(svc.replace('rank-1', { setId: '' } as any, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects 400 when setId is undefined', async () => {
    const { svc } = build();
    const user = makeUser();
    await expect(svc.replace('rank-1', {} as any, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws ForbiddenException when caller cannot manage the set org', async () => {
    const { svc, sets, abilities } = build();
    sets.findById = vi.fn().mockResolvedValue({ id: 's-1', organisationId: 'orgB' });
    abilities.createForUser.mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const user = makeUser();
    await expect(svc.replace('rank-1', { setId: 's-1' } as any, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when set does not exist', async () => {
    const { svc, sets } = build();
    sets.findById = vi.fn().mockResolvedValue(null);
    const user = makeUser();
    await expect(svc.replace('rank-1', { setId: 's-missing' } as any, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('calls deleteScope BEFORE any insertScalar', async () => {
    const { svc, repo } = build();
    // fetchScalar after insert returns null so fetchForScope returns empty
    repo.fetchScalar = vi.fn().mockResolvedValue(null);

    const user = makeUser();
    await svc.replace('rank-1', {
      setId: 's-1',
      kihon: [],
      kihonTested: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      hokeiGroups: [],
      jissenTested: false,
      requiresTheoricExam: false,
      requiresEssay: false,
    }, user);

    const deleteOrder = repo.deleteScope.mock.invocationCallOrder[0]!;
    const insertOrder = repo.insertScalar.mock.invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(insertOrder);
  });

  it('clamps pickCount to patternIds.length', async () => {
    const { svc, repo } = build();
    repo.fetchScalar = vi.fn().mockResolvedValue(null);

    const user = makeUser();
    await svc.replace('rank-1', {
      setId: 's-1',
      kihon: [],
      kihonTested: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      hokeiGroups: [{ pickCount: 5, patternIds: ['p1', 'p2', 'p3'], groupOrder: 0, isTested: false }],
      jissenTested: false,
      requiresTheoricExam: false,
      requiresEssay: false,
    }, user);

    expect(repo.insertHokeiGroup).toHaveBeenCalledWith(
      expect.objectContaining({ pickCount: 3 }),
      FAKE_TX,
    );
  });

  it('deduplicates technique rows, preferring isTested=true when same id in kihon and kihonTested', async () => {
    const { svc, repo } = build();
    repo.fetchScalar = vi.fn().mockResolvedValue(null);

    const user = makeUser();
    await svc.replace('rank-1', {
      setId: 's-1',
      kihon: ['t1', 't2'],
      kihonTested: ['t1'], // t1 appears in both
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      hokeiGroups: [],
      jissenTested: false,
      requiresTheoricExam: false,
      requiresEssay: false,
    }, user);

    // Only 2 rows should be inserted (t1 with isTested=true, t2 with isTested=false)
    expect(repo.insertTechniques).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ techniqueId: 't1', isTested: true }),
        expect.objectContaining({ techniqueId: 't2', isTested: false }),
      ]),
      FAKE_TX,
    );
    // Exactly 2 rows (no duplicate for t1)
    const insertedRows = repo.insertTechniques.mock.calls[0]![0] as unknown[];
    expect(insertedRows).toHaveLength(2);
  });
});

// ── Tests: clearForScope ─────────────────────────────────────────────────────

describe('RankRequirementsService.clearForScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundException when the set does not exist', async () => {
    const { svc, sets } = build();
    sets.findById = vi.fn().mockResolvedValue(null);
    const user = makeUser();
    await expect(svc.clearForScope('rank-1', 's-missing', user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when caller cannot manage the set org', async () => {
    const { svc, sets, abilities } = build();
    sets.findById = vi.fn().mockResolvedValue({ id: 's-1', organisationId: 'orgB' });
    abilities.createForUser.mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const user = makeUser();
    await expect(svc.clearForScope('rank-1', 's-1', user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('calls deleteScope with correct rankId and setId when authorized', async () => {
    const { svc, repo } = build();
    const user = makeUser();
    await svc.clearForScope('rank-1', 's-1', user);
    expect(repo.deleteScope).toHaveBeenCalledWith('rank-1', 's-1', FAKE_TX);
  });
});

// ── Tests: deepCopyDetailsForSet ─────────────────────────────────────────────

describe('RankRequirementsService.deepCopyDetailsForSet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls distinctRankIdsForSet on the source set to discover ranks', async () => {
    const { svc, repo } = build();
    repo.distinctRankIdsForSet = vi.fn().mockResolvedValue([]);
    await svc.deepCopyDetailsForSet('src-set', 'tgt-set');
    expect(repo.distinctRankIdsForSet).toHaveBeenCalledWith('src-set', FAKE_TX);
  });

  it('re-points each detail row to the target set, preserving isTested + groupOrder + pickCount', async () => {
    const { svc, repo } = build();

    repo.distinctRankIdsForSet = vi.fn().mockResolvedValue(['rank-A']);
    repo.fetchScalar = vi.fn().mockResolvedValue(scalarRow({ rankId: 'rank-A', setId: 'src-set', jissenMinutes: 10 }));
    repo.fetchTechniques = vi.fn().mockResolvedValue([
      { techniqueId: 'tech-1', isTested: true },
      { techniqueId: 'tech-2', isTested: false },
    ]);
    repo.fetchPatternsWithType = vi.fn().mockResolvedValue([
      { patternId: 'pat-1', isTested: false, isKobo: true },
    ]);
    repo.fetchHokeiGroups = vi.fn().mockResolvedValue([
      { id: 'hg-src', rankId: 'rank-A', setId: 'src-set', groupOrder: 1, pickCount: 2, isTested: true, labelEn: 'G', labelFi: null, labelSv: null, patternIds: ['p1', 'p2'] },
    ]);

    await svc.deepCopyDetailsForSet('src-set', 'tgt-set');

    // scalar re-inserted with targetSetId
    expect(repo.insertScalar).toHaveBeenCalledWith(
      expect.objectContaining({ rankId: 'rank-A', setId: 'tgt-set', jissenMinutes: 10 }),
      FAKE_TX,
    );

    // techniques re-inserted with targetSetId
    expect(repo.insertTechniques).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ rankId: 'rank-A', setId: 'tgt-set', techniqueId: 'tech-1', isTested: true }),
        expect.objectContaining({ rankId: 'rank-A', setId: 'tgt-set', techniqueId: 'tech-2', isTested: false }),
      ]),
      FAKE_TX,
    );

    // patterns re-inserted with targetSetId
    expect(repo.insertPatterns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ rankId: 'rank-A', setId: 'tgt-set', patternId: 'pat-1', isTested: false }),
      ]),
      FAKE_TX,
    );

    // hokei group re-inserted with targetSetId and correct fields
    expect(repo.insertHokeiGroup).toHaveBeenCalledWith(
      expect.objectContaining({ rankId: 'rank-A', setId: 'tgt-set', groupOrder: 1, pickCount: 2, isTested: true }),
      FAKE_TX,
    );

    // group patterns re-inserted
    expect(repo.insertHokeiGroupPatterns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ patternId: 'p1', sortOrder: 0 }),
        expect.objectContaining({ patternId: 'p2', sortOrder: 1 }),
      ]),
      FAKE_TX,
    );
  });

  it('skips a rank when scalar is missing (graceful no-op)', async () => {
    const { svc, repo } = build();
    repo.distinctRankIdsForSet = vi.fn().mockResolvedValue(['rank-B']);
    repo.fetchScalar = vi.fn().mockResolvedValue(null); // no scalar

    await svc.deepCopyDetailsForSet('src-set', 'tgt-set');

    expect(repo.insertScalar).not.toHaveBeenCalled();
  });
});
