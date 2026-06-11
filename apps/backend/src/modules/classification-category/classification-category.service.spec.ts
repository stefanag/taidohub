import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { type ClassificationCategoryRow } from './classification-category.repository.js';
import { ClassificationCategoryService } from './classification-category.service.js';

type Row = ClassificationCategoryRow;

const ROOT_TECH: Row = {
  id: 'r-tech',
  parentId: null,
  code: 'technique_type',
  isActive: true,
  nameEn: 'TT',
  nameSv: '',
  nameFi: '',
  nameJa: '',
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ROOT_ATK: Row = {
  id: 'r-atk',
  parentId: null,
  code: 'attack_type',
  isActive: true,
  nameEn: 'AT',
  nameSv: '',
  nameFi: '',
  nameJa: '',
  sortOrder: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CHILD_KICK: Row = {
  id: 'c-kick',
  parentId: 'r-atk',
  code: 'kick',
  isActive: true,
  nameEn: 'Kick',
  nameSv: '',
  nameFi: '',
  nameJa: '',
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRepo(seed: {
  roots?: Row[];
  children?: Record<string, Row[]>;
  byIds?: Row[];
}) {
  return {
    findRoots: vi.fn().mockResolvedValue(seed.roots ?? []),
    findChildren: vi
      .fn()
      .mockImplementation(async (pid: string) => seed.children?.[pid] ?? []),
    findRootByCode: vi.fn(),
    findManyByIds: vi.fn().mockResolvedValue(seed.byIds ?? []),
    update: vi.fn().mockImplementation(async (id: string, patch: Partial<Row>) => ({
      ...CHILD_KICK,
      id,
      ...patch,
    })),
  };
}

function build(repo: ReturnType<typeof makeRepo>): ClassificationCategoryService {
  return new ClassificationCategoryService(repo as never);
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

describe('ClassificationCategoryService', () => {
  it('getRootMap populates from repo and caches on subsequent calls', async () => {
    const repo = makeRepo({ roots: [ROOT_TECH, ROOT_ATK] });
    const svc = build(repo);

    const m1 = await svc.getRootMap();
    const m2 = await svc.getRootMap();

    expect(m1.size).toBe(2);
    expect(m1.get('technique_type')?.id).toBe('r-tech');
    expect(repo.findRoots).toHaveBeenCalledTimes(1);
    expect(m2).toBe(m1);
  });

  it('listByRoot 404s when the root has not been seeded', async () => {
    const svc = build(makeRepo({ roots: [] }));
    await expect(svc.listByRoot('technique_type')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listByRoot returns children with rootCode populated', async () => {
    const svc = build(
      makeRepo({ roots: [ROOT_TECH, ROOT_ATK], children: { 'r-atk': [CHILD_KICK] } }),
    );
    const out = await svc.listByRoot('attack_type');
    expect(out).toHaveLength(1);
    expect(out[0]!.rootCode).toBe('attack_type');
    expect(out[0]!.code).toBe('kick');
  });

  it('resolveRootCodes maps known ids and reports null for unknown', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH, ROOT_ATK], byIds: [CHILD_KICK] }));
    const m = await svc.resolveRootCodes(['c-kick', 'unknown']);
    expect(m.get('c-kick')).toBe('attack_type');
    expect(m.get('unknown')).toBeNull();
  });

  it('update rejects non-sysadmin callers', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH] }));
    await expect(
      svc.update(makeUser({ role: 'user' }), 'x', { nameEn: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update permits sysadmin and returns the new row', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH, ROOT_ATK] }));
    const out = await svc.update(makeUser({ id: 's', role: 'sysadmin' }), 'c-kick', {
      nameEn: 'Front kick',
    });
    expect(out.nameEn).toBe('Front kick');
    expect(out.rootCode).toBe('attack_type');
  });

  it('update of a root row invalidates the root cache', async () => {
    const repo = makeRepo({ roots: [ROOT_TECH, ROOT_ATK] });
    const svc = build(repo);

    await svc.getRootMap();
    expect(repo.findRoots).toHaveBeenCalledTimes(1);

    // Pretend update returns a root.
    repo.update.mockResolvedValueOnce({ ...ROOT_TECH, nameEn: 'Technique kind' });
    await svc.update(makeUser({ id: 's', role: 'sysadmin' }), ROOT_TECH.id, {
      nameEn: 'Technique kind',
    });

    await svc.getRootMap();
    expect(repo.findRoots).toHaveBeenCalledTimes(2);
  });

  it('update of a child row does NOT invalidate the root cache', async () => {
    const repo = makeRepo({ roots: [ROOT_TECH, ROOT_ATK] });
    const svc = build(repo);

    await svc.getRootMap();
    await svc.update(makeUser({ id: 's', role: 'sysadmin' }), 'c-kick', { sortOrder: 5 });
    await svc.getRootMap();

    expect(repo.findRoots).toHaveBeenCalledTimes(1);
  });
});
