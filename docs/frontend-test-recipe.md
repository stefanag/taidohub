# Frontend test recipe

> **Audience.** Anyone writing a frontend spec for the first time, or
> adding the second spec in a feature where the first is unusual.
> Surveys the patterns this codebase already uses so a new test
> matches what's around it instead of inventing its own setup.
>
> **Companion to** [`fsd-test-barrel-recipe.md`](./fsd-test-barrel-recipe.md)
> (Phase 4.2 — barrel-mock pattern for tests that need to mock entity
> APIs) and the Phase 5.4 audit table in
> [`architecture-phase5-plan.md` § Chunk 5.4](./architecture-phase5-plan.md).

## What's already set up for you

`apps/frontend/src/test/setup.ts` runs before every spec. It:

  - Imports `@testing-library/jest-dom/vitest` so `toBeInTheDocument`,
    `toHaveTextContent`, etc. are available.
  - Initialises i18next via `@/i18n` — the default language is `en`.
    Test bodies that need a different locale call
    `await i18n.changeLanguage('sv')` (or `'fi'`) in `beforeEach`.
  - Starts MSW (`src/test/msw-server.ts`) with
    `onUnhandledRequest: 'warn'` so any fetch that escapes a mock
    surfaces during the run.
  - Patches jsdom's `Range` prototype so Quill (used by
    `RichTextEditor` / `QuillViewer` / `ProfileForm` / `UserForm`
    Profile tab) doesn't blow up. New specs don't need to repeat
    the patch.

Vitest config (`apps/frontend/vitest.config.ts`) sets the environment
to `jsdom` for all `*.test.ts(x)` files.

## Pattern 1 — testing an entity hook

Entity hooks (`entities/*/lib/hooks.ts`) wrap `useQuery` /
`useMutation` and provide the query-key registry. The behaviour
worth pinning is usually:

  - Query keys are stable across renders.
  - Mutation `onSuccess` invalidates the right keys.
  - Optimistic updates land on cancel/error correctly (if used).

Use `renderHook` from `@testing-library/react` and wrap with a
`QueryClientProvider`:

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import * as api from '../api/<entity>.api.js';
import { useCreate<Entity> } from './hooks.js';

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

it('invalidates the list query on successful create', async () => {
  vi.spyOn(api, 'create<Entity>').mockResolvedValue({ ... });
  const client = new QueryClient();
  const spy = vi.spyOn(client, 'invalidateQueries');

  const { result } = renderHook(() => useCreate<Entity>(), {
    wrapper: wrap(client),
  });

  await act(() => result.current.mutateAsync({ ... }));

  expect(spy).toHaveBeenCalledWith({ queryKey: <expected key> });
});
```

The `vi.spyOn(api, ...)` shape is the simplest path for hooks that
sit INSIDE the same slice as the fetcher (intra-slice imports are
fine). For tests OUTSIDE the slice that need to mock the fetcher,
use the barrel-mock recipe in `fsd-test-barrel-recipe.md`.

## Pattern 2 — testing a feature component

Feature components compose hooks + UI + i18n. The harness needs:

  - A `QueryClientProvider` with a fresh client per test (no
    cross-test cache pollution).
  - The `AbilityContext.Provider` when the component branches on
    CASL ability.
  - `userEvent.setup()` for interactions; `fireEvent` only for
    Radix open/close stubs and other DOM-event-level work where
    `userEvent` is too high-level.

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { AbilityContext, defineAbilityFor } from '@/shared/lib/casl';

import { FeatureUnderTest } from './FeatureUnderTest.js';

function renderWithProviders(node: React.ReactNode, role: 'sysadmin' | 'user' = 'user') {
  const client = new QueryClient();
  const ability = defineAbilityFor({ id: 'u1', role });
  return render(
    <QueryClientProvider client={client}>
      <AbilityContext.Provider value={ability}>
        {node}
      </AbilityContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

it('renders the expected button copy in English', () => {
  renderWithProviders(<FeatureUnderTest />);
  expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
});

it('submits via userEvent', async () => {
  const user = userEvent.setup();
  renderWithProviders(<FeatureUnderTest />);
  await user.type(screen.getByRole('textbox'), 'Hello');
  await user.click(screen.getByRole('button', { name: /save/i }));
  // …assert mock calls or UI state…
});
```

The `feature-flag` gate and `useSession` are commonly stubbed too —
look at `AppSidebar.test.tsx` for a worked example of mocking
`useSession` via the `@/entities/me` barrel (Phase 5.1a).

## Pattern 3 — testing a widget

