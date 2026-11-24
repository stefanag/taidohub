---
name: add-module
description: "Scaffold a new backend domain module for taidohub: Drizzle schema, repository, service, controller, CASL ability contributor, Zod contract, and tests, wired together the way every existing module (labels, belt-catalog, feedback, ...) already is. Use whenever a change needs a new resource/endpoint group under apps/backend/src/modules/, or a new subject needs CASL rules. Ensures repository-only DB access, contributor-based ability registration, and contract-first DTOs are never skipped."
---

# add-module: backend module scaffolder

Every backend module follows one shape. Deviating from it (a service that imports `drizzle-orm`
directly, an ability class registered by hand instead of discovered, a DTO defined outside
`@repo/contracts`) breaks an invariant enforced elsewhere in the codebase — see [Hard Rules 1-4 in
CLAUDE.md](../../../CLAUDE.md#hard-rules). Build modules in this order; each step's file is a template
lifted from an existing module, not invented fresh.

## 0. Before you start

- Read [`taido-domain`](../taido-domain/SKILL.md) if the module touches ranks, patterns, techniques,
  hokei groups, requirement sets, or organisation hierarchy — the schema has non-obvious shapes (see
  its "Known gotchas" section) that are easy to get wrong from the table names alone.
- Decide the CASL subject name(s) now (PascalCase, singular: `Tag`, `RequirementSet`, not `Tags`). It
  appears in the contract, the ability file, and the `@CheckAbility` decorators, and must match exactly.

## 1. Contract first (`packages/contracts/src/<name>.ts`)

Define every request/response shape as a Zod schema before writing any NestJS code. Follow
`packages/contracts/src/labels.ts` as the template:

```typescript
export const ThingSchema = z
  .object({
    id: z.uuid(),
    organisationId: z.uuid().nullable(),
    // domain fields
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'Thing',
    description: 'One-line description of what this row represents and what null fields mean.',
    example: { /* a realistic, fully-populated example */ },
  });

export const CreateThingSchema = z.object({ /* input fields only */ }).meta({ id: 'CreateThingInput' });
export const UpdateThingSchema = z.object({ /* ... */ }).meta({ id: 'UpdateThingInput' });
```

Add a `src/__tests__/<name>.test.ts` asserting the schema round-trips its example. Export the new file
from `src/index.ts`. Run `pnpm --filter @repo/contracts build` before touching the backend — the
backend imports compiled output from `@repo/contracts/<name>`, not the source file.

## 2. Schema (`apps/backend/src/infrastructure/database/schema/<name>.ts`)

Drizzle table definitions. Company-/org-scoped tables get `organisationId: uuid('organisation_id')
.references(() => organisation.id)`, nullable only if the row can be a sysadmin-owned global (see
`taido-domain` for which tables allow that). Re-export from `schema/index.ts`. Generate the migration
with `pnpm --filter backend db:generate` — never hand-write the SQL file (see CLAUDE.md Hard Rule 7).

## 3. Repository (`<name>.repository.ts`)

**The only file in the module allowed to import `drizzle-orm` or touch the DB client.** Template:

```typescript
@Injectable()
export class ThingRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<ThingRow | undefined> { /* ... */ }
  async listVisible(organisationId: string | null): Promise<ThingRow[]> { /* org OR null-scoped globals */ }
  // one method per query shape the service actually needs — don't expose a generic query builder
}
```

Add `<name>.repository.spec.ts` mocking the Drizzle client (see `organisations.repository.spec.ts`).

## 4. Service (`<name>.service.ts`)

Business logic and cross-module orchestration. Injects its own repository plus any **other module's
exported service** it needs (never another module's repository — see CLAUDE.md Hard Rule 1). Row-level
authorization for anything the controller-level gate can't express lives here:

```typescript
async update(id: string, input: UpdateThingInput, ability: AppAbility): Promise<ThingRow> {
  const existing = await this.repo.findById(id);
  if (!existing) throw new NotFoundException();
  ForbiddenError.from(ability).throwUnlessCan('update', subject('Thing', existing));
  return this.repo.update(id, input);
}
```

Add `<name>.service.spec.ts` mocking the repository.

## 5. Ability contributor (`<name>.abilities.ts`)

```typescript
@AbilityContributor()
@Injectable()
export class ThingAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'Thing');
      return;
    }
    for (const orgId of user.memberships.map((m) => m.organisationId)) {
      builder.can('read', 'Thing', { organisationId: orgId });
      // create / update / delete rules, scoped as narrowly as the domain requires
    }
  }
}
```

Provide it in the module's `providers` array — **do not** touch `ability.factory.ts`; contributors are
discovered automatically at bootstrap (see CLAUDE.md Hard Rule 3). Write out in a comment block, like
`labels.abilities.ts` does, exactly which role gets which verb: this file is the actual authorization
spec and the comment is what the next person reads instead of re-deriving it from the code. Add
`<name>.abilities.spec.ts` asserting each rule.

## 6. Controller (`<name>.controller.ts`)

```typescript
@Controller('things')
@ApiTags('things')
@ApiCookieAuth()
export class ThingController {
  constructor(
    private readonly service: ThingService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  @Post()
  @CheckAbility('create', 'Thing')
  async create(
    @Body(new ZodValidationPipe(CreateThingSchema)) input: CreateThingInput,
    @CurrentUser() user: AuthenticatedUser,
  ) { /* ... */ }
}
```

Plural-noun resource path, standard verbs, `nestjs-zod`'s `ZodValidationPipe` against the contract
schema (never a hand-written DTO class). Add `<name>.controller.spec.ts`.

## 7. Module (`<name>.module.ts`)

```typescript
@Module({
  imports: [/* forwardRef(() => OtherModule) only if genuinely circular */],
  controllers: [ThingController],
  providers: [ThingService, ThingRepository, ThingAbilityRules],
  exports: [ThingService], // only if another module needs to inject it
})
export class ThingModule {}
```

`DatabaseModule` and `AbilityModule` are `@Global` — don't import them. Write the same short "why this
import list looks like this" comment block `labels.module.ts` has; it's what stops the next person from
either re-importing something global or reaching for a repository that should stay private. Register
`ThingModule` in `app.module.ts`.

## 8. E2E test

Add `apps/backend/test/e2e/<name>.e2e.spec.ts` following `apps/backend/test/e2e/health.e2e.spec.ts` and
`invitation.e2e.spec.ts`: boot via `test/helpers/app-factory.ts`, reset the DB with
`test/helpers/db-reset.ts`, exercise the real HTTP surface.

## 9. Regenerate the OpenAPI artifact

```bash
pnpm --filter backend openapi:generate
git add packages/contracts/openapi/
```

CI's `openapi-sync` job fails the build otherwise (CLAUDE.md Hard Rule 5).

## 10. Verify

Run the `ci-verify` skill before opening the PR.
