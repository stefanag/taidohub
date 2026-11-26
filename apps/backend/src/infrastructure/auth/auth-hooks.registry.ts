import { Injectable } from '@nestjs/common';

/**
 * Decides whether a sign-up through a social provider (Google) may create an
 * account, and completes it afterwards. Implemented by the registration
 * module, which owns the checks (age, federation, accepted terms).
 */
export interface SocialSignUpHandler {
  /** True when `intent` is a valid, unexpired registration intent. */
  allow(intent: unknown): Promise<boolean>;
  /** Writes the new user's profile and acknowledgements from the intent. */
  complete(userId: string, intent: unknown): Promise<void>;
}

/**
 * Late-bound hooks for better-auth. better-auth is built before any feature
 * module exists, and the registration module itself depends on better-auth,
 * so the handler registers itself here at startup instead of being injected
 * into the better-auth factory. Without a handler, social sign-up is refused.
 */
@Injectable()
export class AuthHooksRegistry {
  socialSignUp: SocialSignUpHandler | null = null;
}
