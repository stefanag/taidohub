import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { myProfileQueryOptions } from '@/entities/profile';
import { authClient } from '@/features/auth-by-email';
import { ProfileForm } from '@/features/profile-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

/**
 * Self-service profile page — any signed-in user can view and edit their own
 * profile here.
 */
export function ProfilePage(): React.ReactElement {
  const { t } = useTranslation();
  const profileQuery = useQuery(myProfileQueryOptions());

  return (
    <main className="container py-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {profileQuery.isPending ? (
            <p className="text-on-surface-variant">{t('common.loading')}</p>
          ) : profileQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {profileQuery.error instanceof Error
                ? profileQuery.error.message
                : t('common.unknownError')}
            </p>
          ) : (
            <ProfileForm
              profile={profileQuery.data}
              onSaved={() => {
                // Refetch the better-auth session so the sidebar picks up the
                // synced `user.name` without a reload.
                void authClient.getSession();
              }}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
