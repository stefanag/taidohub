import * as React from 'react';

import { cn } from '@/shared/lib/utils';

export interface LogoProps {
  /** Tailwind classes to size the logo. Defaults to `h-8 w-auto` (suits the
   *  sidebar header). The underlying SVG is viewBox 380x100, so width follows
   *  aspect ratio automatically. */
  className?: string;
}

/**
 * Brand wordmark + mark. Serves the SVG from `/logo.svg` so the same asset
 * doubles as the favicon. The fill colour (brand gold) is baked into the SVG
 * and intentionally not tokenised — the wordmark is a fixed brand artefact.
 */
export function Logo({ className }: LogoProps): React.ReactElement {
  return (
    <img
      src="/logo.svg"
      alt="taidohub"
      className={cn('h-8 w-auto select-none', className)}
      draggable={false}
    />
  );
}

/**
 * Mark-only variant — the gold spiral + central figure without the wordmark.
 * Used when there isn't room for the full lockup (e.g. the icon-collapsed
 * sidebar header). ViewBox is roughly square (95x100), so `className` should
 * size with `size-N` rather than `h-N w-auto`.
 */
export function LogoMark({ className }: LogoProps): React.ReactElement {
  return (
    <img
      src="/logo-mark.svg"
      alt="taidohub"
      className={cn('size-8 select-none', className)}
      draggable={false}
    />
  );
}
