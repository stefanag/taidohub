import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';

import { LOCALE_OPTIONS, type LocaleCode, useChangeLocale } from '../model/use-change-locale.js';

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
  const { t } = useTranslation();
  const { current, change } = useChangeLocale();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    change(event.target.value as LocaleCode);
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
        value={current}
        onChange={handleChange}
        className={cn(
          'rounded-sm border px-2 py-1 outline-hidden focus-visible:ring-2',
          palette,
        )}
      >
        {LOCALE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