Widgets compose features + entities + shadcn primitives. The
harness mirrors Pattern 2 but typically needs MORE mocks because
the widget reaches across multiple slices. Two notable extras:

  - **`@tanstack/react-router` partial mock** if the widget calls
    `useNavigate` / `useRouterState`. The pattern is to spread
    `actual` so `Link` keeps working and override only the
    navigate / router-state hooks:

    ```ts
    const navigateMock = vi.fn();
    const useRouterStateMock = vi.fn<() => string>(() => '/dashboard');
    vi.mock('@tanstack/react-router', async (orig) => {
      const actual = await orig<typeof import('@tanstack/react-router')>();
      return {
        ...actual,
        Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
        useNavigate: () => navigateMock,
        useRouterState: (opts) => opts.select({ location: { pathname: useRouterStateMock() } }),
      };
    });
    ```

  - **`window.matchMedia` polyfill** if the widget uses shadcn's
    `useIsMobile` or any other media-query hook:

    ```ts
    beforeAll(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
          matches: false, media: query, onchange: null,
          addListener: vi.fn(), removeListener: vi.fn(),
          addEventListener: vi.fn(), removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      });
    });
    ```

See `widgets/appsidebar/ui/AppSidebar.test.tsx` for both patterns
together in one file.

## Pattern 4 — testing a page

Pages are integration territory. They wire entity queries, feature
components, router state, and CASL gating. Page tests are the most
expensive to write per spec, but they catch coordination bugs that
no lower layer can.

Pattern:

  1. Mock the entity query-options at the BARREL via `vi.hoisted`
     (see `fsd-test-barrel-recipe.md`) so the page's `useQuery`
     calls resolve from a fixture without hitting MSW or the
     fetcher.
  2. Mock features that the page composes — usually as
     `vi.fn(() => null)` returning components, with assertions on
     the props they receive.
  3. Provide a fresh `QueryClient` + `AbilityContext` per test.

Existing example: `pages/my-organisation/ui/MyOrganisationPage.test.tsx`.
It mocks four barrels (`@/entities/me`, `@/entities/organisation`,
`@/entities/membership`, `@/features/auth-by-email`) and asserts the
page's tab-strip behaviour against the membership fixture.

## Radix primitive interactions in jsdom

Radix Select / Dropdown / Sheet use pointer events that jsdom
doesn't model. To open them in a test, stub the pointer-capture
methods first:

```ts
function openRadixSelect(trigger: HTMLElement): void {
  window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
  window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  window.HTMLElement.prototype.scrollIntoView ??= vi.fn();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.click(trigger);
}
```

The block is reused across MembershipEditor.test.tsx,
OrgMembershipEditor.test.tsx, and others. Copy it locally when
a new spec needs it — Phase 5.4 may extract it to
`shared/test/radix.ts` if the third or fourth spec wants it.

## Things to avoid

  - **Don't deep-import an entity API for a mock target.** Use
    the barrel + `vi.hoisted` pattern documented in
    `fsd-test-barrel-recipe.md`. The `pnpm arch` rule flags deep
    mocks as `fsd/no-public-api-sidestep` errors.

  - **Don't share a `QueryClient` across tests.** Create one
    inside `beforeEach` (or inside the test itself for one-off
    cases). Cross-test cache pollution causes mysterious flakes.

  - **Don't assert on i18n keys directly.** The setup loads the
    `en` resources so `screen.getByText` with the English
    string works. If you must guard against language changes,
    use a regex match (`/save/i`) or query by `role` + `name`.

  - **Don't trigger MSW unless you want the network surface.**
    `vi.spyOn(api, 'fn').mockResolvedValue(...)` is faster and
    more deterministic than registering an MSW handler for a
    single test. MSW is the right tool when the spec exercises
    a real fetch path (page-level integration tests).

  - **Don't write a spec without running it.** The vitest watch
    feedback loop is fast; write-test-fail-fix-pass is cheaper
    than write-test-and-assume-it-works.

## Adding a 5.4 slice

1. Pick a target from the audit table in
   [`architecture-phase5-plan.md` § Chunk 5.4](./architecture-phase5-plan.md).
2. Open a branch named `refactor/p5-4-<area>-specs`.
3. Pick the pattern that matches the area (entity hook → Pattern 1;
   feature component → Pattern 2; etc.).
4. Write the spec(s); keep each focused on ONE behaviour per
   `it(...)`.
5. Confirm: `pnpm --filter frontend exec vitest run <path>`
   passes; `pnpm --filter frontend exec tsc --noEmit` is clean.
6. PR; update the audit table in the Phase 5 plan to mark the
   slice DONE when the PR merges.
