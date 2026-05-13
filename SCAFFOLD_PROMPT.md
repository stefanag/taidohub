# Prompt: Scaffold a Full-Stack TypeScript Monorepo (FSD Frontend + NestJS Backend)

Set up a new **Turborepo monorepo** using **pnpm**, containing:

- A **React + Vite + TypeScript** frontend that follows the **Feature-Sliced Design (FSD) v2.1** methodology. Frontend stack: **Tailwind CSS**, **shadcn/ui**, **TanStack Query**, **TanStack Router**, **Zod**, **Vitest + React Testing Library**, and **Storybook**.
- A **NestJS** backend running on **Node.js + Express** with **TypeScript**, exposing a **RESTful JSON API documented with Swagger/OpenAPI**. Backend stack: **Supabase Postgres (used purely as the database — no Supabase Auth)** with **Drizzle ORM**, **better-auth** for authentication (sole identity provider, stores its tables in the same Supabase Postgres via the Drizzle adapter), and **CASL (`@casl/ability`)** for authorization.

Follow every instruction below precisely.

## 1. Initialize the monorepo

- Use **pnpm** as the package manager. Create a `pnpm-workspace.yaml` declaring `apps/*` and `packages/*` as workspaces.
- Install **Turborepo** at the root and add a `turbo.json` with pipelines for `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `storybook`, `build-storybook`, `arch`, `db:generate`, `db:migrate`, and `openapi:generate`. Configure `dependsOn` so `build` waits on upstream `^build`, and backend/frontend tasks depend on `@repo/contracts#build`.
- Root `package.json` scripts proxy to Turbo (e.g. `"dev": "turbo run dev"`, `"test": "turbo run test"`).
- Shared packages under `packages/`:
  - `packages/tsconfig/` — base `tsconfig.json` extended by all workspaces (presets: `react-vite`, `nest`, `node-lib`).
  - `packages/eslint-config/` — shared ESLint flat config.
  - `packages/contracts/` — **the single source of truth for the HTTP boundary**. Exports Zod schemas for request/response DTOs, inferred TypeScript types, typed route path constants, and the shared CASL `Subjects`/`Actions` unions. Consumed by both `apps/frontend` and `apps/backend`.

## 2. Create the frontend app

