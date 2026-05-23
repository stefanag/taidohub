import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CHECK_ABILITY_KEY } from '../../infrastructure/ability/check-ability.decorator.js';

import { ProfileController } from './profile.controller.js';

describe('ProfileController — authorization metadata', () => {
  it('gates GET /users/:id/profile with the sysadmin manage-User ability', () => {
    const meta = Reflect.getMetadata(
      CHECK_ABILITY_KEY,
      ProfileController.prototype.getByUserId,
    );
    expect(meta).toEqual([{ action: 'manage', subject: 'User' }]);
  });

  it('leaves the self-scoped me/profile handlers ungated', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, ProfileController.prototype.getOwn),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, ProfileController.prototype.updateOwn),
    ).toBeUndefined();
  });
});
