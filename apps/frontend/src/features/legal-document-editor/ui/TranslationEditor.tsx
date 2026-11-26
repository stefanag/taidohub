import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  deleteLegalTranslation,
  languageName,
  saveLegalTranslation,
  useLegalDocumentMutation,
  type LegalDocumentVersion,
  type LegalLocale,
} from '@/entities/legal-document';
import { HttpError } from '@/shared/api';
import {
  Badge,
  Button,
  FormField,
  FormMessage,
  Input,
  Label,
  RichTextEditor,
  emptyDelta,
  isEmpty,
  type Delta,
} from '@/shared/ui';

export interface TranslationEditorProps {
  version: LegalDocumentVersion;
  locale: LegalLocale;
}

/**
 * One language of a version. On a draft, saving replaces the text. On a
 * published version, the legally binding language is read-only and saving
 * another language adds a revision.
 */
export function TranslationEditor({ version, locale }: TranslationEditorProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const current = version.translations.find((tr) => tr.locale === locale);
  const isBinding = locale === version.authoritativeLocale;
  const locked = version.status !== 'draft' && isBinding;
  const [title, setTitle] = React.useState(current?.title ?? '');
  const [body, setBody] = React.useState<Delta>(
    (current?.body as Delta | undefined) ?? emptyDelta(),
  );
  const [error, setError] = React.useState<string | undefined>();
  const save = useLegalDocumentMutation(() =>
    saveLegalTranslation(version.id, locale, { title, body }),
  );
  const remove = useLegalDocumentMutation(() => deleteLegalTranslation(version.id, locale));

  const fail = (err: unknown) =>
    setError(err instanceof HttpError ? err.payload.message : t('common.unknownError'));

  const onSave = () => {
    setError(undefined);
    if (!title.trim() || isEmpty(body)) {
      setError(t('legal.editor.textRequired'));
      return;
    }
    save.mutate(undefined, { onError: fail });
  };

  const id = `legal-${version.id}-${locale}`;
  return (
    <section className="space-y-3" lang={locale}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isBinding ? <Badge>{t('legal.binding')}</Badge> : null}
        {current?.needsReview ? (
          <Badge variant="destructive">{t('legal.editor.needsReview')}</Badge>
        ) : null}
        {current && version.status !== 'draft' ? (
          <span className="text-on-surface-variant">
            {t('legal.editor.revision', { revision: current.revision })}
          </span>
        ) : null}
        {!current ? (
          <span className="text-on-surface-variant">
            {t('legal.editor.missing', { language: languageName(locale, i18n.language) })}
          </span>
        ) : null}
      </div>
      {locked ? (
        <p className="text-sm text-on-surface-variant">{t('legal.editor.bindingLocked')}</p>
      ) : null}
      <FormField>
        <Label htmlFor={`${id}-title`}>{t('legal.editor.title')}</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={locked}
        />
      </FormField>
      <FormField>
        <Label htmlFor={`${id}-body`}>{t('legal.editor.body')}</Label>
        <RichTextEditor
          id={`${id}-body`}
          value={body}
          onChange={setBody}
          readOnly={locked}
          ariaLabel={t('legal.editor.body')}
        />
      </FormField>
      <FormMessage message={error} />
      {!locked ? (
        <div className="flex gap-2">
          <Button type="button" onClick={onSave} disabled={save.isPending}>
            {current?.needsReview ? t('legal.editor.saveReviewed') : t('common.save')}
          </Button>
          {version.status === 'draft' && current ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => remove.mutate(undefined, { onError: fail })}
              disabled={remove.isPending}
            >
              {t('legal.editor.removeLanguage')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
