import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useInvitationLegalTextsQuery, type LegalLocale, LEGAL_LOCALES } from '@/entities/legal-document';
import { SetPasswordForm } from '@/features/set-password-form';

export interface SetPasswordPageProps {
  /** One-time token, supplied by the route from its validated `?token=` param. */
  token: string;
}

/**
 * Public page wrapping `<SetPasswordForm>`. The `token` arrives as a prop from
 * the route component — the page never imports from the `app` layer, which
 * FSD / Steiger's `forbidden-imports` rule forbids (`pages` may not import
 * `app`).
 *
 * Layout: minimal centered card (not the branded two-panel hero used by
 * LoginPage) — intentional, as `/set-password` is a one-time, email-link-
 * triggered flow and not a primary marketing/auth surface.
 */
export function SetPasswordPage({ token }: SetPasswordPageProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const base = i18n.language.split('-')[0] ?? '';
  const locale = (LEGAL_LOCALES as readonly string[]).includes(base) ? (base as LegalLocale) : undefined;
  // The terms and privacy notices that apply to an invited user; none for resets.
  const legal = useInvitationLegalTextsQuery(token, locale);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-surface p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('auth.setPassword.title', { defaultValue: 'Set your password' })}
          </h1>
          <p className="text-sm text-on-surface-variant">
            {t('auth.setPassword.description', {
              defaultValue: 'Choose a password to finish setting up your account.',
            })}
          </p>
        </div>
        {legal.isPending ? (
          <p className="text-center text-sm text-on-surface-variant">{t('common.loading')}</p>
        ) : legal.isError ? (
          <p role="alert" className="text-center text-sm">
            {t('auth.setPassword.invalidToken', {
              defaultValue:
                'This link is invalid or has expired. Ask an administrator to send a new one.',
            })}
          </p>
        ) : (
          <SetPasswordForm token={token} legalTexts={legal.data.documents} />
        )}
      </div>
    </main>
  );
}
