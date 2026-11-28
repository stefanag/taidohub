import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  PROFILE_PATH,
  SessionNotFreshError,
  linkGoogle,
  requestPasswordReset,
  unlinkSignInAccount,
} from '../api/auth.api.js';
import { signInAccountsQueryOptions, signInProvidersQueryOptions } from '../model/auth.queries.js';

import { Button } from '@/shared/ui';

type Notice =
  | { kind: 'linked' }
  | { kind: 'unlinked' }
  | { kind: 'passwordLinkSent' }
  | { kind: 'error'; key: string };

/** Error codes better-auth puts on `?error=` after a failed link, mapped to our texts. */
const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user: 'signInMethods.errors.linkedToOther',
  unable_to_link_account: 'signInMethods.errors.unableToLink',
};

/** Reads and removes `?linked=` / `?error=` left by the Google round trip. */
function takeReturnNotice(): Notice | null {
  if (typeof window === 'undefined' || window.location.pathname !== PROFILE_PATH) return null;
  const params = new URLSearchParams(window.location.search);
  const linked = params.get('linked');
  const error = params.get('error');
  if (!linked && !error) return null;
  params.delete('linked');
  params.delete('error');
  params.delete('error_description');
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${PROFILE_PATH}${rest ? `?${rest}` : ''}`);
  if (linked === 'google') return { kind: 'linked' };
  return { kind: 'error', key: LINK_ERRORS[error ?? ''] ?? 'signInMethods.errors.unableToLink' };
}

/**
 * Profile page: the ways to sign in (password, Google), with "Connect Google"
 * and "Remove". The last way to sign in cannot be removed (the button is
 * hidden and the server refuses too). A Google-only user can add a password
 * through the reset link sent to their address.
 */
export function SignInMethodsSection({ email }: { email: string }): React.ReactElement {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const providers = useQuery(signInProvidersQueryOptions());
  const accounts = useQuery(signInAccountsQueryOptions());
  const [notice, setNotice] = React.useState<Notice | null>(takeReturnNotice);
  const [busy, setBusy] = React.useState(false);

  const list = accounts.data ?? [];
  const password = list.find((a) => a.providerId === 'credential');
  const google = list.find((a) => a.providerId === 'google');
  const canRemove = list.length > 1;

  const run = async (action: () => Promise<void>, success: Notice | null) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await qc.invalidateQueries({ queryKey: signInAccountsQueryOptions().queryKey });
    } catch (err) {
      setNotice({
        kind: 'error',
        key:
          err instanceof SessionNotFreshError
            ? 'signInMethods.errors.signInAgain'
            : 'common.unknownError',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="sign-in-methods-heading">
      <h2 id="sign-in-methods-heading" className="text-lg font-semibold">
        {t('signInMethods.title')}
      </h2>
      {accounts.isPending ? (
        <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : accounts.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('common.unknownError')}
        </p>
      ) : (
        <ul className="divide-y text-sm">
          <li
            className="flex items-center justify-between gap-4 py-2"
            data-testid="sign-in-method-password"
          >
            <span>
              {t('signInMethods.password')}
              <span className="block text-on-surface-variant">
                {password ? t('signInMethods.passwordSet') : t('signInMethods.passwordNotSet')}
              </span>
            </span>
            {password ? null : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => requestPasswordReset(email), { kind: 'passwordLinkSent' })
                }
              >
                {t('signInMethods.addPassword')}
              </Button>
            )}
          </li>
          {providers.data?.google || google ? (
            <li
              className="flex items-center justify-between gap-4 py-2"
              data-testid="sign-in-method-google"
            >
              <span>
                Google
                <span className="block text-on-surface-variant">
                  {google ? t('signInMethods.connected') : t('signInMethods.notConnected')}
                </span>
              </span>
              {google ? (
                canRemove ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t('signInMethods.confirmRemove'))) {
                        void run(() => unlinkSignInAccount(google.id), { kind: 'unlinked' });
                      }
                    }}
                  >
                    {t('signInMethods.remove')}
                  </Button>
                ) : (
                  <span className="text-xs text-on-surface-variant">
                    {t('signInMethods.onlyMethod')}
                  </span>
                )
              ) : providers.data?.google ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(linkGoogle, null)}
                >
                  {t('signInMethods.connectGoogle')}
                </Button>
              ) : null}
            </li>
          ) : null}
        </ul>
      )}
      {notice ? (
        notice.kind === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            {t(notice.key)}
          </p>
        ) : (
          <p role="status" className="text-sm text-on-surface-variant">
            {t(`signInMethods.notices.${notice.kind}`)}
          </p>
        )
      ) : null}
      <p className="text-xs text-on-surface-variant">{t('signInMethods.hint')}</p>
    </section>
  );
}
