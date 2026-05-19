import { Injectable, NotFoundException } from '@nestjs/common';
import { type Role, type User } from '@repo/contracts/users';

import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  async findOne(id: string): Promise<User> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async list(limit?: number, offset?: number): Promise<User[]> {
    const rows = await this.repo.list(limit, offset);
    return rows.map((r) => this.toApi(r));
  }

  /** Map the internal Drizzle row to the API-facing shape from `@repo/contracts`. */
  private toApi(row: {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    image: string | null;
    role: string;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      image: row.image,
      role: row.role as Role,
      deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
