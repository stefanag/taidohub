/**
 * Public API for `features/auth-by-email`.
 */
export {
  authClient,
  EmailNotVerifiedError,
  getSignInProviders,
  InvalidResetTokenError,
  linkGoogle,
  listSignInAccounts,
  OAuthConsentNotAllowedError,
  requestPasswordReset,
  resetPassword,
  RESET_PASSWORD_PATH,
  resendVerificationEmail,
  VERIFY_EMAIL_PATH,
  respondToOAuthConsent,
  SessionNotFreshError,
  unlinkSignInAccount,
  type SignInAccount,
  registerWithGoogle,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  useSession,
  type Session,
} from './api/auth.api.js';
export {
  sessionKeys,
  sessionQueryOptions,
  signInAccountsQueryOptions,
  signInProvidersQueryOptions,
} from './model/auth.queries.js';
export { useSignOut } from './model/useSignOut.js';
export { ForgotPasswordForm } from './ui/ForgotPasswordForm.js';
export { GoogleSignInButton } from './ui/GoogleSignInButton.js';
export { LoginForm, type LoginFormProps } from './ui/LoginForm.js';
export { ResetPasswordForm, type ResetPasswordFormProps } from './ui/ResetPasswordForm.js';
export { SignInMethodsSection } from './ui/SignInMethodsSection.js';
