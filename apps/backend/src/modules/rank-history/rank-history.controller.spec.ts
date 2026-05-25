import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CHECK_ABILITY_KEY } from '../../infrastructure/ability/check-ability.decorator.js';

import { RankHistoryController } from './rank-history.controller.js';

describe('RankHistoryController — authorization metadata', () => {
  it('listForUser carries read RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.listForUser),
    ).toEqual([{ action: 'read', subject: 'RankHistory' }]);
  });

  it('create carries create RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.create),
    ).toEqual([{ action: 'create', subject: 'RankHistory' }]);
  });

  it('update carries update RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.update),
    ).toEqual([{ action: 'update', subject: 'RankHistory' }]);
  });

  it('remove carries delete RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.remove),
    ).toEqual([{ action: 'delete', subject: 'RankHistory' }]);
  });

  it('verify carries update RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.verify),
    ).toEqual([{ action: 'update', subject: 'RankHistory' }]);
  });

  it('unverify carries update RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.unverify),
    ).toEqual([{ action: 'update', subject: 'RankHistory' }]);
  });
});
