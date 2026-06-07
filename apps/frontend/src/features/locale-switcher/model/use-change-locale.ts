import { useTranslation } from 'react-i18next';

import { authClient, useSession } from '@/features/auth-by-email';

export const LOCALE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska' },
  { code: 'fi', label: 'Suomi' },
] as const;

export type LocaleCode = (typeof LOCALE_OPTIONS)[number]['code'];

/**
 * Switches the active i18n language and (if authenticated) persists the choice
 * to the better-auth user record optimistically. Best-effort: persistence
 * errors are logged, not surfaced.
 */
export function useChangeLocale(): {
  current: string;
  change: (next: LocaleCode) => void;
} {
  const { i18n } = useTranslation();
  const session = useSession();
  const isAuthed = Boolean(session.data?.user);

  const change = (next: LocaleCode) => {
    void i18n.changeLanguage(next);
    if (isAuthed) {
      // better-auth registers `updateUser` dynamically when the server config
      // declares `additionalFields.locale.input === true`. The installed TS
      // surface may not expose it, so we narrow via a typed cast.
      const client = authClient as unknown as {
        updateUser: (input: { locale: string }) => Promise<unknown>;
      };
      client.updateUser({ locale: next }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[locale] failed to persist locale to user record', err);
      });
    }
  };

  return { current: i18n.resolvedLanguage ?? i18n.language, change };
}
