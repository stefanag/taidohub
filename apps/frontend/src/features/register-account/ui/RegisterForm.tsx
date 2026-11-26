import { ageOn, SELF_REGISTRATION_MIN_AGE } from '@repo/contracts/registration';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  getRegistrationFederations,
  getRegistrationLegalTexts,
  registerAccount,
} from '../api/registration.api.js';

import {
  LEGAL_LOCALES,
  type LegalLocale,
  type PublishedLegalDocument,
} from '@/entities/legal-document';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';

function currentLocale(language: string): LegalLocale {
  const base = language.split('-')[0] ?? '';
  return (LEGAL_LOCALES as readonly string[]).includes(base) ? (base as LegalLocale) : 'en';
}

function federationName(
  f: { nameEn: string; nameSv: string; nameFi: string },
  locale: LegalLocale,
): string {
  return locale === 'sv' ? f.nameSv : locale === 'fi' ? f.nameFi : f.nameEn;
}

function textHref(doc: PublishedLegalDocument): string {
  return `/legal/platform/${doc.kind}?audience=self_registered`;
}

/**
 * Self-registration: name, email, password, date of birth (at least 13), the
 * national federation whose grading requirements apply, and the platform's
 * terms and privacy notice. Ends with "check your email": the account can
 * sign in once the address is confirmed.
 */
export function RegisterForm(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const locale = currentLocale(i18n.language);
  const federations = useQuery({
    queryKey: ['registration', 'federations'],
    queryFn: getRegistrationFederations,
  });
  const texts = useQuery({
    queryKey: ['registration', 'legal-texts', locale],
    queryFn: () => getRegistrationLegalTexts(locale),
  });

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [federationId, setFederationId] = React.useState('');
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [readPrivacy, setReadPrivacy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const documents = texts.data?.documents ?? [];
  const terms = documents.filter((d) => d.kind === 'terms');
  const privacy = documents.filter((d) => d.kind === 'privacy');

  const onSubmit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    const today = new Date().toISOString().slice(0, 10);
    if (!name.trim() || !email.trim() || !dateOfBirth || !federationId) {
      setError(t('register.fillEverything'));
      return;
    }
    if (password.length < 8) {
      setError(t('zod.tooSmall', { min: 8 }));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.setPassword.mismatch'));
      return;
    }
    if (dateOfBirth > today || ageOn(dateOfBirth, today) < SELF_REGISTRATION_MIN_AGE) {
      setError(t('register.tooYoung', { age: SELF_REGISTRATION_MIN_AGE }));
      return;
    }
    if ((terms.length > 0 && !acceptedTerms) || (privacy.length > 0 && !readPrivacy)) {
      setError(t('legal.acknowledgeRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await registerAccount({
        name: name.trim(),
        email: email.trim(),
        password,
        locale,
        dateOfBirth,
        federationId,
        acknowledgements: documents.map((d) => ({
          versionId: d.versionId,
          locale: d.translation.locale,
        })),
      });
      setDone(true);
    } catch (err) {
      const code = err instanceof HttpError ? err.payload.code : undefined;
      setError(
        code === 'TOO_YOUNG'
          ? t('register.tooYoung', { age: SELF_REGISTRATION_MIN_AGE })
          : code === 'RATE_LIMITED'
            ? t('register.rateLimited')
            : code === 'LEGAL_ACKNOWLEDGEMENT_REQUIRED'
              ? t('register.textsChanged')
              : t('register.failed'),
      );
      if (code === 'LEGAL_ACKNOWLEDGEMENT_REQUIRED') void texts.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <p role="status" className="text-sm">
        {t('register.checkEmail', { email: email.trim() })}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="register-name">{t('register.name')}</Label>
        <Input
          id="register-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </FormField>
      <FormField>
        <Label htmlFor="register-email">{t('register.email')}</Label>
        <Input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </FormField>
      <FormField>
        <Label htmlFor="register-password">{t('register.password')}</Label>
        <Input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>
      <FormField>
        <Label htmlFor="register-confirm">{t('register.confirmPassword')}</Label>
        <Input
          id="register-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>
      <FormField>
        <Label htmlFor="register-dob">{t('register.dateOfBirth')}</Label>
        <Input
          id="register-dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </FormField>
      <FormField>
        <Label htmlFor="register-federation">{t('register.federation')}</Label>
        <select
          id="register-federation"
          className="w-full rounded-md border px-2 py-2 text-sm"
          value={federationId}
          onChange={(e) => setFederationId(e.target.value)}
        >
          <option value="">{t('register.chooseFederation')}</option>
          {(federations.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {federationName(f, locale)}
            </option>
          ))}
        </select>
        <p className="text-xs text-on-surface-variant">{t('register.federationHelp')}</p>
      </FormField>

      {terms.length > 0 ? (
        <TextCheckbox
          id="register-terms"
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
          label={t('legal.acceptTerms')}
          documents={terms}
        />
      ) : null}
      {privacy.length > 0 ? (
        <TextCheckbox
          id="register-privacy"
          checked={readPrivacy}
          onChange={setReadPrivacy}
          label={t('legal.readPrivacy')}
          documents={privacy}
        />
      ) : null}

      <FormMessage message={error} />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('register.submitting') : t('register.submit')}
      </Button>
    </form>
  );
}

function TextCheckbox({
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
            <a href={textHref(doc)} target="_blank" rel="noreferrer" className="underline">
              {doc.translation.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
