import { createRoute, useNavigate } from '@tanstack/react-router';

import { LoginForm } from '@/features/auth-by-email';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

import { rootRoute } from './__root.js';

function LoginComponent(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <main className="container flex justify-center py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Sign in with your email address to manage posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            onSuccess={() => {
              void navigate({ to: '/posts' });
            }}
          />
        </CardContent>
      </Card>
    </main>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginComponent,
});

export const Route = loginRoute;
