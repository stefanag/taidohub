/**
 * User schemas. Mirrors the better-auth `user` table fields the API exposes to
 * clients (we deliberately do NOT expose password hashes, internal flags, etc.).
 */
import { z } from './zod-openapi.js';

export const UserSchema = z
  .object({
    id: z.string().uuid().describe('Unique identifier (UUID v4).'),
    email: z.string().email().describe('The user’s primary email address.'),
    name: z.string().nullable().describe('Display name; null until the user sets one.'),
    emailVerified: z.boolean().describe('Whether the email address has been verified.'),
    image: z.string().url().nullable().describe('URL to the user’s avatar, if any.'),
    createdAt: z.string().datetime().describe('ISO-8601 timestamp the account was created.'),
    updatedAt: z.string().datetime().describe('ISO-8601 timestamp the account was last modified.'),
  })
  .meta({
    id: 'User',
    description: 'A user account exposed to API clients.',
    example: {
      id: '4a3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      emailVerified: true,
      image: 'https://example.com/avatars/ada.png',
      createdAt: '2025-01-15T12:34:56.000Z',
      updatedAt: '2025-04-02T08:00:00.000Z',
    },
  });

export type User = z.infer<typeof UserSchema>;

export const UsersOpenApiRegistry = {
  User: UserSchema,
} as const;
