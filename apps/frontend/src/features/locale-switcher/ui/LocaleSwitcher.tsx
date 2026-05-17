import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { authClient, useSession } from '@/features/auth-by-email';
import { cn } from '@/shared/lib/utils';

const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska' },
  { code: 'fi', label: 'Suomi' },
] as const;

export interface LocaleSwitcherProps {
  /** `default` reads on white surfaces; `onDark` reads on the navy hero. */
  variant?: 'default' | 'onDark';
  className?: string;
}

/**
 * Drop-down that flips the active i18n language. Optimistic: changes i18n
 * immediately, then (if the viewer is authenticated) writes the choice to
 * the better-auth user record in the background — best-effort, no spinner.
 */
export function LocaleSwitcher({
  variant = 'default',
  className,
}: LocaleSwitcherProps): React.ReactElement {
  const { i18n, t } = useTranslation();
  const session = useSession();
  const isAuthed = Boolean(session.data?.user);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
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

  const palette =
    variant === 'onDark'
      ? 'bg-transparent text-secondary border-on-primary/30'
      : 'bg-transparent text-on-surface border-outline-variant';

  return (
    <label className={cn('inline-flex items-center gap-2 text-sm', className)}>
      <span className="sr-only">{t('locale.switch')}</span>
      <select
        aria-label={t('locale.switch')}
        value={i18n.resolvedLanguage ?? i18n.language}
        onChange={handleChange}
        className={cn(
          'rounded-sm border px-2 py-1 outline-hidden focus-visible:ring-2',
          palette,
        )}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
