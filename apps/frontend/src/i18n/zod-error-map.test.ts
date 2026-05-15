import { describe, expect, it, beforeEach } from 'vitest';
import { z } from 'zod';

import i18n from './index.js';

describe('Zod error map (via i18n)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('returns a translated tooSmall message in English', () => {
    const result = z.string().min(8).safeParse('abc');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Must be at least 8.');
    }
  });

  it('returns a translated tooSmall message in Finnish after changeLanguage', async () => {
    await i18n.changeLanguage('fi');
    const result = z.string().min(8).safeParse('abc');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Vähintään 8.');
    }
  });

  it('returns a translated invalidEmail message', async () => {
    await i18n.changeLanguage('sv');
    const result = z.string().email().safeParse('not-an-email');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Ange en giltig e-postadress.');
    }
  });
});
