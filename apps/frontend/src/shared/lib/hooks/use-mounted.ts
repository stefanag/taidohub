import { useSyncExternalStore } from 'react';

/**
 * Returns `true` after the first client-side render — useful for avoiding
 * hydration mismatches on SSR-bridge code or for guarding `document`-touching
 * effects. Implemented via `useSyncExternalStore` so it doesn't trip the
 * `react-hooks/set-state-in-effect` rule; the server snapshot returns `false`
 * (still hydrating), the client snapshot returns `true` (mounted).
 */

// `subscribe` is a no-op — the value never changes after mount; there's
// nothing to re-notify React about.
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
