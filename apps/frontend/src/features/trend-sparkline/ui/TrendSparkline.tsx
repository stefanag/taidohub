import * as React from 'react';

import type { StatsTrendPoint } from '@repo/contracts/statistics';

export interface TrendSparklineProps {
  points: StatsTrendPoint[];
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 40;

/**
 * Maps trend points onto an SVG polyline `points` string, normalising the
 * value range into the [0, height] box. When every value is identical
 * (flat trend, or a single point), the line is rendered at mid-height
 * rather than collapsing to 0 — a flat-but-visible line is more honest
 * than one pinned to the bottom edge.
 */
function toPolylinePoints(points: StatsTrendPoint[], width: number, height: number): string {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return points
    .map((point, index) => {
      const x = points.length > 1 ? (index / (points.length - 1)) * width : width / 2;
      const y = range === 0 ? height / 2 : height - ((point.value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

export function TrendSparkline({
  points,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: TrendSparklineProps): React.ReactElement {
  if (points.length === 0) {
    return <p className="text-sm text-on-surface-variant">No trend data available.</p>;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Trend over time"
    >
      <polyline
        points={toPolylinePoints(points, width, height)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-primary"
      />
    </svg>
  );
}
