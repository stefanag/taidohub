import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { signInWithGoogle } from '../api/auth.api.js';
import { signInProvidersQueryOptions } from '../model/auth.queries.js';

import { Button } from '@/shared/ui';

/** "Sign in with Google", rendered only when the server has Google configured. */
export function GoogleSignInButton(): React.ReactElement | null {
  const { t } = useTranslation();
  const providers = useQuery(signInProvidersQueryOptions());
  const [pending, setPending] = React.useState(false);
  if (!providers.data?.google) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signInWithGoogle().catch(() => setPending(false));
      }}
    >
      {t('auth.login.google')}
    </Button>
  );
}
