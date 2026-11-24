# MCP module: implementation plan

Spec: [`docs/superpowers/specs/2026-11-24-mcp-module-design.md`](../specs/2026-11-24-mcp-module-design.md)

## Global Constraints

- Hard rules in `CLAUDE.md` apply: repositories are the only Drizzle users, CASL rules are contributed,
  DTOs live in `@repo/contracts`, OpenAPI is regenerated, migrations come from `db:generate`, UI strings
  ship in en, sv and fi.
- MCP SDK is v2 (`@modelcontextprotocol/server` 2.4.0, spec revision 2026-07-28), stateless,
  `createMcpHandler` with `responseMode: 'json'`. Not the v1 `@modelcontextprotocol/sdk` package.
- `/api/mcp` is an Express mount next to `/api/auth`, not a Nest controller: the token is a bearer JWT
  verified by `requireMcpAuth`, not the session cookie the global `AuthGuard` reads.
- Tools call the owning module's exported service, never its repository, and get exactly the checks the
  HTTP endpoints get. The MCP layer adds `use Mcp` and the declared per-tool ability on top.
- Approval of a pending operation happens only through the cookie-authenticated HTTP API (web app).

## File map

| Area | Files |
| --- | --- |
| Contracts | `packages/contracts/src/mcp.ts`, `pending-operations.ts`, `casl.ts` (action `use`, subjects `Mcp`, `PendingOperation`), tests |
| DB | `schema/pending-operations.ts`, `schema/audit-log.ts` (`origin`), migration via `db:generate` |
| Audit | `audit-log.service.ts` (`RecordInput.origin`) |
| Students | `students.abilities.ts` (orgadmin read), `students.service.ts` (roster and progress read for orgadmin) |
| Rank history | `rank-history.service.ts` (`create` accepts an outer executor) |
| Pending operations | `modules/pending-operations/*` (repository, service, controller, abilities, module, specs) |
| MCP | `modules/mcp/*` (abilities, actor repository, registry, tools, resource, instructions, http handler, module, specs) |
| Bootstrap | `main.ts`, `test/helpers/app-factory.ts` (mount `/api/mcp`) |
| Frontend | `entities/pending-operation`, `pages/pending-operations`, route, nav link, i18n |
| Tests | `test/e2e/mcp.e2e.spec.ts`, `test/e2e/pending-operations.e2e.spec.ts` |
| Docs | README "Connecting an AI client" |

## Tasks

### 1. Sign-in prerequisites (done in PR #101)

- [x] OAuth 2.1 provider, CIMD, discovery, consent page, sysadmin/orgadmin gate.

### 2. Transport and one read tool end to end

- [x] CASL vocabulary: action `use`, subjects `Mcp`, `PendingOperation` (+ subject shapes).
- [x] `McpAbilityRules` + spec.
- [x] `McpActorRepository.load(userId)` (user row + memberships) + spec.
- [x] Tool registry with default deny, error mapping, static definitions.
- [x] `list_my_organisations` and resource `taidohub://me`; server instructions.
- [x] `McpHttpHandler`: Origin check → `requireMcpAuth` → load actor → `use Mcp` → `userContext.run`.
- [x] Mount in `main.ts` and `app-factory.ts`.
- [x] e2e with the SDK client: 401 + `WWW-Authenticate`, 403 bad Origin, 403 instructor and student
      tokens, happy path `tools/list`, `list_my_organisations`, `taidohub://me`.

### 3. Remaining read tools

- [x] `StudentAbilityRules`: orgadmin `read Student` in their orgs + spec.
- [x] `StudentsService.listRoster` / `getStudentProgress` accept orgadmin orgs for reading + spec.
- [x] `list_students`, `get_student_progress`, `get_next_rank_requirements`, `get_statistics_summary`.
- [x] e2e: happy paths, CASL deny on a student in another organisation.

### 4. Pending operations (backend)

- [x] `audit_log.origin` column and `RecordInput.origin`.
- [x] `pending_operation` table; migration from `db:generate`, applied with `db:migrate`.
- [x] `RankHistoryService.create(…, executor?)`.
- [x] Pending-operations module: propose, list mine, approve, reject; abilities; specs.
- [x] HTTP: `GET /api/pending-operations`, `POST /api/pending-operations/:id/approve`, `…/reject`.
- [x] MCP tools `propose_rank_entry`, `list_pending_operations`, `reject_pending_operation`.
- [x] e2e: propose → approve over HTTP → rank history row + audit rows with origin `mcp`; another user
      cannot approve; reject.
- [x] OpenAPI regenerated.

### 5. Approval page (frontend)

- [x] `entities/pending-operation` (api + query options, parsed through the contract) + `.api.test.ts`.
- [x] `pages/pending-operations` with approve/reject and empty state + `.test.tsx`.
- [x] Route `/pending-operations`, navigation entry, strings in en/sv/fi.

### 6. Guard tests and docs

- [x] Guard spec over every registered tool: strict input schema, description ≤ 280 characters,
      declared ability, staged envelope for staged tools, byte-stable `tools/list`.
- [x] README: connecting Claude Code and Claude.ai.
- [x] `ci-verify` checklist green; PR.

## E2E strategy

The real Nest app (`app-factory.ts`) and the e2e Postgres. Access tokens are minted in the test by
signing a JWT with the app's own JWKS (via better-auth's `jwt` plugin API) with the MCP resource as
audience. That exercises the same verification path as a real OAuth flow without driving a browser
consent screen; the OAuth flow itself is covered by `mcp-oauth.e2e.spec.ts`. The SDK client connects
with a `fetch` that routes into supertest's server.

## Connecting (for the README)

- **Claude Code:** `claude mcp add --transport http taidohub https://taidohub.se/api/mcp`, then
  `/mcp` to sign in.
- **Claude.ai:** Settings → Connectors → Add custom connector → `https://taidohub.se/api/mcp`.
- Staging: the same with `https://staging.taidohub.se/api/mcp`.
