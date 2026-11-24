# MCP module: design

**Status:** approved for implementation, 2026-11-24.
**Builds on:** PR #101 (better-auth 1.7.27 as the OAuth 2.1 authorization server for MCP clients).

## Goal

Make TaidoHub usable from AI clients (Claude, ChatGPT, Cursor and other MCP clients) through a small
MCP server in the NestJS backend. The user signs in with their own TaidoHub account, and every tool
call runs with that user's CASL ability, exactly as the same action in the web app would.

This is a skeleton. It proves the full path (OAuth → `/api/mcp` → tool → service → CASL → audit log →
response) and fixes the conventions later tools follow. Breadth comes later.

Out of scope: in-app chat, calling an LLM from the backend, a plugin or skills package, any tool that
deletes data.

## Decisions taken

| Question | Decision |
| --- | --- |
| MCP packages | `@modelcontextprotocol/server` 2.4.0 (backend) and `@modelcontextprotocol/client` 2.4.0 (backend dev, e2e only). `@modelcontextprotocol/express` was approved but is not needed: better-auth's `toNodeHandler` already adapts a fetch handler to Express, and the adapter's Host check does not cover the `Origin` check the MCP spec asks for. |
| Who may use MCP | Active sysadmins, and users with an `orgadmin` membership in at least one organisation. |
| First write tool | `propose_rank_entry`: proposes a new row in a student's grading history (rank history). |
| Who approves a proposal | Only the user who proposed it. |
| Where a proposal is approved | **Only in the web app.** The MCP server offers `reject_pending_operation` but no approve tool. An AI client acts with the user's token, so an approve tool would let the agent approve its own proposal and make the staging step meaningless. |
| Orgadmin reading students | New CASL rule: an orgadmin may **read** students in the organisations where they hold that role. This applies to the HTTP API as well (roster, a student's progress, requirement resolution). Writes on student progress stay instructor-only. |

## Architecture

```
MCP client ──OAuth 2.1 (better-auth, CIMD)──▶ /api/auth/oauth2/*
    │
    │  Authorization: Bearer <JWT, aud = <BETTER_AUTH_URL>/api/mcp>
    ▼
/api/mcp  (Express mount, outside the Nest router, like /api/auth)
    1. Origin check            → 403 if an Origin header is present and not one of WEB_ORIGIN
    2. requireMcpAuth          → 401 + WWW-Authenticate (RFC 9728) without a valid token
    3. load actor              → user row + memberships; deactivated → 403
    4. CASL `use Mcp`          → 403 for instructors, students and plain users
    5. userContext.run(actor)  → createMcpHandler(factory).fetch(request, { authInfo })
         └─ McpServer per request: tools + resource, bound to the actor
              └─ tool → owning module's service (same checks as HTTP) → contract-shaped result
```

- **Stateless.** `createMcpHandler` from SDK v2 builds one `McpServer` per request. Responses are JSON
  (`responseMode: 'json'`); no SSE, so `compression()` cannot buffer a stream and nothing is held in
  memory between requests.
- **Token verification** uses `requireMcpAuth(auth, handler)` from `@better-auth/mcp`: signature
  (JWKS), issuer, audience (the MCP resource) and expiry. The `sub` claim is the user id.
- **Two checks on access**, as agreed in PR #101: the OAuth authorize/consent hook refuses users who
  may not use MCP, and every MCP request checks CASL `use Mcp`, so a token issued before a role change
  stops working at once (the actor is loaded fresh on every request).

## CASL

- New action `use` and new subjects `Mcp` and `PendingOperation` in `@repo/contracts/casl`.
- `McpAbilityRules`: `use Mcp` for an active sysadmin or a user with any `orgadmin` membership.
  (Sysadmin already has `manage all`; the explicit rule documents intent.)
- `PendingOperationAbilityRules`: any authenticated user may `read`, `create` and `update` a
  `PendingOperation` whose `createdByUserId` is their own id. Because sysadmin's `manage all` also
  matches, the service additionally enforces `createdByUserId === actor.id` for approve and reject.
- `StudentAbilityRules`: adds `read Student` scoped to `organisationIds $in <orgadmin orgs>`. This
  broadens; no existing rule is narrowed.

## Tools and resource

All inputs are `z.strictObject` schemas in `@repo/contracts/mcp` (so the JSON Schema has
`additionalProperties: false`); outputs are object schemas returned as `structuredContent`, with the
same JSON as text content for clients that ignore structured output.

| Tool | Ability | Service call | Notes |
| --- | --- | --- | --- |
| `list_my_organisations` | `use Mcp` | `OrganisationsService.list` filtered to the actor's memberships | Returns id, name, the actor's roles. Sysadmin gets their own memberships too; for "all organisations" a later tool. |
| `list_students` | `read Student` | `StudentsService.listRoster`, optional `organisationId` filter | Orgadmin and instructor orgs; all for sysadmin. |
| `get_student_progress` | `read Student` | `StudentsService.getStudentProgress` | Instance check on the student's organisations. |
| `get_next_rank_requirements` | `read Student` | `RankHistoryService.list` + `BeltRanksService` + `RankRequirementsService.resolveForUser` | Next rank = `nextRankId` of the latest passed rank; `rankId` overrides. Resolution walks the student's organisation ancestors (unchanged logic). |
| `get_statistics_summary` | `use Mcp` | `StatisticsService.getOrganisationStats`, or `getPlatformStats` without `organisationId` (sysadmin only) | Same checks as the HTTP endpoints. |
| `propose_rank_entry` | `create PendingOperation` | `PendingOperationsService.propose` | Writes nothing in rank history. Returns the staged envelope. |
| `reject_pending_operation` | `update PendingOperation` | `PendingOperationsService.reject` | Proposer only. |
| `list_pending_operations` | `read PendingOperation` | `PendingOperationsService.listMine` | So the agent can report what awaits approval. |

Resource `taidohub://me`: the actor's id, name, email, global role and memberships with organisation
names. The server instructions tell agents to read it first.

## Pending operations

Table `pending_operation`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `type` | text | `rank_history.create` for now; checked against a known list |
| `params` | jsonb | the validated tool input |
| `preview` | jsonb | what will happen, in readable terms (student name, rank name, date) |
| `status` | text | `pending` → `approved` / `rejected` / `failed` |
| `created_by_user_id` | uuid fk user | the proposer |
| `created_via` | text | `mcp` |
| `result_entity_id` | uuid null | the rank history row created on approval |
| `error` | text null | why approval failed |
| `created_at`, `decided_at` | timestamptz | |

- **Propose** validates the input, checks now that the proposer could record the entry (same rule as
  `RankHistoryService.create`), builds the preview and stores the row. Audit: `pending_operation`
  `create`, origin `mcp`.
- **Approve** (web app, `POST /api/pending-operations/:id/approve`, cookie session): proposer only,
  status must be `pending`. In one transaction: re-run `RankHistoryService.create` as the proposer
  (permissions are re-checked against today's state), mark the operation `approved` with the new row id,
  audit `rank_history` `create` with origin `mcp` and `pending_operation` `update`. A permission or
  validation failure marks it `failed` with the message instead of throwing away the record.
- **Reject** (web app or MCP): proposer only, status must be `pending`; audit `pending_operation` `update`.
- Result envelope for staged tools: `{ staged: true, operationId, preview, message }`.

## Audit origin

`audit_log` gets a column `origin text not null default 'web'`, and `RecordInput` an optional
`origin?: 'web' | 'mcp'` (default `'web'`), so existing callers are untouched. Every row written
because of an MCP call carries `mcp`. Exposing `origin` in the audit-log API and UI is a follow-up.

## Conventions (the tool authoring contract)

1. Every tool is declared once in `mcp/tools/*.tool.ts` as a `McpToolDefinition`: name, description,
   `inputSchema`, `outputSchema`, `ability: [action, subject]`, `annotations`, `kind: 'read' | 'staged'`,
   and `handler(input, actor)`.
2. Schemas come from `@repo/contracts/mcp`; inputs are `z.strictObject`. No hand-written JSON Schema.
3. Descriptions are at most 280 characters, agent-facing ("Use to …", "Call … first"), with no
   argument documentation in prose.
4. Definitions are static (built at module load), so `tools/list` is byte-stable between requests.
5. The registry checks the declared ability before calling the handler; a tool without one cannot be
   registered (default deny).
6. Staged tools return the staged envelope; read tools never write.
7. Errors from services (Nest `HttpException` with the error envelope) become a tool result with
   `isError: true` and the envelope's `code` and `message` as text.

Guard tests run over every registered tool and fail when a convention is broken.

## Server instructions

Short, safety rules first (well under 4,000 characters): read `taidohub://me` first; data is personal
data about students, share only what the user asks for; writes are proposals that the user approves in
the web app; never claim a proposal is done until it is approved; tool errors mean no change was made.

## Open questions

- Exposing the audit `origin` in the audit-log page.
- Whether an orgadmin should also get progress **write** access (kept instructor-only).
- More staged write types (progress, memberships) once the pattern has been used.
- Rate limiting per token, when the server sees real use.
