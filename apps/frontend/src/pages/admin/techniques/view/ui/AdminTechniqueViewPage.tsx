import { useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDeleteTechniqueMutation,
  useTechniqueQuery,
} from '@/entities/technique';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import { formatDate } from '@/i18n/formatters';
import { Button } from '@/shared/ui';

/**
 * Sysadmin-only "view technique" page. Loads the row by id and renders a
 * read-only summary with an audit footer (createdAt / updatedAt /
 * createdByOrganisationId → org name). Edit and Delete actions sit at
 * the top right.
 */
export function AdminTechniqueViewPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { techniqueId } = useParams({
    from: '/_app/admin/techniques/$techniqueId',
  });
  const techniqueQuery = useTechniqueQuery(techniqueId);
  const orgsQuery = useQuery(listOrganisationsQueryOptions());
  const deleteMut = useDeleteTechniqueMutation();

  const orgNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgsQuery.data?.data ?? []) map.set(o.id, o.nameEn);
    return map;
  }, [orgsQuery.data]);

  const onEdit = (): void => {
    void navigate({
      to: '/admin/techniques/$techniqueId/edit',
      params: { techniqueId },
    });
  };
  const onDelete = (): void => {
    if (window.confirm(t('admin.techniques.deleteConfirm'))) {
      deleteMut.mutate(techniqueId, {
        onSuccess: () => {
          void navigate({ to: '/admin/techniques' });
        },
      });
    }
  };
  const onBack = (): void => {
    void navigate({ to: '/admin/techniques' });
  };

  if (techniqueQuery.isPending) {
    return (
      <main className="container max-w-3xl py-8">
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      </main>
    );
  }

  const technique = techniqueQuery.data;
  if (!technique) {
    return (
      <main className="container max-w-3xl py-8">
        <p className="text-on-surface-variant">
          {t('admin.techniques.notFound', {
            defaultValue: 'Technique not found.',
          })}{' '}
          <button
            type="button"
            onClick={onBack}
            className="text-primary underline hover:no-underline"
          >
            {t('admin.techniques.backToList', { defaultValue: 'Back to list' })}
          </button>
        </p>
      </main>
    );
  }

  const createdByOrgName =
    technique.createdByOrganisationId !== null
      ? (orgNameById.get(technique.createdByOrganisationId) ??
        technique.createdByOrganisationId)
      : t('admin.techniques.organisationGlobal', { defaultValue: 'Global' });

  return (
    <main className="container max-w-3xl py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {technique.nameRomaji}
          </h1>
          {technique.nameJa ? (
            <p className="mt-1 text-lg text-on-surface-variant" lang="ja">
              {technique.nameJa}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            {t('admin.techniques.backToList', { defaultValue: 'Back to list' })}
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
          {t('techniques.filters.techniqueType', { defaultValue: 'Technique type' })}
        </dt>
        <dd>
          {technique.classificationsByRoot.technique_type
            .map((c) => c.code)
            .join(', ') || '—'}
        </dd>

        {technique.classificationsByRoot.sotai_category.length > 0 ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.filters.sotaiCategory', { defaultValue: 'Sotai category' })}
            </dt>
            <dd>
              {technique.classificationsByRoot.sotai_category
                .map((c) => c.code)
                .join(', ')}
            </dd>
          </>
        ) : null}

        {technique.classificationsByRoot.attack_type.length > 0 ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.filters.attackType', { defaultValue: 'Attack type' })}
            </dt>
            <dd>
              {technique.classificationsByRoot.attack_type
                .map((c) => c.code)
                .join(', ')}
            </dd>
          </>
        ) : null}

        {technique.nameEn ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.form.nameEn', { defaultValue: 'English' })}
            </dt>
            <dd>{technique.nameEn}</dd>
          </>
        ) : null}
        {technique.nameSv ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.form.nameSv', { defaultValue: 'Swedish' })}
            </dt>
            <dd>{technique.nameSv}</dd>
          </>
        ) : null}
        {technique.nameFi ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.form.nameFi', { defaultValue: 'Finnish' })}
            </dt>
            <dd>{technique.nameFi}</dd>
          </>
        ) : null}

        {technique.descriptionEn ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.form.descriptionEn', { defaultValue: 'Description (EN)' })}
            </dt>
            <dd className="whitespace-pre-wrap">{technique.descriptionEn}</dd>
          </>
        ) : null}
        {technique.descriptionSv ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.form.descriptionSv', { defaultValue: 'Description (SV)' })}
            </dt>
            <dd className="whitespace-pre-wrap">{technique.descriptionSv}</dd>
          </>
        ) : null}
        {technique.descriptionFi ? (
          <>
            <dt className="text-on-surface-variant">
              {t('techniques.form.descriptionFi', { defaultValue: 'Description (FI)' })}
            </dt>
            <dd className="whitespace-pre-wrap">{technique.descriptionFi}</dd>
          </>
        ) : null}

        <dt className="text-on-surface-variant">
          {t('techniques.form.isKihon', { defaultValue: 'Kihon' })}
        </dt>
        <dd>{technique.isKihon ? t('common.yes', { defaultValue: 'Yes' }) : t('common.no', { defaultValue: 'No' })}</dd>

        <dt className="text-on-surface-variant">
          {t('techniques.form.sortOrder', { defaultValue: 'Sort order' })}
        </dt>
        <dd>{technique.sortOrder}</dd>
      </dl>

      <footer className="mt-8 border-t border-outline-variant pt-4 text-xs text-on-surface-variant">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          <dt>{t('admin.audit.createdAt', { defaultValue: 'Created' })}</dt>
          <dd>{formatDate(technique.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt>{t('admin.audit.updatedAt', { defaultValue: 'Last updated' })}</dt>
          <dd>{formatDate(technique.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt>{t('admin.audit.createdByOrg', { defaultValue: 'Owning organisation' })}</dt>
          <dd>{createdByOrgName}</dd>
        </dl>
      </footer>
    </main>
  );
}
