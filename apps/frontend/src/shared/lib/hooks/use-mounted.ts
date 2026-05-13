import { useEffect, useState } from 'react';

/**
 * Returns `true` after the first effect tick — useful for avoiding hydration
 * mismatches on SSR-bridge code or for guarding `document`-touching effects.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
