import * as React from "react"

const MOBILE_BREAKPOINT = 768

// External-store subscription for the mobile breakpoint. Registering via
// useSyncExternalStore avoids the "setState synchronously in effect" pattern
// that react-hooks 7 flags and gives us hydration-safe reads via the
// server-snapshot callback (returns false on the server; browsers get the
// real matchMedia value).
function subscribe(cb: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
