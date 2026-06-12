import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbBeltSystem } from '../../infrastructure/database/schema/index.js';

import { BeltSystemsRepository } from './belt-systems.repository.js';

@Injectable()
export class BeltSystemsService {
  constructor(private readonly repo: BeltSystemsRepository) {}

  async list(): Promise<BeltSystem[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findById(id: string): Promise<BeltSystem> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Belt system ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async create(input: CreateBeltSystemInput, _actor: AuthenticatedUser): Promise<BeltSystem> {
    const row = await this.repo.insert({
      code: input.code,
      nameEn: input.nameEn,
      nameSv: input.nameSv,
      nameFi: input.nameFi,
      sortOrder: input.sortOrder ?? 0,
    });
    return this.toApi(row);
  }

  async update(
    id: string,
    input: UpdateBeltSystemInput,
    _actor: AuthenticatedUser,
  ): Promise<BeltSystem> {
    const patch: Partial<DbBeltSystem> = {};
    if ('code' in input) patch.code = input.code!;
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;

    const row = await this.repo.update(id, patch);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Belt system ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Belt system ${id} not found.` },
      });
    }
    const inUse = await this.repo.countRanksUsingSystem(id);
    if (inUse > 0) {
      throw new ConflictException({
        error: {
          code: 'SYSTEM_IN_USE',
          message: `Cannot delete: ${inUse} rank(s) still reference this system.`,
        },
      });
    }
    await this.repo.delete(id);
  }

  private toApi(row: DbBeltSystem): BeltSystem {
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
}
