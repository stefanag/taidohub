import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';

import en from './locales/en.json' with { type: 'json' };
import fi from './locales/fi.json' with { type: 'json' };
import sv from './locales/sv.json' with { type: 'json' };
import { i18nZodErrorMap } from './zod-error-map.js';

export const SUPPORTED_LOCALES = ['en', 'sv', 'fi'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sv: { translation: sv },
      fi: { translation: fi },
    },
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'cookie', 'navigator'],
      caches: ['localStorage', 'cookie'],
      lookupLocalStorage: 'i18nextLng',
      lookupCookie: 'i18nextLng',
      cookieMinutes: 60 * 24 * 365,
    },
    returnNull: false,
  });

z.setErrorMap(i18nZodErrorMap);

export default i18n;
