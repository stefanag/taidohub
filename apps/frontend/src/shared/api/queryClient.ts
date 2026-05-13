import { QueryClient } from '@tanstack/react-query';

/**
 * Factory for the singleton `QueryClient`. Lives in a factory (not a top-level
 * `const`) so each test/Storybook render can get a fresh client and avoid
 * leaking cache state across cases.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
