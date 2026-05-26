import { render, renderHook, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, parseFlagsFromEnv, type FeatureFlagMap } from './flags.js';
import { FeatureFlag } from './FeatureFlag.js';
import { FeatureFlagsProvider } from './provider.js';
import { useFeatureFlag } from './useFeatureFlag.js';

function wrapper(flags: FeatureFlagMap) {
  return ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <FeatureFlagsProvider flags={flags}>{children}</FeatureFlagsProvider>
  );
}

describe('parseFlagsFromEnv', () => {
  it('returns DEFAULT_FLAGS for undefined / empty / "{}" input', () => {
    expect(parseFlagsFromEnv(undefined)).toEqual(DEFAULT_FLAGS);
    expect(parseFlagsFromEnv('')).toEqual(DEFAULT_FLAGS);
    expect(parseFlagsFromEnv('{}')).toEqual(DEFAULT_FLAGS);
  });

  it('honours `true` values for known codes', () => {
    const out = parseFlagsFromEnv('{"grading-history":true}');
    expect(out['grading-history']).toBe(true);
    expect(out['grading-history-verification']).toBe(false);
    expect(out['instructor-feedback']).toBe(false);
  });

  it('coerces non-true values to false', () => {
    const out = parseFlagsFromEnv('{"grading-history":1,"instructor-feedback":"yes"}');
    expect(out['grading-history']).toBe(false);
    expect(out['instructor-feedback']).toBe(false);
  });

  it('drops unknown keys silently', () => {
    const out = parseFlagsFromEnv('{"never-defined":true}');
    expect(Object.keys(out).sort()).toEqual(
      ['grading-history', 'grading-history-verification', 'instructor-feedback'].sort(),
    );
  });

  it('falls back to DEFAULT_FLAGS on malformed JSON', () => {
    expect(parseFlagsFromEnv('not json')).toEqual(DEFAULT_FLAGS);
  });
});

describe('useFeatureFlag', () => {
  it('returns false with no provider in the tree (defaults)', () => {
    const { result } = renderHook(() => useFeatureFlag('grading-history'));
    expect(result.current).toBe(false);
  });

  it('returns the provider-supplied value', () => {
    const flags = { ...DEFAULT_FLAGS, 'grading-history': true };
    const { result } = renderHook(() => useFeatureFlag('grading-history'), {
      wrapper: wrapper(flags),
    });
    expect(result.current).toBe(true);
  });
});

describe('<FeatureFlag>', () => {
  it('renders children when the flag is on', () => {
    const flags = { ...DEFAULT_FLAGS, 'grading-history': true };
    render(
      <FeatureFlagsProvider flags={flags}>
        <FeatureFlag code="grading-history">
          <span>shown</span>
        </FeatureFlag>
      </FeatureFlagsProvider>,
    );
    expect(screen.getByText('shown')).toBeInTheDocument();
  });

  it('renders the fallback when the flag is off', () => {
    render(
      <FeatureFlagsProvider flags={DEFAULT_FLAGS}>
        <FeatureFlag code="grading-history" fallback={<span>fallback</span>}>
          <span>shown</span>
        </FeatureFlag>
      </FeatureFlagsProvider>,
    );
    expect(screen.queryByText('shown')).not.toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });
});
