import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CoverageMeter } from './CoverageMeter.js';

describe('<CoverageMeter>', () => {
  it('renders the label and pct% text', () => {
    render(<CoverageMeter label="Shodan" pct={42} />);
    expect(screen.getByText('Shodan')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('clamps the inner bar width to 100 when pct exceeds 100', () => {
    render(<CoverageMeter label="Shodan" pct={150} />);
    const bar = screen.getByRole('progressbar');
    const inner = bar.firstElementChild as HTMLElement;
    expect(inner.style.width).toBe('100%');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps the inner bar width to 0 when pct is negative', () => {
    render(<CoverageMeter label="Shodan" pct={-10} />);
    const bar = screen.getByRole('progressbar');
    const inner = bar.firstElementChild as HTMLElement;
    expect(inner.style.width).toBe('0%');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders the exact pct as the inner bar width within range', () => {
    render(<CoverageMeter label="Shodan" pct={64} />);
    const bar = screen.getByRole('progressbar');
    const inner = bar.firstElementChild as HTMLElement;
    expect(inner.style.width).toBe('64%');
  });
});
