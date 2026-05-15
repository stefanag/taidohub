# App Shell — Public vs Authenticated Layouts

**Date:** 2026-05-15
**Goal:** Separate the frontend into two distinct layouts — a public layout for anonymous-facing routes (`/`, `/login`, future `/signup`) and an auth-gated app shell with a left sidebar + main area for authenticated routes (`/dashboard`, `/posts`). Move auth enforcement out of per-route guards into a single layout-level `beforeLoad`.

---

## Context

The frontend's current `__root.tsx` carries a `ROUTES_WITHOUT_HEADER` allowlist to opt specific pages out of the global Header. `posts.tsx` carries its own `beforeLoad` auth redirect. The newly-scaffolded shadcn `Sidebar` primitives sit in `apps/frontend/src/shared/ui/sidebar.tsx` and a WIP `AppSidebar` widget exists at `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` with placeholder nav data.

As the app grows, this in-place conditional approach won't scale — every new authenticated page needs its own `beforeLoad`, every new "no header" page needs to be added to the allowlist. The fix is the TanStack Router idiom for shared layouts: **pathless layout routes** that wrap their children and centralise chrome + auth logic.

## Architecture

Two pathless layout routes nested directly under the existing `__root`:

```
__root.tsx                     <Outlet /> + devtools only (no chrome)
├─ _public.tsx                 <Header /> (conditionally) + <Outlet />
│   ├─ '/'  (index.tsx)        IndexComponent; beforeLoad → /dashboard if authed
│   ├─ '/login' (login.tsx)    LoginPage (own hero, header hidden by _public)
│   └─ '/signup' (future)
└─ _app.tsx                    beforeLoad → /login if NOT authed
                               renders SidebarProvider + AppSidebar + main
    ├─ '/dashboard' (new dashboard.tsx) DashboardPage
    └─ '/posts'   (posts.tsx)   PostsPage
```

**Pathless layout routes** (leading-underscore id, e.g. `id: '_app'`) contribute zero path segments — `/posts` stays `/posts`, not `/_app/posts`. Their job is purely structural: share a layout component + share a `beforeLoad`.

**No more `ROUTES_WITHOUT_HEADER`.** `__root.tsx` becomes a four-line shell. Header presence is decided inside `_public.tsx` (which knows about `/login`/`/signup` opting out of header chrome).

**No more per-route auth `beforeLoad`.** `_app.tsx` owns the single redirect-if-anonymous check; every child route inherits.

**Authenticated home redirect.** `routes/index.tsx` gets its own `beforeLoad` — if a session exists, throw `redirect({ to: '/dashboard' })`. This means an authenticated user effectively never sees the public layout; once logged in, they live inside the sidebar shell.

## Components

### `__root.tsx` — simplified

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';

function RootComponent(): React.ReactElement {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV ? (
        <React.Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
      ) : null}
    </>
  );
}

export const rootRoute = createRootRoute({ component: RootComponent });
export const Route = rootRoute;
```

The `ROUTES_WITHOUT_HEADER` set and the `useRouterState` pathname read disappear from here.

### `_public.tsx` (new)

```tsx
function PublicLayout(): React.ReactElement {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  return (
    <>
      {isAuthPage ? null : <Header />}
      <Outlet />
    </>
  );
}

export const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_public',
  component: PublicLayout,
});
```

### `_app.tsx` (new)

```tsx
function AppLayout(): React.ReactElement {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="min-h-svh flex-1">
        <div className="sticky top-2 left-2 z-10 w-fit md:hidden">
          <SidebarTrigger />
        </div>
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async () => {
    const result = await authClient.getSession();
    if (!result.data) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});
```

The `<SidebarTrigger />` is positioned only for mobile (`md:hidden`). On desktop the persistent sidebar's `<SidebarRail />` handles collapse/expand.

### `AppSidebar` — full rewrite

The placeholder nav (Next.js docs structure) gets replaced. Real nav entries, translated labels, real `<Link>` components, active-route highlighting. Footer holds the locale switcher and sign-out button (sign-out also navigates to `/` so the post-logout user lands on the public home).

```tsx
const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/posts', icon: FileText, labelKey: 'nav.posts' },
] as const;

export function AppSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const user = session.data?.user;
  const pathname = useRouterState({ select: s => s.location.pathname });
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    void navigate({ to: '/' });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        <span className="font-headline text-xl font-extrabold tracking-tight">
          taidohub
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)}>
                    <Link to={item.to}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 p-3">
        {user ? (
          <span className="truncate text-xs text-on-surface-variant" title={user.email}>
            {user.email}
          </span>
        ) : null}
        <LocaleSwitcher />
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void handleSignOut(); }}
          className="justify-start gap-2"
        >
          <LogOut className="size-4" />
          {t('header.signOut')}
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
```

`collapsible="icon"` keeps the sidebar visible (as just the icon column) when collapsed on desktop, instead of disappearing entirely.

### `routes/dashboard.tsx` (new)

```tsx
import { createRoute } from '@tanstack/react-router';

