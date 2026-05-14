# Sysadmin Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `role` column to the user table, surface it through better-auth, seed an idempotent sysadmin user via `pnpm --filter backend run db:seed`, and fix/extend the frontend tests so the verify gate can re-include `pnpm test`.

**Architecture:** Five small backend deltas (schema → env → better-auth config → seed function → seed CLI), plus four frontend deltas (a11y/test fix, MSW diagnosis, new `onSuccess` case, new CASL ability-builder tests). Backend seed logic is split into a pure function with injected deps + a thin CLI wrapper so it's unit-testable without a live database. Each task is independently committable.

**Tech Stack:** NestJS 11 backend (ESM), Drizzle ORM 0.45, better-auth 1.6, TanStack Router on the frontend, Vitest 4, MSW 2, Zod 4.

---

## File touch list

| Path | Status | Owner |
|---|---|---|
| `apps/backend/src/infrastructure/database/schema/users.ts` | modify | Task 1 |
| `apps/backend/drizzle/0001_*.sql` (+ `meta/_journal.json`) | generated | Task 1 |
| `apps/backend/src/config/env.schema.ts` | modify | Task 2 |
| `apps/backend/.env.example` | modify | Task 2 |
| `apps/backend/src/infrastructure/auth/better-auth.ts` | modify | Task 3 |
| `apps/backend/src/infrastructure/database/seed-sysadmin.ts` | create | Task 4 |
| `apps/backend/src/infrastructure/database/seed-sysadmin.spec.ts` | create | Task 4 |
| `apps/backend/src/infrastructure/database/seed.ts` | create | Task 5 |
| `apps/backend/package.json` | modify (`db:seed` script) | Task 5 |
| `apps/frontend/src/shared/ui/form.tsx` | modify (`role="alert"`) | Task 6 |
| `apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx` | modify (fix test 2, add `onSuccess`) | Task 7, Task 8 |
| `apps/frontend/src/shared/lib/casl/defineAbilityFor.test.ts` | create | Task 9 |

---

## Task 1: Add `role` column to the `user` table

**Files:**
- Modify: `apps/backend/src/infrastructure/database/schema/users.ts`
- Generated: `apps/backend/drizzle/0001_*.sql` (drizzle-kit assigns the name)

- [ ] **Step 1: Add the column to the schema**

Edit `apps/backend/src/infrastructure/database/schema/users.ts`. Inside the `user = pgTable('user', { ... })` columns object, add `role` between `image` and `createdAt`:

```ts
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm --filter backend run db:generate
```

Expected: a new file appears under `apps/backend/drizzle/` named `0001_<adjective>_<noun>.sql` and `apps/backend/drizzle/meta/0001_snapshot.json` is created; `apps/backend/drizzle/meta/_journal.json` gets a second entry.

- [ ] **Step 3: Inspect the generated SQL**

```bash
cat apps/backend/drizzle/0001_*.sql
```

Expected content (exact identifiers may differ):

```sql
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;
```

If the file contains anything else (e.g. unrelated changes to `posts` because drizzle-kit detected drift), STOP and investigate — schema and migrations are now out of sync.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: `Tasks: 4 successful, 4 total`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/database/schema/users.ts apps/backend/drizzle/
git commit -m "feat(backend): add role column to user table"
```

---

## Task 2: Add SYSADMIN env vars

**Files:**
- Modify: `apps/backend/src/config/env.schema.ts`
- Modify: `apps/backend/.env.example`

- [ ] **Step 1: Extend the env schema**

Edit `apps/backend/src/config/env.schema.ts`. Add the two fields at the end of the `EnvSchema` `z.object({...})` (just before the closing `})`):

```ts
  /**
   * Seed-only: identity for the sysadmin user created by
   * `pnpm --filter backend run db:seed`. Defaults are dev-friendly;
   * override in `.env` for staging/prod.
   */
  SYSADMIN_EMAIL: z.string().email().default('sysadmin@example.com'),
  SYSADMIN_PASSWORD: z.string().min(8).default('sysadmin'),
