/**
 * Public API for `features/auth-by-email`.
 */
export {
  authClient,
  EmailNotVerifiedError,
  InvalidResetTokenError,
  OAuthConsentNotAllowedError,
  requestPasswordReset,
  resetPassword,
  RESET_PASSWORD_PATH,
  resendVerificationEmail,
  VERIFY_EMAIL_PATH,
  respondToOAuthConsent,
  signInWithEmail,
  signOut,
  useSession,
  type Session,
} from './api/auth.api.js';
export { sessionKeys, sessionQueryOptions } from './model/auth.queries.js';
export { useSignOut } from './model/useSignOut.js';
export { ForgotPasswordForm } from './ui/ForgotPasswordForm.js';
export { LoginForm, type LoginFormProps } from './ui/LoginForm.js';
export { ResetPasswordForm, type ResetPasswordFormProps } from './ui/ResetPasswordForm.js';
