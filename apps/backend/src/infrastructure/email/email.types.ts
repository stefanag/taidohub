/**
 * Email infrastructure types. The `EmailService` interface is the single
 * abstraction the rest of the app depends on; v1 ships `ConsoleEmailService`
 * behind it. A real provider (Resend / SMTP / Postmark) is a follow-up class
 * implementing the same interface — see spec §6.3.
 */

/** Locales the templates render copy for. Anything else falls back to `en`. */
export type EmailLocale = 'en' | 'sv' | 'fi';

export interface SendInviteArgs {
  to: string;
  /** Recipient's preferred locale; unknown values fall back to `en`. */
  locale: string;
  /** Absolute URL to the public set-password page, token included. */
  setPasswordUrl: string;
  /** Display name of the sysadmin who issued the invite, or null. */
  inviterName: string | null;
}

export interface SendPasswordResetArgs {
  to: string;
  locale: string;
  /** Absolute URL the user opens to choose a new password. */
  resetUrl: string;
}

export interface SendAdminPasswordResetArgs {
  to: string;
  locale: string;
  resetUrl: string;
  /** Display name of the sysadmin who triggered the reset, or null. */
  adminName: string | null;
}

/** The abstraction the app depends on. v1 impl: `ConsoleEmailService`. */
export interface EmailService {
  sendInvite(args: SendInviteArgs): Promise<void>;
  sendPasswordReset(args: SendPasswordResetArgs): Promise<void>;
  sendAdminPasswordReset(args: SendAdminPasswordResetArgs): Promise<void>;
}

/** DI token for injecting the `EmailService` implementation. */
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

/** A rendered plain-text email (subject + body). */
export interface RenderedEmail {
  subject: string;
  body: string;
}
