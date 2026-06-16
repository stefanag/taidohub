import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BeltRank,
  CreateBeltRankInput,
  PublicRankResponse,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbBeltRank } from '../../infrastructure/database/schema/index.js';

import { BeltRankPatch, BeltRanksRepository } from './belt-ranks.repository.js';

@Injectable()
export class BeltRanksService {
  constructor(private readonly repo: BeltRanksRepository) {}

  async list(): Promise<BeltRank[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findById(id: string): Promise<BeltRank> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async create(input: CreateBeltRankInput, _actor: AuthenticatedUser): Promise<BeltRank> {
    // Service-layer defence in depth (the Zod refine already covers this).
    if (input.publiclyVisible && (!input.slug || input.slug.length === 0)) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Slug is required when publicly visible.' },
      });
    }
    const orgId = input.organisationId ?? null;
    const collision = await this.repo.findBySystemAndLevel(orgId, input.systemId, input.level);
    if (collision) {
      throw new ConflictException({
        error: {
          code: 'LEVEL_TAKEN',
          message: `Level ${input.level} is already used in this system.`,
        },
      });
    }

    const row = await this.repo.insert({
      organisationId: orgId,
      systemId: input.systemId,
      level: input.level,
      sortOrder: input.sortOrder ?? 0,
      nameJa: input.nameJa ?? null,
      nameRomaji: input.nameRomaji,
      nameEn: input.nameEn ?? '',
      nameSv: input.nameSv ?? '',
      nameFi: input.nameFi ?? '',
      beltColor: input.beltColor,
      visuals: input.visuals,
      imageUrl: input.imageUrl ?? null,
      descriptionEn: input.descriptionEn ?? null,
      descriptionSv: input.descriptionSv ?? null,
      descriptionFi: input.descriptionFi ?? null,
      publiclyVisible: input.publiclyVisible ?? false,
      slug: input.slug ?? null,
      minAge: input.minAge ?? null,
      nextRankId: input.nextRankId ?? null,
    });
    return this.toApi(row);
  }

  async update(
    id: string,
    input: UpdateBeltRankInput,
    _actor: AuthenticatedUser,
  ): Promise<BeltRank> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }

    if ('nextRankId' in input && input.nextRankId === id) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A rank cannot point to itself as nextRankId.',
        },
      });
    }

    const effectivePublic = 'publiclyVisible' in input
      ? input.publiclyVisible
      : existing.publiclyVisible;
    const effectiveSlug = 'slug' in input ? input.slug : existing.slug;
    if (effectivePublic && (!effectiveSlug || effectiveSlug.length === 0)) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Slug is required when publicly visible.' },
      });
    }

    if ('systemId' in input || 'level' in input || 'organisationId' in input) {
      const orgId =
        'organisationId' in input ? input.organisationId ?? null : existing.organisationId;
      const sysId = 'systemId' in input ? input.systemId! : existing.systemId;
      const lvl = 'level' in input ? input.level! : existing.level;
      const collision = await this.repo.findBySystemAndLevel(orgId, sysId, lvl);
      if (collision && collision.id !== id) {
        throw new ConflictException({
          error: { code: 'LEVEL_TAKEN', message: `Level ${lvl} is already used in this system.` },
        });
      }
    }

    const patch = this.buildPatch(input);
    const row = await this.repo.update(id, patch);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async findPublicBySlug(slug: string): Promise<PublicRankResponse> {
    const row = await this.repo.findPublicBySlug(slug);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank with slug "${slug}" not found.` },
      });
    }
    const { systemCode, systemNameEn, systemNameSv, systemNameFi, orgShortCode, orgNameEn, orgNameSv, orgNameFi, ...rankRow } = row;
    return {
      rank: this.toApi(rankRow),
      system: {
        id: row.systemId,
        code: systemCode,
        nameEn: systemNameEn,
        nameSv: systemNameSv,
        nameFi: systemNameFi,
      },
      organisation: row.organisationId
        ? {
            id: row.organisationId,
            shortCode: orgShortCode!,
            nameEn: orgNameEn!,
            nameSv: orgNameSv!,
            nameFi: orgNameFi!,
          }
        : null,
    };
  }

  /**
   * RANK_IN_USE delete guard.
   * v1 covers three of the four reference types: `rank_history.rank_id`,
   * `belt_ranks.next_rank_id`, and `shogo_titles.min_rank_id`. The fourth —
   * `user_profile.current_rank_id` — is deferred until followup D4 ships
   * that column.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }
    const [history, pointers, shogos] = await Promise.all([
      this.repo.countHistoryUsingRank(id),
      this.repo.countNextRankPointers(id),
      this.repo.countShogosUsingRank(id),
    ]);
    if (history + pointers + shogos > 0) {
      throw new ConflictException({
        error: {
          code: 'RANK_IN_USE',
          message: `Cannot delete: ${history} history row(s), ${pointers} next-rank pointer(s), ${shogos} shogo title(s) still reference this rank.`,
        },
      });
    }
    await this.repo.delete(id);
  }

  private buildPatch(input: UpdateBeltRankInput): BeltRankPatch {
    const patch: BeltRankPatch = {};
    if ('organisationId' in input) patch.organisationId = input.organisationId ?? null;
    if ('systemId' in input) patch.systemId = input.systemId!;
    if ('level' in input) patch.level = input.level!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;
    if ('nameJa' in input) patch.nameJa = input.nameJa ?? null;
    if ('nameRomaji' in input) patch.nameRomaji = input.nameRomaji!;
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('beltColor' in input) patch.beltColor = input.beltColor!;
    if ('visuals' in input) patch.visuals = input.visuals!;
    if ('imageUrl' in input) patch.imageUrl = input.imageUrl ?? null;
    if ('descriptionEn' in input) patch.descriptionEn = input.descriptionEn ?? null;
    if ('descriptionSv' in input) patch.descriptionSv = input.descriptionSv ?? null;
    if ('descriptionFi' in input) patch.descriptionFi = input.descriptionFi ?? null;
    if ('publiclyVisible' in input) patch.publiclyVisible = input.publiclyVisible!;
    if ('slug' in input) patch.slug = input.slug ?? null;
    if ('minAge' in input) patch.minAge = input.minAge ?? null;
    if ('nextRankId' in input) patch.nextRankId = input.nextRankId ?? null;
    return patch;
  }

  private toApi(row: DbBeltRank): BeltRank {
    return {
      id: row.id,
      organisationId: row.organisationId,
      systemId: row.systemId,
      level: row.level,
      sortOrder: row.sortOrder,
      nameJa: row.nameJa,
      nameRomaji: row.nameRomaji,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      beltColor: row.beltColor,
      visuals: row.visuals as BeltRank['visuals'],
      imageUrl: row.imageUrl,
      descriptionEn: row.descriptionEn,
      descriptionSv: row.descriptionSv,
      descriptionFi: row.descriptionFi,
      publiclyVisible: row.publiclyVisible,
      slug: row.slug,
      minAge: row.minAge,
      nextRankId: row.nextRankId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
