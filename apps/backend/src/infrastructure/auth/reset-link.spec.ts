import { describe, expect, it } from 'vitest';

import { isResetLinkForTrustedOrigin } from './better-auth.js';

const TRUSTED = ['https://taidohub.se', 'http://localhost:5173'];
const link = (callback?: string) =>
  `https://taidohub.se/api/auth/reset-password/tok${callback === undefined ? '' : `?callbackURL=${encodeURIComponent(callback)}`}`;

describe('isResetLinkForTrustedOrigin', () => {
  it.each([
    ['a trusted origin', 'https://taidohub.se/reset-password', true],
    ['another trusted origin', 'http://localhost:5173/reset-password', true],
    ['a relative path', '/reset-password', true],
    ['no callback at all', undefined, true],
    ['a foreign site', 'https://evil.example/reset-password', false],
    ['a look-alike host', 'https://taidohub.se.evil.example/reset-password', false],
    ['a protocol-relative URL', '//evil.example/reset-password', false],
    ['a backslash trick', '/\\evil.example/reset-password', false],
    ['another scheme', 'javascript:alert(1)', false],
  ])('%s → %s', (_label, callback, expected) => {
    expect(isResetLinkForTrustedOrigin(link(callback), TRUSTED)).toBe(expected);
  });
});
