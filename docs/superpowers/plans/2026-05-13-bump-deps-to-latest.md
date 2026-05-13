# Bump All Dependencies to Latest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every outdated dependency in the monorepo to its latest version (as of 2026-05-13), accepting that breakage will happen and must be fixed in-place. End state: `pnpm install && pnpm typecheck && pnpm lint && pnpm build && pnpm test` is green.

**Architecture:** Batch upgrades by tool-chain layer and coupling. Run the verify gate after every batch so blast radius is small and bisecting is cheap. Use official migrators (Storybook, Tailwind, Zod) wherever they exist. Commit each batch separately so any batch can be reverted on its own.

**Tech Stack:** pnpm 11 workspaces, Turborepo, TypeScript, NestJS, Drizzle ORM, Vite, Vitest, Storybook, Tailwind, Zod, ESLint flat config.

---

## Pre-flight

Before starting any batch, capture the baseline so you can tell breakage from pre-existing issues.

- [ ] **Step 0.1: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If not, stash or commit first.

- [ ] **Step 0.2: Record current versions**

```bash
pnpm outdated -r --format list > /tmp/outdated-before.txt
```

Expected: file written; this is the diff target.

- [ ] **Step 0.3: Establish a green baseline**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Expected: every command exits 0. If anything is already red on `main`, **STOP** and fix that first — you cannot bisect upgrade breakage against a red baseline.

- [ ] **Step 0.4: Create a working branch**

```bash
git checkout -b chore/bump-deps-2026-05
```

---

## The Verify Gate (used after every batch)

