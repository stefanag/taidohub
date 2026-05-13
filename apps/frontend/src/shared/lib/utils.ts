import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Canonical `cn` helper — combines `clsx` for conditional logic with
 * `tailwind-merge` to dedupe conflicting Tailwind utility classes.
 *
 * Per the scaffold spec this is the **single** location for `cn`; shadcn
 * primitives in `@/shared/ui/` import it from here.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