```

- [ ] **Step 2: Document the keys in .env.example**

Edit `apps/backend/.env.example` — replace the existing content with:

```
# Backend env. See the root `.env.example` for the canonical list of variables.
# Copy that file to `.env` at the repo root — Nest's @nestjs/config picks it up
# via `envFilePath: ['../../.env', '.env']` in `config.module.ts`.

# Consumed only by the db:seed script — identity for the sysadmin user.
SYSADMIN_EMAIL=sysadmin@example.com
SYSADMIN_PASSWORD=sysadmin
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: `Tasks: 4 successful, 4 total`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/config/env.schema.ts apps/backend/.env.example
git commit -m "feat(backend): add SYSADMIN_EMAIL/SYSADMIN_PASSWORD env vars for the seed script"
```

---

## Task 3: Surface `role` through better-auth

**Files:**
- Modify: `apps/backend/src/infrastructure/auth/better-auth.ts`

- [ ] **Step 1: Add `user.additionalFields.role` to the better-auth config**

Edit `apps/backend/src/infrastructure/auth/better-auth.ts`. Inside the `betterAuth({ ... })` call, add a top-level `user` block. Place it between `emailAndPassword: {...}` and `advanced: {...}`:

```ts
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'user',
          required: false,
          input: false,
        },
      },
    },
    advanced: {
      // Default cookie name is `better-auth.session_token`; do not change it
      // unless `swagger.ts`'s `addCookieAuth(...)` name is updated to match.
      cookies: {
        sessionToken: {
          attributes: {
            httpOnly: true,
            sameSite: isProd ? 'none' : 'lax',
            secure: isProd,
          },
        },
      },
    },
  });
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: `Tasks: 4 successful, 4 total`. If better-auth's type complains about the new shape, the most likely cause is a different config layout for `additionalFields` in 1.6.10 — `cat node_modules/.pnpm/better-auth@*/node_modules/better-auth/dist/types/index.d.mts | grep -A5 "additionalFields"` to confirm the exact key name and field shape.

- [ ] **Step 3: Boot the backend to verify the runtime accepts the config**

```bash
pnpm --filter backend run build && cd apps/backend && timeout 12 node dist/src/main.js 2>&1 | tail -10 && cd ../..
```

