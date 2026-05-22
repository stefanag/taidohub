import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useInviteUser, type InviteUserInput, type User } from '@/entities/user';
import { HttpError } from '@/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Input,
  Label,
} from '@/shared/ui';

export interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created user after a successful invite. */
  onInvited?: (user: User) => void;
}

/**
 * Dialog for inviting a new user by email (and an optional display name).
 * On success it closes itself and hands the created user to `onInvited`.
 * `EMAIL_IN_USE` / `EMAIL_DEACTIVATED` backend codes map to friendly copy.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteUserDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  // Reset local state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setName('');
      setError(undefined);
    }
  }, [open]);

  const mapError = React.useCallback(
    (err: unknown): string => {
      if (err instanceof HttpError) {
        switch (err.payload.code) {
          case 'EMAIL_IN_USE':
            return t('admin.users.errors.emailInUse', {
              defaultValue: 'A user with this email already exists.',
            });
          case 'EMAIL_DEACTIVATED':
            return t('admin.users.errors.emailDeactivated', {
              defaultValue:
                'A deactivated user already has this email. Reactivate them instead.',
            });
          default:
            return err.message;
        }
      }
      return err instanceof Error
        ? err.message
        : t('common.unknownError', { defaultValue: 'Unknown error' });
    },
    [t],
  );

  const inviteMut = useInviteUser({
    onSuccess: (user) => {
      onInvited?.(user);
      onOpenChange(false);
    },
    onError: (err) => setError(mapError(err)),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(undefined);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('zod.invalidEmail', { defaultValue: 'Please enter a valid email address.' }));
      return;
    }
    const input: InviteUserInput = { email: trimmedEmail };
    const trimmedName = name.trim();
    if (trimmedName) input.name = trimmedName;
    inviteMut.mutate(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.invite.title', { defaultValue: 'Invite a new user' })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField>
            <Label htmlFor="invite-email">
              {t('admin.users.invite.emailLabel', { defaultValue: 'Email' })}
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="invite-name">
              {t('admin.users.invite.nameLabel', { defaultValue: 'Name (optional)' })}
            </Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormMessage message={error} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={inviteMut.isPending}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={inviteMut.isPending}>
              {t('admin.users.invite.submit', { defaultValue: 'Send invite' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
