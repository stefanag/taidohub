import * as React from 'react';

import { useSession } from '@/features/auth-by-email';
import i18n from '@/i18n';

/**
 * `AuthProvider` keeps the active i18n language in sync with the logged-in
 * user's persisted locale (better-auth `user.locale`). It does not own any
 * state itself; `useSession()` is stateless inside better-auth's React client.
 *
 * Flow:
 *  - Anonymous: `session.data?.user` is undefined → effect no-ops.
 *  - On login or session refresh: reconcile i18n if the DB locale differs.
 *  - On logout: locale stays at the last-used value (we don't reset).
 */
export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const session = useSession();
  const dbLocale = session.data?.user
    ? (session.data.user as { locale?: string }).locale
    : undefined;

  React.useEffect(() => {
    if (!dbLocale) return;
    if (i18n.resolvedLanguage === dbLocale) return;
    void i18n.changeLanguage(dbLocale);
  }, [dbLocale]);

  return <>{children}</>;
}
