import { setupServer } from 'msw/node';

/**
 * Centralised MSW server for Vitest. Currently starts with an empty handler
 * set — each test that needs network mocking uses `server.use(...)` to push
 * its own handlers. When a long-lived entity gains an MSW handler set,
 * re-add it here so it's available to every test.
 */
export const server = setupServer();
