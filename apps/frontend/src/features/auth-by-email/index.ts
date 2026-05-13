/**
 * Public API for `features/auth-by-email`.
 */
export {
  authClient,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  useSession,
  type Session,
} from './api/auth.api.js';
export { sessionKeys, sessionQueryOptions } from './model/auth.queries.js';
export { LoginForm, type LoginFormProps } from './ui/LoginForm.js';
export { SignupForm, type SignupFormProps } from './ui/SignupForm.js';
