import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  LEGAL_LOCALES,
  LegalTextView,
  usePublishedLegalDocumentQuery,
  type LegalAudience,
  type LegalDocumentKind,
  type LegalLocale,
  type LegalOwner,
} from '@/entities/legal-document';
import { HttpError } from '@/shared/api';

export interface LegalPageProps {
  owner: LegalOwner;
  kind: LegalDocumentKind;
  audience?: LegalAudience | undefined;
}

function initialLocale(language: string): LegalLocale | undefined {
  const base = language.split('-')[0];
  return (LEGAL_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as LegalLocale)
    : undefined;
}

/**
 * Public page for one published text. Readable without signing in, so people
 * can read the terms and privacy notice before registering or accepting an
 * invitation. Opens in the interface language when available.
 */
export function LegalPage({ owner, kind, audience }: LegalPageProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [locale, setLocale] = React.useState<LegalLocale | undefined>(() =>
    initialLocale(i18n.language),
  );
  const query = usePublishedLegalDocumentQuery({ owner, kind, audience, locale });

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      {query.isPending ? (
        <p className="text-on-surface-variant">{t('common.loading')}</p>
      ) : query.isError ? (
        <p role="alert" className="text-on-surface-variant">
          {query.error instanceof HttpError && query.error.status === 404
            ? t('legal.notPublished')
            : t('common.unknownError')}
        </p>
      ) : (
        <LegalTextView document={query.data} onLocaleChange={setLocale} />
      )}
    </main>
  );
}
