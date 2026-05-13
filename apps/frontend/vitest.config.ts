import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // env.ts validates VITE_API_URL at module load; supply a dummy for tests
    // so the validation passes without depending on a real `.env`.
    env: {
      VITE_API_URL: 'http://localhost:3001',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'src/**/*.stories.*',
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/test/**',
        'src/app/router/routeTree.gen.ts',
      ],
    },
  },
});
