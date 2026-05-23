import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../infrastructure/database/client.js';
import { UsersRepository } from '../users/users.repository.js';

import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

const caller = {
  id: 'u-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  image: null,
  role: 'user' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const sysadmin = { ...caller, id: 'u-sys', email: 'sys@example.com', role: 'sysadmin' as const };

const PROFILE_ROW = {
  userId: 'u-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  taidoStartDate: '2015-09-01',
  addressStreet: '12 Analytical Way',
  addressPostalCode: '11122',
  addressCity: 'Stockholm',
  addressCountry: 'SWE',
  citizenships: ['SWE', 'GBR'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DB_USER = {
  id: 'u-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function profileRepoStub() {
  return {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
    syncUserName: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof ProfileRepository, ReturnType<typeof vi.fn>>;
}

function usersRepoStub() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    list: vi.fn(),
  };
}

const FAKE_TX = { __tx: true } as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof profileRepoStub>,
  usersRepo: ReturnType<typeof usersRepoStub>,
) {
  const module = await Test.createTestingModule({
    providers: [
      ProfileService,
      { provide: ProfileRepository, useValue: repo },
      { provide: UsersRepository, useValue: usersRepo },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return module.get(ProfileService);
}

describe('ProfileService — getOwn', () => {
  let repo: ReturnType<typeof profileRepoStub>;
  let usersRepo: ReturnType<typeof usersRepoStub>;
  let service: ProfileService;

  beforeEach(async () => {
    repo = profileRepoStub();
    usersRepo = usersRepoStub();
    service = await makeService(repo, usersRepo);
  });

  it('returns the empty-profile shape when no row exists', async () => {
    repo.findByUserId.mockResolvedValue(null);
    const out = await service.getOwn(caller);
    expect(out).toEqual({
      userId: 'u-1',
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      taidoStartDate: null,
      addressStreet: null,
      addressPostalCode: null,
      addressCity: null,
      addressCountry: null,
      citizenships: [],
    });
  });

  it('returns the persisted row when one exists', async () => {
    repo.findByUserId.mockResolvedValue(PROFILE_ROW);
    const out = await service.getOwn(caller);
    expect(out).toMatchObject({ userId: 'u-1', firstName: 'Ada', citizenships: ['SWE', 'GBR'] });
    expect(out).not.toHaveProperty('createdAt');
  });
});

describe('ProfileService — getByUserId', () => {
  let repo: ReturnType<typeof profileRepoStub>;
  let usersRepo: ReturnType<typeof usersRepoStub>;
  let service: ProfileService;

  beforeEach(async () => {
    repo = profileRepoStub();
    usersRepo = usersRepoStub();
    service = await makeService(repo, usersRepo);
  });

  it('404s when the target user does not exist', async () => {
    usersRepo.findById.mockResolvedValue(null);
    await expect(service.getByUserId('nope', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('returns the empty-profile shape when the user exists but has no profile', async () => {
    usersRepo.findById.mockResolvedValue(DB_USER);
    repo.findByUserId.mockResolvedValue(null);
    const out = await service.getByUserId('u-1', sysadmin);
    expect(out).toMatchObject({ userId: 'u-1', firstName: null, citizenships: [] });
  });

  it('returns the persisted profile when the user has one', async () => {
    usersRepo.findById.mockResolvedValue(DB_USER);
    repo.findByUserId.mockResolvedValue(PROFILE_ROW);
    const out = await service.getByUserId('u-1', sysadmin);
    expect(out).toMatchObject({ userId: 'u-1', firstName: 'Ada' });
  });
});

describe('ProfileService — updateOwn', () => {
  let repo: ReturnType<typeof profileRepoStub>;
  let usersRepo: ReturnType<typeof usersRepoStub>;
  let service: ProfileService;

  beforeEach(async () => {
    repo = profileRepoStub();
    usersRepo = usersRepoStub();
    service = await makeService(repo, usersRepo);
  });

  it('upserts the profile and syncs user.name when first/last are in the patch', async () => {
    repo.findByUserId.mockResolvedValue(null);
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, firstName: 'Ada', lastName: 'Lovelace' });

    const out = await service.updateOwn(caller, { firstName: 'Ada', lastName: 'Lovelace' });

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert.mock.calls[0]?.[0]).toBe('u-1');
    expect(repo.upsert.mock.calls[0]?.[1]).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(repo.syncUserName).toHaveBeenCalledWith('u-1', 'Ada Lovelace', FAKE_TX);
    expect(out).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('combines a patched first name with the existing last name when syncing', async () => {
    repo.findByUserId.mockResolvedValue({ ...PROFILE_ROW, firstName: 'Old', lastName: 'Lovelace' });
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, firstName: 'Ada', lastName: 'Lovelace' });

    await service.updateOwn(caller, { firstName: 'Ada' });

    expect(repo.syncUserName).toHaveBeenCalledWith('u-1', 'Ada Lovelace', FAKE_TX);
  });

  it('does not sync user.name when the patch does not touch first/last', async () => {
    repo.findByUserId.mockResolvedValue(PROFILE_ROW);
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, addressCity: 'Gothenburg' });

    await service.updateOwn(caller, { addressCity: 'Gothenburg' });

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.syncUserName).not.toHaveBeenCalled();
  });

  it('does not sync user.name when both first and last are empty', async () => {
    repo.findByUserId.mockResolvedValue({ ...PROFILE_ROW, firstName: null, lastName: null });
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, firstName: null, lastName: null });

    await service.updateOwn(caller, { firstName: null, lastName: null });

    expect(repo.syncUserName).not.toHaveBeenCalled();
  });
});
