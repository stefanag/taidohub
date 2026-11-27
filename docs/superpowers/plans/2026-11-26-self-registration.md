# Plan: Self-registration and use without a club

Status: **phase 1 shipped; phase 2 built** (PR feat/training-readiness). Decisions recorded 2026-11-26 (see "Decisions").

## Goal

Let an individual register on their own and use TaidoHub without belonging to a club: keep a
grading history, follow their progress towards the next rank, and use the training features below.
Joining a club later must keep that history and let the club verify it.

## Decisions (owner, 2026-11-26)

1. Minimum age for self-registration: **13 years** (the Swedish age of consent for information
   society services). Younger users are only added by a club through an invitation.
2. Users without a club get grading requirements from a **national federation they choose**, and
   can change that choice later.
3. Self-reported gradings are **clearly marked as not verified** everywhere, including for a club
   the user joins later.
4. The Google plan (`plan/google-sign-in`) must support self-registration (see that plan).
5. All features below are equally important; the order below is an engineering choice so that each
   phase builds on the previous one.

## What already works without a club (verified in code)

- Own grading history: any signed-in user can create, edit and delete their own `external`
  rank-history rows (`RankHistoryAuthService.canEdit`); rows start `verified = false` and only a
  head instructor or sysadmin can verify them. `organisation_name` is free text.
- Training progress per technique and pattern (`user_content_progress`: status, student notes,
  `last_practiced_at`).
- Techniques, patterns and the public rank pages are readable by any signed-in user.
- Org-scoped CASL rules already keep a user without memberships away from other members, students
  and statistics.

## Global constraints

- **The federation choice is not a membership.** `RankHistoryAuthService.loadRoleContext` treats
  users who share any organisation as able to read each other's history, so an "individual"
  membership in a federation would expose every individual's history to every other one. Store the
  choice on the profile instead.
- **Requirement resolution changes need the `taido-domain` rules**: walk ancestors with
  `OrganisationsRepository.getAncestorIds()`, null-aware `setId` filters, fall back to the global set.
- better-auth's `disabledPaths` only blocks HTTP routes; server-side `auth.api.signUpEmail` still
  works. Use that to close the public `/sign-up/email` route while our own endpoint registers users.
- No new dependency without asking (relevant for PDF export, see phase 3).
- Every new string in en, sv and fi; contracts in `@repo/contracts`; migrations via `db:generate`.
- Each phase ships behind its own feature flag and is tried on staging first.

## Phase 1: Register and use the system without a club

Flag: `self-registration`.

### Data

- `user_profile.reference_federation_id` (uuid, nullable, FK `organisations.id`). The service
  checks the referenced organisation has `type = 'national_federation'`.
- Terms and privacy texts, and the log of what each user accepted or acknowledged, come from the
  legal documents plan (`2026-11-26-legal-documents.md`, branch `plan/legal-documents`). Its
  phase 1 must ship before this phase.
- `user_profile.date_of_birth` already exists; registration makes it required for self-registered
  users.

### Backend

- New `registration` module (via `/add-module`): `POST /api/registration` (public, rate limited)
  with a contract holding name, email, password, locale, date of birth, federation id and the ids of
  the platform text versions shown. It validates age ≥ 13 on the day of registration, that the
  federation exists and is a national federation, and that the versions are the current platform
  `self_registered` texts, then calls `auth.api.signUpEmail` server-side and records profile, terms
  acceptance and privacy receipt in the same flow.
- `GET /api/registration/federations` (public): the national federations to choose from.
- better-auth: `disabledPaths` gains `/sign-up/email`; `emailVerification` with
  `sendVerificationEmail` through `EmailService` (new localised template) and
  `requireEmailVerification: true` for sign-in. Invited users are unaffected: they get
  `emailVerified` when they set their password through the invitation link (confirm in e2e).
- Requirement resolution (`RankRequirementsService`): when the user has no student membership,
  use `reference_federation_id` as the starting organisation (ancestors → global set). With neither,
  fall back to the global set instead of returning empty requirements as today.
- Profile: read and change the reference federation.
- Delete my account: `DELETE /api/me` with password confirmation. It removes the user and their
  own data; rows other users depend on (`recorded_by_user_id`, audit log) are kept as the schema's
  FK rules dictate. Needed once anyone can register. (Check every `onDelete: 'restrict'` FK to
  `user` before implementing.)

### Frontend

- `/register` page: form, "I accept the terms" and "I have read the privacy notice" checkboxes
  with links to the platform texts (a privacy notice is acknowledged, not consented to), age
  validation with a clear message, a "check your email" view after submit. A link from the login
  page.
- `/verify-email` landing page for the link in the email (success, expired link → send a new one).
- No-club state: dashboard and sidebar show my grading history, my progression, techniques,
  patterns and profile; club-only entries hidden. A small hint on the dashboard: "You are not in a
  club. Your gradings are self-reported."
