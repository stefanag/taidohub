import { Link } from '@tanstack/react-router';

import { signOut, useSession } from '@/features/auth-by-email';
import { Button } from '@/shared/ui';

/**
 * Top navigation bar — links to landing/posts and shows auth state.
 * Reads the current session from better-auth's React `useSession()` and
 * offers a sign-out button when authenticated.
 */
export function Header(): React.ReactElement {
  const session = useSession();
  const user = session.data?.user;

  return (
    <header className="border-b border-border bg-background">
      <div className="container flex h-14 items-center justify-between">
        <nav className="flex items-center gap-4">
          <Link to="/" className="text-sm font-semibold">
            taidohub
          </Link>
          <Link to="/posts" className="text-sm text-muted-foreground hover:text-foreground">
            Posts
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void signOut();
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
