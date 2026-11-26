import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  createLegalDocument,
  useLegalDocumentMutation,
  type LegalDocument,
  type LegalOwner,
} from '@/entities/legal-document';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Label } from '@/shared/ui';

export interface CreateLegalDocumentFormProps {
  owner: LegalOwner;
  existing: LegalDocument[];
}

type Choice =
  'terms:members' | 'privacy:members' | 'terms:self_registered' | 'privacy:self_registered';

/** Adds a text the owner does not have yet. Self-registration texts are platform-only. */
export function CreateLegalDocumentForm({
  owner,
  existing,
}: CreateLegalDocumentFormProps): React.ReactElement | null {
  const { t } = useTranslation();
  const all: Choice[] =
    owner === 'platform'
      ? ['terms:members', 'privacy:members', 'terms:self_registered', 'privacy:self_registered']
      : ['terms:members', 'privacy:members'];
  const available = all.filter((c) => !existing.some((d) => `${d.kind}:${d.audience}` === c));
  const [choice, setChoice] = React.useState<Choice | ''>('');
  const [error, setError] = React.useState<string | undefined>();
  const create = useLegalDocumentMutation((c: Choice) => {
    const [kind, audience] = c.split(':') as ['terms' | 'privacy', 'members' | 'self_registered'];
    return createLegalDocument({
      kind,
      audience,
      organisationId: owner === 'platform' ? null : owner,
    });
  });

  if (available.length === 0) return null;
  const selected = choice && available.includes(choice) ? choice : available[0]!;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <FormField>
        <Label htmlFor="new-legal-document">{t('legal.editor.addText')}</Label>
        <select
          id="new-legal-document"
          className="rounded-md border px-2 py-1 text-sm"
          value={selected}
          onChange={(e) => setChoice(e.target.value as Choice)}
        >
          {available.map((c) => {
            const [kind, audience] = c.split(':') as [string, string];
            return (
              <option key={c} value={c}>
                {t(`legal.kind.${kind}`)}
                {audience === 'self_registered' ? ` (${t('legal.audience.self_registered')})` : ''}
              </option>
            );
          })}
        </select>
      </FormField>
      <Button
        type="button"
        onClick={() =>
          create.mutate(selected, {
            onError: (err) =>
              setError(err instanceof HttpError ? err.payload.message : t('common.unknownError')),
          })
        }
        disabled={create.isPending}
      >
        {t('common.create')}
      </Button>
      <FormMessage message={error} />
    </div>
  );
}
