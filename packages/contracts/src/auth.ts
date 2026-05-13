/**
 * Auth schemas for the better-auth-backed endpoints under `/api/auth/*`.
 *
 * better-auth itself handles the HTTP routes — these schemas exist so the
 * Swagger docs accurately describe the request/response shapes (without us
 * re-implementing the endpoints) and so the frontend can validate inputs
 * before hitting the wire.
 */
import { UserSchema } from './users.js';
import { z } from './zod-openapi.js';

export const SignInWithEmailSchema = z
  .object({
    email: z.string().email().describe('Registered email address.'),
    password: z.string().min(8).describe('Account password (8+ chars).'),
  })
  .meta({
    id: 'SignInWithEmail',
    description: 'Payload for `POST /api/auth/sign-in/email`.',
    example: {
      email: 'ada@example.com',
      password: 'correct-horse-battery-staple',
    },
  });

export const SignUpWithEmailSchema = z
  .object({
    email: z.string().email().describe('Email address to register.'),
    password: z.string().min(8).describe('New account password (8+ chars).'),
    name: z.string().min(1).optional().describe('Optional display name.'),
  })
  .meta({
    id: 'SignUpWithEmail',
    description: 'Payload for `POST /api/auth/sign-up/email`.',
    example: {
      email: 'ada@example.com',
      password: 'correct-horse-battery-staple',
      name: 'Ada Lovelace',
    },
  });

export const SessionSchema = z
  .object({
    user: UserSchema,
    session: z.object({
      id: z.string().describe('Opaque session identifier.'),
      expiresAt: z.string().datetime().describe('ISO-8601 timestamp the session expires at.'),
    }),
  })
  .meta({
    id: 'Session',
    description:
      'The session payload returned by `GET /api/auth/get-session` for an authenticated request.',
    example: {
      user: {
        id: '4a3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        emailVerified: true,
        image: null,
        createdAt: '2025-01-15T12:34:56.000Z',
        updatedAt: '2025-04-02T08:00:00.000Z',
      },
      session: {
        id: 'sess_01HXYZ…',
        expiresAt: '2025-05-13T08:00:00.000Z',
      },
    },
  });

export type SignInWithEmailInput = z.infer<typeof SignInWithEmailSchema>;
export type SignUpWithEmailInput = z.infer<typeof SignUpWithEmailSchema>;
export type Session = z.infer<typeof SessionSchema>;

export const AuthOpenApiRegistry = {
  SignInWithEmail: SignInWithEmailSchema,
  SignUpWithEmail: SignUpWithEmailSchema,
  Session: SessionSchema,
} as const;
