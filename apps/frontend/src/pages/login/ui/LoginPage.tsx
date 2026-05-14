import { useNavigate } from '@tanstack/react-router';

import { LoginForm } from '@/features/auth-by-email';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

/**
 * Sign-in page. Wraps the `LoginForm` feature in a centered Card and
 * navigates to `/posts` on a successful sign-in. The route definition in
 * `app/router/routes/login.tsx` delegates to this component — keep page
 * structure here and routing concerns there.
 */
export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen flex">
      {/* Left hero panel */}
      <div className="hidden lg:flex w-1/2 taido-gradient flex-col justify-between p-16">
        <div>
          <h1 className="font-headline font-extrabold text-4xl text-white tracking-tight">TaidoHub</h1>
        </div>
        <div>
          <p className="japanese-text text-6xl font-bold text-secondary leading-tight mb-6">
            精神一到<br />何事か成らざらん
          </p>
          <p className="text-secondary text-m italic">Where the mind is concentrated, nothing is impossible.</p>
        </div>
        <p className="text-inverse-primary text-xs">© {new Date().getFullYear()} TaidoHub</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface">

        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-headline font-extrabold text-3xl tracking-tight text-on-surface">Logga in</CardTitle>
            <CardDescription className="text-sm text-on-surface-variant mt-2">
              Välkommen tillbaka
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
      </div>
    </main>
  );
}
