/**
 * User schemas. Mirrors the better-auth `user` table fields the API exposes to
 * clients (we deliberately do NOT expose password hashes, internal flags, etc.).
 */
import { z } from './zod-openapi.js';

export const RoleSchema = z
  .enum(['sysadmin', 'user'])
  .meta({
    id: 'Role',
    description: 'Global role on a user row.',
    example: 'user',
  });

export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = z
  .object({
    id: z.string().describe('Unique identifier — an opaque string assigned by the auth provider (not necessarily a UUID).'),
    email: z.string().email().describe('The user’s primary email address.'),
    name: z.string().nullable().describe('Display name; null until the user sets one.'),
    emailVerified: z.boolean().describe('Whether the email address has been verified.'),
    image: z.string().url().nullable().describe('URL to the user’s avatar, if any.'),
    role: RoleSchema.describe('Global role; org-scoped roles live in `organisation_membership`.'),
    deactivatedAt: z
      .string()
      .datetime()
      .nullable()
      .describe('When the account was deactivated. Null = active. Deactivated users cannot sign in.'),
    createdAt: z.string().datetime().describe('ISO-8601 timestamp the account was created.'),
    updatedAt: z.string().datetime().describe('ISO-8601 timestamp the account was last modified.'),
  })
  .meta({
    id: 'User',
    description: 'A user account exposed to API clients.',
    example: {
      id: 'kZ8x2mN4pQ7rT1vW9yA3bC6dE5fG0hJ2',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      emailVerified: true,
      image: 'https://example.com/avatars/ada.png',
      role: 'user',
      deactivatedAt: null,
      createdAt: '2025-01-15T12:34:56.000Z',
      updatedAt: '2025-04-02T08:00:00.000Z',
    },
  });

export type User = z.infer<typeof UserSchema>;

export const ListUsersQuerySchema = z
  .object({
    q: z.string().optional(),
    role: RoleSchema.optional(),
    deactivated: z.enum(['true', 'false', 'all']).default('false'),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
  })
  .meta({ id: 'ListUsersQuery' });

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const ListUsersResponseSchema = z
  .object({
    data: UserSchema.array(),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    perPage: z.number().int().min(1),
  })
  .meta({ id: 'ListUsersResponse' });

export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

export const UpdateUserSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    role: RoleSchema.optional(),
  })
  .meta({ id: 'UpdateUserInput' });

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const InviteUserSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(200).optional(),
  })
  .meta({ id: 'InviteUserInput' });

export type InviteUserInput = z.infer<typeof InviteUserSchema>;

export const SetInitialPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(200),
  })
  .meta({ id: 'SetInitialPasswordInput' });

export type SetInitialPasswordInput = z.infer<typeof SetInitialPasswordSchema>;

export const UsersOpenApiRegistry = {
  Role: RoleSchema,
  User: UserSchema,
  ListUsersQuery: ListUsersQuerySchema,
  ListUsersResponse: ListUsersResponseSchema,
  UpdateUserInput: UpdateUserSchema,
  InviteUserInput: InviteUserSchema,
  SetInitialPasswordInput: SetInitialPasswordSchema,
} as const;
