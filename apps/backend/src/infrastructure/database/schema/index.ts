/**
 * Barrel for every Drizzle table. `drizzle-kit` reads this file (see
 * `drizzle.config.ts`) to generate migrations, and the better-auth Drizzle
 * adapter receives it verbatim — so any new table must be re-exported here.
 */
export * from './users.js';
export * from './organisations.js';
export * from './audit-log.js';
export * from './memberships.js';
