import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAddUser, useInviteUser, type AddUserResponse, type Role, type User } from '@/entities/user';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created user after a successful invite. */
  onInvited?: (user: User) => void;
}

type Mode = 'invite' | 'add';

/**
 * Dialog for inviting a new user by email (and an optional display name),
 * or adding a user directly (returns a one-time set-password link).
 * On invite success it closes itself and hands the created user to `onInvited`.
 * `EMAIL_IN_USE` / `EMAIL_DEACTIVATED` backend codes map to friendly copy.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteUserDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [mode, setMode] = React.useState<Mode>('invite');
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState<Role>('user');
  const [error, setError] = React.useState<string | undefined>();
  const [createdLink, setCreatedLink] = React.useState<string | undefined>();

  // Reset local state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setName('');
      setMode('invite');
      setRole('user');
      setError(undefined);
      setCreatedLink(undefined);
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

  const addMut = useAddUser({
    onSuccess: (response: AddUserResponse) => {
      setCreatedLink(response.setPasswordUrl);
    },
    onError: (err) => setError(mapError(err)),
  });

  const isPending = inviteMut.isPending || addMut.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(undefined);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('zod.invalidEmail', { defaultValue: 'Please enter a valid email address.' }));
      return;
    }
    const trimmedName = name.trim();

    if (mode === 'invite') {
      inviteMut.mutate({
        email: trimmedEmail,
        ...(trimmedName ? { name: trimmedName } : {}),
      });
    } else {
      addMut.mutate({
        email: trimmedEmail,
        ...(trimmedName ? { name: trimmedName } : {}),
        role,
      });
    }
  };

  const dialogTitle =
    mode === 'invite'
      ? t('admin.users.invite.title', { defaultValue: 'Invite a new user' })
      : t('admin.users.invite.addTitle', { defaultValue: 'Add a new user' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:min-h-[30rem]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        {createdLink ? (
          /* Success view (add mode) */
          <div className="space-y-4">
            <p className="font-semibold">
              {t('admin.users.invite.linkTitle', { defaultValue: 'User added' })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('admin.users.invite.linkHelp', {
                defaultValue:
                  'Share this link with the user so they can set their password. It is shown only once.',
              })}
            </p>
            <FormField>
              <Label htmlFor="set-password-link">
                {t('admin.users.invite.linkLabel', { defaultValue: 'Set-password link' })}
              </Label>
              <Input id="set-password-link" value={createdLink} readOnly />
            </FormField>
            <Button
              type="button"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(createdLink)}
            >
              {t('admin.users.invite.copy', { defaultValue: 'Copy' })}
            </Button>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t('admin.users.invite.done', { defaultValue: 'Done' })}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Form view */
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'invite' ? 'default' : 'outline'}
                onClick={() => { setMode('invite'); setError(undefined); }}
              >
                {t('admin.users.invite.modeInvite', { defaultValue: 'Email invite' })}
              </Button>
              <Button
                type="button"
                variant={mode === 'add' ? 'default' : 'outline'}
                onClick={() => { setMode('add'); setError(undefined); }}
              >
                {t('admin.users.invite.modeAdd', { defaultValue: 'Add directly' })}
              </Button>
            </div>

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

            {mode === 'add' && (
              <FormField>
                <Label htmlFor="add-role">
                  {t('admin.users.invite.roleLabel', { defaultValue: 'Role' })}
                </Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger
                    id="add-role"
                    aria-label={t('admin.users.invite.roleLabel', { defaultValue: 'Role' })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      {t('admin.users.roles.user', { defaultValue: 'User' })}
                    </SelectItem>
                    <SelectItem value="sysadmin">
                      {t('admin.users.roles.sysadmin', { defaultValue: 'System administrator' })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <FormMessage message={error} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" disabled={isPending}>
                {mode === 'invite'
                  ? t('admin.users.invite.submit', { defaultValue: 'Send invite' })
                  : t('admin.users.invite.addSubmit', { defaultValue: 'Add user' })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
