import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/react';

import { SignInProvidersSchema, type Session, type SignInProviders, type SignInWithEmailInput } from '@repo/contracts/auth';
import { AccountRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

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
    if (result.error.code === 'EMAIL_NOT_VERIFIED') throw new EmailNotVerifiedError();
    throw new Error(result.error.message ?? 'Sign in failed.');
  }
  return redirectTarget(result.data);
}

/** Thrown by {@link signInWithEmail} when a self-registered account has not confirmed its email. */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('EMAIL_NOT_VERIFIED');
    this.name = 'EmailNotVerifiedError';
  }
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

/** Which sign-in methods besides email and password this environment offers. */
export async function getSignInProviders(): Promise<SignInProviders> {
  return SignInProvidersSchema.parse(await httpClient(AccountRoutes.signInProviders));
}

/**
 * Sends the browser to Google. Only signs in existing users: an unknown
 * address comes back to `errorPath?error=signup_disabled`.
 */
export async function signInWithGoogle(errorPath = '/login'): Promise<void> {
  const origin = window.location.origin;
  const result = await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${origin}/dashboard`,
    errorCallbackURL: `${origin}${errorPath}`,
  });
  if (result.error) throw new Error(result.error.message ?? 'Google sign-in failed.');
}

/**
 * Sends the browser to Google to create an account, carrying the
 * registration intent the server issued after checking age, federation and
 * the accepted texts.
 */
export async function registerWithGoogle(intent: string): Promise<void> {
  const origin = window.location.origin;
  const result = await authClient.signIn.social({
    provider: 'google',
    requestSignUp: true,
    additionalData: { registrationIntent: intent },
    callbackURL: `${origin}/dashboard`,
    newUserCallbackURL: `${origin}/dashboard`,
    errorCallbackURL: `${origin}/register`,
  });
  if (result.error) throw new Error(result.error.message ?? 'Google sign-up failed.');
}

/** One way to sign in to the account: `credential` (password) or `google`. */
export interface SignInAccount {
  id: string;
  providerId: string;
}

/** The signed-in user's ways to sign in. */
export async function listSignInAccounts(): Promise<SignInAccount[]> {
  const result = await authClient.listAccounts();
  if (result.error) throw new Error(result.error.message ?? 'Could not list sign-in methods.');
  return (result.data ?? []).map((a) => ({ id: a.id, providerId: a.providerId }));
}

/** Where the profile page lands after connecting Google (or failing to). */
export const PROFILE_PATH = '/profile';

/**
 * Sends the browser to Google to connect a Google account to the signed-in
 * user; its address may differ from the TaidoHub address. Comes back to the
 * profile page with `?linked=google`, or `?error=<code>`.
 */
export async function linkGoogle(): Promise<void> {
  const origin = window.location.origin;
  const result = await authClient.linkSocial({
    provider: 'google',
    callbackURL: `${origin}${PROFILE_PATH}?linked=google`,
    errorCallbackURL: `${origin}${PROFILE_PATH}`,
  });
  if (result.error) throw new Error(result.error.message ?? 'Could not connect Google.');
}

/** The session is too old for a sensitive change; sign in again first. */
export class SessionNotFreshError extends Error {
  constructor() {
    super('SESSION_NOT_FRESH');
    this.name = 'SessionNotFreshError';
  }
}

/** Removes one way to sign in. The server refuses to remove the last one. */
export async function unlinkSignInAccount(accountId: string): Promise<void> {
  const result = await authClient.unlinkAccount({ accountId });
  if (result.error) {
    if (result.error.code === 'SESSION_NOT_FRESH') throw new SessionNotFreshError();
    throw new Error(result.error.message ?? 'Could not remove the sign-in method.');
  }
}

/** Where the email confirmation link lands (see the verify-email page). */
export const VERIFY_EMAIL_PATH = '/verify-email';

/**
 * Sends a new confirmation link to a self-registered account. better-auth
 * answers the same whether or not the address is known.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const result = await authClient.sendVerificationEmail({
    email,
    callbackURL: `${window.location.origin}${VERIFY_EMAIL_PATH}`,
  });
  if (result.error) throw new Error(result.error.message ?? 'Could not send the link.');
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}

export type { Session };

/** Where better-auth sends the user from the emailed reset link. */
export const RESET_PASSWORD_PATH = '/reset-password';

/**
 * Ask for a password-reset email. better-auth answers the same whether or not
 * the address has an account, so this resolves in both cases and the UI must
 * not say which. The link in the email lands on {@link RESET_PASSWORD_PATH}
 * with `?token=` (or `?error=INVALID_TOKEN` once expired).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const result = await authClient.requestPasswordReset({
    email,
    redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
  });
  if (result.error) {
    throw new Error(result.error.message ?? 'Could not request a password reset.');
  }
}

/** The reset token is unknown, used or expired. */
export class InvalidResetTokenError extends Error {
  constructor() {
    super('INVALID_TOKEN');
    this.name = 'InvalidResetTokenError';
  }
}

/** Set a new password with the token from a reset link. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const result = await authClient.resetPassword({ token, newPassword });
  if (result.error) {
    if (result.error.code === 'INVALID_TOKEN') throw new InvalidResetTokenError();
    throw new Error(result.error.message ?? 'Could not reset the password.');
  }
}
