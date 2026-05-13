import {
  ListPostsResponseSchema,
  PostSchema,
  type CreatePostInput,
  type ListPostsQuery,
  type ListPostsResponse,
  type Post,
  type UpdatePostInput,
} from '@repo/contracts/posts';
import { PostsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api/httpClient';

/**
 * Network surface for the Post entity.
 *
 * Every response is parsed with the Zod schemas from `@repo/contracts/posts`
 * so the frontend cannot drift away from the backend's actual response shape.
 */

export async function listPosts(query: ListPostsQuery): Promise<ListPostsResponse> {
  const raw = await httpClient(PostsRoutes.base, {
    query: {
      page: query.page,
      perPage: query.perPage,
      published: query.published,
      q: query.q,
    },
  });
  return ListPostsResponseSchema.parse(raw);
}

export async function getPost(id: string): Promise<Post> {
  const raw = await httpClient(PostsRoutes.byId(id));
  return PostSchema.parse(raw);
}

export async function createPost(input: CreatePostInput): Promise<Post> {
  const raw = await httpClient(PostsRoutes.base, {
    method: 'POST',
    body: input,
  });
  return PostSchema.parse(raw);
}

export async function updatePost(
  id: string,
  input: UpdatePostInput,
): Promise<Post> {
  const raw = await httpClient(PostsRoutes.byId(id), {
    method: 'PATCH',
    body: input,
  });
  return PostSchema.parse(raw);
}

export async function deletePost(id: string): Promise<void> {
  await httpClient(PostsRoutes.byId(id), { method: 'DELETE' });
}
