import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateShogoTitleInput,
  ShogoTitle,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbShogoTitle } from '../../infrastructure/database/schema/index.js';

import { ShogoTitlePatch, ShogoTitlesRepository } from './shogo-titles.repository.js';

@Injectable()
export class ShogoTitlesService {
  constructor(private readonly repo: ShogoTitlesRepository) {}

  async list(): Promise<ShogoTitle[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findByCode(code: string): Promise<ShogoTitle> {
    const row = await this.repo.findByCode(code);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Shogo title ${code} not found.` },
      });
    }
    return this.toApi(row);
  }

  async create(input: CreateShogoTitleInput, _actor: AuthenticatedUser): Promise<ShogoTitle> {
    const row = await this.repo.insert({
      code: input.code,
      nameEn: input.nameEn,
      nameSv: input.nameSv,
      nameFi: input.nameFi,
      nameJa: input.nameJa,
      minRankId: input.minRankId,
      sortOrder: input.sortOrder ?? 0,
    });
    return this.toApi(row);
  }

  async update(
    code: string,
    input: UpdateShogoTitleInput,
    _actor: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    const patch: ShogoTitlePatch = {};
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('nameJa' in input) patch.nameJa = input.nameJa!;
    if ('minRankId' in input) patch.minRankId = input.minRankId!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;

    const row = await this.repo.update(code, patch);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Shogo title ${code} not found.` },
      });
    }
    return this.toApi(row);
  }

  async delete(code: string): Promise<void> {
    const existing = await this.repo.findByCode(code);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Shogo title ${code} not found.` },
      });
    }
    const [history, profiles] = await Promise.all([
      this.repo.countHistoryUsingShogo(code),
      this.repo.countProfilesUsingShogo(code),
    ]);
    if (history + profiles > 0) {
      throw new ConflictException({
        error: {
          code: 'SHOGO_IN_USE',
          message: `Cannot delete: ${history} history row(s), ${profiles} user profile(s) still reference this shogo.`,
        },
      });
    }
    await this.repo.delete(code);
  }

  private toApi(row: DbShogoTitle): ShogoTitle {
    return {
      code: row.code,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      nameJa: row.nameJa,
      minRankId: row.minRankId,
      sortOrder: row.sortOrder,
    };
  }
}
