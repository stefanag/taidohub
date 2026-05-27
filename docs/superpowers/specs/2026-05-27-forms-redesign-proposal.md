# Forms Redesign Proposal

**Status:** proposal — not yet approved.

**Date:** 2026-05-27

**Author:** Stefan (with Claude)

**Context:** As of Plans B and C (belt-catalog frontend + grading-history),
the taidohub frontend has accumulated **three coexisting form patterns**:

1. **Custom `useZodForm` helper** (`apps/frontend/src/shared/ui/form.tsx`) —
   adopted in the codebase's earliest forms; the helper's docblock explicitly
   says "we don't pull in `react-hook-form` to keep the dep tree lean."
2. **Plain `useState`** — used by forms shipped during the user-management
   phases (ProfileForm, UserForm, InviteUserDialog, …).
3. **`react-hook-form` + `zodResolver`** — adopted in Plans B and C, pulling
   in `react-hook-form@^7.76.1` and `@hookform/resolvers@^5.4.0` as new deps
   to handle complex forms with Radix Selects, Controllers, and conditional
   validation.

The "keep the dep tree lean" rationale for `useZodForm` has been overtaken by
the Plan B/C decision: RHF is now a transitive runtime dependency. The
question is no longer **whether** RHF should be in the bundle — it already
is — but **whether to converge on it everywhere** or **roll it back to
`useZodForm`**.

This proposal recommends a forward migration to RHF + Zod, with an explicit
plan, an effort estimate, and a tight set of conventions that the four
Plan B/C forms have already proven out.

---

## 1. Goals

- **One form pattern across the whole frontend.** Predictable validation,
  error display, accessibility wiring, and test setup. No third-pattern
  surprises for the next contributor.
- **Sharp Zod validation at the form boundary.** Every form is type-safe
  end-to-end from the Zod schema in `@repo/contracts` to the React event
  handler.
- **Backend error envelopes surface cleanly.** A consistent `mapErrorCode`
  pattern converts `HttpError`'s `{ error: { code, message } }` payload to a
  localised inline message.

## 2. Non-goals

- **Don't break any existing test.** Migration is incremental; every
  pre-existing test in the migrated form's suite must still pass post-migration.
- **Don't migrate confirmation dialogs.** `OrganisationDeleteDialog`,
  `OrganisationMoveDialog`, `UserDeleteDialog` are select-and-confirm UIs with
  one or zero free-text fields — they have no real form state and don't need
  RHF.
- **Don't change Zod schemas in `@repo/contracts`.** The schemas are stable;
  form-layer adapters bridge any quirks (see §4 conventions).
- **Don't introduce a new dep.** RHF + resolvers are already in
  `package.json`; nothing else gets added.

## 3. Recommendation

**Converge on `react-hook-form` + `zodResolver`** across every multi-field
form. Delete the `useZodForm` helper after the last consumer migrates. Plain
`useState` forms get migrated form-by-form.

Rationale:
- **It's already in the bundle.** Plans B/C committed to `react-hook-form`.
  Rolling it back would mean rewriting four complex forms (16+ fields with
  Selects/Controllers/conditional validation) using a helper that doesn't
  have first-class Select support — a strict net-negative.
- **Battle-tested validation engine.** RHF's subscription model avoids
  re-renders on every keystroke, which matters for ProfileForm (10+ fields
  + dynamic citizenship list).
- **Idiomatic for new contributors.** RHF + Zod is the de facto React
  ecosystem standard; new hires will look for it before they look for a
  custom helper.
- **Better TypeScript ergonomics.** With the established `z.input<typeof
  Schema>` + `Schema.parse(values)` pattern, RHF + Zod produces clean
  end-to-end types even under `exactOptionalPropertyTypes`.

The alternative — keeping `useZodForm` and rolling back RHF — is rejected
because the four Plan B/C forms use Radix Selects that need RHF's
`Controller` (or a custom equivalent we'd have to write into `useZodForm`,
re-creating RHF). Not worth the rebuild.

---

## 4. Established conventions (from Plans B and C)

These conventions are already proven out across `BeltSystemForm`,
`BeltRankForm`, `ShogoTitleForm`, and `RankHistoryFormDialog`. They are the
canonical reference for the migration.

### 4.1 Hook shape

