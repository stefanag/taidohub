import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CreateShogoTitleInput,
  ShogoTitle,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type DbShogoTitle,
  type DbNewShogoTitle,
} from '../../infrastructure/database/schema/index.js';

import { LookupTableService } from './lookup-table.service.js';
import { ShogoTitlePatch, ShogoTitlesRepository } from './shogo-titles.repository.js';

/**
 * CRUD for `shogo_titles` — Renshi, Kyoshi, Hanshi (sortable
 * honorifics). Extends {@link LookupTableService}. The natural key
 * is the textual `code` ('renshi', 'kyoshi', etc.) rather than a
 * UUID; controllers and specs still call `findByCode(code)`, so a
 * thin alias preserves that public surface without bypassing the
 * base.
 *
 * The delete guard is two-table: a shogo can be referenced from
 * `rank_history.shogo_title` AND `user_profile.shogo_title`. Both
 * counts are summed for the user-facing message.
 */
@Injectable()
export class ShogoTitlesService extends LookupTableService<
  string,
  DbShogoTitle,
  ShogoTitle,
  CreateShogoTitleInput,
  UpdateShogoTitleInput,
  DbNewShogoTitle,
  ShogoTitlePatch
> {
  protected readonly entityLabel = 'Shogo title';

  constructor(protected readonly repo: ShogoTitlesRepository) {
    super();
  }

  findByCode(code: string): Promise<ShogoTitle> {
    return this.findByKey(code);
  }

  protected override async lookupByKey(key: string) {
    return this.repo.findByCode(key);
  }

  override create(
    input: CreateShogoTitleInput,
    _actor?: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    return super.create(input);
  }

  override update(
    code: string,
    input: UpdateShogoTitleInput,
    _actor?: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    return super.update(code, input);
  }

  protected toApi(row: DbShogoTitle): ShogoTitle {
    return {
      code: row.code,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      nameJa: row.nameJa,
      minRankId: row.minRankId,
      sortOrder: row.sortOrder,
      visuals: row.visuals as ShogoTitle['visuals'],
    };
  }

  protected inputToInsertValues(input: CreateShogoTitleInput): DbNewShogoTitle {
    return {
      code: input.code,
      nameEn: input.nameEn,
      nameSv: input.nameSv,
      nameFi: input.nameFi,
      nameJa: input.nameJa,
      minRankId: input.minRankId,
      sortOrder: input.sortOrder ?? 0,
      visuals: input.visuals,
    };
  }

  protected inputToPatch(input: UpdateShogoTitleInput): ShogoTitlePatch {
    const patch: ShogoTitlePatch = {};
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('nameJa' in input) patch.nameJa = input.nameJa!;
    if ('minRankId' in input) patch.minRankId = input.minRankId!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;
    if ('visuals' in input) patch.visuals = input.visuals!;
    return patch;
  }

  protected async assertCanDelete(existing: DbShogoTitle): Promise<void> {
    const [history, profiles] = await Promise.all([
      this.repo.countHistoryUsingShogo(existing.code),
      this.repo.countProfilesUsingShogo(existing.code),
    ]);
    if (history + profiles > 0) {
      throw new ConflictException({
        error: {
          code: 'SHOGO_IN_USE',
          message: `Cannot delete: ${history} history row(s), ${profiles} user profile(s) still reference this shogo.`,
        },
      });
    }
  }
}
