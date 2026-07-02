/**
 * Barrel for every Drizzle table. `drizzle-kit` reads this file (see
 * `drizzle.config.ts`) to generate migrations, and the better-auth Drizzle
 * adapter receives it verbatim — so any new table must be re-exported here.
 */
export * from './users.js';
export * from './organisations.js';
export * from './audit-log.js';
export * from './memberships.js';
export * from './user-profile.js';
export * from './belt-systems.js';
export * from './belt-ranks.js';
export * from './shogo-titles.js';
export * from './rank-history.js';
export * from './labels.js';
export * from './feature-flag.js';
export * from './classification-category.js';
export * from './technique.js';
export * from './pattern.js';
export * from './user-content-progress.js';
export * from './feedback.js';
export * from './grading-requirements.js';