Expected output ending with: `Nest application successfully started` and `Backend listening on http://localhost:3001/api`. (Database connection failures are tolerable here — env.schema's NODE_ENV-dependent placeholders apply only to the openapi:generate context, not to a real boot. If you don't have a DB, the boot may stop earlier; the goal of this step is to confirm better-auth's config validation passes.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/infrastructure/auth/better-auth.ts
git commit -m "feat(backend): expose user.role on session via better-auth additionalFields"
```

---

## Task 4: Pure seed function + unit tests

**Files:**
- Create: `apps/backend/src/infrastructure/database/seed-sysadmin.ts`
- Create: `apps/backend/src/infrastructure/database/seed-sysadmin.spec.ts`

Split the seed logic from its database/better-auth dependencies so it can be unit-tested with plain stubs. The CLI wrapper (Task 5) injects the real implementations.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/infrastructure/database/seed-sysadmin.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { seedSysadmin, type SeedDeps } from './seed-sysadmin.js';

const config = {
  email: 'sysadmin@example.com',
  password: 'sysadmin-pass',
  name: 'Sysadmin',
};

function makeDeps(overrides: Partial<SeedDeps> = {}): SeedDeps {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    signUpEmail: vi.fn().mockResolvedValue(undefined),
    setRoleByEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('seedSysadmin', () => {
  it('creates the user via signUpEmail and promotes to admin when missing', async () => {
    const deps = makeDeps();
    const result = await seedSysadmin(deps, config);

    expect(deps.findUserByEmail).toHaveBeenCalledWith(config.email);
    expect(deps.signUpEmail).toHaveBeenCalledWith({
      email: config.email,
      password: config.password,
      name: config.name,
    });
    expect(deps.setRoleByEmail).toHaveBeenCalledWith(config.email, 'admin');
    expect(result).toEqual({ created: true, promoted: true });
  });

  it('skips signup and promotes when the user already exists with non-admin role', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'u1', role: 'user' }),
    });
    const result = await seedSysadmin(deps, config);

    expect(deps.signUpEmail).not.toHaveBeenCalled();
    expect(deps.setRoleByEmail).toHaveBeenCalledWith(config.email, 'admin');
    expect(result).toEqual({ created: false, promoted: true });
  });

  it('is a no-op when the user exists and is already admin', async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'u1', role: 'admin' }),
    });
    const result = await seedSysadmin(deps, config);

    expect(deps.signUpEmail).not.toHaveBeenCalled();
    expect(deps.setRoleByEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false, promoted: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter backend exec vitest run src/infrastructure/database/seed-sysadmin.spec.ts
```

Expected: FAIL with `Cannot find module './seed-sysadmin.js'` (or equivalent module-not-found error).

- [ ] **Step 3: Implement the function**

Create `apps/backend/src/infrastructure/database/seed-sysadmin.ts`:

```ts
/**
 * Pure seed logic — given concrete dependencies, ensures a sysadmin row
 * exists and has role='admin'. The CLI wrapper in `./seed.ts` injects real
 * implementations against drizzle + better-auth; tests inject stubs.
 */

export interface SeedDeps {
  /** Returns `null` when no row matches, or `{ id, role }` when one does. */
  findUserByEmail(email: string): Promise<{ id: string; role: string } | null>;
  /** Calls better-auth's server-side sign-up (handles password hashing). */
  signUpEmail(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<void>;
  /** Issues a direct `UPDATE user SET role = ? WHERE email = ?`. */
  setRoleByEmail(email: string, role: string): Promise<void>;
}

export interface SeedConfig {
  email: string;
  password: string;
  name: string;
}

export interface SeedResult {
  /** `true` if a new user row was created; `false` if it already existed. */
  created: boolean;
  /** `true` if the role had to be set to 'admin'; `false` if already admin. */
  promoted: boolean;
}

export async function seedSysadmin(
  deps: SeedDeps,
  config: SeedConfig,
): Promise<SeedResult> {
  const existing = await deps.findUserByEmail(config.email);

  if (!existing) {
    await deps.signUpEmail({
      email: config.email,
      password: config.password,
      name: config.name,
    });
    await deps.setRoleByEmail(config.email, 'admin');
    return { created: true, promoted: true };
  }

  if (existing.role === 'admin') {
    return { created: false, promoted: false };
  }

  await deps.setRoleByEmail(config.email, 'admin');
  return { created: false, promoted: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter backend exec vitest run src/infrastructure/database/seed-sysadmin.spec.ts
```

Expected: `Test Files 1 passed (1)` and `Tests 3 passed (3)`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/database/seed-sysadmin.ts apps/backend/src/infrastructure/database/seed-sysadmin.spec.ts
git commit -m "feat(backend): add testable seedSysadmin pure function"
```

---

## Task 5: Seed CLI wrapper + `db:seed` script

**Files:**
- Create: `apps/backend/src/infrastructure/database/seed.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Write the CLI wrapper**

Create `apps/backend/src/infrastructure/database/seed.ts`:

```ts
/**
 * Standalone sysadmin seed runner. Invoked via:
 *
 *   pnpm --filter backend run db:seed
 *
 * Wires the pure `seedSysadmin` function against a real Drizzle client and
 * the real better-auth server API. Idempotent — safe to re-run.
 */
import { eq } from 'drizzle-orm';

import { EnvSchema, type Env } from '../../config/env.schema.js';
import { buildBetterAuth } from '../auth/better-auth.js';

import { createDrizzleClient } from './client.js';
import { user } from './schema/index.js';
import { seedSysadmin, type SeedDeps } from './seed-sysadmin.js';

async function main(): Promise<void> {
  const env: Env = EnvSchema.parse(process.env);

  const db = createDrizzleClient(env.DATABASE_URL);
  const auth = buildBetterAuth(env);

  const deps: SeedDeps = {
    findUserByEmail: async (email) => {
      const rows = await db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      return rows[0] ?? null;
    },
    signUpEmail: async ({ email, password, name }) => {
      await auth.api.signUpEmail({
        body: { email, password, name },
      });
    },
    setRoleByEmail: async (email, role) => {
      await db.update(user).set({ role }).where(eq(user.email, email));
    },
  };

  const result = await seedSysadmin(deps, {
    email: env.SYSADMIN_EMAIL,
    password: env.SYSADMIN_PASSWORD,
    name: 'Sysadmin',
  });

  // eslint-disable-next-line no-console
  console.info(
    `[seed] sysadmin: ${env.SYSADMIN_EMAIL} (role=admin, created=${result.created}, promoted=${result.promoted})`,
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Register the script in package.json**

Edit `apps/backend/package.json`. Add `db:seed` immediately after `db:migrate` in the `scripts` block:

```json
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/infrastructure/database/migrate.ts",
    "db:seed": "tsx src/infrastructure/database/seed.ts",
    "db:studio": "drizzle-kit studio",
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: `Tasks: 4 successful, 4 total`. If `db.select({ id: user.id, role: user.role })` complains about `user.role` not existing, the schema regeneration from Task 1 didn't take — rerun `pnpm --filter backend run db:generate` and `pnpm install`.

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: `Tasks: 4 successful, 4 total` (warnings about import order are acceptable).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/database/seed.ts apps/backend/package.json
git commit -m "feat(backend): add db:seed CLI for the sysadmin user"
```

---

## Task 6: `role="alert"` on `FormMessage`

**Files:**
- Modify: `apps/frontend/src/shared/ui/form.tsx`

- [ ] **Step 1: Apply the a11y fix**

Edit `apps/frontend/src/shared/ui/form.tsx`. In the `FormMessage` component, add `role="alert"` to the `<p>` element. The whole `FormMessage` becomes:

```tsx
export const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, message, children, ...props }, ref) => {
    const body = message ?? children;
    if (!body) return null;
    return (
      <p
        ref={ref}
        role="alert"
        className={cn('text-sm font-medium text-destructive', className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';
```

- [ ] **Step 2: Run the existing LoginForm tests**

```bash
pnpm --filter frontend exec vitest run src/features/auth-by-email/ui/LoginForm.test.tsx
```

Expected: the `"shows validation errors when fields are empty"` case PASSES. The `"posts the credentials to the better-auth email endpoint on submit"` case still FAILS (that's Task 7).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/shared/ui/form.tsx
git commit -m "fix(frontend): announce form validation errors via role=alert"
```

---

## Task 7: Diagnose and fix the LoginForm credentials test

**Files:**
- Modify: `apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx`

This task has a discovery step before a fix step.

- [ ] **Step 1: Surface the actual request that's not being intercepted**

Edit `apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx`. Temporarily flip MSW to error on unhandled requests by adding a `beforeEach` to the `describe`:

```ts
import { beforeEach } from 'vitest';

beforeEach(() => {
  server.events.on('request:unhandled', ({ request }) => {
    // eslint-disable-next-line no-console
    console.warn('[msw] unhandled', request.method, request.url);
  });
});
```

Run the test:

```bash
pnpm --filter frontend exec vitest run src/features/auth-by-email/ui/LoginForm.test.tsx
```

Inspect the output. Three possible outcomes:

**Outcome A: `[msw] unhandled POST <some URL>` printed** — the actual URL is different from `${env.VITE_API_URL}/api/auth/sign-in/email`. Note the URL, remove the diagnostic code, and update the `http.post(...)` handler URL in the test to match the URL MSW observed.

**Outcome B: no unhandled-request warning, spy still 0 calls** — MSW intercepted nothing, meaning better-auth's React client is using a transport jsdom-MSW doesn't observe. Skip to Step 2 (mock approach).

**Outcome C: the warning prints but the URL matches** — race between `server.use(...)` and the submit. Skip to Step 3 (await pattern).

- [ ] **Step 2: (Outcome B only) Rewrite the test to mock `signInWithEmail` directly**

If Outcome B, the test's coverage moves up a level — instead of verifying the HTTP call, verify the form calls its collaborator with the typed values. Replace the second test in `LoginForm.test.tsx` with:

```ts
import { vi } from 'vitest';
import * as authApi from '../api/auth.api';

it('posts the credentials to signInWithEmail on submit', async () => {
  const signInSpy = vi.spyOn(authApi, 'signInWithEmail').mockResolvedValue();
  const user = userEvent.setup();
  render(<LoginForm />);

  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery-staple');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  await vi.waitFor(() => {
    expect(signInSpy).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct-horse-battery-staple',
    });
  });

  signInSpy.mockRestore();
});
```

Also remove the now-unused `server.use(...)` block, the `seen` spy, and the `http`/`HttpResponse`/`server` imports if nothing else uses them — but keep them if Step 3 needs them.

- [ ] **Step 3: (Outcome C only) Flush before submit**

If Outcome C, edit the test to await one microtask after `server.use(...)`:

```ts
server.use(
  http.post(`${env.VITE_API_URL}/api/auth/sign-in/email`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    seen(body);
    return HttpResponse.json({ user: null, session: null });
  }),
);
await Promise.resolve();  // <-- new
```

- [ ] **Step 4: Remove the diagnostic `beforeEach` from Step 1**

If you added the `request:unhandled` listener for diagnosis, delete it now. The fix should stand on its own.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/features/auth-by-email/ui/LoginForm.test.tsx
```

Expected: both test cases pass. `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx
git commit -m "fix(frontend): repair LoginForm credentials submit test"
```

(If the commit body is useful, append `-m "..."` with the actual outcome — A/B/C — and what changed.)

---

## Task 8: New `onSuccess` test on LoginForm

**Files:**
- Modify: `apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to the `describe('<LoginForm>', ...)` block in `apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx`:

```ts
it('calls onSuccess after a successful sign-in', async () => {
  // If Task 7 picked Outcome B (mock the collaborator), spy similarly:
  const signInSpy = vi.spyOn(authApi, 'signInWithEmail').mockResolvedValue();
  // If Task 7 picked Outcome A or C (MSW), use server.use(...) instead.

  const onSuccess = vi.fn();
  const user = userEvent.setup();
  render(<LoginForm onSuccess={onSuccess} />);

  await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery-staple');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  await vi.waitFor(() => {
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  signInSpy.mockRestore();
});
```

(If Task 7 picked Outcome A or C, swap the `vi.spyOn` for the corresponding `server.use(...)` resolution pattern from that task — the rest of the body is identical.)

- [ ] **Step 2: Run the test**

```bash
pnpm --filter frontend exec vitest run src/features/auth-by-email/ui/LoginForm.test.tsx
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/auth-by-email/ui/LoginForm.test.tsx
git commit -m "test(frontend): cover LoginForm onSuccess callback"
```

---

## Task 9: CASL `defineAbilityFor` tests

**Files:**
- Create: `apps/frontend/src/shared/lib/casl/defineAbilityFor.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/frontend/src/shared/lib/casl/defineAbilityFor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { defineAbilityFor } from './defineAbilityFor.js';

describe('defineAbilityFor', () => {
  it('anonymous: can read only published posts', () => {
    const ability = defineAbilityFor(null);
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(false);
    expect(ability.can('update', 'Post')).toBe(false);
    expect(ability.can('delete', 'Post')).toBe(false);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('regular user: can create posts and update/delete their own', () => {
    const ability = defineAbilityFor({ id: 'u1', role: 'user' });
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('admin: can manage all', () => {
    const ability = defineAbilityFor({ id: 'u1', role: 'admin' });
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('delete', 'Post')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(true);
  });

  it('undefined user is treated as anonymous', () => {
    const ability = defineAbilityFor(undefined);
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('create', 'Post')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm --filter frontend exec vitest run src/shared/lib/casl/defineAbilityFor.test.ts
```

Expected: `Tests 4 passed (4)`. If a single assertion fails, the most likely culprit is the contracts package not being rebuilt — `pnpm --filter @repo/contracts build` then rerun.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/shared/lib/casl/defineAbilityFor.test.ts
git commit -m "test(frontend): cover defineAbilityFor anonymous/user/admin branches"
```

---

## Task 10: Full verify gate (no commit)

- [ ] **Step 1: Run install (lockfile may have minor changes)**

```bash
pnpm install
```

Expected: `Done in <Ns>` with no errors. Lockfile diff should be empty or minor.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: `Tasks: 4 successful, 4 total`.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: `Tasks: 4 successful, 4 total` (warnings allowed, no errors).

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: `Tasks: 3 successful, 3 total`.

- [ ] **Step 5: Test (now includes frontend)**

```bash
pnpm test
```

Expected: `Tasks: 3 successful, 3 total` (backend + frontend + contracts if it has tests). The frontend's `LoginForm.test.tsx` is now 3 passing tests; `defineAbilityFor.test.ts` is 4 passing.

If anything is red here, return to the task that owns it before moving on.

---

## Task 11: Manual end-to-end smoke

This task is not committable — it's a manual confirmation that the whole stack works against a real DB.

- [ ] **Step 1: Apply the new migration**

```bash
pnpm --filter backend run db:migrate
```

Expected output ending with `[migrate] done`.

- [ ] **Step 2: Seed the sysadmin user**

```bash
pnpm --filter backend run db:seed
```

Expected output: `[seed] sysadmin: sysadmin@example.com (role=admin, created=true, promoted=true)`. Re-run; expect `created=false, promoted=false` the second time.

- [ ] **Step 3: Boot dev**

```bash
pnpm dev
```

Expected: backend logs `Nest application successfully started`, frontend logs `VITE v8.0.12  ready in <Nms>`.

- [ ] **Step 4: Sign in**

In a browser: `http://localhost:5173/login`. Enter `sysadmin@example.com` / `sysadmin`. Submit.

Expected: navigation to `/posts` with no console errors. The session cookie is set; subsequent API calls succeed.

- [ ] **Step 5: Confirm admin abilities are active**

Open the React DevTools, find the `AbilityContext.Provider`, and inspect its value. Expected: an `Ability` whose `rules` array contains `{ action: 'manage', subject: 'all' }`. Alternatively, manually test an admin-gated action (e.g., delete a post you didn't create) and confirm the backend allows it.

- [ ] **Step 6: Cleanup**

`Ctrl+C` the dev server.

---

## Rollback strategy

Each task is its own commit. To roll back a single task:

```bash
git revert <task-sha>
```

If Task 1 (the migration) needs reverting, also delete `apps/backend/drizzle/0001_*.sql` and the corresponding entry from `apps/backend/drizzle/meta/_journal.json`, then `git revert` the schema commit.

---

## Notes & gotchas

- **better-auth's `signUpEmail` payload shape**: confirmed in v1.6.10 as `auth.api.signUpEmail({ body: { email, password, name } })`. If a future bump changes this, the seed CLI breaks; the unit tests do NOT catch it (they stub `signUpEmail`). The Task 11 smoke run is the canary.
- **`input: false` on the role additionalField** means the signup payload cannot set `role`. The seed script intentionally bypasses this by issuing a direct `UPDATE` after signup — the only path to admin is via the seed script (or another future admin tool that goes through the DB directly).
- **Migration filename collisions**: drizzle-kit assigns a random adjective_noun. If two engineers run `db:generate` on the same base, they get conflicting `0001_*.sql` names. Resolve by rebasing and regenerating against the latest snapshot.
- **`SYSADMIN_PASSWORD` length floor**: `z.string().min(8)`. The dev default `sysadmin` is exactly 8. If you want a shorter dev default for testing, you must change the schema too.
- **The verify gate**: `pnpm test` was excluded from the per-batch verify gate during the dep upgrade session because of pre-existing frontend test bugs. Task 10 confirms it's safe to re-include. There's no central config to update — `pnpm test` already runs all packages' test scripts via turbo.
