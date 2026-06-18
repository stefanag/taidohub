import { useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDeletePatternMutation,
  usePatternQuery,
} from '@/entities/pattern';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import { formatDate } from '@/i18n/formatters';
import { Button } from '@/shared/ui';

/**
 * Sysadmin-only "view pattern" page. Loads the row by id and renders a
 * read-only summary with an audit footer (createdAt / updatedAt /
 * createdByOrganisationId → org name). Edit and Delete actions sit at
 * the top right.
 */
export function AdminPatternViewPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { patternId } = useParams({
    from: '/_app/admin/patterns/$patternId',
  });
  const patternQuery = usePatternQuery(patternId);
  const orgsQuery = useQuery(listOrganisationsQueryOptions());
  const deleteMut = useDeletePatternMutation();

  const orgNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgsQuery.data?.data ?? []) map.set(o.id, o.nameEn);
    return map;
  }, [orgsQuery.data]);

  const onEdit = (): void => {
    void navigate({
      to: '/admin/patterns/$patternId/edit',
      params: { patternId },
    });
  };
  const onDelete = (): void => {
    if (window.confirm(t('admin.patterns.deleteConfirm'))) {
      deleteMut.mutate(patternId, {
        onSuccess: () => {
          void navigate({ to: '/admin/patterns' });
        },
      });
    }
  };
  const onBack = (): void => {
    void navigate({ to: '/admin/patterns' });
  };

  if (patternQuery.isPending) {
    return (
      <main className="container max-w-3xl py-8">
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      </main>
    );
  }

  const pattern = patternQuery.data;
  if (!pattern) {
    return (
      <main className="container max-w-3xl py-8">
        <p className="text-on-surface-variant">
          {t('admin.patterns.notFound', {
            defaultValue: 'Pattern not found.',
          })}{' '}
          <button
            type="button"
            onClick={onBack}
            className="text-primary underline hover:no-underline"
          >
            {t('admin.patterns.backToList', { defaultValue: 'Back to list' })}
          </button>
        </p>
      </main>
    );
  }

  const officialBodyName =
    pattern.officialBodyOrgId !== null
      ? (orgNameById.get(pattern.officialBodyOrgId) ?? pattern.officialBodyOrgId)
      : null;
  const createdByOrgName =
    pattern.createdByOrganisationId !== null
      ? (orgNameById.get(pattern.createdByOrganisationId) ??
        pattern.createdByOrganisationId)
      : t('admin.patterns.organisationGlobal', { defaultValue: 'Global' });

  return (
    <main className="container max-w-3xl py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {pattern.nameRomaji}
          </h1>
          {pattern.nameJa ? (
            <p className="mt-1 text-lg text-on-surface-variant" lang="ja">
              {pattern.nameJa}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            {t('admin.patterns.backToList', { defaultValue: 'Back to list' })}
          </Button>
          <Button onClick={onEdit}>{t('common.edit')}</Button>
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={deleteMut.isPending}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-on-surface-variant">
          {t('patterns.filters.patternType', { defaultValue: 'Pattern type' })}
        </dt>
        <dd>
          {pattern.classificationsByRoot.pattern_type
            .map((c) => c.code)
            .join(', ') || '—'}
        </dd>

        {pattern.classificationsByRoot.hokei_subtype.length > 0 ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.filters.hokeiSubtype', { defaultValue: 'Hokei subtype' })}
            </dt>
            <dd>
              {pattern.classificationsByRoot.hokei_subtype
                .map((c) => c.code)
                .join(', ')}
            </dd>
          </>
        ) : null}

        {pattern.nameEn ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.nameEn', { defaultValue: 'English' })}
            </dt>
            <dd>{pattern.nameEn}</dd>
          </>
        ) : null}
        {pattern.nameSv ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.nameSv', { defaultValue: 'Swedish' })}
            </dt>
            <dd>{pattern.nameSv}</dd>
          </>
        ) : null}
        {pattern.nameFi ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.nameFi', { defaultValue: 'Finnish' })}
            </dt>
            <dd>{pattern.nameFi}</dd>
          </>
        ) : null}

        {pattern.descriptionEn ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.descriptionEn', { defaultValue: 'Description (EN)' })}
            </dt>
            <dd className="whitespace-pre-wrap">{pattern.descriptionEn}</dd>
          </>
        ) : null}
        {pattern.descriptionSv ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.descriptionSv', { defaultValue: 'Description (SV)' })}
            </dt>
            <dd className="whitespace-pre-wrap">{pattern.descriptionSv}</dd>
          </>
        ) : null}
        {pattern.descriptionFi ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.descriptionFi', { defaultValue: 'Description (FI)' })}
            </dt>
            <dd className="whitespace-pre-wrap">{pattern.descriptionFi}</dd>
          </>
        ) : null}

        {officialBodyName ? (
          <>
            <dt className="text-on-surface-variant">
              {t('patterns.form.officialBodyOrgId', {
                defaultValue: 'Official body',
              })}
            </dt>
            <dd>{officialBodyName}</dd>
          </>
        ) : null}

        <dt className="text-on-surface-variant">
          {t('patterns.form.sortOrder', { defaultValue: 'Sort order' })}
        </dt>
        <dd>{pattern.sortOrder}</dd>
      </dl>

      <footer className="mt-8 border-t border-outline-variant pt-4 text-xs text-on-surface-variant">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          <dt>{t('admin.audit.createdAt', { defaultValue: 'Created' })}</dt>
          <dd>{formatDate(pattern.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt>{t('admin.audit.updatedAt', { defaultValue: 'Last updated' })}</dt>
          <dd>{formatDate(pattern.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt>{t('admin.audit.createdByOrg', { defaultValue: 'Owning organisation' })}</dt>
          <dd>{createdByOrgName}</dd>
        </dl>
      </footer>
    </main>
  );
}
