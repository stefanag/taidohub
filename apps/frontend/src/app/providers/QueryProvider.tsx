import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as React from 'react';

import { createQueryClient } from '@/shared/api/queryClient';

export interface QueryProviderProps {
  children: React.ReactNode;
  /** Optional override — primarily for tests/Storybook to supply a fresh client. */
  client?: QueryClient;
}

/**
 * Wraps the app in a TanStack Query `QueryClientProvider` and mounts the
 * devtools (only meaningful in dev — Vite tree-shakes them out of prod builds
 * because we only render them when `import.meta.env.DEV` is true).
 */
export function QueryProvider({ children, client }: QueryProviderProps): React.ReactElement {
  const [queryClient] = React.useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
