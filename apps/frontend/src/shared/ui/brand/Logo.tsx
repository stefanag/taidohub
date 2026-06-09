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
