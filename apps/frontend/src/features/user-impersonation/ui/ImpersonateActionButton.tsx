import { UserCog } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';

import { ConfirmImpersonateDialog } from './ConfirmImpersonateDialog.js';

export interface ImpersonateActionButtonProps {
  user: { id: string; name: string | null; email: string; role: string };
}

/**
 * Sysadmin-facing entry point to impersonate the given user. Hides itself
 * automatically when the target's role is `sysadmin` (target restriction
 * enforced server-side as well).
 */
export function ImpersonateActionButton({
  user,
}: ImpersonateActionButtonProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  if (user.role === 'sysadmin') return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <UserCog className="size-4" aria-hidden />
        {t('admin.users.impersonate.action', { defaultValue: 'Impersonate' })}
      </Button>
      {open ? (
        <ConfirmImpersonateDialog
          open
          onOpenChange={setOpen}
          targetUser={user}
        />
      ) : null}
    </>
  );
}
