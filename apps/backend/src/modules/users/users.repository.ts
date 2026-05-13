import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
} from '../../infrastructure/database/client.js';
import { user } from '../../infrastructure/database/schema/index.js';

/**
 * Repository — the only file in the users module allowed to touch Drizzle.
 * Services consume its async methods; cross-module callers must go through
 * `UsersService`.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string) {
    const rows = await this.db.select().from(user).where(eq(user.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await this.db.select().from(user).where(eq(user.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async list(limit = 50, offset = 0) {
    return this.db.select().from(user).limit(limit).offset(offset);
  }
}
