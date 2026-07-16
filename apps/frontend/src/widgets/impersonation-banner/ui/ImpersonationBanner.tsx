import { TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth-by-email';
import { useStopImpersonating } from '@/features/user-impersonation';
import { Button } from '@/shared/ui';

/**
 * Mounted at the router root. Renders a sticky amber banner whenever the
 * current session was created via admin impersonation. The session payload
 * carries `impersonatedBy` (the sysadmin's user ID) when this is the case.
 * Shows a countdown to the 1-hour auto-end and a "Stop impersonating"
 * button that delegates to the user-impersonation feature's mutation.
 *
 * Colours: the design system has no `warning-container` tokens yet (only
 * `error` / `error-container`). The amber Tailwind utilities below are
 * therefore used as the documented fallback per the task spec. If/when
 * `--color-warning-container` & friends land, swap to those tokens.
 */
export function ImpersonationBanner(): React.ReactElement | null {
  const { t } = useTranslation();
  const session = useSession();
  const mut = useStopImpersonating();

  const sessionRecord = session.data?.session as
    | { impersonatedBy?: string | null; expiresAt?: string | Date }
    | undefined;
  const userRecord = session.data?.user as
    | { name?: string | null; email?: string }
    | undefined;

  // Tick every 30s so the "N minutes remaining" display stays fresh
  // without calling Date.now() during render (which is impure).
  const [now, setNow] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!sessionRecord?.impersonatedBy) return null;

  const minutes = sessionRecord.expiresAt
    ? Math.max(
        0,
        Math.floor((new Date(sessionRecord.expiresAt).getTime() - now) / 60_000),
      )
    : 0;

  const displayName = userRecord?.name ?? userRecord?.email ?? '';
  const email = userRecord?.email ?? '';

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900"
    >
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span>
          {t('admin.users.impersonate.banner', {
            name: displayName,
            email,
            minutes,
            defaultValue: `Impersonating ${displayName} (${email}) — ${minutes} min remaining`,
          })}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
      >
        {t('admin.users.impersonate.stop', { defaultValue: 'Stop impersonating' })}
      </Button>
    </div>
  );
}
