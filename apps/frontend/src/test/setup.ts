import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { resetPostStore } from '@/entities/post';

import { server } from './msw-server.js';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
  resetPostStore();
});

afterAll(() => {
  server.close();
});