- Scaffold `apps/frontend` using Vite with the `react-ts` template.
- Install: `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `zod`, `@tanstack/router-plugin`, `@tanstack/router-devtools`, `tailwindcss`, `postcss`, `autoprefixer`, `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `lucide-react`, `vitest`, `@vitest/ui`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`, `storybook`, `@storybook/react-vite`, `@storybook/addon-essentials`, `@storybook/addon-a11y`, `@storybook/addon-interactions`, `@storybook/test`, `@storybook/addon-themes`, `@feature-sliced/steiger`.
- Add `better-auth` client SDK (`better-auth/react`) and `@casl/ability` + `@casl/react`.
- Add `@repo/contracts` as a workspace dependency. All API calls in `entities/*/api/` and `features/*/api/` parse responses with schemas from `@repo/contracts`.
- Configure `VITE_API_URL` (e.g. `http://localhost:3001`) in `.env`. The frontend hits the backend on a **separate origin**; no Vite proxy.
- `shared/api/httpClient.ts` is a `fetch` wrapper that:
  - Uses `import.meta.env.VITE_API_URL` as the base URL.
  - Sets `credentials: 'include'` on every request so better-auth's HTTP-only session cookie is sent cross-origin.
  - Parses errors into a typed error envelope (matches the backend's uniform shape).
- Path aliases, Tailwind config, TanStack Router Vite plugin, Vitest config, Storybook config, and shadcn `components.json` aliases as previously specified. Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:watch`, `test:ui`, `test:coverage`, `storybook`, `build-storybook`, `arch`.

## 3. FSD folder structure under `apps/frontend/src/`

```
src/
├── app/        # providers (Query, Router, Auth, Ability), router, global styles, entrypoint
├── pages/      # route-level components
├── widgets/    # large self-contained UI blocks
├── features/   # reusable user-facing actions (e.g. features/auth-by-email)
├── entities/   # business entities — schemas re-exported from @repo/contracts
└── shared/     # framework/business-agnostic reusable code (shadcn primitives, httpClient, queryClient, casl helpers)
```

No `processes/` layer. `app/` and `shared/` have segments only; other layers have slices → segments. Same-layer slices cannot import each other. Every slice exposes an `index.ts` Public API (tests and stories exempt).

Auth/authorization wire-up:

- `app/providers/AuthProvider.tsx` — wraps the app in better-auth's React provider, hydrates the session via `VITE_API_URL`.
- `app/providers/AbilityProvider.tsx` — builds a CASL `Ability` from the session's claims/roles, exposes it via context.
- `features/auth-by-email/` — login/logout/signup using better-auth client methods.
- `shared/lib/casl/defineAbilityFor.ts` — shared with the backend via `@repo/contracts` subject/action unions.

## 4. Create the backend app

Scaffold `apps/backend` as a **NestJS** application using the **Express** platform adapter and TypeScript.

- Install: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/swagger`, `swagger-ui-express`, `reflect-metadata`, `rxjs`, `class-validator`, `class-transformer`, `zod`, `nestjs-zod`, `@anatine/zod-openapi`, `drizzle-orm`, `drizzle-zod`, `postgres`, `better-auth`, `@casl/ability`, `helmet`, `compression`, `cookie-parser`.
- Dev: `@nestjs/cli`, `@nestjs/testing`, `drizzle-kit`, `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/supertest`, `tsx`, `eslint`, `prettier`.
- Add `@repo/contracts` as a workspace dependency.
- **CORS** (`main.ts`): `app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true, methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] })`. `credentials: true` is required so the better-auth session cookie works cross-origin.
- **Session cookies** issued by better-auth must be `httpOnly: true`, `sameSite: 'none'`, `secure: true` in prod. In local dev allow `sameSite: 'lax'` with `secure: false` and document the trade-off in the README.
- Apply `helmet`, `compression`, `cookie-parser`, global `ZodValidationPipe` from `nestjs-zod`, global `AllExceptionsFilter`, and `app.setGlobalPrefix('api')`. Bind to `PORT` (default `3001`).
- Scripts: `"dev": "nest start --watch"`, `"build": "nest build"`, `"start": "node dist/main.js"`, `"start:prod": "node dist/main.js"`, `"lint"`, `"typecheck"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "vitest run --config vitest.e2e.config.ts"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "tsx src/infrastructure/database/migrate.ts"`, `"db:studio": "drizzle-kit studio"`, `"openapi:generate": "tsx src/openapi/generate.ts"`.

## 5. Backend folder structure under `apps/backend/src/`

```
src/
├── main.ts                          # bootstrap: helmet, compression, cookie-parser, CORS, global pipes/filters, Swagger, listen
├── app.module.ts
├── config/
│   ├── env.schema.ts                # Zod: DATABASE_URL, DIRECT_URL, PORT, WEB_ORIGIN, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NODE_ENV
│   └── config.module.ts             # @nestjs/config with validate: (env) => envSchema.parse(env)
├── openapi/
│   ├── swagger.ts                   # builds DocumentBuilder, registers contracts schemas, mounts Swagger UI
│   └── generate.ts                  # standalone script: writes openapi.json to packages/contracts/openapi/
├── infrastructure/
│   ├── database/
│   │   ├── schema/                  # Drizzle tables (users.ts, posts.ts, index.ts barrel) — INCLUDES better-auth tables
│   │   ├── client.ts                # drizzle() over postgres-js using DATABASE_URL
│   │   ├── database.module.ts       # Global module, provides DRIZZLE token
│   │   ├── migrate.ts               # standalone migration runner (uses DIRECT_URL)
│   │   └── drizzle.config.ts        # at apps/backend root
│   ├── auth/
│   │   ├── better-auth.ts           # better-auth server instance, Drizzle adapter -> Supabase Postgres
│   │   ├── auth.module.ts           # mounts better-auth's Express handler at /api/auth/*
│   │   ├── auth.guard.ts            # validates session via better-auth, attaches req.user
│   │   ├── current-user.decorator.ts
│   │   └── public.decorator.ts
│   └── ability/
│       ├── ability.factory.ts       # createForUser(user) using AbilityBuilder<AppAbility>
│       ├── ability.module.ts        # Global
│       ├── ability.guard.ts         # reads @CheckAbility metadata
│       ├── check-ability.decorator.ts
│       └── ability.types.ts         # AppAbility — re-exports Subjects/Actions from @repo/contracts
├── common/
│   ├── filters/all-exceptions.filter.ts
│   ├── interceptors/logging.interceptor.ts
│   └── dto/pagination.dto.ts
├── modules/
│   ├── users/   { users.module.ts, users.controller.ts, users.service.ts, users.repository.ts, dto/, users.abilities.ts }
│   ├── posts/   { posts.module.ts, posts.controller.ts, posts.service.ts, posts.repository.ts, dto/, posts.abilities.ts }
│   └── health/  health.controller.ts   # GET /api/health -> { status: 'ok' }
└── test/
    ├── e2e/
    └── helpers/
```

Rules:

- **REST conventions:** plural-noun resources, standard verbs, JSON-only, uniform error envelope `{ error: { code, message, details? } }`. All paths under `/api`.
- **Validation:** controllers consume Zod DTOs from `@repo/contracts`, validated by the global `ZodValidationPipe`.
- **Module isolation:** repositories are the only files that touch Drizzle. No cross-domain repo/service imports — go through the exporting module's public service.

## 6. Swagger / OpenAPI documentation

The API is fully documented with **Swagger UI**, driven by the same Zod schemas in `@repo/contracts` that validate at runtime — so docs cannot drift from behavior.

### 6.1 Zod → OpenAPI in `@repo/contracts`

- Every schema in `packages/contracts/src/` is augmented with OpenAPI metadata using `@anatine/zod-openapi` (or `nestjs-zod`'s `extendApi`). For each schema, attach `.openapi({ title, description, example })` and field-level descriptions/examples.
- Each resource module in contracts (e.g. `posts.ts`, `users.ts`, `auth.ts`) exports its schemas **plus** an `*OpenApiRegistry` object listing them by name. A root `packages/contracts/src/openapi.ts` re-exports a single `registerContractSchemas(document)` helper that the backend calls during Swagger setup so every schema appears under `components.schemas` with stable names.

### 6.2 Swagger setup in `apps/backend/src/openapi/swagger.ts`

Build the document with `DocumentBuilder`:

- `setTitle('<Project> API')`, `setDescription(...)`, `setVersion(process.env.npm_package_version ?? '0.0.0')`.
- `setContact(...)`, `setLicense(...)`, optional `setTermsOfService(...)`.
- `addServer(env.BACKEND_URL ?? 'http://localhost:3001', 'Local')` plus staging/prod servers when configured.
- `addCookieAuth('better-auth.session_token', { type: 'apiKey', in: 'cookie' }, 'session')` — the default scheme matching better-auth's cookie name.
- `addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'session-token' }, 'bearer')` — for non-browser clients.
- Tag groups corresponding to modules: `auth`, `users`, `posts`, `health`.

Then:

```ts
const document = SwaggerModule.createDocument(app, config, {
  operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  deepScanRoutes: true,
});
registerContractSchemas(document);   // injects components.schemas from @repo/contracts
SwaggerModule.setup('api/docs', app, document, {
  jsonDocumentUrl: 'api/docs/openapi.json',
  yamlDocumentUrl: 'api/docs/openapi.yaml',
  swaggerOptions: {
    persistAuthorization: true,
    withCredentials: true,           // send the session cookie from "Try it out"
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
});
```

Mount Swagger **only** when `NODE_ENV !== 'production'` or when `ENABLE_SWAGGER=true`. In production, gate `/api/docs` behind basic auth or the auth guard (configurable).

### 6.3 Controller-level decorators (required on every endpoint)

Each controller method must carry the full set of Swagger decorators so the spec is complete:

- Class level: `@ApiTags('posts')`, optional `@ApiExtraModels(...)` for inline schemas.
- Method level:
  - `@ApiOperation({ summary, description, operationId })`
  - `@ApiParam` / `@ApiQuery` / `@ApiBody` referencing contracts schemas via `nestjs-zod`'s `ZodDto`-wrapped DTOs (so `@Body() body: CreatePostDto` is auto-documented).
  - `@ApiOkResponse({ type: ListPostsResponseDto })` / `@ApiCreatedResponse` / `@ApiNoContentResponse` as appropriate.
  - Error responses: `@ApiBadRequestResponse({ type: ErrorEnvelopeDto })`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse`, `@ApiUnprocessableEntityResponse` — all referencing the shared `ErrorEnvelopeDto` from `@repo/contracts`.
  - Auth: `@ApiCookieAuth('session')` and/or `@ApiBearerAuth('bearer')`. Public routes use `@Public()` plus `@ApiSecurity({})` to clear inherited security.

Provide a project-local composite decorator (e.g. `@ApiEndpoint({ summary, ok, errors })`) in `apps/backend/src/common/swagger/` to reduce boilerplate while keeping the underlying decorators discoverable.

### 6.4 OpenAPI JSON/YAML artifact

- `apps/backend/src/openapi/generate.ts` boots a minimal Nest context (without listening), produces the same `document` as the runtime, and writes:
  - `packages/contracts/openapi/openapi.json`
  - `packages/contracts/openapi/openapi.yaml`
- Wire this into `pnpm --filter backend openapi:generate` and run it in CI to guarantee the spec stays in sync (see §11).

### 6.5 Frontend integration

- The frontend continues to type its requests through `@repo/contracts` Zod schemas (no runtime dependency on the generated OpenAPI).
- The generated `openapi.json` is consumed by docs/portals and can optionally power a typed SDK later (Orval, openapi-typescript, etc.) — leave a hook for it but do not scaffold the SDK now.

## 7. Database (Supabase Postgres only, no Supabase Auth) + Drizzle

- Supabase is **strictly a managed Postgres host**. Backend connects via the postgres-js driver using `DATABASE_URL` (pooler URL) and `DIRECT_URL` (direct URL for migrations).
- **No Supabase Auth / GoTrue.** All identity lives in better-auth's tables, created and migrated as Drizzle schemas inside `infrastructure/database/schema/`.
- The frontend **does not** use `@supabase/supabase-js` and holds no Supabase keys.
- `drizzle-zod` inside `@repo/contracts` derives Zod schemas from Drizzle tables; those same schemas carry OpenAPI metadata (§6.1).
- Enable RLS on Supabase tables as defense in depth; authoritative authorization remains CASL in the API.

## 8. Authentication (better-auth) and Authorization (CASL)

- `infrastructure/auth/better-auth.ts` configures better-auth with the Drizzle adapter → Supabase Postgres, email/password (and OAuth as needed), HTTP-only cookies, cross-origin cookie options (§4), and `trustedOrigins` from `WEB_ORIGIN`.
- `/api/auth/*` is handled by better-auth's Express handler, mounted from `AuthModule`. The frontend's `better-auth/react` client calls it with `credentials: 'include'`. These routes appear in Swagger via a thin `auth.controller.ts` that documents (but does not re-implement) the endpoints — `@ApiTags('auth')`, `@ApiOperation`, request/response examples derived from `@repo/contracts/auth.ts`.
- Global `AuthGuard`: every route requires a session unless decorated `@Public()` (apply to `/api/health` and `/api/auth/*`).
- CASL in `infrastructure/ability/`; rules contributed by each module's `<Module>.abilities.ts`. Use `ForbiddenError.from(ability).throwUnlessCan(...)` in services and `@CheckAbility()` + `AbilityGuard` at the controller layer. Document `403` responses on all gated endpoints (§6.3).

## 9. Testing

- Backend: **Vitest** for unit, **supertest** for e2e booting a real Nest app. Repository tests run against a disposable Postgres with migrations applied per suite. E2E specs log in via better-auth in `beforeAll`, reuse the cookie, and assert 200/201/403/404 paths.
- **OpenAPI contract test:** an e2e spec asserts that `GET /api/docs/openapi.json` returns a document where every documented operation also exists on the running app and every `components.schemas` entry is referenced — catches forgotten decorators.
- Frontend: **Vitest + RTL + MSW**, with handlers built from `@repo/contracts`. Storybook reuses the same MSW handlers via `msw-storybook-addon`.

## 10. Seed the structure with a minimal working example

Vertical slice for `posts`:

- `@repo/contracts/src/posts.ts` — `PostSchema`, `CreatePostSchema`, `UpdatePostSchema`, `ListPostsQuerySchema`, `ListPostsResponseSchema`, types, `PostsRoutes`, and `.openapi({...})` metadata on each schema.
- Backend `modules/posts/*` — Drizzle table, repository, service with `throwUnlessCan('update', post)`, controller with `@CheckAbility` on reads, `@CurrentUser()` on writes, and the **full Swagger decorator set** (`@ApiTags`, `@ApiOperation`, request/response/error decorators, `@ApiCookieAuth`). Unit + e2e specs, including the OpenAPI contract test.
- Frontend `entities/post/*` — schema re-export, TanStack Query options/hooks, MSW handlers; `pages/posts/` lists posts; `<Can I="create" a="Post">` gates the "New post" shadcn `Button`.
- Auth seed: `features/auth-by-email/` with shadcn `Input`/`Button`, a protected TanStack Router route that redirects to `/login` without a session.

After scaffold, `http://localhost:3001/api/docs` should render Swagger UI listing **Auth, Users, Posts, Health** with full request/response schemas, examples, error envelopes, and a working "Authorize" flow via the session cookie.

## 11. Dockerfiles (one per app)

### `apps/frontend/Dockerfile` — multi-stage, static build served by nginx

- **`base`**: `node:20-alpine`, corepack + pinned pnpm.
- **`deps`**: copy root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, plus `apps/frontend/package.json` and every `packages/*/package.json`. Run `pnpm install --frozen-lockfile`.
- **`build`**: copy repo, `pnpm --filter @repo/contracts build` then `pnpm --filter frontend build`. Build arg: `VITE_API_URL`.
- **`runner`**: `nginx:1.27-alpine`, copy `apps/frontend/dist` → `/usr/share/nginx/html`, custom `nginx.conf` with SPA fallback (`try_files $uri /index.html`). Expose `8080`. `USER nginx`.

### `apps/backend/Dockerfile` — multi-stage Node runtime

- **`base`**: `node:20-alpine`, corepack + pinned pnpm.
- **`deps`**: workspace-aware install as above.
- **`build`**: build `@repo/contracts` then `pnpm --filter backend build`. Also run `pnpm --filter backend openapi:generate` so `openapi.json` is baked in.
- **`prod-deps`**: `pnpm deploy --filter backend --prod /prod/backend` for a self-contained `node_modules`.
- **`runner`**: `node:20-alpine`. Copy `apps/backend/dist` and pruned deps. `USER node`. `EXPOSE 3001`. `CMD ["node", "dist/main.js"]`. `HEALTHCHECK` hitting `/api/health`.

### Root `docker-compose.yml` (dev convenience)

- Services: `backend` (build from `apps/backend/Dockerfile`, env from `.env`, port `3001:3001`), `frontend` (build with `VITE_API_URL=http://localhost:3001`, port `8080:8080`).
- `.dockerignore` at root excluding `node_modules`, `**/dist`, `.turbo`, `.git`, `**/.env*`.

## 12. GitHub Actions workflows

### `.github/workflows/ci.yml` — runs on PRs and pushes to `main`

- Triggers: `pull_request`, `push: branches: [main]`.
- Ubuntu, Node 20.
- Steps:
  1. `actions/checkout@v4`.
  2. `pnpm/action-setup@v4` (pinned pnpm).
  3. `actions/setup-node@v4` with `cache: 'pnpm'`.
  4. `pnpm install --frozen-lockfile`.
  5. Turbo cache via `actions/cache@v4`.
  6. `pnpm turbo run lint typecheck arch build test`.
  7. Backend e2e job (`services: postgres: image: postgres:16`) running migrations then `pnpm --filter backend test:e2e`.
  8. **OpenAPI sync check:** run `pnpm --filter backend openapi:generate`, then `git diff --exit-code packages/contracts/openapi/` — fails the build if the committed spec is stale.
  9. Upload `packages/contracts/openapi/openapi.json` and the Storybook static build as artifacts.

### `.github/workflows/docker.yml` — builds and pushes images on `main` and tags

- Triggers: `push: branches: [main], tags: ['v*']`.
- Two jobs (`frontend-image`, `backend-image`), each: checkout → Buildx → GHCR login → `docker/metadata-action@v5` → `docker/build-push-action@v6` with GHA cache. Frontend passes `build-args: VITE_API_URL=${{ vars.VITE_API_URL }}`.
- Required repo variables/secrets documented in the README.

## 13. Deliverables

- Full monorepo tree: root configs (`pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `.npmrc`, `.env.example`, `.dockerignore`, `docker-compose.yml`), `.github/workflows/{ci.yml,docker.yml}`, shared `packages/tsconfig`, `packages/eslint-config`, `packages/contracts` (including `openapi/` output dir), plus `apps/frontend` and `apps/backend` as specified.
- All config files wired end-to-end: frontend (`vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `.storybook/main.ts`, `.storybook/preview.tsx`, `Dockerfile`, `nginx.conf`), backend (`nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `drizzle.config.ts`, `vitest.config.ts`, `vitest.e2e.config.ts`, `Dockerfile`, `src/openapi/swagger.ts`, `src/openapi/generate.ts`).
- A root `README.md` covering: monorepo layout, Turbo pipelines, the `@repo/contracts` boundary (Zod schemas as the source of truth for validation **and** OpenAPI), FSD layer hierarchy and import-direction rule, frontend library placement (shadcn → `shared/ui/`, `cn` → `shared/lib/utils.ts`, all routing → `app/router/`), backend module rules, the **Supabase-as-database-only** decision, **separate-port CORS setup** with cookie matrix, **Swagger usage** (how to view at `/api/docs`, how "Authorize" works with the session cookie, how to regenerate `openapi.json`, how the CI sync check works, how to gate `/api/docs` in production), how to run every script, how to run via Docker, and what each GitHub Actions workflow does.
- Confirm: `pnpm dev` runs both apps concurrently on separate ports; the frontend renders with Tailwind + shadcn; TanStack Router devtools appear in dev; the post list fetches from `http://localhost:3001/api/posts` with cookies sent cross-origin; CORS preflight succeeds; CASL hides the "New post" button for unauthorized users and the backend returns 403; **Swagger UI at `http://localhost:3001/api/docs` documents every endpoint with request/response schemas, examples, and error envelopes, and `Try it out` works after `Authorize`**; `pnpm --filter backend openapi:generate` produces a committed, up-to-date `openapi.json`; `pnpm test` and `pnpm test:e2e` pass green; `pnpm storybook` opens; `docker compose up --build` brings the stack up cleanly; both GitHub Actions workflows pass.

**References:**
- FSD methodology: https://feature-sliced.design/docs/get-started/overview
- NestJS: https://docs.nestjs.com
- NestJS OpenAPI: https://docs.nestjs.com/openapi/introduction
- nestjs-zod: https://github.com/BenLorantfy/nestjs-zod
- Drizzle ORM: https://orm.drizzle.team
- Supabase Postgres: https://supabase.com/docs/guides/database
- better-auth: https://www.better-auth.com
- CASL: https://casl.js.org
- Turborepo: https://turborepo.com/docs
- pnpm workspaces: https://pnpm.io/workspaces
