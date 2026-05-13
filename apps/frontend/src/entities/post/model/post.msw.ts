import { http, HttpResponse } from 'msw';

import {
  CreatePostSchema,
  type ListPostsResponse,
  type Post,
  UpdatePostSchema,
} from '@repo/contracts/posts';
import { PostsRoutes } from '@repo/contracts/routes';

import { env } from '@/shared/lib/env';

/**
 * MSW handlers for the Post entity. Shared by:
 *   - frontend Vitest tests (`src/test/setup.ts` → `server.use(...)`)
 *   - Storybook stories (`.storybook/preview.tsx` via `msw-storybook-addon`)
 *
 * Request bodies are validated against the same Zod schemas the backend uses,
 * so a story that "works" here cannot pass payloads the API would reject.
 */

const DEFAULT_AUTHOR_ID = '4a3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const seed: Post[] = [
  {
    id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
    authorId: DEFAULT_AUTHOR_ID,
    title: 'Hello, world!',
    content: 'My first post.',
    published: true,
    createdAt: '2025-04-02T08:00:00.000Z',
    updatedAt: '2025-04-02T08:00:00.000Z',
  },
];

const store: Map<string, Post> = new Map(seed.map((post) => [post.id, post]));

function abs(path: string): string {
  return `${env.VITE_API_URL}${path}`;
}

export const postHandlers = [
  http.get(abs(PostsRoutes.base), ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const perPage = Number(url.searchParams.get('perPage') ?? '20');
    const publishedParam = url.searchParams.get('published');
    const q = url.searchParams.get('q');

    let items = [...store.values()];
    if (publishedParam !== null) {
      const flag = publishedParam === 'true';
      items = items.filter((p) => p.published === flag);
    }
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(needle) ||
          p.content.toLowerCase().includes(needle),
      );
    }

    const start = (page - 1) * perPage;
    const data = items.slice(start, start + perPage);
    const body: ListPostsResponse = {
      data,
      page,
      perPage,
      total: items.length,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${env.VITE_API_URL}/api/posts/:id`, ({ params }) => {
    const id = String(params.id);
    const post = store.get(id);
    if (!post) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 },
      );
    }
    return HttpResponse.json(post);
  }),

  http.post(abs(PostsRoutes.base), async ({ request }) => {
    const body = await request.json();
    const parsed = CreatePostSchema.safeParse(body);
    if (!parsed.success) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid request body.',
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }
    const now = new Date().toISOString();
    const post: Post = {
      id: crypto.randomUUID(),
      authorId: DEFAULT_AUTHOR_ID,
      title: parsed.data.title,
      content: parsed.data.content,
      published: parsed.data.published,
      createdAt: now,
      updatedAt: now,
    };
    store.set(post.id, post);
    return HttpResponse.json(post, { status: 201 });
  }),

  http.patch(`${env.VITE_API_URL}/api/posts/:id`, async ({ params, request }) => {
    const id = String(params.id);
    const existing = store.get(id);
    if (!existing) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 },
      );
    }
    const body = await request.json();
    const parsed = UpdatePostSchema.safeParse(body);
    if (!parsed.success) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid request body.',
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }
    // Strip `undefined` values from the parsed patch so they don't overwrite
    // populated fields on `existing` — under exactOptionalPropertyTypes the
    // raw spread would also typecheck-fail.
    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    const next: Post = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    store.set(id, next);
    return HttpResponse.json(next);
  }),

  http.delete(`${env.VITE_API_URL}/api/posts/:id`, ({ params }) => {
    const id = String(params.id);
    if (!store.has(id)) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 },
      );
    }
    store.delete(id);
    return new HttpResponse(null, { status: 204 });
  }),
];

export function resetPostStore(): void {
  store.clear();
  for (const post of seed) {
    store.set(post.id, post);
  }
}
