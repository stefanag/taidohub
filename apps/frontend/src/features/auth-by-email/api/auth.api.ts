import { oauthProviderClient } from '@better-auth/oauth-provider/client';
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
  // During an OAuth authorization (an AI client connecting over MCP), the
  // login and consent pages are opened with a signed query. This plugin
  // forwards it on sign-in and consent so better-auth can resume the flow.
  plugins: [oauthProviderClient()],
});

/**
 * Where better-auth wants the browser to go next, if anywhere. Set when a
 * sign-in or consent resumes an OAuth authorization: the URL leads back to the
 * AI client with an authorization code (or an error).
 */
function redirectTarget(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { redirect, url } = data as { redirect?: unknown; url?: unknown };
  return redirect === true && typeof url === 'string' ? url : undefined;
}

export const { useSession } = authClient;

/**
 * Signs in. Resolves with a URL to leave the app for when the sign-in resumes
 * an OAuth authorization; otherwise with `undefined`.
 */
export async function signInWithEmail(input: SignInWithEmailInput): Promise<string | undefined> {
  const result = await authClient.signIn.email({
    email: input.email,
    password: input.password,
  });
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign in failed.');
  }
  return redirectTarget(result.data);
}

/** Thrown by {@link respondToOAuthConsent} when the user may not grant access. */
export class OAuthConsentNotAllowedError extends Error {
  constructor() {
    super('MCP_NOT_ALLOWED');
    this.name = 'OAuthConsentNotAllowedError';
  }
}

/**
 * Accepts or denies an OAuth client's request for access. Resolves with the URL
 * that returns the browser to the client.
 */
export async function respondToOAuthConsent(accept: boolean): Promise<string> {
  const result = await authClient.$fetch('/oauth2/consent', {
    method: 'POST',
    body: { accept },
  });
  if (result.error) {
    if (result.error.status === 403) throw new OAuthConsentNotAllowedError();
    throw new Error(result.error.message ?? 'Consent failed.');
  }
  const url = redirectTarget(result.data);
  if (!url) throw new Error('Consent failed.');
  return url;
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
