import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listOrganisationsQueryOptions,
  useCreateOrganisation,
} from '@/entities/organisation';
import { OrganisationForm } from '@/features/organisation-form';
import { Button } from '@/shared/ui';

/**
 * Sysadmin-only "new organisation" page. Wraps `OrganisationForm` in
 * create mode; on save → list, on cancel → list. The sysadmin guard is
 * inherited from `_app.admin.organisations.tsx`.
 */
export function AdminOrganisationNewPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: orgsResp } = useQuery(listOrganisationsQueryOptions());
  const createMut = useCreateOrganisation({
    onSuccess: () => {
      void navigate({ to: '/admin/organisations' });
    },
  });

  const onBack = (): void => {
    void navigate({ to: '/admin/organisations' });
  };

  return (
    <main className="container max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.organisations.newOrganisation', {
            defaultValue: 'New organisation',
          })}
        </h1>
        <Button variant="outline" onClick={onBack}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
      <OrganisationForm
        mode="create"
        parentCandidates={orgsResp?.data ?? []}
        submitting={createMut.isPending}
        onSubmit={async (values) => {
          await createMut.mutateAsync(
            values as Parameters<typeof createMut.mutateAsync>[0],
          );
        }}
      />
    </main>
  );
}
