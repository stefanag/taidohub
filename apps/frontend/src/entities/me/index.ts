export * from './api/me.api.js';
export * from './lib/hooks.js';
export { refreshSession } from './lib/refresh-session.js';

// Public-surface compaction: `useSession` and `Session` describe "the
// currently authenticated user", which is exactly what `entities/me`
// already models for memberships. Consumers OUTSIDE the auth-by-email
// feature should reach for `useSession` through `entities/me` so that
// "current actor" facts (memberships, session) live behind a single
// entity boundary. The actual implementation still lives in
// `features/auth-by-email` because that's where better-auth's wire
// adapter is wired up; we re-export here rather than move it because
// the feature owns the auth wire protocol (sign-in/up/out flows), and
// only the read-only "who is the actor" slice generalises.
//
// FSD strictly forbids an entity from importing a feature; the
// `steiger.config.js` override for this specific file documents that
// constraint and why the re-export is the chosen public surface.
export { useSession, type Session } from '@/features/auth-by-email';
