import { describe, expect, it } from 'vitest';

import { renderAdminPasswordResetEmail } from './admin-password-reset.template.js';
import { renderInviteEmail } from './invite.template.js';
import { renderPasswordResetEmail } from './password-reset.template.js';

describe('renderInviteEmail', () => {
  const base = {
    to: 'new@example.com',
    setPasswordUrl: 'http://localhost:5173/set-password?token=abc',
    inviterName: 'Ada',
  };

  for (const locale of ['en', 'sv', 'fi']) {
    it(`renders a non-empty subject + body containing the URL for locale=${locale}`, () => {
      const out = renderInviteEmail({ ...base, locale });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.body).toContain(base.setPasswordUrl);
    });
  }

  it('falls back to English for an unknown locale', () => {
    const en = renderInviteEmail({ ...base, locale: 'en' });
    const unknown = renderInviteEmail({ ...base, locale: 'de' });
    expect(unknown.subject).toBe(en.subject);
  });

  it('uses a generic inviter when inviterName is null', () => {
    const out = renderInviteEmail({ ...base, locale: 'en', inviterName: null });
    expect(out.body).toContain('a system administrator');
  });
});

describe('renderPasswordResetEmail', () => {
  const base = { to: 'u@example.com', resetUrl: 'http://localhost:5173/set-password?token=xyz' };

  for (const locale of ['en', 'sv', 'fi']) {
    it(`renders a non-empty subject + body containing the URL for locale=${locale}`, () => {
      const out = renderPasswordResetEmail({ ...base, locale });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.body).toContain(base.resetUrl);
    });
  }

  it('falls back to English for an unknown locale', () => {
    const en = renderPasswordResetEmail({ ...base, locale: 'en' });
    const unknown = renderPasswordResetEmail({ ...base, locale: 'xx' });
    expect(unknown.subject).toBe(en.subject);
  });
});

describe('renderAdminPasswordResetEmail', () => {
  const base = {
    to: 'u@example.com',
    resetUrl: 'http://localhost:5173/set-password?token=zzz',
    adminName: 'Grace',
  };

  for (const locale of ['en', 'sv', 'fi']) {
    it(`renders a non-empty subject + body containing the URL for locale=${locale}`, () => {
      const out = renderAdminPasswordResetEmail({ ...base, locale });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.body).toContain(base.resetUrl);
    });
  }

  it('falls back to English for an unknown locale', () => {
    const en = renderAdminPasswordResetEmail({ ...base, locale: 'en' });
    const unknown = renderAdminPasswordResetEmail({ ...base, locale: 'qq' });
    expect(unknown.subject).toBe(en.subject);
  });

  it('uses a generic admin when adminName is null', () => {
    const out = renderAdminPasswordResetEmail({ ...base, locale: 'en', adminName: null });
    expect(out.body).toContain('a system administrator');
  });
});
