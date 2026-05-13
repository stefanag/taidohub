/**
 * `@repo/contracts` — single source of truth for the HTTP boundary between
 * `apps/backend` and `apps/frontend`.
 *
 * Importing the package barrel installs the Zod ↔ OpenAPI extension (via the
 * `./openapi.js` re-export) so `.openapi()` is available everywhere downstream
 * without needing to import the helper explicitly.
 */

// Side effect first: ensure `.openapi()` is installed before any resource
// module's schema definitions are referenced.
export * from './zod-openapi.js';

export * from './errors.js';
export * from './casl.js';
export * from './routes.js';
export * from './users.js';
export * from './posts.js';
export * from './auth.js';
export * from './openapi.js';
