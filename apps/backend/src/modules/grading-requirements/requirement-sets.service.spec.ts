import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import {
  RequirementSetsRepository,
  type RequirementSetRow,
} from './requirement-sets.repository.js';
import { RequirementSetsService } from './requirement-sets.service.js';

// ── Shared fixtures ────────────────────────────────────────────────────

function row(overrides: Partial<RequirementSetRow> = {}): RequirementSetRow {
  return {
    id: 'rs-1',
    name: 'Default Set',
    organisationId: 'org-A',
    effectiveDate: '2026-01-01',
    isActive: false,
    clonedFromId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u@example.com',
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

// ── Harness ─────────────────────────────────────────────────────────────

interface Harness {
  service: RequirementSetsService;
  repo: { [K in keyof RequirementSetsRepository]: ReturnType<typeof vi.fn> };
  orgs: { getAncestorIds: ReturnType<typeof vi.fn> };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
}

function build(opts: { canManage?: boolean; rowOnFind?: RequirementSetRow | null } = {}): Harness {
  const { canManage = true, rowOnFind = null } = opts;

  const repo = {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(rowOnFind),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
    setActive: vi.fn().mockResolvedValue(undefined),
    deactivateActiveForOrg: vi.fn().mockResolvedValue(undefined),
    findActiveByOrg: vi.fn().mockResolvedValue(null),
  };

  const orgs = {
    getAncestorIds: vi.fn().mockResolvedValue([]),
  };

  const fakeAbility = { can: vi.fn().mockReturnValue(canManage) };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(fakeAbility),
  };

  const service = new RequirementSetsService(
    repo as unknown as RequirementSetsRepository,
    orgs as unknown as OrganisationsRepository,
    abilities as unknown as AbilityFactory,
  );

  return { service, repo, orgs, abilities };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('RequirementSetsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list: sysadmin sees every set', async () => {
    const sysadmin = makeUser({ role: 'sysadmin', memberships: [] });
    const { service, repo, abilities } = build();

    // Sysadmin: ability.can('manage', 'all') returns true
    abilities.createForUser.mockReturnValue({ can: vi.fn().mockReturnValue(true) });
    const sets = [row({ id: 'rs-1' }), row({ id: 'rs-2' })];
    repo.list.mockResolvedValue(sets);

    const result = await service.list(sysadmin);

    expect(repo.list).toHaveBeenCalledWith('all');
    expect(result).toHaveLength(2);
  });

  it('list: org user sees only sets in their ancestor org chain', async () => {
    const orgUser = makeUser({
      role: 'user',
      memberships: [{ organisationId: 'org-child', role: 'instructor' }],
    });
    const { service, repo, orgs, abilities } = build();

    // Non-sysadmin: ability.can('manage', 'all') returns false
    const fakeAbility = { can: vi.fn().mockReturnValue(false) };
    abilities.createForUser.mockReturnValue(fakeAbility);

    orgs.getAncestorIds.mockResolvedValue(['org-child', 'org-parent']);
    repo.list.mockResolvedValue([row({ id: 'rs-1', organisationId: 'org-parent' })]);

    const result = await service.list(orgUser);

    expect(orgs.getAncestorIds).toHaveBeenCalledWith('org-child');
    expect(repo.list).toHaveBeenCalledWith(expect.arrayContaining(['org-child', 'org-parent']));
    expect(result).toHaveLength(1);
  });

  it('create: rejects when non-sysadmin passes another org id', async () => {
    const orgAdmin = makeUser({
      role: 'user',
      memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
    });
    const { service, abilities } = build();

    // Non-sysadmin: can('manage', 'all') = false
    const fakeAbility = { can: vi.fn().mockReturnValue(false) };
    abilities.createForUser.mockReturnValue(fakeAbility);

    await expect(
      service.create({ name: 'Test', organisationId: 'org-OTHER', effectiveDate: '2026-01-01' }, orgAdmin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create: defaults organisationId to caller primary org for non-sysadmin', async () => {
    const orgAdmin = makeUser({
      role: 'user',
      memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
    });
    const created = row({ id: 'rs-new', name: 'Test', organisationId: 'org-A' });
    const { service, repo, abilities } = build();

    const fakeAbility = { can: vi.fn().mockReturnValue(false) };
    abilities.createForUser.mockReturnValue(fakeAbility);
    repo.insert.mockResolvedValue(created);

    const result = await service.create({ name: 'Test', effectiveDate: '2026-01-01' }, orgAdmin);

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: 'org-A', name: 'Test' }),
    );
    expect(result.id).toBe('rs-new');
  });

  it('get: 404 when missing', async () => {
    const { service } = build({ rowOnFind: null });
    await expect(service.get('missing-id', makeUser())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activate: deactivates sibling active sets in same org', async () => {
    const target = row({ id: 'rs-1', organisationId: 'org-A', isActive: false });
    const { service, repo } = build({ rowOnFind: target, canManage: true });

    // After activation, findById returns the activated row
    repo.findById
      .mockResolvedValueOnce(target) // first call in activate()
      .mockResolvedValue({ ...target, isActive: true }); // second call after transaction

    await service.activate('rs-1', makeUser({ role: 'sysadmin' }));

    expect(repo.deactivateActiveForOrg).toHaveBeenCalledWith('org-A');
    expect(repo.setActive).toHaveBeenCalledWith('rs-1', true);
    // deactivateActiveForOrg must be called before setActive
    const deactivateOrder = repo.deactivateActiveForOrg.mock.invocationCallOrder[0];
    const setActiveOrder = repo.setActive.mock.invocationCallOrder[0];
    expect(deactivateOrder).toBeLessThan(setActiveOrder!);
  });

  it('deactivate: only flips isActive on the target set', async () => {
    const target = row({ id: 'rs-1', organisationId: 'org-A', isActive: true });
    const { service, repo } = build({ rowOnFind: target, canManage: true });

    repo.findById
      .mockResolvedValueOnce(target)
      .mockResolvedValue({ ...target, isActive: false });

    const result = await service.deactivate('rs-1', makeUser({ role: 'sysadmin' }));

    expect(repo.setActive).toHaveBeenCalledWith('rs-1', false);
    expect(repo.deactivateActiveForOrg).not.toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it('clone: copies set row with isActive=false and clonedFromId=source.id', async () => {
    const source = row({ id: 'rs-source', name: 'Original', organisationId: 'org-A' });
    const cloned = row({ id: 'rs-clone', clonedFromId: 'rs-source', isActive: false });
    const { service, repo } = build({ rowOnFind: source, canManage: true });

    repo.insert.mockResolvedValue(cloned);

    const result = await service.clone('rs-source', { name: 'Clone Name' }, makeUser({ role: 'sysadmin' }));

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clonedFromId: 'rs-source',
        organisationId: 'org-A',
      }),
    );
    expect(result.isActive).toBe(false);
    expect(result.clonedFromId).toBe('rs-source');
    // NOTE: detail-row copy verified in Task 12 once RankRequirementsService exists.
  });

  it('clone: defaults name to "{source.name} (copy)" when body.name absent', async () => {
    const source = row({ id: 'rs-source', name: 'Original', organisationId: 'org-A' });
    const cloned = row({ id: 'rs-clone', name: 'Original (copy)', clonedFromId: 'rs-source' });
    const { service, repo } = build({ rowOnFind: source, canManage: true });

    repo.insert.mockResolvedValue(cloned);

    await service.clone('rs-source', {}, makeUser({ role: 'sysadmin' }));

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Original (copy)' }),
    );
  });
});
