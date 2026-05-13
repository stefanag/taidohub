import { createAuthClient } from 'better-auth/react';

import type {
  Session,
  SignInWithEmailInput,
  SignUpWithEmailInput,
} from '@repo/contracts/auth';

import { env } from '@/shared/lib/env';

/**
 * better-auth React client. Points at the backend's `/api/auth/*` mount.
 * `baseURL` is the API origin (no path) — better-auth appends `/api/auth/*`
 * itself.
 *
 * NOTE on assumptions: better-auth's React client surface is
 * `{ signIn: { email }, signUp: { email }, signOut, useSession, ... }`. If the
 * pinned `better-auth` version diverges, adjust call sites in this file only.
 */
export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
});

export const { useSession } = authClient;

export async function signInWithEmail(input: SignInWithEmailInput): Promise<void> {
  const result = await authClient.signIn.email({
    email: input.email,
    password: input.password,
  });
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign in failed.');
  }
}

export async function signUpWithEmail(input: SignUpWithEmailInput): Promise<void> {
  const result = await authClient.signUp.email({
    email: input.email,
    password: input.password,
    name: input.name ?? '',
  });
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign up failed.');
  }
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}

export type { Session };
