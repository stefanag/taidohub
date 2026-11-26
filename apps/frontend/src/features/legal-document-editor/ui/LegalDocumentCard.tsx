import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { TranslationEditor } from './TranslationEditor.js';

import {
  LEGAL_LOCALES,
  createLegalDocumentVersion,
  deleteLegalDocumentDraft,
  languageName,
  publishLegalDocumentVersion,
  updateLegalDocumentVersion,
  useLegalDocumentMutation,
  type LegalDocument,
  type LegalDocumentVersion,
  type LegalLocale,
} from '@/entities/legal-document';
import { HttpError } from '@/shared/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  FormMessage,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';

export interface LegalDocumentCardProps {
  document: LegalDocument;
}

function publicHref(doc: LegalDocument): string {
  const base = `/legal/${doc.organisationId ?? 'platform'}/${doc.kind}`;
  return doc.audience === 'members' ? base : `${base}?audience=${doc.audience}`;
}

function LanguageTabs({ version }: { version: LegalDocumentVersion }): React.ReactElement {
  const { i18n } = useTranslation();
  return (
    <Tabs defaultValue={version.authoritativeLocale}>
      <TabsList>
        {LEGAL_LOCALES.map((locale) => (
          <TabsTrigger key={locale} value={locale}>
            {languageName(locale, i18n.language, { capitalize: true })}
          </TabsTrigger>
        ))}
      </TabsList>
      {LEGAL_LOCALES.map((locale) => (
        <TabsContent key={locale} value={locale} className="pt-3">
          <TranslationEditor
            key={`${version.id}-${locale}-${version.translations.find((t) => t.locale === locale)?.contentHash ?? ''}`}
            version={version}
            locale={locale}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * One text (for example the club's privacy notice): its published version,
 * where translations can be corrected, and its draft, where everything can be
 * edited until it is published.
 */
export function LegalDocumentCard({ document: doc }: LegalDocumentCardProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [error, setError] = React.useState<string | undefined>();
  const [newBinding, setNewBinding] = React.useState<LegalLocale>(
    (doc.published?.authoritativeLocale as LegalLocale | undefined) ?? 'sv',
  );
  const draft = doc.draft;
  const fail = (err: unknown) =>
    setError(err instanceof HttpError ? err.payload.message : t('common.unknownError'));

  const createDraft = useLegalDocumentMutation(() =>
    createLegalDocumentVersion(doc.id, {
      authoritativeLocale: newBinding,
      copyFromPublished: true,
    }),
  );
  const updateDraft = useLegalDocumentMutation(
    (patch: Parameters<typeof updateLegalDocumentVersion>[1]) =>
      updateLegalDocumentVersion(draft!.id, patch),
  );
  const publish = useLegalDocumentMutation(() => publishLegalDocumentVersion(draft!.id));
  const discard = useLegalDocumentMutation(() => deleteLegalDocumentDraft(draft!.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t(`legal.kind.${doc.kind}`)}
          {doc.audience !== 'members' ? (
            <Badge variant="outline">{t(`legal.audience.${doc.audience}`)}</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="font-medium">{t('legal.editor.published')}</h3>
          {doc.published ? (
            <>
              <p className="text-sm text-on-surface-variant">
                {t('legal.editor.publishedLine', {
                  version: doc.published.version,
                  date: new Date(doc.published.publishedAt!).toLocaleDateString(i18n.language),
                  language: languageName(doc.published.authoritativeLocale, i18n.language),
                })}{' '}
                <a href={publicHref(doc)} target="_blank" rel="noreferrer" className="underline">
                  {t('legal.editor.openPublic')}
                </a>
              </p>
              <details>
                <summary className="cursor-pointer text-sm">
                  {t('legal.editor.correctTranslations')}
                </summary>
                <div className="pt-3">
                  <LanguageTabs version={doc.published} />
                </div>
              </details>
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">{t('legal.editor.notPublishedYet')}</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-medium">{t('legal.editor.draft')}</h3>
          {draft ? (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <FormField>
                  <Label htmlFor={`binding-${draft.id}`}>{t('legal.editor.bindingLanguage')}</Label>
                  <select
                    id={`binding-${draft.id}`}
                    className="rounded-md border px-2 py-1 text-sm"
                    value={draft.authoritativeLocale}
                    onChange={(e) =>
                      updateDraft.mutate(
                        { authoritativeLocale: e.target.value as LegalLocale },
                        { onError: fail },
                      )
                    }
                  >
                    {LEGAL_LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {languageName(l, i18n.language, { capitalize: true })}
                      </option>
                    ))}
                  </select>
                </FormField>
                {doc.published ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.requiresReacceptance}
                      onChange={(e) =>
                        updateDraft.mutate(
                          { requiresReacceptance: e.target.checked },
                          { onError: fail },
                        )
                      }
                    />
                    {t('legal.editor.requiresReacceptance')}
                  </label>
                ) : null}
              </div>
              {doc.published ? (
                <FormField>
                  <Label htmlFor={`summary-${draft.id}`}>{t('legal.editor.changeSummary')}</Label>
                  <textarea
                    id={`summary-${draft.id}`}
                    className="w-full rounded-md border p-2 text-sm"
                    rows={2}
                    defaultValue={draft.changeSummary ?? ''}
                    onBlur={(e) => {
                      const value = e.target.value.trim() || null;
                      if (value !== draft.changeSummary)
                        updateDraft.mutate({ changeSummary: value }, { onError: fail });
                    }}
                  />
                </FormField>
              ) : null}
              <LanguageTabs version={draft} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setError(undefined);
                    if (window.confirm(t('legal.editor.confirmPublish')))
                      publish.mutate(undefined, { onError: fail });
                  }}
                  disabled={publish.isPending}
                >
                  {t('legal.editor.publish')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => discard.mutate(undefined, { onError: fail })}
                  disabled={discard.isPending}
                >
                  {t('legal.editor.discardDraft')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <FormField>
                <Label htmlFor={`new-binding-${doc.id}`}>{t('legal.editor.bindingLanguage')}</Label>
                <select
                  id={`new-binding-${doc.id}`}
                  className="rounded-md border px-2 py-1 text-sm"
                  value={newBinding}
                  onChange={(e) => setNewBinding(e.target.value as LegalLocale)}
                >
                  {LEGAL_LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {languageName(l, i18n.language, { capitalize: true })}
                    </option>
                  ))}
                </select>
              </FormField>
              <Button
                type="button"
                onClick={() => createDraft.mutate(undefined, { onError: fail })}
              >
                {doc.published ? t('legal.editor.newVersion') : t('legal.editor.startDraft')}
              </Button>
            </div>
          )}
        </section>
        <FormMessage message={error} />
      </CardContent>
    </Card>
  );
}
