import { describe, expect, it, vi } from 'vitest';

import { seedSysadmin, type SeedDeps } from './seed-sysadmin.js';

const config = {
  email: 'sysadmin@example.com',
  password: 'sysadmin-pass',
  name: 'Sysadmin',
};

function makeDeps(overrides: Partial<SeedDeps> = {}): SeedDeps {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    signUpEmail: vi.fn().mockResolvedValue(undefined),
    setRoleByEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('seedSysadmin', () => {
  it('creates the user via signUpEmail and promotes to admin when missing', async () => {
    const deps = makeDeps();
    const result = await seedSysadmin(deps, config);

    expect(deps.findUserByEmail).toHaveBeenCalledWith(config.email);
    expect(deps.signUpEmail).toHaveBeenCalledWith({
      email: config.email,
      password: config.password,
      name: config.name,
    });
    expect(deps.setRoleByEmail).toHaveBeenCalledWith(config.email, 'admin');
    expect(result).toEqual({ created: true, promoted: true });
  });

  it('skips signup and promotes when the user already exists with non-admin role', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'u1', role: 'user' }),
    });
    const result = await seedSysadmin(deps, config);

    expect(deps.signUpEmail).not.toHaveBeenCalled();
    expect(deps.setRoleByEmail).toHaveBeenCalledWith(config.email, 'admin');
    expect(result).toEqual({ created: false, promoted: true });
  });

  it('is a no-op when the user exists and is already admin', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'u1', role: 'admin' }),
    });
    const result = await seedSysadmin(deps, config);

    expect(deps.signUpEmail).not.toHaveBeenCalled();
    expect(deps.setRoleByEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false, promoted: false });
  });
});
