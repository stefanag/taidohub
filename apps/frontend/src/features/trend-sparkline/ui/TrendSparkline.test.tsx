import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrendSparkline } from './TrendSparkline.js';

import type { StatsTrendPoint } from '@repo/contracts/statistics';

const POINTS: StatsTrendPoint[] = [
  { year: 2026, month: 1, value: 10 },
  { year: 2026, month: 2, value: 25 },
  { year: 2026, month: 3, value: 15 },
  { year: 2026, month: 4, value: 40 },
];

describe('<TrendSparkline>', () => {
  it('renders one svg with a polyline whose points attribute has N pairs for N input points', () => {
    const { container } = render(<TrendSparkline points={POINTS} />);

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);

    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const pairs = polyline?.getAttribute('points')?.trim().split(/\s+/) ?? [];
    expect(pairs).toHaveLength(POINTS.length);
    for (const pair of pairs) {
      expect(pair.split(',')).toHaveLength(2);
    }
  });

  it('honours width and height props on the svg element', () => {
    const { container } = render(<TrendSparkline points={POINTS} width={320} height={80} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '320');
    expect(svg).toHaveAttribute('height', '80');
  });

  it('applies sensible defaults for width and height', () => {
    const { container } = render(<TrendSparkline points={POINTS} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '200');
    expect(svg).toHaveAttribute('height', '40');
  });

  it('renders a flat line at mid-height when all values are equal', () => {
    const flat: StatsTrendPoint[] = [
      { year: 2026, month: 1, value: 7 },
      { year: 2026, month: 2, value: 7 },
      { year: 2026, month: 3, value: 7 },
    ];
    const { container } = render(<TrendSparkline points={flat} height={40} />);
    const polyline = container.querySelector('polyline');
    const ys = (polyline?.getAttribute('points')?.trim().split(/\s+/) ?? []).map((pair) =>
      Number(pair.split(',')[1]),
    );
    expect(ys.every((y) => y === 20)).toBe(true);
  });

  it('shows an accessible empty-state message when there are no points', () => {
    render(<TrendSparkline points={[]} />);
    expect(screen.getByText(/no trend data/i)).toBeInTheDocument();
  });
});
