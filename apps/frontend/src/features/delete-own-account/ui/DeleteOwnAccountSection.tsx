import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { deleteOwnAccount } from '../api/delete-own-account.api.js';

import { HttpError } from '@/shared/api';
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

/**
 * "Delete my account" on the profile page. Asks for the password, deletes the
 * account and the user's own data, and leaves the app.
 */
export function DeleteOwnAccountSection(): React.ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const onConfirm = async (): Promise<void> => {
    setError(undefined);
    setSubmitting(true);
    try {
      await deleteOwnAccount(password);
      window.location.assign('/');
    } catch (err) {
      const code = err instanceof HttpError ? err.payload.code : undefined;
      setError(
        code === 'INVALID_PASSWORD'
          ? t('deleteAccount.wrongPassword')
          : code === 'ACCOUNT_IN_USE' || code === 'LAST_SYSADMIN'
            ? t('deleteAccount.inUse')
            : t('common.unknownError'),
      );
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t('deleteAccount.title')}</h2>
      <p className="text-sm text-on-surface-variant">{t('deleteAccount.description')}</p>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        {t('deleteAccount.open')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword('');
            setError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteAccount.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('deleteAccount.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <FormField>
            <Label htmlFor="delete-account-password">{t('deleteAccount.password')}</Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormMessage message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!password || submitting}
              onClick={() => void onConfirm()}
            >
              {t('deleteAccount.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
