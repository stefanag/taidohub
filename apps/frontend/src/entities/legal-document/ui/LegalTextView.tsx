import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { languageName } from '../lib/locale.js';

import type { LegalLocale, PublishedLegalDocument } from '@repo/contracts/legal-documents';

import { Badge, Button, QuillViewer, type Delta } from '@/shared/ui';

export interface LegalTextViewProps {
  document: PublishedLegalDocument;
  /** Switch the shown language. Without it, no language switcher is rendered. */
  onLocaleChange?: (locale: LegalLocale) => void;
}

/**
 * A published text with its language rules made visible:
 *  - a language switcher that marks the legally binding language;
 *  - on every translation, a fixed notice in the translation's own language
 *    saying which language is binding and takes precedence. The notice comes
 *    from the app's strings, not from the text, so an editor cannot remove it;
 *  - when the requested language is missing, a note that the binding language
 *    is shown instead.
 */
export function LegalTextView({
  document: doc,
  onLocaleChange,
}: LegalTextViewProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const shown = doc.translation.locale;
  const binding = doc.authoritativeLocale;
  const isTranslation = shown !== binding;

  return (
    <article className="space-y-4" lang={shown}>
      {onLocaleChange && doc.availableLocales.length > 1 ? (
        <nav aria-label={t('legal.languages')} className="flex flex-wrap gap-2">
          {doc.availableLocales.map((locale) => (
            <Button
              key={locale}
              type="button"
              size="sm"
              variant={locale === shown ? 'default' : 'outline'}
              aria-pressed={locale === shown}
              onClick={() => onLocaleChange(locale)}
            >
              <span lang={locale}>{languageName(locale, locale, { capitalize: true })}</span>
              {locale === binding ? (
                <Badge variant="secondary" className="ml-2">
                  {t('legal.binding')}
                </Badge>
              ) : null}
            </Button>
          ))}
        </nav>
      ) : null}

      {doc.isFallback ? (
        <p role="note" className="rounded-md border p-3 text-sm text-on-surface-variant">
          {t('legal.notAvailableInLanguage', { language: languageName(binding, i18n.language) })}
        </p>
      ) : null}

      {isTranslation ? (
        <div
          role="note"
          className="rounded-md bg-tertiary-container p-3 text-sm text-on-tertiary-container"
        >
          <p>
            {t('legal.translationNotice', { lng: shown, language: languageName(binding, shown) })}
          </p>
          {onLocaleChange ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => onLocaleChange(binding)}
            >
              {t('legal.showBinding', { lng: shown, language: languageName(binding, shown) })}
            </Button>
          ) : null}
        </div>
      ) : null}

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{doc.translation.title}</h1>
        <p className="text-sm text-on-surface-variant">
          {t('legal.versionLine', {
            version: doc.version,
            date: new Date(doc.publishedAt).toLocaleDateString(i18n.language),
          })}
        </p>
      </header>

      <QuillViewer value={doc.translation.body as Delta} />
    </article>
  );
}
