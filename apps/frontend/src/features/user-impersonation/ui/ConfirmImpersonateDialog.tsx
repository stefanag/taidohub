import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';

import { useStartImpersonating } from '../lib/hooks.js';

export interface ConfirmImpersonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: { id: string; name: string | null; email: string };
}

/**
 * Confirmation modal shown before a sysadmin impersonates another user.
 * On confirm, fires the `startImpersonating` mutation; the banner widget
 * picks up the resulting session change automatically.
 */
export function ConfirmImpersonateDialog({
  open,
  onOpenChange,
  targetUser,
}: ConfirmImpersonateDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const mut = useStartImpersonating();

  const displayName = targetUser.name ?? targetUser.email;

  const onConfirm = (): void => {
    mut.mutate(targetUser.id, {
      onSuccess: () => {
        onOpenChange(false);
        // The banner widget will pick up the session change automatically;
        // no manual navigation here.
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.impersonate.confirmTitle', {
              defaultValue: 'Impersonate {{name}}?',
              name: displayName,
            })}
          </DialogTitle>
        </DialogHeader>
        <p className="text-on-surface-variant">
          {t('admin.users.impersonate.confirmBody', {
            defaultValue:
              'You will see the application as this user until you stop impersonating. All actions you take will be attributed to them with your sysadmin identity recorded for audit.',
          })}
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={onConfirm} disabled={mut.isPending}>
            {t('admin.users.impersonate.confirm', { defaultValue: 'Impersonate' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
