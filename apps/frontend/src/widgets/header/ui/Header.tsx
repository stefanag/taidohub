import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { signOut, useSession } from '@/features/auth-by-email';
import { Button } from '@/shared/ui';
import { LocaleSwitcher } from '@/widgets/locale-switcher';

/**
 * Top navigation bar — links to landing/posts and shows auth state.
 */
export function Header(): React.ReactElement {
  const { t } = useTranslation();
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
            {t('header.posts')}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
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
                {t('header.signOut')}
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">{t('header.signIn')}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
