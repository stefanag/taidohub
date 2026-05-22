import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { User } from '@/entities/user';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Input,
  Label,
} from '@/shared/ui';

export interface UserDeleteDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs the actual delete. The dialog closes itself after it resolves. */
  onConfirm: () => Promise<void>;
}

/**
 * Hard-delete confirmation with a typed-email gate: the destructive button
 * stays disabled until the admin types the target's exact email address.
 * Deliberately stricter than `OrganisationDeleteDialog` because user deletion
 * is irreversible and cascades.
 */
export function UserDeleteDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
}: UserDeleteDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  // Reset the typed value and error whenever the dialog closes or the target user changes.
  React.useEffect(() => {
    if (!open) {
      setSubmitError(undefined);
    }
    setTyped('');
  }, [open, user.email]);

  const confirmed = typed.trim() === user.email;

  const handleConfirm = async (): Promise<void> => {
    if (!confirmed) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.delete.title', { defaultValue: 'Delete user' })}
          </DialogTitle>
          <DialogDescription>
            {t('admin.users.delete.description', {
              defaultValue:
                'This permanently deletes "{{email}}" and all their data. ' +
                'To confirm, type their email address below.',
              email: user.email,
            })}
          </DialogDescription>
        </DialogHeader>

        <FormField>
          <Label htmlFor="user-delete-confirm">
            {t('admin.users.delete.confirmLabel', {
              defaultValue: 'Type the email to confirm',
            })}
          </Label>
          <Input
            id="user-delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </FormField>

        <FormMessage message={submitError} />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!confirmed || submitting}
          >
            {t('admin.users.delete.confirm', { defaultValue: 'Delete user' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
