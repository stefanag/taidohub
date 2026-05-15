import { describe, expect, it } from 'vitest';

import i18n from './index.js';

describe('i18n singleton', () => {
  it('initializes with English by default and translates common.loading', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('common.loading')).toBe('Loading…');
  });

  it('returns Swedish strings after changeLanguage(sv)', async () => {
    await i18n.changeLanguage('sv');
    expect(i18n.t('common.loading')).toBe('Laddar…');
    expect(i18n.t('auth.login.submit')).toBe('Logga in');
  });

  it('returns Finnish strings after changeLanguage(fi)', async () => {
    await i18n.changeLanguage('fi');
    expect(i18n.t('common.loading')).toBe('Ladataan…');
    expect(i18n.t('auth.login.submit')).toBe('Kirjaudu sisään');
  });

  it('falls back to English for missing keys', async () => {
    await i18n.changeLanguage('fi');
    const unknown = i18n.t('this.key.does.not.exist');
    expect(unknown).toBe('this.key.does.not.exist');
  });
});