```ts
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { CreateSomethingSchema } from '@repo/contracts/something';

// IMPORTANT: use `z.input` (NOT `z.infer`) so the form's values type matches
// the schema's *pre-coercion* shape. This is essential under
// `exactOptionalPropertyTypes: true` whenever the schema has `.default()`,
// `.optional()`, or transformations.
type FormValues = z.input<typeof CreateSomethingSchema>;

const form = useForm<FormValues>({
  resolver: zodResolver(CreateSomethingSchema),
  defaultValues: { /* … */ },
});
```

### 4.2 Submit handler

```ts
const onSubmit = form.handleSubmit((values) => {
  // Re-parse to get the schema's *output* type (with defaults applied,
  // coercions run). This guarantees the mutation receives the right shape.
  const input = CreateSomethingSchema.parse(values);
  mutation.mutate(input);
});
```

### 4.3 Non-native controls — `Controller`

Radix Select, Checkbox, RadioGroup, and any other component that doesn't
expose a native `ref` or `onChange` for `register` must go through RHF's
`Controller`:

```tsx
<Controller
  control={form.control}
  name="organisationId"
  render={({ field, fieldState }) => (
    <Select
      value={field.value ?? 'global'}
      onValueChange={(v) => field.onChange(v === 'global' ? null : v)}
    >
      {/* … */}
    </Select>
  )}
/>
```

### 4.4 Backend error mapping

Every mutation can fail with a backend `HttpError` carrying `{ error: { code,
message } }`. Map the `code` to a localised inline message:

```ts
const mapErrorCode = React.useCallback(
  (err: unknown): string => {
    if (err instanceof HttpError) {
      switch (err.payload.code) {
        case 'EMAIL_IN_USE':
          return t('admin.users.errors.emailInUse', { defaultValue: '…' });
        // … other known codes
        default:
          return err.message;
      }
    }
    return err instanceof Error ? err.message : t('common.unknownError');
  },
  [t],
);
```

This `mapErrorCode` lives inline in the form component (no shared util yet —
each form has its own subset of known codes).

### 4.5 Form-layer schema (when wire shape doesn't fit a form)

If the wire schema demands `null` but the form's controlled inputs naturally
hold `""`, write a **form-layer schema** that accepts strings, then transform
in the submit handler. `RankHistoryFormDialog` already does this:

```ts
const RankHistoryFormSchema = z.object({
  rankId: z.string().min(1),
  shogoTitle: z.string(), // empty string allowed
  // …
});

// In submit:
const input = {
  ...values,
  shogoTitle: values.shogoTitle === '' ? null : values.shogoTitle,
};
const parsed = CreateRankHistorySchema.parse(input);
```

### 4.6 Test conventions

- **Mock the entity API at its deep path** (`vi.mock('@/entities/<x>/api/<x>.api.js')`)
  — query-options factories capture fetchers by reference, so barrel mocks
  don't intercept them.
- **Add a Steiger override** for the test file (`fsd/no-public-api-sidestep: 'off'`,
  and `fsd/forbidden-imports: 'off'` if the form bridges into other features).
- **jsdom polyfills for Radix Select** at the top of test files that exercise
  Selects:

  ```ts
  beforeAll(() => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
    HTMLElement.prototype.scrollIntoView = () => {};
  });
  ```
- **UUIDs in test fixtures** must be RFC4122-valid when the Zod schema uses
  `.uuid()` — Zod 4's regex rejects placeholder strings like `'system-1'`.

---

## 5. Inventory of existing forms

Surveyed via `git ls-files`, `grep -l react-hook-form`, and per-file reads.

