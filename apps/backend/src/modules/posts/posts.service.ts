import { Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenError } from '@casl/ability';
import {
  type CreatePostInput,
  type ListPostsQuery,
  type ListPostsResponse,
  type Post,
  type UpdatePostInput,
} from '@repo/contracts/posts';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import { type DbPost } from '../../infrastructure/database/schema';

import { PostsRepository } from './posts.repository';

@Injectable()
export class PostsService {
  constructor(
    private readonly repo: PostsRepository,
    private readonly abilities: AbilityFactory,
  ) {}

  async list(query: ListPostsQuery, user: AuthenticatedUser | null): Promise<ListPostsResponse> {
    const ability = this.abilities.createForUser(user);

    // Unless the caller can manage Post, restrict listing to published posts.
    const published =
      query.published !== undefined
        ? query.published
        : ability.can('manage', 'Post')
          ? undefined
          : true;

    const { data, total } = await this.repo.list({
      page: query.page,
      perPage: query.perPage,
      ...(published !== undefined ? { published } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
    });

    return {
      data: data.map((r) => this.toApi(r)),
      page: query.page,
      perPage: query.perPage,
      total,
    };
  }

  async findOne(id: string, user: AuthenticatedUser | null): Promise<Post> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Post ${id} not found.` },
      });
    }

    const ability = this.abilities.createForUser(user);
    ForbiddenError.from(ability).throwUnlessCan('read', this.asSubject(row));

    return this.toApi(row);
  }

  async create(input: CreatePostInput, user: AuthenticatedUser): Promise<Post> {
    const ability = this.abilities.createForUser(user);
    ForbiddenError.from(ability).throwUnlessCan('create', 'Post');

    const row = await this.repo.create(user.id, input);
    return this.toApi(row);
  }

  async update(id: string, input: UpdatePostInput, user: AuthenticatedUser): Promise<Post> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Post ${id} not found.` },
      });
    }

    const ability = this.abilities.createForUser(user);
    ForbiddenError.from(ability).throwUnlessCan('update', this.asSubject(existing));

    const row = await this.repo.update(id, input);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Post ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Post ${id} not found.` },
      });
    }

    const ability = this.abilities.createForUser(user);
    ForbiddenError.from(ability).throwUnlessCan('delete', this.asSubject(existing));

    await this.repo.delete(id);
  }

  /** Tag a Drizzle row as the CASL subject `Post` for instance-level rules. */
  private asSubject(row: DbPost): DbPost & { __caslSubjectType__: 'Post' } {
    return Object.assign(row, { __caslSubjectType__: 'Post' as const });
  }

  private toApi(row: DbPost): Post {
    return {
      id: row.id,
      authorId: row.authorId,
      title: row.title,
      content: row.content,
      published: row.published,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
