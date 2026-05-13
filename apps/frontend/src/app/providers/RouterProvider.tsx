import { RouterProvider as TanStackRouterProvider } from '@tanstack/react-router';

import { router } from '@/app/router/router';

export function RouterProvider(): React.ReactElement {
  return <TanStackRouterProvider router={router} />;
}
