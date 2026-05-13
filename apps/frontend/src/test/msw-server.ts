import { setupServer } from 'msw/node';

import { postHandlers } from '@/entities/post';

/**
 * Centralised MSW server for Vitest. Reuses the same handlers each entity
 * exports from `model/*.msw.ts` so behavior under test == behavior in
 * Storybook == documented response shape in `@repo/contracts`.
 */
export const server = setupServer(...postHandlers);
