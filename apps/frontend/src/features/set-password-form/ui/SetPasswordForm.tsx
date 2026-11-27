import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { type PublishedLegalDocument } from '@/entities/legal-document';
import { acceptLinkWithGoogle, setInitialPassword } from '@/entities/user';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';

export interface SetPasswordFormProps {
  /** One-time token from the `?token=` query parameter. */
  token: string;
  /**
   * Terms to accept and privacy notices to acknowledge before the password can
   * be set (invitations). Empty or absent for password resets.
   */
  legalTexts?: PublishedLegalDocument[];
  /**
   * Continues with Google instead of a password. Supplied by the page when
   * Google sign-in is available; without it the option is hidden.
   */
  onContinueWithGoogle?: (() => Promise<void>) | undefined;
}

function legalHref(doc: PublishedLegalDocument): string {
  return `/legal/${doc.organisationId ?? 'platform'}/${doc.kind}`;
}

/**
 * Public form for choosing a password from an invite or reset link. Validates
 * the match + minimum length client-side, then posts to the public
 * set-initial-password endpoint. On success it does a full-page navigation to
 * `/dashboard` so the freshly issued session cookie is picked up.
 */
export function SetPasswordForm({
  token,
  legalTexts = [],
  onContinueWithGoogle,
}: SetPasswordFormProps): React.ReactElement {
  const { t } = useTranslation();
  const terms = legalTexts.filter((d) => d.kind === 'terms');
  const privacy = legalTexts.filter((d) => d.kind === 'privacy');
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [readPrivacy, setReadPrivacy] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const acknowledgements = () =>
    legalTexts.length > 0
      ? { acknowledgements: legalTexts.map((d) => ({ versionId: d.versionId, locale: d.translation.locale })) }
      : {};

  const linkError = (err: unknown): string =>
    err instanceof HttpError && err.payload.code === 'INVALID_TOKEN'
      ? t('auth.setPassword.invalidToken', {
          defaultValue: 'This link is invalid or has expired. Ask an administrator to send a new one.',
        })
      : t('auth.setPassword.googleFailed');

  /** Accept the link (and texts) without a password, then go to Google. */
  const handleGoogle = async (): Promise<void> => {
    setError(undefined);
    if ((terms.length > 0 && !acceptedTerms) || (privacy.length > 0 && !readPrivacy)) {
      setError(t('legal.acknowledgeRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await acceptLinkWithGoogle({ token, ...acknowledgements() });
      await onContinueWithGoogle?.();
    } catch (err) {
      setError(linkError(err));
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);

    if (password.length < 8) {
      setError(t('zod.tooSmall', { defaultValue: 'Must be at least {{min}}.', min: 8 }));
      return;
    }
    if (password !== confirm) {
      setError(
        t('auth.setPassword.mismatch', { defaultValue: 'The passwords do not match.' }),
      );
      return;
    }

    if ((terms.length > 0 && !acceptedTerms) || (privacy.length > 0 && !readPrivacy)) {
      setError(t('legal.acknowledgeRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await setInitialPassword({
        token,
        password,
        ...(legalTexts.length > 0 && {
          acknowledgements: legalTexts.map((d) => ({ versionId: d.versionId, locale: d.translation.locale })),
        }),
      });
      // Full navigation so the new session cookie is applied to the next load.
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof HttpError && err.payload.code === 'INVALID_TOKEN') {
        setError(
          t('auth.setPassword.invalidToken', {
            defaultValue:
              'This link is invalid or has expired. Ask an administrator to send a new one.',
          }),
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('common.unknownError', { defaultValue: 'Unknown error' }));
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="set-password">
          {t('auth.setPassword.passwordLabel', { defaultValue: 'Password' })}
        </Label>
        <Input
          id="set-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>

      <FormField>
        <Label htmlFor="set-password-confirm">
          {t('auth.setPassword.confirmLabel', { defaultValue: 'Confirm password' })}
        </Label>
        <Input
          id="set-password-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>

      {terms.length > 0 ? (
        <LegalCheckbox
          id="set-password-terms"
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
          label={t('legal.acceptTerms')}
          documents={terms}
        />
      ) : null}
      {privacy.length > 0 ? (
        <LegalCheckbox
          id="set-password-privacy"
          checked={readPrivacy}
          onChange={setReadPrivacy}
          label={t('legal.readPrivacy')}
          documents={privacy}
        />
      ) : null}

      <FormMessage message={error} />

      <Button type="submit" disabled={submitting} className="w-full">
        {t('auth.setPassword.submit', { defaultValue: 'Set password' })}
      </Button>
      {onContinueWithGoogle ? (
        <>
          <p className="text-center text-xs text-on-surface-variant">{t('auth.setPassword.googleHint')}</p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={submitting}
            onClick={() => void handleGoogle()}
          >
            {t('auth.setPassword.continueWithGoogle')}
          </Button>
        </>
      ) : null}
    </form>
  );
}

function LegalCheckbox({
  id,
  checked,
  onChange,
  label,
  documents,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  documents: PublishedLegalDocument[];
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      </div>
      <ul className="ml-6 list-disc text-sm">
        {documents.map((doc) => (
          <li key={doc.versionId}>
            <a href={legalHref(doc)} target="_blank" rel="noreferrer" className="underline">
              {doc.translation.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
