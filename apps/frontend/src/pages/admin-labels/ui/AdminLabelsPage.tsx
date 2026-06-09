import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { CategoriesList, TagsList } from '@/features/labels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui';

/**
 * Admin → Labels page. Sysadmin-only entry point that manages ONLY
 * system-wide (global) tags and categories. The per-organisation labels UX
 * lives at `/settings/labels` for everyone (including sysadmins).
 *
 * Sysadmin-only access is enforced by the route's `beforeLoad`; this
 * component assumes the viewer is a sysadmin and renders the
 * `globalsOnly` variant of the shared TagsList / CategoriesList components.
 */
export function AdminLabelsPage(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('admin.labels.title')}
      </h1>
      <Tabs defaultValue="tags" className="mt-6">
        <TabsList>
          <TabsTrigger value="tags">{t('settings.labels.tagsTab')}</TabsTrigger>
          <TabsTrigger value="categories">
            {t('settings.labels.categoriesTab')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tags" className="mt-4">
          <TagsList isSysadmin globalsOnly />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesList isSysadmin globalsOnly />
        </TabsContent>
      </Tabs>
    </main>
  );
}
