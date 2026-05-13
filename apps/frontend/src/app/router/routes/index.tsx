import { createRoute, Link } from '@tanstack/react-router';

import { Button } from '@/shared/ui';

import { rootRoute } from './__root.js';

function IndexComponent(): React.ReactElement {
  return (
    <main className="container py-16">
      <h1 className="text-4xl font-bold tracking-tight">taidohub</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">
        A Feature-Sliced Design seed for a Vite + React + TypeScript app, wired
        to a NestJS backend over a typed `@repo/contracts` HTTP boundary.
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild>
          <Link to="/posts">Browse posts</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
});

export const Route = indexRoute;