- Grading history: an "unverified, self-reported" badge on every unverified row, also where
  instructors and admins see a student's history.
- Profile: choose or change the national federation; delete my account (with confirmation).

### Open questions for phase 1

- The platform texts themselves and who operates TaidoHub formally: see the open decisions in the
  legal documents plan.

### Implementation notes (phase 1)

- Email verification is required only for self-registered accounts (`user_profile.self_registered_at`),
  enforced by a better-auth `before` hook on `/sign-in/email`. better-auth's global
  `requireEmailVerification` would also lock out invited and seeded users, whose `emailVerified` is
  only set when they choose a password.
- Verification emails are sent only to self-registered accounts and only with a callback on a
  trusted origin (same guard as password resets); confirming signs the user in.
- An existing address gets the same `202 verification_sent` answer and no email, so the endpoint
  does not reveal who has an account.
- Registration is rate limited in memory (5 per address and hour), enough for one app instance per
  environment.
- Account deletion (`DELETE /api/account`) is open to every user, not only self-registered ones
  (the right to erasure). Own grading history is removed first because
  `rank_history.recorded_by_user_id` is `ON DELETE RESTRICT`; gradings recorded for others block
  deletion with `ACCOUNT_IN_USE`.
- Requirement resolution for a user without a student membership now starts from their reference
  federation and, with neither, falls back to the global set (it used to return empty
  requirements).
- The "self-reported, not verified" badge on external unverified gradings is shown whether or not
  the verification flag is on (decision 3).

## Phase 2: Training and grading readiness

Order: readiness first (uses data that already exists), then the training log, then what builds
on it.

1. **Grading readiness** (flag `grading-readiness`): one view against the next rank's
   requirements: share of techniques and patterns marked done, time in current rank against the
   minimum, and the minimum age, giving "earliest possible grading: <date>". Uses the existing
   requirement data (time and age scalars) and progress rows.
2. **Training log** (flag `training-log`): new `training_session` table (user, date, duration,
   kind: club session / own training / camp / seminar, notes) and a link table to the techniques and
   patterns practised. Saving a session updates `last_practiced_at` for those items.
3. **Practice reminders**: "You have not practised X for 4 weeks", from `last_practiced_at`; shown
   on the dashboard and the progression page. No email at first.
4. **Personal goals**: target rank by date, sessions per week; progress shown on the dashboard.

### Phase 2 as built (feat/training-readiness)

- **Readiness** is computed in the frontend (`shared/lib/grading-readiness`), shown inside the
  next-rank card for the signed-in user only (the age gate needs the user's own date of birth).
  The earliest date is the later of "last pass + `minMonthsSincePreviousRank`" and "date of birth +
  `minAge`". When a gate applies but its input is missing (no date of birth, no dated pass), the
  card says so instead of showing a date.
- **Training log**: module `training-log` (tables `training_session`, `training_session_item`,
  `training_goal`, migration 0039; flags in 0040). Routes `/api/training-sessions[/:id]` and
  `/api/training-goals/me`, each behind `@RequireFeatureFlag('training-log')` (the guard reads
  method metadata only, so the decorator sits on every endpoint). CASL subject `TrainingSession`:
  owner only, no sysadmin grant: a training log is private. Someone else's session answers 404.
- Saving a session calls `ProgressService.markPracticed` in the same transaction: "last
  practised" moves up to the session date (never back), and an item without a progress row gets
  one with status `learning`. Deleting a session does not move the date back.
- **Reminders** and **goals** sit behind `training-log` too (both rely on the log). Reminders list
  next-rank requirements not practised for 28 days, never-practised first; goals are one row per
  user, all fields optional; the dashboard card counts sessions from Monday of the current week.

## Phase 3: Joining a club, export, self-test

1. **Join a club** (flag `club-join-requests`): a user without a club searches for a club and sends
   a request; the club's orgadmin approves or declines (reuse the pending-operations pattern if it
   fits). On approval the user gets a student membership; the head instructor can then verify the
   self-reported history with the existing verify action.
2. **Export** of grading history and training log for the user's own use and GDPR data
   portability: JSON download first, then a printable page (browser print to PDF, no new
   dependency). A server-generated PDF would need a library: ask first.
3. **Self-test** (flag `self-test`): multiple-choice and flashcards on terminology and pattern
   order, generated from the technique and pattern catalogue; results not stored at first.

## Tests (every phase)

- Unit specs for every new service rule: age limit at the boundary (12 years 364 days / 13 years),
  federation type check, resolution order (student membership → reference federation → global).
- e2e: registration → verification email → sign in; refusal under 13; `/api/auth/sign-up/email`
  returns 404; invited user can still set a password and sign in; account deletion.
- Frontend tests for the register form, the no-club sidebar and the unverified badge.
