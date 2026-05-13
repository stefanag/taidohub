/**
 * Post resource schemas. Used by the backend for request/response validation
 * (via `nestjs-zod`'s `ZodValidationPipe`) and by the frontend to parse fetch
 * responses inside `entities/post/api/`.
 */
import { z } from './zod-openapi.js';

const ISO_DATETIME_EXAMPLE = '2025-04-02T08:00:00.000Z';

export const PostSchema = z
  .object({
    id: z.string().uuid().describe('Unique identifier (UUID v4).'),
    authorId: z.string().uuid().describe('Identifier of the user who authored the post.'),
    title: z.string().min(1).max(200).describe('Post title (1–200 chars).'),
    content: z.string().describe('Body content; Markdown allowed.'),
    published: z.boolean().describe('Whether the post is visible to non-author readers.'),
    createdAt: z.string().datetime().describe('ISO-8601 timestamp the post was created.'),
    updatedAt: z.string().datetime().describe('ISO-8601 timestamp the post was last modified.'),
  })
  .meta({
    id: 'Post',
    description: 'A blog post.',
    example: {
      id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      authorId: '4a3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      title: 'Hello, world!',
      content: 'My first post.',
      published: true,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export const CreatePostSchema = z
  .object({
    title: z.string().min(1).max(200).describe('Post title (1–200 chars).'),
    content: z.string().describe('Body content; Markdown allowed.'),
    published: z
      .boolean()
      .default(false)
      .describe('Whether to publish immediately (defaults to draft).'),
  })
  .meta({
    id: 'CreatePostInput',
    description: 'Payload for creating a new post.',
    example: {
      title: 'Hello, world!',
      content: 'My first post.',
      published: false,
    },
  });

export const UpdatePostSchema = CreatePostSchema.partial().meta({
  id: 'UpdatePostInput',
  description: 'Payload for partially updating an existing post.',
  example: {
    title: 'Hello, world! (revised)',
  },
});

export const ListPostsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1).describe('1-indexed page number.'),
    perPage: z
      .coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(20)
      .describe('Page size (max 100).'),
    published: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
      .optional()
      .describe('Filter by published flag.'),
    q: z.string().optional().describe('Full-text-ish search across title/content.'),
  })
  .meta({
    id: 'ListPostsQuery',
    description: 'Query parameters accepted by `GET /api/posts`.',
    example: {
      page: 1,
      perPage: 20,
      published: true,
    },
  });

export const ListPostsResponseSchema = z
  .object({
    data: PostSchema.array(),
    page: z.number().int().positive(),
    perPage: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  })
  .meta({
    id: 'ListPostsResponse',
    description: 'A page of posts plus pagination metadata.',
    example: {
      data: [
        {
          id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
          authorId: '4a3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
          title: 'Hello, world!',
          content: 'My first post.',
          published: true,
          createdAt: ISO_DATETIME_EXAMPLE,
          updatedAt: ISO_DATETIME_EXAMPLE,
        },
      ],
      page: 1,
      perPage: 20,
      total: 1,
    },
  });

export type Post = z.infer<typeof PostSchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;
export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;
export type ListPostsResponse = z.infer<typeof ListPostsResponseSchema>;

export const PostsOpenApiRegistry = {
  Post: PostSchema,
  CreatePostInput: CreatePostSchema,
  UpdatePostInput: UpdatePostSchema,
  ListPostsQuery: ListPostsQuerySchema,
  ListPostsResponse: ListPostsResponseSchema,
} as const;
