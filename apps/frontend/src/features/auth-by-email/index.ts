/**
 * Public API for `features/auth-by-email`.
 */
export {
  authClient,
  InvalidResetTokenError,
  OAuthConsentNotAllowedError,
  requestPasswordReset,
  resetPassword,
  RESET_PASSWORD_PATH,
  respondToOAuthConsent,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  useSession,
  type Session,
} from './api/auth.api.js';
export { sessionKeys, sessionQueryOptions } from './model/auth.queries.js';
export { useSignOut } from './model/useSignOut.js';
export { ForgotPasswordForm } from './ui/ForgotPasswordForm.js';
export { LoginForm, type LoginFormProps } from './ui/LoginForm.js';
export { ResetPasswordForm, type ResetPasswordFormProps } from './ui/ResetPasswordForm.js';
export { SignupForm, type SignupFormProps } from './ui/SignupForm.js';
