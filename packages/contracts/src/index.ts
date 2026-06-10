/**
 * `@repo/contracts` — single source of truth for the HTTP boundary between
 * `apps/backend` and `apps/frontend`.
 *
 * Zod 4 provides `.meta({...})` natively, so no prototype extension is
 * required. The `./zod-openapi.js` re-export is kept for import stability
 * (existing files import `z` from there).
 */

export * from './zod-openapi.js';

export * from './errors.js';
export * from './casl.js';
export * from './routes.js';
export * from './users.js';
export * from './auth.js';
export * from './openapi.js';
export * from './organisations.js';
export * from './audit-log.js';
export * from './memberships.js';
export * from './profile.js';
export * from './belt-systems.js';
export * from './ranks.js';
export * from './shogo-titles.js';
export * from './rank-history.js';
export * from './labels.js';
export * from './feature-flags.js';
export * from './classification-category.js';
export * from './techniques.js';
