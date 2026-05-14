import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Load VITE_* env vars from the repo-root `.env` (matches the backend's
  // NestJS `envFilePath: ['../../.env', '.env']`). Single source of truth
  // for the monorepo.
  envDir: path.resolve(__dirname, '../..'),
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/app/router/routes',
      generatedRouteTree: './src/app/router/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