import { DashboardPage } from '@/pages/dashboard';

import { appLayoutRoute } from './_app.js';

export const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});

export const Route = dashboardRoute;
```

### `routes/posts.tsx` — modified

- Parent changes: `getParentRoute: () => rootRoute` → `getParentRoute: () => appLayoutRoute`.
- The `beforeLoad` redirect is **removed** — covered by `_app`'s layout-level guard.

### `routes/login.tsx` — modified

Parent changes only: `getParentRoute: () => rootRoute` → `getParentRoute: () => publicLayoutRoute`.

### `routes/index.tsx` — modified

- Parent: `rootRoute` → `publicLayoutRoute`.
- New `beforeLoad`:
  ```ts
  beforeLoad: async () => {
    const result = await authClient.getSession();
    if (result.data) {
      throw redirect({ to: '/dashboard' });
    }
  },
  ```

### `shared/lib/routes.ts` (new)

```ts
export const APP_LANDING_ROUTE = '/dashboard' as const;
```

Both `routes/index.tsx`'s redirect destination and `LoginPage`'s `LoginForm onSuccess` navigation read this constant. Flipping the post-login landing page is then a one-line change.

### `pages/login/ui/LoginPage.tsx` — modified

The `onSuccess` navigation target switches from inline `'/posts'` to `APP_LANDING_ROUTE`.

### `widgets/header/ui/Header.tsx` — modified

The existing Header was carrying the `LocaleSwitcher`, the user email, and the sign-out button. After this change:
- Header is only shown to anonymous visitors on `/` (and any future public pages).
- The signed-in branch of Header is dead code — keep the LocaleSwitcher mount, drop the `useSession()`/user-email/sign-out branch entirely.

Result: Header renders only the brand, the Posts link, the LocaleSwitcher, and a Sign-in button.

## Data flow

**Anonymous loads `/`:**
1. `_public.beforeLoad` — none. Match resolves.
2. `index.tsx.beforeLoad` runs: `getSession()` → `{ data: null }` → no throw.
3. `PublicLayout` renders Header (pathname is `/`, not auth-page).
4. `IndexComponent` mounts inside `<Outlet />`.

**Authenticated loads `/`:**
1. `index.tsx.beforeLoad`: `getSession()` → `{ data: { user, session } }` → `throw redirect({ to: '/dashboard' })`.
2. Router cancels load, navigates to `/dashboard`.
3. `_app.beforeLoad`: session present → no throw.
4. `AppLayout` mounts; `DashboardPage` renders.

**Anonymous loads `/dashboard`:**
1. `_app.beforeLoad`: `getSession()` → null → `throw redirect({ to: '/login' })`.
2. `_public/login` matches; LoginPage renders.

**Login success:**
1. better-auth sets cookie, LoginForm's `onSuccess` callback fires.
2. `navigate({ to: APP_LANDING_ROUTE })`.
3. `_app.beforeLoad`: session present (cookie set) → no throw.
4. Sidebar shell renders.

**Logout (sidebar footer button):**
1. `await signOut()` — cookie cleared.
2. `navigate({ to: '/' })` — explicit redirect to public home.
3. `_public/` matches; `index.tsx.beforeLoad` sees no session → no further redirect.
4. PublicLayout renders Header + home page.

## Testing

### `routes/_app.test.tsx` (new)

- TC1: `authClient.getSession` returns `{ data: null }` → calling the route's `beforeLoad` throws a `RouterRedirect` with destination `/login`.
- TC2: `getSession` returns a session → `beforeLoad` resolves without throwing.

Implementation note: TanStack Router's `redirect(...)` returns a thrown sentinel object. Asserting `await expect(beforeLoad(...)).rejects.toMatchObject({ to: '/login' })` works.

### `routes/index.test.ts` (new)

- TC1: anonymous → no throw.
- TC2: authenticated → throws redirect to `/dashboard`.

Same shape as `_app.test.tsx`.

### `widgets/appsidebar/ui/AppSidebar.test.tsx` (new)

- TC1: nav entries render with translated labels in the default `en` locale (`Dashboard`, `Posts`).
- TC2: passing `vi.spyOn(reactRouter, 'useRouterState').mockReturnValue('/posts')` makes the Posts entry active (`data-active="true"` on the `SidebarMenuButton`).
- TC3: with a mocked authenticated session, the user email renders in the footer.
- TC4: clicking the sign-out button calls `signOut()` and then `navigate({ to: '/' })` exactly once each.

Mock strategy mirrors existing `LocaleSwitcher.test.tsx`: `vi.spyOn(authApi, 'useSession').mockReturnValue(...)`; `signOut` is a regular module export and can be spied directly; `useNavigate` and `useRouterState` are mocked via partial `vi.mock('@tanstack/react-router', async (orig) => ({ ...(await orig<...>()), useNavigate: vi.fn(...), useRouterState: vi.fn(...) }))` so `<Link>` is preserved.

Render wraps the sidebar in `<SidebarProvider>` (required by the shadcn primitives) — small test-helper function.

### Updated test: `features/auth-by-email/ui/LoginForm.test.tsx`

No behavioural change. The existing `onSuccess` test only spies on the prop; the LoginForm itself doesn't navigate (that's LoginPage's job). Untouched.

### Manual smoke

1. Migration already applied. Boot `pnpm dev`.
2. Anonymous: visit `/`, `/posts`, `/dashboard`. `/` shows home + Header; `/posts` and `/dashboard` both redirect to `/login`.
3. Sign in. Lands on `/dashboard` (was `/posts`). App shell renders: sidebar left, main area right, footer with email + locale + sign-out.
4. Click `Posts` in sidebar → navigates to `/posts` without reloading. Active-route highlight moves.
5. Switch locale via sidebar footer → labels update everywhere (including sidebar nav).
6. Click sidebar logo / nav to `/` (or type in URL) → bounces to `/dashboard`.
7. Sign out → returns to `/`, public Header reappears, sidebar gone.
8. Mobile (DevTools narrow viewport): sidebar collapses into a Sheet. `<SidebarTrigger />` floats top-left of main area to reopen.

## Error handling

| Failure | Behaviour |
|---|---|
| `getSession()` rejects (network down) | `_app.beforeLoad` lets the error propagate from `await`. Router treats it as a load failure. The unauthenticated user sees an error boundary or is redirected via the catch — wrap the getSession call in try/catch and treat any error as "no session" so they end up at `/login` rather than a blank error screen. |
| Cookie cleared mid-session | Next navigation within `_app` re-runs `beforeLoad` → redirects to `/login`. Components already on screen don't auto-redirect; this is acceptable for a scaffold. |
| `redirect()` race with another in-flight navigation | TanStack Router serialises — the last redirect wins. No special handling needed. |
| User opens `/login` while already authed | Stays on `/login`. Intentional — `/login` is not in `_app`, so no auth check runs. Allows "sign in as someone else" without first signing out. |

## Out of scope

- A "you've been signed out" toast or notification system.
- Sidebar customisation (pinned items, recent items, multi-workspace switcher).
- Breadcrumbs / page-title strip inside main.
- Replacing the home page content (`/`'s `IndexComponent` stays as-is; most users won't see it after sign-in).
- Backend route changes — none needed.

## File touch list

### Routing scaffold

| Path | Status |
|---|---|
| `apps/frontend/src/app/router/routes/__root.tsx` | modify (strip Header logic) |
| `apps/frontend/src/app/router/routes/_public.tsx` | create |
| `apps/frontend/src/app/router/routes/_app.tsx` | create |
| `apps/frontend/src/app/router/routes/dashboard.tsx` | create |
| `apps/frontend/src/app/router/routes/index.tsx` | modify (parent + redirect) |
| `apps/frontend/src/app/router/routes/login.tsx` | modify (parent) |
| `apps/frontend/src/app/router/routes/posts.tsx` | modify (parent + drop beforeLoad) |
| `apps/frontend/src/app/router/routeTree.gen.ts` | regenerated by TanStack Router plugin |

### Components & shared

| Path | Status |
|---|---|
| `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` | rewrite (real nav, footer chrome) |
| `apps/frontend/src/widgets/header/ui/Header.tsx` | modify (drop signed-in branch) |
| `apps/frontend/src/shared/lib/routes.ts` | create (APP_LANDING_ROUTE constant) |
| `apps/frontend/src/pages/login/ui/LoginPage.tsx` | modify (use APP_LANDING_ROUTE) |

### i18n

| Path | Status |
|---|---|
| `apps/frontend/src/i18n/locales/{en,sv,fi}.json` | add `nav.dashboard`, `nav.posts` keys |

### Tests

| Path | Status |
|---|---|
| `apps/frontend/src/app/router/routes/_app.test.tsx` | create |
| `apps/frontend/src/app/router/routes/index.test.ts` | create |
| `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx` | create |
