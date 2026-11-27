# Plan: Sign in with Google

Status: **phase 1 in progress** (PR feat/google-sign-in).

## Goal

Let users sign in with their Google account as an alternative to email and password.

## Global constraints

- better-auth 1.7 has Google built in (`socialProviders.google`); no new dependency.
- Users join either by invitation or by self-registration (see
  `2026-11-26-self-registration.md`, branch `plan/self-registration`). Self-registration requires
  age ≥ 13, a chosen national federation and accepted terms. Google must not become a way around
  those checks.
- **Depends on phase 1 of the self-registration plan.** Implement that first.
- better-auth links a Google sign-in to the existing user with the same email when Google reports
  the address as verified (`oauth2/link-account.mjs`). An invited user can thus pick Google instead
  of setting a password.
- One origin per environment; the callback is `https://<site>/api/auth/callback/google`.
- Secrets only in `/opt/taidohub/.env`.

## Decisions

- 2026-11-26: Google must support self-registration, not only invited users.

## Open decisions (ask before starting)

1. Include phase 2 (link/unlink on the profile page) now or later?
2. Mention Google as a sub-processor in the privacy text? (The privacy text is written in the
   self-registration plan.)

## Phase 1: sign in for existing users

### Google Cloud (owner does this; document in deploy/hetzner/README.md)

- Project with an OAuth consent screen, type External: app name TaidoHub, domain `taidohub.se`,
  scopes `openid`, `email`, `profile` only.
- One OAuth client per environment, so one can be revoked without the other. Redirect URIs:
  - `https://staging.taidohub.se/api/auth/callback/google`
  - `https://taidohub.se/api/auth/callback/google`
  - `http://localhost:3001/api/auth/callback/google` (local development)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `/opt/taidohub/.env`.

### Backend

- `env.schema.ts`: optional `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, empty counts as unset
  (`unsetIfEmpty`). Also pass them through `auth.module.ts` and `openapi/swagger.ts`, which build
  the Env object by hand.
- `better-auth.ts`: add `socialProviders.google` only when both variables are set, with
  `disableImplicitSignUp: true`: the "Sign in with Google" button never creates an account by
  accident; only the registration page asks for sign-up (`requestSignUp: true`).
- Google sign-up goes through the same checks as email registration. Recommended approach: the
  account is created **incomplete** (`registration_completed_at` is null) and every API route
  except profile completion, sign-out and account deletion refuses it until the user has given
  date of birth (at least 13), national federation and consent on a "Complete your registration"
  page. Under 13: the account is deleted again with an explanation. Alternative considered:
  collecting those fields before the Google round trip and carrying them in a short-lived
  verification row; more moving parts, same result.
- Google reports the email as verified, so these accounts skip the verification email.
- New public endpoint `GET /api/auth/providers` → `{ google: boolean }`, so the frontend knows
  whether to show the button (the image is shared between environments, so build-time Vite env
  won't do). Zod contract in `@repo/contracts`; regenerate the OpenAPI spec.
- `compose.yaml` (`${GOOGLE_CLIENT_ID:-}` …) and `deploy/hetzner/env.example`.

### Frontend

- "Sign in with Google" button on the login page under the email form, shown only when the
  providers endpoint says so.
- `authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL })`, with
  `errorCallbackURL` back to `/login`.
- Map the returned `?error=` codes to messages, e.g. `signup_disabled` from the login button:
  "There is no account for that Google address yet. Register first.", with a link to `/register`.
- `/register` gets a "Register with Google" button; afterwards the user lands on the
  "Complete your registration" page.
- New strings in en, sv and fi.
- Invitation email: one line saying Google sign-in also works.

### Tests

- Backend unit: Google enabled only when both variables are set.
- e2e: `POST /api/auth/sign-in/social` returns a Google URL with the right `redirect_uri`; the
  providers endpoint answers correctly in both configurations; an incomplete account is refused
  by a normal API route and accepted after completion.
- Frontend: button shown/hidden; error messages per code.
- Real Google sign-in and linking to an invited account are tested by hand on staging.

### Implementation notes (phase 1)

- **Changed from the recommended "incomplete account" approach to the registration intent**, the
  alternative listed above. better-auth 1.7 carries `additionalData` through the Google round trip
  and exposes it to `databaseHooks` via `getOAuthState()`. The registration page first calls
  `POST /api/registration/google-intent`, which runs the same checks as an email registration
  (age, federation, platform texts, rate limit) and returns a one-hour intent; the sign-in passes
  it as `additionalData.registrationIntent` with `requestSignUp: true`. `user.create.before`
  refuses any social sign-up without a live intent (or while `self-registration` is off), and
  `user.create.after` writes the profile and acknowledgements, deleting the user again if that
  fails. No account ever exists without the checks, so no "incomplete" state or global guard is
  needed.
- The handler lives in the registration module and registers itself in an `AuthHooksRegistry`
  (infrastructure), because better-auth is built before feature modules and the registration
  module depends on better-auth.
- Providers endpoint: `GET /api/account/sign-in-providers` (better-auth owns `/api/auth/*`).
- The Google button is hidden on the login page while an AI client is being connected (the
  OAuth authorize flow resumes only through the email form).
- Phase 2 (link/unlink on the profile page) is not part of this PR; still an open decision.



- "Connect Google account" / "Remove connection" (`linkSocial` / `unlinkAccount`), for users whose
  Google address differs from their TaidoHub address.
- Never allow removing the last sign-in method.

## Risks to check during implementation

- MCP: the login page is also used mid OAuth flow (`/oauth2/authorize`). Verify that flow resumes
  after a round trip through Google; if not, hide the Google button there in phase 1.
- Verify that "Forgot password?" lets a Google-only user set a password (better-auth must create
  the credential account if missing).

## Found along the way

The open `POST /api/auth/sign-up/email` endpoint is closed as part of the self-registration plan
(phase 1), which replaces it with a checked registration endpoint.
