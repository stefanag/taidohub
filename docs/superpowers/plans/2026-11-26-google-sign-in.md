# Plan: Sign in with Google

Status: **on hold** (parked 2026-11-26, revisit around 2026-12-03). Nothing is implemented yet.

## Goal

Let users sign in with their Google account as an alternative to email and password.

## Global constraints

- better-auth 1.7 has Google built in (`socialProviders.google`); no new dependency.
- Users join by invitation only; there is no sign-up page. Google sign-in must therefore not create
  accounts: it only signs in users that already exist (`disableSignUp: true`).
- better-auth links a Google sign-in to the existing user with the same email when Google reports
  the address as verified (`oauth2/link-account.mjs`). An invited user can thus pick Google instead
  of setting a password.
- One origin per environment; the callback is `https://<site>/api/auth/callback/google`.
- Secrets only in `/opt/taidohub/.env`.

## Open decisions (ask before starting)

1. Google only for existing (invited) users? Recommended: yes.
2. Include phase 2 (link/unlink on the profile page) now or later?
3. Close the open email sign-up endpoint in a separate PR? (see "Found along the way")
4. Mention Google as a sub-processor in the privacy text?

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
- `better-auth.ts`: add `socialProviders.google` with `disableSignUp: true`, only when both
  variables are set.
- New public endpoint `GET /api/auth/providers` → `{ google: boolean }`, so the frontend knows
  whether to show the button (the image is shared between environments, so build-time Vite env
  won't do). Zod contract in `@repo/contracts`; regenerate the OpenAPI spec.
- `compose.yaml` (`${GOOGLE_CLIENT_ID:-}` …) and `deploy/hetzner/env.example`.

### Frontend

- "Sign in with Google" button on the login page under the email form, shown only when the
  providers endpoint says so.
- `authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL })`, with
  `errorCallbackURL` back to `/login`.
- Map the returned `?error=` codes to messages, e.g. `signup_disabled` → "There is no user with
  that Google address. Ask your club administrator for an invitation."
- New strings in en, sv and fi.
- Invitation email: one line saying Google sign-in also works.

### Tests

- Backend unit: Google enabled only when both variables are set.
- e2e: `POST /api/auth/sign-in/social` returns a Google URL with the right `redirect_uri`; the
  providers endpoint answers correctly in both configurations.
- Frontend: button shown/hidden; error messages per code.
- Real Google sign-in and linking to an invited account are tested by hand on staging.

## Phase 2 (optional): manage the link on the profile page

- "Connect Google account" / "Remove connection" (`linkSocial` / `unlinkAccount`), for users whose
  Google address differs from their TaidoHub address.
- Never allow removing the last sign-in method.

## Risks to check during implementation

- MCP: the login page is also used mid OAuth flow (`/oauth2/authorize`). Verify that flow resumes
  after a round trip through Google; if not, hide the Google button there in phase 1.
- Verify that "Forgot password?" lets a Google-only user set a password (better-auth must create
  the credential account if missing).

## Found along the way

`emailAndPassword` has no `disableSignUp`, so `POST /api/auth/sign-up/email` is open: anyone can
create an account without an invitation, although no page links to it. Proposed fix in its own PR:
`disableSignUp: true`, then confirm the invitation e2e tests still pass (invites create users
through `UsersService`, not the sign-up endpoint).
