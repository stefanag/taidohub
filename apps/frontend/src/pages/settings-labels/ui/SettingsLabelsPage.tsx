import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth-by-email';
import { CategoriesList, TagsList } from '@/features/labels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui';

/**
 * Settings → Labels admin page. Surfaces the Tags and Categories CRUD
 * affordances as a tabbed interface. Org-scoped labels are editable by any
 * authenticated user in the org; globals are read-only for non-sysadmins.
 *
 * `isSysadmin` is read here (pages may import from features) and threaded
 * down to the list components as a prop so the labels feature itself stays
 * free of cross-feature imports.
 */
export function SettingsLabelsPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const role = (session.data?.user as { role?: string } | undefined)?.role;
  const isSysadmin = role === 'sysadmin';
  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('settings.labels.title')}
      </h1>
      <Tabs defaultValue="tags" className="mt-6">
        <TabsList>
          <TabsTrigger value="tags">{t('settings.labels.tagsTab')}</TabsTrigger>
          <TabsTrigger value="categories">
            {t('settings.labels.categoriesTab')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tags" className="mt-4">
          <TagsList isSysadmin={isSysadmin} />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesList isSysadmin={isSysadmin} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