Every batch ends with this block. Treat it as one step.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Pass criteria: all five exit 0. If any fail, **fix in the same batch** (don't push breakage to a later batch — that defeats bisecting). Only commit once green.

For frontend-touching batches (Vite, Tailwind, Storybook, lucide, casl/react), also do a smoke check:

```bash
pnpm --filter frontend dev
```

Open `http://localhost:5173`, confirm the page renders without console errors, then Ctrl+C.

---

## Batch 1: TypeScript 6 + Node/Express/Supertest types

**Rationale:** Compilers and ambient types underpin everything downstream. Bumping these first means later batches see the new type errors *as part of their own upgrade*, not as mysterious leftovers.

**Files to modify:**
- `package.json` (root): `typescript`
- `apps/backend/package.json`: `@types/node`, `@types/express`, `@types/supertest`
- `apps/frontend/package.json`: `@types/node`, `typescript`
- `packages/contracts/package.json`: `typescript`

- [ ] **Step 1.1: Bump TypeScript across the three places that pin it**

Edit `package.json`:
```json
"typescript": "^6.0.3"
```

Edit `apps/frontend/package.json`:
```json
"typescript": "^6.0.3"
```

Edit `packages/contracts/package.json`:
```json
"typescript": "^6.0.3"
```

- [ ] **Step 1.2: Bump backend @types/* and shared @types/node**

Edit `apps/backend/package.json`:
```json
"@types/express": "^5.0.6",
"@types/node": "^25.7.0",
"@types/supertest": "^7.2.0"
```

Edit `apps/frontend/package.json`:
```json
"@types/node": "^25.7.0"
```

- [ ] **Step 1.3: Install**

```bash
pnpm install
```

Expected: lockfile updates, no `ERR_PNPM_*` errors. If pnpm complains about new ignored build scripts, add the package name to `allowBuilds:` in `pnpm-workspace.yaml` (set `true` for native binaries, `false` for telemetry).

- [ ] **Step 1.4: Fix new TS6 errors**

Run typecheck:
```bash
pnpm typecheck
```

Common TS6 breakage to expect:
- Stricter `exactOptionalPropertyTypes` enforcement (already on in `base.json`)
- Tightened `unknown` propagation in catch clauses
- `@types/express` 5 changes the `Request`/`Response` generic shape — handlers may need updated generics or explicit `Request<{}, Body, Params>` syntax

Read every error message — TS6 errors usually quote the exact fix. Edit the offending file. Re-run `pnpm typecheck` until clean.

- [ ] **Step 1.5: Run the Verify Gate**

(see "The Verify Gate" section above)

- [ ] **Step 1.6: Commit**

```bash
git add -A
git commit -m "chore(deps): bump TypeScript to 6 and Node/Express/Supertest types"
```

---

## Batch 2: ESLint 10 ecosystem

**Rationale:** Lint config sits on top of TS but doesn't influence runtime — safe to do second.

**Files to modify:**
- `packages/eslint-config/package.json`: `@eslint/js`, `eslint-plugin-react-hooks`, `globals`
- `apps/backend/package.json`, `apps/frontend/package.json`, `packages/contracts/package.json`: `eslint`

- [ ] **Step 2.1: Bump the shared eslint-config**

Edit `packages/eslint-config/package.json`:
```json
"@eslint/js": "^10.0.1",
"eslint-plugin-react-hooks": "^7.1.1",
"globals": "^17.6.0"
```

Also update the peer:
```json
"peerDependencies": {
  "eslint": "^10.0.0"
}
```

- [ ] **Step 2.2: Bump eslint in each package that pins it**

Edit `apps/backend/package.json`, `apps/frontend/package.json`, `packages/contracts/package.json`:
```json
"eslint": "^10.3.0"
```

- [ ] **Step 2.3: Install**

```bash
pnpm install
```

- [ ] **Step 2.4: Check typescript-eslint peer compatibility**

`typescript-eslint` is currently `^8.13.0` in `packages/eslint-config/package.json`. ESLint 10 may require a newer typescript-eslint. Check the actual peerDependency error:

```bash
pnpm install 2>&1 | grep -i "peer"
```

If you see `typescript-eslint` peer warnings about ESLint 10, bump it:

```bash
pnpm --filter @repo/eslint-config add -D typescript-eslint@latest
```

Same check for `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`. Bump any that warn.

- [ ] **Step 2.5: Update flat-config rule names if needed**

Run lint:
```bash
pnpm lint
```

`eslint-plugin-react-hooks` 7 may rename rules. If lint reports unknown rule names, open `packages/eslint-config/react.js` and consult the rule list at `node_modules/eslint-plugin-react-hooks/cjs/index.js` — pick the new name for each removed/renamed rule.

`globals` 17 may have removed some legacy global sets. If a `globals.xxx` lookup is now `undefined`, switch to whichever current set covers the same environment.

- [ ] **Step 2.6: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump ESLint to 10 and related plugins"
```

---

## Batch 3: Vitest 4 + jsdom 29

**Rationale:** Test infra should be current before any app-level upgrades, so test failures during later batches are real failures and not test-runner regressions.

**Files to modify:**
- `apps/backend/package.json`: `vitest`, `@vitest/coverage-v8`
- `apps/frontend/package.json`: `vitest`, `@vitest/coverage-v8`, `@vitest/ui`, `jsdom`

- [ ] **Step 3.1: Bump versions**

Edit `apps/backend/package.json`:
```json
"vitest": "^4.1.6",
"@vitest/coverage-v8": "^4.1.6"
```

Edit `apps/frontend/package.json`:
```json
"vitest": "^4.1.6",
"@vitest/coverage-v8": "^4.1.6",
"@vitest/ui": "^4.1.6",
"jsdom": "^29.1.1"
```

- [ ] **Step 3.2: Install**

```bash
pnpm install
```

- [ ] **Step 3.3: Update vitest configs**

Check `apps/backend/vitest.config.ts`, `apps/backend/vitest.e2e.config.ts`, `apps/frontend/vite.config.ts` (or `vitest.config.ts`). Vitest 4 deprecated and removed some options:
- `deps.inline` → `server.deps.inline`
- `environmentMatchGlobs` → `projects[].test.environment`
- `coverage.all` default flipped

Open each config file. If Vitest emits a `[DEPRECATED]` warning when running tests, follow the migration hint in the warning text.

- [ ] **Step 3.4: Run tests**

```bash
pnpm test
```

Expected: tests pass. If a test fails with `expect.soft is not a function` or similar API mismatch, look at the Vitest 4 changelog notes (search the message in `node_modules/vitest/dist/index.js` to confirm the new API name).

`msw-storybook-addon` is pinned at `^2.0.4` and may emit a peer warning against the new vitest — note it but don't fix here; Batch 9 (Storybook) will resolve it.

- [ ] **Step 3.5: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump Vitest to 4 and jsdom to 29"
```

---

## Batch 4: Vite 8 + @vitejs/plugin-react 6

**Rationale:** Two majors of Vite, but isolated to `apps/frontend`. Storybook also uses Vite — but the Storybook 10 migrator will reconcile its plugin pin, so doing Vite first is safe.

**Files to modify:**
- `apps/frontend/package.json`: `vite`, `@vitejs/plugin-react`

- [ ] **Step 4.1: Bump versions**

Edit `apps/frontend/package.json`:
```json
"vite": "^8.0.12",
"@vitejs/plugin-react": "^6.0.1"
```

- [ ] **Step 4.2: Install**

```bash
pnpm install
```

- [ ] **Step 4.3: Reconcile vite.config.ts**

Open `apps/frontend/vite.config.ts`. Common Vite 7/8 changes:
- `optimizeDeps.entries` glob behavior tightened
- `build.assetsInlineLimit` may need to be an explicit number
- `server.fs.strict` defaults to `true`

If `pnpm --filter frontend build` fails after the bump, the error will usually name the offending config key.

- [ ] **Step 4.4: Run frontend dev smoke test**

```bash
pnpm --filter frontend dev
```

Open `http://localhost:5173`. Page renders, no console errors, no terminal warnings about removed APIs. Ctrl+C.

- [ ] **Step 4.5: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump Vite to 8 and @vitejs/plugin-react to 6"
```

---

## Batch 5: Tailwind v4 (official migrator)

**Rationale:** Tailwind 4 is a near-complete rewrite (CSS-first config, new Vite plugin, no PostCSS plugin by default). Use the official codemod — manual migration is a trap.

**Files affected:** `apps/frontend/tailwind.config.{js,ts}`, `apps/frontend/postcss.config.js`, `apps/frontend/src/index.css` (or wherever Tailwind is imported), `apps/frontend/vite.config.ts`.

- [ ] **Step 5.1: Run the official Tailwind upgrade tool**

```bash
cd apps/frontend
npx @tailwindcss/upgrade@latest
cd ../..
```

The tool rewrites your config to CSS-first (`@theme` blocks in CSS), updates `@tailwind` directives to the new `@import "tailwindcss";` form, and prints a list of any changes it could not perform automatically.

**Read the tool's stdout in full.** Anything it flagged as "manual change required" is now a TODO.

- [ ] **Step 5.2: Install the v4 Vite plugin**

```bash
pnpm --filter frontend add -D @tailwindcss/vite@^4.3.0
```

The migrator usually wires this up, but verify `apps/frontend/vite.config.ts` now imports `@tailwindcss/vite` and includes it in `plugins: [...]`. If it doesn't, add it:

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    // ...existing plugins
    tailwindcss(),
  ],
})
```

- [ ] **Step 5.3: Remove obsolete PostCSS Tailwind config**

If `apps/frontend/postcss.config.js` only existed to load `tailwindcss` and `autoprefixer`, Tailwind 4 no longer needs the `tailwindcss` PostCSS plugin. The migrator may delete the file or leave only `autoprefixer`. Confirm the file's final state matches one of these two outcomes.

- [ ] **Step 5.4: Check tailwindcss-animate compatibility**

`tailwindcss-animate` v1 was a v3 plugin. For v4, either keep it (if it still works as a plugin import in CSS) or replace with `tw-animate-css` (the v4-compatible fork). If `pnpm --filter frontend build` errors on the animate plugin, swap it:

```bash
pnpm --filter frontend remove tailwindcss-animate
pnpm --filter frontend add tw-animate-css
```

Then update the CSS `@import` or `@plugin` directive accordingly.

- [ ] **Step 5.5: Bump tailwind-merge to 3**

In the same batch since it's Tailwind-coupled:

Edit `apps/frontend/package.json`:
```json
"tailwind-merge": "^3.6.0"
```

`tailwind-merge` 3 supports Tailwind v4 class naming. If you have a custom `extendTailwindMerge` config anywhere, the API is compatible but the default class groups changed — check `apps/frontend/src/lib/cn.ts` or wherever `twMerge` is used.

- [ ] **Step 5.6: Frontend dev smoke**

```bash
pnpm install
pnpm --filter frontend dev
```

Open the app. Confirm styles render — if everything is unstyled, the `@import "tailwindcss"` line in your entry CSS is probably missing or the Vite plugin isn't wired.

- [ ] **Step 5.7: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): migrate to Tailwind v4 and tailwind-merge 3"
```

---

## Batch 6: Zod v4 (+ drizzle-zod and nestjs-zod)

**Rationale:** Zod is consumed by `@repo/contracts`, `apps/backend`, and `apps/frontend`. Bump it together with its peers (`drizzle-zod`, `nestjs-zod`) so the type universe stays consistent.

**Files affected:** all three `package.json` files, plus any file that imports from `zod`.

- [ ] **Step 6.1: Bump zod everywhere it's pinned**

Edit `packages/contracts/package.json`:
```json
"zod": "^4.4.3"
```

Edit `apps/backend/package.json`:
```json
"zod": "^4.4.3",
"drizzle-zod": "^0.8.3",
"nestjs-zod": "^5.3.0"
```

Edit `apps/frontend/package.json`:
```json
"zod": "^4.4.3"
```

- [ ] **Step 6.2: Install**

```bash
pnpm install
```

- [ ] **Step 6.3: Apply Zod v4 codemod**

Zod publishes an official codemod that handles the common API shifts:

```bash
npx zod-v4-codemod packages/contracts/src apps/backend/src apps/frontend/src
```

If the codemod package isn't available under that exact name, run the upgrade manually following the Zod v4 migration guide. The high-frequency changes you'll see:
- `z.string().email()` → `z.email()` (now a top-level method)
- `z.string().url()` → `z.url()`
- `z.string().uuid()` → `z.uuid()`
- `.refine((val, ctx) => ...)` — `ctx.addIssue` shape changed; check `code`, `path`, `message`
- `.errors` → `.issues` on `ZodError`
- `z.record(value)` now requires two args: `z.record(z.string(), value)`

- [ ] **Step 6.4: Fix contracts package**

```bash
pnpm --filter @repo/contracts build
```

If errors, open the file the error points to and apply the v4 idiom. Re-run until clean.

- [ ] **Step 6.5: Check @anatine/zod-openapi compatibility**

`@anatine/zod-openapi` 2.x targets Zod 3. Zod 4 may break it. Run:
```bash
pnpm --filter @repo/contracts build
pnpm --filter backend run openapi:generate
```

If either fails on `@anatine/zod-openapi`, check npm for a newer release supporting Zod 4. If none exists yet, you have two options:
1. **Stay on Zod 3** in contracts and revert the contracts/backend/frontend bumps in this batch.
2. **Switch to a Zod-4-compatible OpenAPI bridge** (e.g., `zod-openapi`).

Make the choice explicitly and proceed. Note the decision in the commit message.

- [ ] **Step 6.6: Fix backend and frontend**

```bash
pnpm typecheck
```

Hit each error file-by-file. Common spots:
- DTOs using `nestjs-zod`'s `createZodDto` — the v5 API may rename helpers
- Drizzle schemas using `createInsertSchema`/`createSelectSchema` from `drizzle-zod` — v0.8 may have moved them

- [ ] **Step 6.7: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump Zod to 4 and consumers (drizzle-zod, nestjs-zod)"
```

---

## Batch 7: NestJS 11 family + class-validator 0.15

**Rationale:** All Nest packages must move together — mixing v10 and v11 will not link. Pair with `class-validator` since `nestjs-zod` 5 may have realigned validation paths.

**Files affected:** `apps/backend/package.json` only.

- [ ] **Step 7.1: Bump all Nest packages in one go**

Edit `apps/backend/package.json`:
```json
"@nestjs/common": "^11.1.19",
"@nestjs/core": "^11.1.19",
"@nestjs/platform-express": "^11.1.19",
"@nestjs/config": "^4.0.4",
"@nestjs/swagger": "^11.4.2",
"@nestjs/cli": "^11.0.21",
"@nestjs/testing": "^11.1.19",
"class-validator": "^0.15.1"
```

- [ ] **Step 7.2: Install**

```bash
pnpm install
```

If `@nestjs/swagger` needs a new build script (it commonly has a CLI plugin), pnpm may flag it under `allowBuilds`. Add to `pnpm-workspace.yaml` if asked.

- [ ] **Step 7.3: Bump Express runtime if @types/express requires it**

`@types/express@5` (already bumped in Batch 1) is for Express 5. Check whether `express` itself appears in your `node_modules` at v4 or v5:

```bash
pnpm list express -r
```

If v4, bump backend dependencies that pull it. Express 5 has subtle changes: the router `app.del()` is removed (use `app.delete()`), error-handling middleware signature unchanged, but `req.params` is now read-only. Nest's `platform-express` 11 ships with Express 5 by default — so this should be automatic.

- [ ] **Step 7.4: Migrate Nest decorator signatures if needed**

```bash
pnpm --filter backend run build
```

Nest 11 changes most commonly seen:
- `Reflector.get(Decorator, ...)` deprecated in favor of `Reflector.getAllAndOverride`
- Custom `ExceptionFilter` decorators may need `@Catch()` re-imported from `@nestjs/common`
- Microservices/Fastify adapter changes (irrelevant if you're on `platform-express`)

Fix each compile error in the file the message names. Re-run until clean.

- [ ] **Step 7.5: Re-verify swagger generation**

```bash
pnpm --filter backend run openapi:generate
```

Swagger 8 → 11 jumps three majors. The `DocumentBuilder` API is largely stable, but check that the generated `apps/backend/openapi/openapi.json` (or wherever `generate.ts` writes it) still produces valid OpenAPI. Open it and confirm the top-level shape (`openapi`, `info`, `paths`, `components`) is present.

- [ ] **Step 7.6: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump NestJS family to 11 and class-validator to 0.15"
```

---

## Batch 8: Drizzle ORM 0.45 + drizzle-kit 0.31

**Rationale:** Pre-1.0 minor bumps in Drizzle are routinely breaking. Nine minors of `drizzle-orm` is meaningful API drift — isolate this batch so any schema/query regression is clearly attributable.

**Files affected:** `apps/backend/package.json`, possibly `apps/backend/src/infrastructure/database/**`, `apps/backend/drizzle.config.{ts,js}`.

- [ ] **Step 8.1: Bump versions**

Edit `apps/backend/package.json`:
```json
"drizzle-orm": "^0.45.2",
"drizzle-kit": "^0.31.10"
```

- [ ] **Step 8.2: Install**

```bash
pnpm install
```

- [ ] **Step 8.3: Reconcile drizzle.config.ts**

Open `apps/backend/drizzle.config.ts`. Drizzle Kit 0.31 changed the config schema:
- `driver: 'pg'` → `dialect: 'postgresql'`
- `dbCredentials.connectionString` → `dbCredentials.url`
- `out` and `schema` paths unchanged

Apply these renames if present.

- [ ] **Step 8.4: Re-check schema files**

```bash
pnpm --filter backend run build
```

Common Drizzle 0.36 → 0.45 changes:
- `pgTable('name', { ... })` unchanged
- Column helpers — `serial()` deprecated for new tables in favor of `integer().generatedAlwaysAsIdentity()` (but `serial` still works)
- Relation queries — `db.query.table.findMany({ with: ... })` syntax unchanged
- Operators imported from `drizzle-orm` — some renamed (`gt`, `lt`, `gte`, `lte` still there)

Fix per the error message.

- [ ] **Step 8.5: Regenerate migrations against the new kit version**

```bash
pnpm --filter backend run db:generate
```

If new migration files appear that aren't substantive changes (just metadata reformatting), commit them anyway — keeping the drizzle-meta in sync with the kit version prevents future spurious diffs.

- [ ] **Step 8.6: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump drizzle-orm to 0.45 and drizzle-kit to 0.31"
```

---

## Batch 9: Storybook 10 (official migrator)

**Rationale:** Storybook publishes a first-party upgrade CLI that handles preset migrations, addon renames, and config rewrites. Manual upgrade of two majors is not worth attempting.

**Files affected:** `apps/frontend/.storybook/**`, `apps/frontend/package.json`, possibly individual `*.stories.tsx` files.

- [ ] **Step 9.1: Run the official upgrade**

```bash
cd apps/frontend
npx storybook@latest upgrade
cd ../..
```

The CLI will:
1. Bump every `@storybook/*` and `storybook` entry to 10.3.6
2. Run automigrate codemods (preset moves, MDX → CSF3 if applicable, addon renames)
3. Print a list of manual TODOs at the end

Read the final TODO list. Each item points to a specific file and tells you what to change.

- [ ] **Step 9.2: Verify the addon list is current**

In Storybook 10, several addons were absorbed into core or renamed:
- `@storybook/addon-essentials` is split — confirm `.storybook/main.ts` references either the new packages it became, or the autoremoved entries are gone
- `@storybook/addon-interactions` may have merged into core's `play` support
- `@storybook/test` may be replaced

The migrator handles this, but if `pnpm --filter frontend run storybook` fails with `Cannot find addon X`, edit `apps/frontend/.storybook/main.ts` and remove or rename the addon per the error.

- [ ] **Step 9.3: msw-storybook-addon peer check**

`msw-storybook-addon` 2.0.4 may not yet have a Storybook-10-compatible release. Check:

```bash
pnpm --filter frontend run storybook 2>&1 | head -50
```

If it crashes on import of `msw-storybook-addon`, upgrade it:

```bash
pnpm --filter frontend add -D msw-storybook-addon@latest
```

If no compatible version exists, remove the addon temporarily — note in commit message.

- [ ] **Step 9.4: Smoke test storybook**

```bash
pnpm --filter frontend run storybook
```

Open `http://localhost:6006`. Confirm at least one story renders. Ctrl+C.

- [ ] **Step 9.5: Verify Gate (including build-storybook) + Commit**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm --filter frontend run build-storybook
```

```bash
git add -A
git commit -m "chore(deps): migrate Storybook to 10 via official upgrade tool"
```

---

## Batch 10: Remaining frontend libs (CASL, lucide-react)

**Rationale:** Final cleanup. Two majors of `@casl/react` and a 0.x → 1.x for `lucide-react`. Both isolated to `apps/frontend`.

**Files affected:** `apps/frontend/package.json`, any file importing `@casl/react` or `lucide-react`.

- [ ] **Step 10.1: Bump versions**

Edit `apps/frontend/package.json`:
```json
"@casl/react": "^6.0.0",
"lucide-react": "^1.14.0"
```

- [ ] **Step 10.2: Install**

```bash
pnpm install
```

- [ ] **Step 10.3: Fix @casl/react breakage**

CASL React v6 changes:
- `<Can>` component renders children as a function or single ReactNode — confirm existing usages match v6 prop shape
- `useAbility` hook is the recommended access pattern; the legacy `bound-can` import is removed

```bash
grep -rn "from '@casl/react'" apps/frontend/src
```

Open each file and confirm the imported names still exist in v6. Adjust if not.

- [ ] **Step 10.4: Fix lucide-react breakage**

Lucide 1.0 cleaned up icon names. Some were renamed/removed. Run:

```bash
pnpm --filter frontend run typecheck
```

If TS errors on `import { X } from 'lucide-react'`, look up the new name in https://lucide.dev/icons/ and replace. Common renames are listed in the lucide-react 1.0 release notes; fix per error.

- [ ] **Step 10.5: Verify Gate + Commit**

```bash
git add -A
git commit -m "chore(deps): bump @casl/react to 6 and lucide-react to 1"
```

---

## Final Verification

After all 10 batches commit cleanly:

- [ ] **Step F.1: Full verify gate from a clean install**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf apps/*/dist packages/*/dist
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Expected: all green. A clean-install run catches phantom cache hits that a same-session install can mask.

- [ ] **Step F.2: Confirm nothing remains on the outdated list**

```bash
pnpm outdated -r --format list > /tmp/outdated-after.txt
diff /tmp/outdated-before.txt /tmp/outdated-after.txt
```

Expected: `outdated-after.txt` is empty (or contains only transitive packages that the workspace doesn't pin directly).

- [ ] **Step F.3: Manual app smoke**

Backend:
```bash
pnpm --filter backend dev
```
Hit a route (e.g. `curl http://localhost:3000/health` if one exists). Confirm no startup errors. Ctrl+C.

Frontend:
```bash
pnpm --filter frontend dev
```
Open in browser, click around the rendered scaffold, watch the console for warnings. Ctrl+C.

Storybook:
```bash
pnpm --filter frontend run storybook
```
Open, browse a story. Ctrl+C.

- [ ] **Step F.4: Open the PR**

```bash
git push -u origin chore/bump-deps-2026-05
gh pr create --title "chore(deps): bump all deps to latest (2026-05)" --body "Batched upgrade across 10 commits — see commit messages for what each batch covered. Pre/post versions in commit history."
```

---

## Rollback strategy

If a batch fails verify and can't be fixed in a reasonable time:

```bash
git reset --hard HEAD~1   # drop the last batch's commit
git clean -fd
pnpm install              # restore the prior lockfile state
```

Move on to the next batch — outdated packages are independent enough that skipping one doesn't block the others. Note the skipped batch in the PR description so it's visible.

If a batch breaks and you've already committed a *later* batch on top, revert just the offending batch:

```bash
git revert <batch-sha>
```

---

## Notes & gotchas

- **`pnpm-workspace.yaml allowBuilds`** — when new packages with native binaries arrive (Tailwind v4 ships its own oxide binary; new Vitest may pull a new swc/native dep), pnpm will block install with `ERR_PNPM_IGNORED_BUILDS`. Add the package name with `true`/`false` per its trust profile. The current entries are: `@nestjs/core: true`, `@scarf/scarf: false`, `@swc/core: true`, `esbuild: true`, `msw: true`.

- **`tsconfig` incremental flag** — `packages/tsconfig/node-lib.json` has `incremental: false` because tsup's DTS worker is incompatible with it. Don't add it back. `base.json` keeps `incremental: true` for apps that use `tsc -b` (the frontend).

- **MSW + Vitest 4** — MSW's request-handler API hasn't changed, but Vitest 4 changed how it shims `fetch` in jsdom. If frontend tests that depend on MSW start failing, check `apps/frontend/src/test/setup.ts` for any vitest-version-specific config.

- **Lockfile** — every batch should change `pnpm-lock.yaml`. If a batch produces no lockfile diff, pnpm short-circuited and didn't actually resolve anything — re-run with `pnpm install --no-frozen-lockfile`.

- **Time budget** — expect 30 minutes to 2 hours per batch depending on how much fallout each upgrade has. Batches 5 (Tailwind), 6 (Zod), 7 (Nest), and 9 (Storybook) are the most likely to consume the upper end of that range.
