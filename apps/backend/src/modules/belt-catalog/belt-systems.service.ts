import { ConflictException, Injectable } from '@nestjs/common';
import type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type DbBeltSystem,
  type DbNewBeltSystem,
} from '../../infrastructure/database/schema/index.js';

import { BeltSystemPatch, BeltSystemsRepository } from './belt-systems.repository.js';
import { LookupTableService } from './lookup-table.service.js';

/**
 * CRUD for `belt_systems` — the system catalogue (kyu/dan,
 * black/coloured grading, kihon Taido, etc.). Extends
 * {@link LookupTableService} for the common `list/findByKey/create/
 * update/delete` plumbing; the entity-specific bits are the
 * row → API mapping, the insert/patch payload shape, and the
 * "ranks reference this system" delete guard.
 *
 * `findById` and the `_actor` parameters on `create`/`update` are
 * kept as thin compatibility wrappers so the controller call
 * signatures (which pass `@CurrentUser`) don't have to change.
 * The actor was always unused — sysadmin gating happens in the
 * CASL guard before the call reaches the service.
 */
@Injectable()
export class BeltSystemsService extends LookupTableService<
  string,
  DbBeltSystem,
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
  DbNewBeltSystem,
  BeltSystemPatch
> {
  protected readonly entityLabel = 'Belt system';

  constructor(protected readonly repo: BeltSystemsRepository) {
    super();
  }

  findById(id: string): Promise<BeltSystem> {
    return this.findByKey(id);
  }

  /**
   * Override the base lookup to call `findById` directly — the
   * repo's `findByKey` is just an alias, and routing through the
   * natural method keeps the spec mocks (which target `findById`)
   * working without forcing every test to add a `findByKey` stub.
   */
  protected override async lookupByKey(key: string) {
    return this.repo.findById(key);
  }

  override create(input: CreateBeltSystemInput, _actor?: AuthenticatedUser): Promise<BeltSystem> {
    return super.create(input);
  }

  override update(
    id: string,
    input: UpdateBeltSystemInput,
    _actor?: AuthenticatedUser,
  ): Promise<BeltSystem> {
    return super.update(id, input);
  }

  protected toApi(row: DbBeltSystem): BeltSystem {
    return {
      id: row.id,
      code: row.code,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  protected inputToInsertValues(input: CreateBeltSystemInput): DbNewBeltSystem {
    return {
      code: input.code,
      nameEn: input.nameEn,
      nameSv: input.nameSv,
      nameFi: input.nameFi,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  protected inputToPatch(input: UpdateBeltSystemInput): BeltSystemPatch {
    const patch: BeltSystemPatch = {};
    if ('code' in input) patch.code = input.code!;
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;
    return patch;
  }

  protected async assertCanDelete(existing: DbBeltSystem): Promise<void> {
    const inUse = await this.repo.countRanksUsingSystem(existing.id);
    if (inUse > 0) {
      throw new ConflictException({
        error: {
          code: 'SYSTEM_IN_USE',
          message: `Cannot delete: ${inUse} rank(s) still reference this system.`,
        },
      });
    }
  }
}
