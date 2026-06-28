# FSD recipe — mock through the barrel, not the deep path

> **Status:** Pattern doc. The proof migration landed in Chunk 4.2
> (`AppSidebar.test.tsx` → `@/features/auth-by-email`); subsequent
> applications track in Chunk 4.3.
>
> **Scope:** Test-side fix for the `fsd/no-public-api-sidestep`
> rule. The recipe is mechanical — once you've seen one migration
> the others follow.

## The problem

Many existing test files mock entity / feature API modules by
their deep path:

```ts
vi.mock('@/entities/user/api/user.api.js', () => ({
  fetchUser: vi.fn(),
}));
```

Steiger flags this as `fsd/no-public-api-sidestep`. The historical
reason for the override was real: code inside the slice (the
queries / hooks file) captures the fetcher as a module-level
constant via direct import, e.g.

```ts
// inside the slice
import { fetchUser } from './api/user.api.js';
export const userQueryOptions = (id) => queryOptions({ queryFn: () => fetchUser(id), ... });
```

Spying on the barrel re-export of `fetchUser` doesn't redirect the
captured deep reference inside the slice — so the test had to
mock the deep module to reach the actual call site.

## The fix

When the consumer in test scope is a **hook** (or a component
calling a hook), mock the hook through the barrel instead of
the underlying fetcher. This works because the test asserts
*observable behaviour from outside the slice* — and the
barrel IS the public surface.

### Pattern: hoisted mock + barrel factory

```ts
// 1. Declare the mock(s) the test wants to assert against, hoisted
//    so the vi.mock factory below can close over them.
const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

// 2. Mock the BARREL, not the deep file. Spread the actual module
//    so every other export keeps working; override only the
//    symbols the test cares about.
vi.mock('@/features/auth-by-email', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email')>();
  return { ...actual, useSignOut: () => signOutMock };
});

// 3. In the test body, assert against the mock. Reset in afterEach.
it('signs out and navigates', async () => {
  // …click the menu item that triggers the hook…
  expect(signOutMock).toHaveBeenCalledTimes(1);
});

afterEach(() => {
  signOutMock.mockClear();
});
```

### Why hoisted

`vi.mock` calls are hoisted to the top of the file. If the mock
factory closes over a variable defined at normal top-level
position, that variable is `undefined` when the factory runs.
`vi.hoisted(() => ...)` returns a value computed at hoisting
time, which the mock factory can safely read.

### Spreading `actual`

`...actual` keeps every other symbol of the barrel intact —
including `useSession`, `signInWithEmail`, etc. The test can
still call `vi.spyOn(authApi, 'useSession').mockReturnValue(...)`
later to control session state per-test.

## When this doesn't work — fall back to mocking the fetcher itself

If the test calls a fetcher *directly* (not via a hook), barrel-
mocking still works IF the fetcher is exported from the barrel
AND the caller imports from the barrel. The remaining trap is
intra-slice deep imports: the slice's own `queries.ts` is the
common offender.

To convert: change the slice's internal import from

```ts
import { fetchUser } from './api/user.api.js';
```

to

```ts
import { fetchUser } from './index.js'; // intra-slice through barrel
```

ESM live re-exports route the call through the barrel module —
so `vi.mock` on the barrel intercepts. Be cautious of circular
imports; intra-slice barrel-importing is brittle. Prefer mocking
the hook layer above the fetcher when possible.

## When NOT to apply this recipe

- **Production-side cross-imports** flagged by
  `fsd/forbidden-imports`. Those are architectural — usually
  lift to a widget, extract shared logic to an entity, or
  accept the violation with an explicit `steiger.config.js`
  override on the production-side file. The barrel-mock trick
  is test-only and doesn't address them.

- **Tests that assert `vi.spyOn(deepModule, 'fn')` for the
  fetcher's exact call count**. If you genuinely need to spy
  on the fetcher (not the hook that wraps it), the hook-mock
  pattern hides what you're testing. In that case, either:
  - lift the assertion up one layer (mock the hook, assert
    observable side effects), OR
  - keep the deep mock and keep the `steiger.config.js`
    override on that one file with a comment explaining
    why.

## Checklist for a 4.3 PR

1. Identify the test file flagged by `pnpm --filter frontend arch`.
2. Note which symbol is being deep-mocked (e.g. `fetchUser`).
3. Identify the consumer layer (hook? component?). Mock at the
   highest layer that the test observes.
4. Apply the hoisted + barrel-factory pattern above.
5. Remove the deep import.
6. Re-run the test → still passes.
7. Re-run `pnpm --filter frontend arch` → that error is gone, no
   new ones.
8. Delete the corresponding `steiger.config.js` override block
   if one exists (the AppSidebar proof had no override; some
   others do).
9. Commit on its own branch.

## Reference migration

`apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx`
landed in Chunk 4.2. The diff from a deep `vi.spyOn` on
`@/features/auth-by-email/api/auth.api.js` to a hoisted mock
of `useSignOut` on `@/features/auth-by-email` is the canonical
example.