| # | Form | Path | Current pattern | Field count | Notes | Migrate? | Effort |
|---|---|---|---|---|---|---|---|
| 1 | `LoginForm` | `features/auth-by-email/ui/LoginForm.tsx` | `useZodForm` | 2 (email, password) | Critical path — auth | **Yes** | S |
| 2 | `SignupForm` | `features/auth-by-email/ui/SignupForm.tsx` | `useZodForm` | 3 (email, password, name) | Sibling of LoginForm | **Yes** | S |
| 3 | `OrganisationForm` | `features/organisation-form/ui/OrganisationForm.tsx` | `useZodForm` | ~8 + nested membership tab | Has a Select for `type` + parentId picker | **Yes** | M |
| 4 | `ProfileForm` | `features/profile-form/ui/ProfileForm.tsx` | `useState` | 9 + dynamic citizenship list | Largest plain-useState form; needs `useFieldArray` | **Yes** | L |
| 5 | `InviteUserDialog` | `features/invite-user-dialog/ui/InviteUserDialog.tsx` | `useState` | 3 (email, name, role) | Modal | **Yes** | S |
| 6 | `SetPasswordForm` | `features/set-password-form/ui/SetPasswordForm.tsx` | `useState` | 2 (password, confirm) | Needs cross-field `.refine()` for confirm match | **Yes** | S |
| 7 | `MembershipEditor` | `features/user-form/ui/MembershipEditor.tsx` | `useState` | 2 (org, role) | Sub-component inside `<UserForm>` | **Yes** (with #8) | S |
| 8 | `UserForm` Details tab | `features/user-form/ui/UserForm.tsx` | `useState` (3 fields) | 2 form fields + 3 lifecycle action buttons | Touches the same file as `<MembershipEditor>` — migrate together | **Yes** | S |
| 9 | `BeltSystemForm` | `features/belt-system-form/` | **RHF + zodResolver** | 5 | Plan B | — | Done |
| 10 | `BeltRankForm` | `features/belt-rank-form/` | **RHF + zodResolver** | 16 | Plan B (the big one) | — | Done |
| 11 | `ShogoTitleForm` | `features/shogo-title-form/` | **RHF + zodResolver** | 6 | Plan B | — | Done |
| 12 | `RankHistoryFormDialog` | `features/rank-history-form/` | **RHF + zodResolver** | 6 + form-layer schema | Plan C | — | Done |

**Out of scope (confirmation dialogs — no form state to migrate):**
- `features/organisation-delete-dialog/ui/OrganisationDeleteDialog.tsx`
- `features/organisation-move-dialog/ui/OrganisationMoveDialog.tsx`
- `features/user-delete-dialog/ui/UserDeleteDialog.tsx`

**Out of scope (read-only views — no form state):**
- `<UserForm>` Profile tab (renders profile data only)
- `<UserForm>` Grading history tab (renders timeline; create/edit lives in `<RankHistoryFormDialog>`)

---

## 6. Migration plan (phased)

Each phase is a separate branch + PR. Within a phase, tasks are independent
and can be parallelised across implementer subagents.

### Phase 1 — small forms (warm-up)

Builds team confidence with the conventions before touching anything large.

1. **`SetPasswordForm`** — uses `useState` for password + confirm + an
   `unverifiedEmail` lookup. Migrate to RHF, add a Zod `.refine()` for the
   confirm-match check, replace manual error state with RHF `formState.errors`.
2. **`InviteUserDialog`** — 3 fields plus a "create directly" toggle. Plain
   migration; cleanest test pattern of the bunch.
3. **`MembershipEditor` + `UserForm` Details tab** — these live in the same
   file (`features/user-form/ui/UserForm.tsx`) and share a state graph. Migrate
   them together. The Details tab's `name` + `role` fields gain `zodResolver`
   from `UpdateUserSchema` in `@repo/contracts/users`; `MembershipEditor`
   gains `zodResolver` from `CreateMembershipSchema` in
   `@repo/contracts/memberships`.

### Phase 2 — auth flows

Critical path. Single feature slice, two consumers, easy to test in isolation.

4. **`LoginForm` + `SignupForm`** — migrate together (they share
   `auth-by-email`'s entity surface). Both already wrap Zod schemas via
   `useZodForm`; the migration is mostly mechanical. Adds RHF; removes
   `useZodForm` usage from this slice.

### Phase 3 — medium catalog admin

5. **`OrganisationForm`** — biggest `useZodForm` consumer (~8 fields + a
   parent-org Select + a country Select). Will surface most of the
   `Controller`-pattern friction; serves as the final test of conventions
   before tackling ProfileForm.

### Phase 4 — large form

6. **`ProfileForm`** — the largest plain-`useState` form. 9 scalar fields +
   a dynamic citizenship list (currently a `useState<string[]>`). Migration
   uses RHF's `useFieldArray` for the citizenships. Spike first to confirm
   the multi-picker UX maps cleanly to `useFieldArray`'s API.

### Phase 5 — cleanup

7. **Delete `useZodForm` helper** from `apps/frontend/src/shared/ui/form.tsx`.
   Confirm no remaining imports via Grep. Update the file's docblock.
8. **Update `FormField` + `FormMessage`** to optionally accept an RHF
   `fieldState` for error display (small enhancement; could be deferred).
9. **Update `CLAUDE.md`** (or the equivalent project doc) with the canonical
   RHF + Zod convention and a pointer to the four already-migrated forms as
   reference examples.
10. **Add a memory entry** (per the auto-memory system) recording "RHF +
    zodResolver is the canonical form pattern in this codebase, with
    `z.input<typeof Schema>` + `Schema.parse(values)` to handle
    `exactOptionalPropertyTypes`."

---

## 7. Effort estimate

| Size | Approx. hours | Tasks at that size | Subtotal |
|---|---|---|---|
| **S** (small: 2-4h each) | 3h | 4 (SetPasswordForm, InviteUserDialog, MembershipEditor+UserForm.Details, LoginForm+SignupForm counted as 1 task) | ~12h |
| **M** (medium: 4-8h each) | 6h | 1 (OrganisationForm) | 6h |
| **L** (large: 8-16h each) | 12h | 1 (ProfileForm) | 12h |
| **Phase 5 cleanup** | — | helper delete + docs + memory | ~3h |
| | | | **~33h total** |

That's roughly a **half work-week** of focused development for one engineer,
or ~12 subagent-driven tasks (one per migrated form + one per cleanup item),
which the existing harness can chew through in a single session given the
established conventions.

The estimate assumes no scope creep — i.e. no surprise design changes to the
migrated forms. Pure mechanical pattern conversion.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regression in critical auth flow (Login/Signup) | Low | High | Keep existing snapshot/integration tests intact; add a happy-path Playwright smoke test before migration; ship Phase 2 on its own branch + manual verify before merge. |
| `useFieldArray` doesn't map cleanly to the citizenship multi-picker | Medium | Medium | Spike the citizenship migration as the first task of Phase 4 — if it surfaces blockers, revisit the field shape (drop multi-picker semantics; switch to a multi-Select). |
| Breaking the `mapErrorCode` switch in `<UserForm>` when migrating the Details tab | Low | Medium | The Details-tab and lifecycle-action error mapping are separate; the migration only touches the form-submit path. Tests assert each error code → string mapping. |
| Steiger overrides multiply | Medium | Low | Migrated forms reuse the existing override pattern. Audit `steiger.config.js` at Phase 5; remove any unneeded overrides made redundant by `useFieldArray` simplifications. |
| TypeScript noise from `exactOptionalPropertyTypes` × RHF | Medium | Low | The `z.input<typeof Schema>` pattern is already proven to resolve this. Tasks that hit a fresh edge will document it inline. |

---

## 9. Open questions for review

1. **Keep `useZodForm` as a thin RHF shim, or delete it outright?** Recommend
   delete — the helper is only 86 lines and three consumers, and the RHF
   pattern is direct enough that a shim adds confusion without saving code.
2. **Single migration PR or one per phase?** Recommend one per phase. Each
   phase produces working, testable software (per the writing-plans
   guidance), and Phase 4 (ProfileForm) is large enough to warrant its own
   review window.
3. **Should `FormField` / `FormMessage` learn about RHF `fieldState`?** No —
   keep them dumb. RHF integration stays in each form's render functions.
4. **What about `<UserForm>` lifecycle action buttons (deactivate / delete /
   send password reset)?** They're not forms, just async action triggers
   with confirm dialogs. Not in scope.

---

## 10. Out of scope (recap)

- Confirmation dialogs (delete, move) — no form state.
- Read-only views (`<UserForm>` Profile + Grading history tabs).
- Backend changes — schemas and route consts are stable.
- Adding new validation rules — migration preserves current rules.
- Visual redesign — pure pattern migration, no Tailwind class churn.

---

## 11. Status of this document

This is a **proposal**, not an executed plan. To proceed, the next step is
either:

- **Approve as-is** → I write Plan D for Phase 1 (the four small forms) and
  start subagent-driven execution.
- **Approve with revisions** → flag the open questions; I update the
  proposal and re-present.
- **Defer** → leave the three patterns coexisting until another feature
  forces convergence. Plan B/C are stable; nothing's on fire.
