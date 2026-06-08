import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FLAGS, type FeatureFlagMap } from './flags.js';
import { FeatureFlag } from './FeatureFlag.js';
import { FeatureFlagsProvider } from './provider.js';
import { useFeatureFlag } from './useFeatureFlag.js';

vi.mock('@/entities/feature-flag/api/feature-flags.api.js', () => ({
  getFeatureFlags: vi.fn(),
}));

import { getFeatureFlags } from '@/entities/feature-flag/api/feature-flags.api.js';

const mockedGetFeatureFlags = vi.mocked(getFeatureFlags);

function wrapper(flags: FeatureFlagMap) {
  return ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <FeatureFlagsProvider flags={flags}>{children}</FeatureFlagsProvider>
  );
}

function renderWithQuery(ui: React.ReactElement): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <React.Suspense fallback={<span data-testid="fallback">…</span>}>{ui}</React.Suspense>
    </QueryClientProvider>,
  );
}

describe('useFeatureFlag', () => {
  it('returns false with no provider in the tree (defaults)', () => {
    const { result } = renderHook(() => useFeatureFlag('grading-history'));
    expect(result.current).toBe(false);
  });

  it('returns the provider-supplied value (test override path)', () => {
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

describe('FeatureFlagsProvider', () => {
  it('uses the flags prop when provided (test override path, no fetch)', () => {
    mockedGetFeatureFlags.mockClear();
    render(
      <FeatureFlagsProvider
        flags={{
          'grading-history': true,
          'grading-history-verification': false,
          'instructor-feedback': false,
        }}
      >
        <Probe code="grading-history" />
      </FeatureFlagsProvider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true');
    expect(mockedGetFeatureFlags).not.toHaveBeenCalled();
  });

  it('fetches from /api/feature-flags when no override is supplied', async () => {
    mockedGetFeatureFlags.mockResolvedValueOnce({
      'grading-history': true,
      'grading-history-verification': false,
      'instructor-feedback': false,
    });

    renderWithQuery(
      <FeatureFlagsProvider>
        <Probe code="grading-history" />
      </FeatureFlagsProvider>,
    );

    expect(await screen.findByTestId('value')).toHaveTextContent('true');
    expect(mockedGetFeatureFlags).toHaveBeenCalledTimes(1);
  });
});

function Probe({ code }: { code: 'grading-history' }): React.ReactElement {
  const value = useFeatureFlag(code);
  return <span data-testid="value">{String(value)}</span>;
}
