import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { useLegalDocumentsQuery, type LegalOwner } from '@/entities/legal-document';
import { useMyMembershipsQuery } from '@/entities/me';
import { displayName, listOrganisationsQueryOptions } from '@/entities/organisation';
import { CreateLegalDocumentForm, LegalDocumentCard } from '@/features/legal-document-editor';
import { AbilityContext } from '@/shared/lib/casl';
import { FormField, Label } from '@/shared/ui';

/**
 * Terms of use and privacy notices. A sysadmin edits the platform's texts and
 * any organisation's; an orgadmin edits the texts of the organisations they
 * administer. The server enforces the same rule on every call.
 */
export function AdminLegalDocumentsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const ability = useContext(AbilityContext);
  const isSysadmin = ability?.can('manage', 'all') === true;
  const { data: memberships = [] } = useMyMembershipsQuery();
  const { data: orgs } = useQuery(listOrganisationsQueryOptions());

  const adminOrgIds = new Set(
    memberships.filter((m) => m.role === 'orgadmin').map((m) => m.organisationId),
  );
  const organisations = (orgs?.data ?? [])
    .filter((o) => isSysadmin || adminOrgIds.has(o.id))
    .sort((a, b) => displayName(a, i18n.language).localeCompare(displayName(b, i18n.language)));
  const owners: { value: LegalOwner; label: string }[] = [
    ...(isSysadmin ? [{ value: 'platform', label: t('legal.editor.platform') }] : []),
    ...organisations.map((o) => ({ value: o.id, label: displayName(o, i18n.language) })),
  ];

  const [chosen, setChosen] = React.useState<LegalOwner | null>(null);
  const owner = chosen ?? owners[0]?.value ?? null;
  const documents = useLegalDocumentsQuery(owner);

  return (
    <main className="container space-y-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('legal.editor.pageTitle')}</h1>
        <p className="text-sm text-on-surface-variant">{t('legal.editor.pageDescription')}</p>
      </header>

      {owners.length === 0 ? (
        <p className="text-on-surface-variant">{t('legal.editor.nothingToManage')}</p>
      ) : (
        <>
          <FormField>
            <Label htmlFor="legal-owner">{t('legal.editor.owner')}</Label>
            <select
              id="legal-owner"
              className="rounded-md border px-2 py-1 text-sm"
              value={owner ?? ''}
              onChange={(e) => setChosen(e.target.value)}
            >
              {owners.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>

          {documents.isPending ? (
            <p className="text-on-surface-variant">{t('common.loading')}</p>
          ) : documents.isError ? (
            <p role="alert">{t('common.unknownError')}</p>
          ) : (
            <>
              {owner ? <CreateLegalDocumentForm owner={owner} existing={documents.data} /> : null}
              {documents.data.length === 0 ? (
                <p className="text-on-surface-variant">{t('legal.editor.noTexts')}</p>
              ) : (
                documents.data.map((doc) => <LegalDocumentCard key={doc.id} document={doc} />)
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
