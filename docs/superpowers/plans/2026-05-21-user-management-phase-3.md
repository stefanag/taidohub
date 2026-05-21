# User Management Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user lifecycle — invite by email, deactivate/reactivate, hard-delete, and password reset — backed by a console email service and a public set-password flow.

**Architecture:** A new `EmailService` abstraction (interface + `ConsoleEmailService`) plus a `VerificationTokenService` that issues/consumes one-time tokens in better-auth's `verification` table. `UsersService` gains lifecycle methods; a new public `POST /auth/set-initial-password` endpoint hashes the password via better-auth's `$context` and signs the user in. The frontend adds invite/delete dialogs, a lifecycle action row, and a public `/set-password` page.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, better-auth, Zod 4 (`@repo/contracts`), React 19, Vite, TanStack Router/Query, Feature-Sliced Design, Vitest + Testing Library.

---

### Task 1: Contracts — invite + set-password schemas

**Files:**
- Modify: `packages/contracts/src/users.ts`
- Test: `packages/contracts/src/__tests__/users.test.ts`

- [ ] **Step 1: Add the failing tests**

Append the following two `describe` blocks to the end of `packages/contracts/src/__tests__/users.test.ts`. Also extend the import at the top of the file from `../users.js` to include the two new schema names.

Change the import block at the top of the file to:

```ts
import {
  InviteUserSchema,
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  RoleSchema,
  SetInitialPasswordSchema,
  UpdateUserSchema,
  UserSchema,
} from '../users.js';
```

Append at the end of the file:

```ts
describe('InviteUserSchema', () => {
  it('accepts an email-only invite', () => {
    expect(InviteUserSchema.safeParse({ email: 'new@example.com' }).success).toBe(true);
  });

  it('accepts an invite with a name', () => {
    expect(
      InviteUserSchema.safeParse({ email: 'new@example.com', name: 'New User' }).success,
    ).toBe(true);
  });

  it('rejects a bad email', () => {
    expect(InviteUserSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(
      InviteUserSchema.safeParse({ email: 'new@example.com', name: '' }).success,
    ).toBe(false);
  });
});

describe('SetInitialPasswordSchema', () => {
  it('accepts a token + a sufficiently long password', () => {
    expect(
      SetInitialPasswordSchema.safeParse({ token: 'abc123', password: 'longenough' }).success,
    ).toBe(true);
  });

  it('rejects a password shorter than 8 chars', () => {
    expect(
      SetInitialPasswordSchema.safeParse({ token: 'abc123', password: 'short' }).success,
    ).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(SetInitialPasswordSchema.safeParse({ password: 'longenough' }).success).toBe(false);
  });

  it('rejects an empty token', () => {
    expect(
      SetInitialPasswordSchema.safeParse({ token: '', password: 'longenough' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter contracts test
```

Expected: the `InviteUserSchema` and `SetInitialPasswordSchema` suites fail because `InviteUserSchema` / `SetInitialPasswordSchema` are not exported from `../users.js` (import resolves to `undefined`, `.safeParse` throws `TypeError`).

- [ ] **Step 3: Add the schemas**

In `packages/contracts/src/users.ts`, insert the following after the `UpdateUserInput` type export (after line `export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;`) and before the `UsersOpenApiRegistry` const:

```ts
export const InviteUserSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(200).optional(),
  })
  .meta({ id: 'InviteUserInput' });

export type InviteUserInput = z.infer<typeof InviteUserSchema>;

export const SetInitialPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(200),
  })
  .meta({ id: 'SetInitialPasswordInput' });

export type SetInitialPasswordInput = z.infer<typeof SetInitialPasswordSchema>;
```

- [ ] **Step 4: Register the schemas in the OpenAPI registry**

Replace the `UsersOpenApiRegistry` const at the bottom of `packages/contracts/src/users.ts` with:

```ts
export const UsersOpenApiRegistry = {
  Role: RoleSchema,
  User: UserSchema,
  ListUsersQuery: ListUsersQuerySchema,
  ListUsersResponse: ListUsersResponseSchema,
  UpdateUserInput: UpdateUserSchema,
  InviteUserInput: InviteUserSchema,
  SetInitialPasswordInput: SetInitialPasswordSchema,
} as const;
```

- [ ] **Step 5: Run the tests — expect PASS**

```
pnpm --filter contracts test
```

Expected: all suites pass, including the new `InviteUserSchema` (4 tests) and `SetInitialPasswordSchema` (4 tests) blocks.

- [ ] **Step 6: Commit**

```
git add packages/contracts/src/users.ts packages/contracts/src/__tests__/users.test.ts
git commit -m "feat(contracts): invite + set-initial-password schemas"
```

---

### Task 2: Contracts — route constants

**Files:**
- Modify: `packages/contracts/src/routes.ts`

- [ ] **Step 1: Extend `AuthRoutes` and `UsersRoutes`**

Replace the `AuthRoutes` and `UsersRoutes` consts at the top of `packages/contracts/src/routes.ts` with:

```ts
export const AuthRoutes = {
  base: '/api/auth',
  signIn: '/api/auth/sign-in/email',
  signUp: '/api/auth/sign-up/email',
  signOut: '/api/auth/sign-out',
  session: '/api/auth/get-session',
  setInitialPassword: '/api/auth/set-initial-password',
} as const;

export const UsersRoutes = {
  base: '/api/users',
  me: '/api/users/me',
  byId: (id: string) => `/api/users/${id}` as const,
  invite: '/api/users/invite',
  deactivate: (id: string) => `/api/users/${id}/deactivate` as const,
  reactivate: (id: string) => `/api/users/${id}/reactivate` as const,
  sendPasswordReset: (id: string) => `/api/users/${id}/send-password-reset` as const,
} as const;
```

- [ ] **Step 2: Verify with typecheck — expect PASS**

```
pnpm --filter contracts typecheck
```

Expected: no errors. This is a pure-constants change; there is no behavior to test, so verification is the typecheck.

- [ ] **Step 3: Commit**

```
git add packages/contracts/src/routes.ts
git commit -m "feat(contracts): lifecycle + set-initial-password route constants"
```

---

### Task 3: Backend env — token TTLs

**Files:**
- Modify: `apps/backend/src/config/env.schema.ts`

- [ ] **Step 1: Add the two TTL vars to `EnvSchema`**

In `apps/backend/src/config/env.schema.ts`, insert the following inside the `z.object({ ... })` passed to `EnvSchema`, immediately after the `SYSADMIN_PASSWORD` field (the last field, just before the closing `})`):

```ts
  /**
   * One-time invite-token lifetime in hours. The set-password link in an
   * invite email stays valid this long. Default 48h.
   */
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(48),

  /**
   * One-time admin-triggered password-reset token lifetime in hours.
   * Shorter than the invite TTL because a reset is a higher-trust action.
   * Default 1h.
   */
  RESET_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(1),
```

The resulting tail of the object should read:

```ts
  SYSADMIN_EMAIL: z.string().email().default('sysadmin@example.com'),
  SYSADMIN_PASSWORD: z.string().min(8).default('sysadmin'),

  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(48),

  RESET_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(1),
});
```

- [ ] **Step 2: Verify with typecheck — expect PASS**

```
pnpm --filter backend typecheck
```

Expected: no errors. `Env` widens to include the two new keys with defaults; nothing else needs touching.

- [ ] **Step 3: Commit**

```
git add apps/backend/src/config/env.schema.ts
git commit -m "feat(backend): invite + reset token TTL env vars"
```

---

### Task 4: Email templates

**Files:**
- Create: `apps/backend/src/infrastructure/email/email.types.ts`
- Create: `apps/backend/src/infrastructure/email/templates/invite.template.ts`
- Create: `apps/backend/src/infrastructure/email/templates/password-reset.template.ts`
- Create: `apps/backend/src/infrastructure/email/templates/admin-password-reset.template.ts`
- Test: `apps/backend/src/infrastructure/email/templates/templates.spec.ts`

- [ ] **Step 1: Create the email types + service interface**

Create `apps/backend/src/infrastructure/email/email.types.ts`:

```ts
/**
 * Email infrastructure types. The `EmailService` interface is the single
 * abstraction the rest of the app depends on; v1 ships `ConsoleEmailService`
 * behind it. A real provider (Resend / SMTP / Postmark) is a follow-up class
 * implementing the same interface — see spec §6.3.
 */

/** Locales the templates render copy for. Anything else falls back to `en`. */
export type EmailLocale = 'en' | 'sv' | 'fi';

export interface SendInviteArgs {
  to: string;
  /** Recipient's preferred locale; unknown values fall back to `en`. */
  locale: string;
  /** Absolute URL to the public set-password page, token included. */
  setPasswordUrl: string;
  /** Display name of the sysadmin who issued the invite, or null. */
  inviterName: string | null;
}

export interface SendPasswordResetArgs {
  to: string;
  locale: string;
  /** Absolute URL the user opens to choose a new password. */
  resetUrl: string;
}

export interface SendAdminPasswordResetArgs {
  to: string;
  locale: string;
  resetUrl: string;
  /** Display name of the sysadmin who triggered the reset, or null. */
  adminName: string | null;
}

/** The abstraction the app depends on. v1 impl: `ConsoleEmailService`. */
export interface EmailService {
  sendInvite(args: SendInviteArgs): Promise<void>;
  sendPasswordReset(args: SendPasswordResetArgs): Promise<void>;
  sendAdminPasswordReset(args: SendAdminPasswordResetArgs): Promise<void>;
}

/** DI token for injecting the `EmailService` implementation. */
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
```

- [ ] **Step 2: Create the invite template**

Create `apps/backend/src/infrastructure/email/templates/invite.template.ts`:

```ts
import type { SendInviteArgs } from '../email.types.js';

/** A rendered plain-text email. */
export interface RenderedEmail {
  subject: string;
  body: string;
}

/** Normalise an arbitrary locale string to one of the three supported ones. */
function normaliseLocale(locale: string): 'en' | 'sv' | 'fi' {
  if (locale === 'sv' || locale === 'fi') return locale;
  return 'en';
}

/**
 * Renders the "you've been invited" email. Plain text only (spec §6.3) —
 * the set-password URL is on its own line so it stays clickable in any
 * mail client, followed by an expiry note.
 */
export function renderInviteEmail(args: SendInviteArgs): RenderedEmail {
  const inviter = args.inviterName ?? 'a system administrator';
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Du har bjudits in till TaidoHub',
        body:
          `Hej!\n\n` +
          `${inviter} har bjudit in dig till TaidoHub. ` +
          `Öppna länken nedan för att välja ett lösenord och logga in:\n\n` +
          `${args.setPasswordUrl}\n\n` +
          `Länken slutar gälla om 48 timmar.\n\n` +
          `Om du inte väntade dig denna inbjudan kan du ignorera detta meddelande.`,
      };
    case 'fi':
      return {
        subject: 'Sinut on kutsuttu TaidoHubiin',
        body:
          `Hei!\n\n` +
          `${inviter} on kutsunut sinut TaidoHubiin. ` +
          `Avaa alla oleva linkki valitaksesi salasanan ja kirjautuaksesi sisään:\n\n` +
          `${args.setPasswordUrl}\n\n` +
          `Linkki vanhenee 48 tunnin kuluttua.\n\n` +
          `Jos et odottanut tätä kutsua, voit jättää tämän viestin huomiotta.`,
      };
    default:
      return {
        subject: 'You have been invited to TaidoHub',
        body:
          `Hi,\n\n` +
          `${inviter} has invited you to TaidoHub. ` +
          `Open the link below to choose a password and sign in:\n\n` +
          `${args.setPasswordUrl}\n\n` +
          `This link expires in 48 hours.\n\n` +
          `If you weren't expecting this invitation, you can ignore this message.`,
      };
  }
}
```

- [ ] **Step 3: Create the self-service password-reset template**

Create `apps/backend/src/infrastructure/email/templates/password-reset.template.ts`:

```ts
import type { SendPasswordResetArgs } from '../email.types.js';
import type { RenderedEmail } from './invite.template.js';

function normaliseLocale(locale: string): 'en' | 'sv' | 'fi' {
  if (locale === 'sv' || locale === 'fi') return locale;
  return 'en';
}

/**
 * Renders the self-service password-reset email — sent by better-auth's
 * `sendResetPassword` callback when a user requests a reset themselves.
 */
export function renderPasswordResetEmail(args: SendPasswordResetArgs): RenderedEmail {
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Återställ ditt TaidoHub-lösenord',
        body:
          `Hej!\n\n` +
          `Vi fick en begäran om att återställa lösenordet för ditt TaidoHub-konto. ` +
          `Öppna länken nedan för att välja ett nytt lösenord:\n\n` +
          `${args.resetUrl}\n\n` +
          `Länken slutar gälla om 1 timme.\n\n` +
          `Om du inte begärde detta kan du ignorera meddelandet — ditt lösenord ändras inte.`,
      };
    case 'fi':
      return {
        subject: 'Palauta TaidoHub-salasanasi',
        body:
          `Hei!\n\n` +
          `Saimme pyynnön palauttaa TaidoHub-tilisi salasana. ` +
          `Avaa alla oleva linkki valitaksesi uuden salasanan:\n\n` +
          `${args.resetUrl}\n\n` +
          `Linkki vanhenee tunnin kuluttua.\n\n` +
          `Jos et pyytänyt tätä, voit jättää viestin huomiotta — salasanasi ei muutu.`,
      };
    default:
      return {
        subject: 'Reset your TaidoHub password',
        body:
          `Hi,\n\n` +
          `We received a request to reset the password for your TaidoHub account. ` +
          `Open the link below to choose a new password:\n\n` +
          `${args.resetUrl}\n\n` +
          `This link expires in 1 hour.\n\n` +
          `If you didn't request this, you can ignore this message — your password won't change.`,
      };
  }
}
```

- [ ] **Step 4: Create the admin-triggered password-reset template**

Create `apps/backend/src/infrastructure/email/templates/admin-password-reset.template.ts`:

```ts
import type { SendAdminPasswordResetArgs } from '../email.types.js';
import type { RenderedEmail } from './invite.template.js';

function normaliseLocale(locale: string): 'en' | 'sv' | 'fi' {
  if (locale === 'sv' || locale === 'fi') return locale;
  return 'en';
}

/**
 * Renders the admin-triggered password-reset email — sent when a sysadmin
 * uses "Send password reset" from the user form. Mentions the admin by name
 * so the recipient knows it was deliberate, not a phishing attempt.
 */
export function renderAdminPasswordResetEmail(
  args: SendAdminPasswordResetArgs,
): RenderedEmail {
  const admin = args.adminName ?? 'a system administrator';
  switch (normaliseLocale(args.locale)) {
    case 'sv':
      return {
        subject: 'Ditt TaidoHub-lösenord har återställts',
        body:
          `Hej!\n\n` +
          `${admin} har påbörjat en lösenordsåterställning för ditt TaidoHub-konto. ` +
          `Öppna länken nedan för att välja ett nytt lösenord:\n\n` +
          `${args.resetUrl}\n\n` +
          `Länken slutar gälla om 1 timme.\n\n` +
          `Om du har frågor, kontakta administratören som skickade detta.`,
      };
    case 'fi':
      return {
        subject: 'TaidoHub-salasanasi on palautettu',
        body:
          `Hei!\n\n` +
          `${admin} on aloittanut salasanan palautuksen TaidoHub-tilillesi. ` +
          `Avaa alla oleva linkki valitaksesi uuden salasanan:\n\n` +
          `${args.resetUrl}\n\n` +
          `Linkki vanhenee tunnin kuluttua.\n\n` +
          `Jos sinulla on kysyttävää, ota yhteyttä viestin lähettäneeseen ylläpitäjään.`,
      };
    default:
      return {
        subject: 'Your TaidoHub password has been reset',
        body:
          `Hi,\n\n` +
          `${admin} has started a password reset for your TaidoHub account. ` +
          `Open the link below to choose a new password:\n\n` +
          `${args.resetUrl}\n\n` +
          `This link expires in 1 hour.\n\n` +
          `If you have questions, contact the administrator who sent this.`,
      };
  }
}
```

- [ ] **Step 5: Add the failing template test**

Create `apps/backend/src/infrastructure/email/templates/templates.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { renderAdminPasswordResetEmail } from './admin-password-reset.template.js';
import { renderInviteEmail } from './invite.template.js';
import { renderPasswordResetEmail } from './password-reset.template.js';

describe('renderInviteEmail', () => {
  const base = {
    to: 'new@example.com',
    setPasswordUrl: 'http://localhost:5173/set-password?token=abc',
    inviterName: 'Ada',
  };

  for (const locale of ['en', 'sv', 'fi']) {
    it(`renders a non-empty subject + body containing the URL for locale=${locale}`, () => {
      const out = renderInviteEmail({ ...base, locale });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.body).toContain(base.setPasswordUrl);
    });
  }

  it('falls back to English for an unknown locale', () => {
    const en = renderInviteEmail({ ...base, locale: 'en' });
    const unknown = renderInviteEmail({ ...base, locale: 'de' });
    expect(unknown.subject).toBe(en.subject);
  });

  it('uses a generic inviter when inviterName is null', () => {
    const out = renderInviteEmail({ ...base, locale: 'en', inviterName: null });
    expect(out.body).toContain('a system administrator');
  });
});

describe('renderPasswordResetEmail', () => {
  const base = { to: 'u@example.com', resetUrl: 'http://localhost:5173/set-password?token=xyz' };

  for (const locale of ['en', 'sv', 'fi']) {
    it(`renders a non-empty subject + body containing the URL for locale=${locale}`, () => {
      const out = renderPasswordResetEmail({ ...base, locale });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.body).toContain(base.resetUrl);
    });
  }

  it('falls back to English for an unknown locale', () => {
    const en = renderPasswordResetEmail({ ...base, locale: 'en' });
    const unknown = renderPasswordResetEmail({ ...base, locale: 'xx' });
    expect(unknown.subject).toBe(en.subject);
  });
});

describe('renderAdminPasswordResetEmail', () => {
  const base = {
    to: 'u@example.com',
    resetUrl: 'http://localhost:5173/set-password?token=zzz',
    adminName: 'Grace',
  };

  for (const locale of ['en', 'sv', 'fi']) {
    it(`renders a non-empty subject + body containing the URL for locale=${locale}`, () => {
      const out = renderAdminPasswordResetEmail({ ...base, locale });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.body.length).toBeGreaterThan(0);
      expect(out.body).toContain(base.resetUrl);
    });
  }

  it('falls back to English for an unknown locale', () => {
    const en = renderAdminPasswordResetEmail({ ...base, locale: 'en' });
    const unknown = renderAdminPasswordResetEmail({ ...base, locale: 'qq' });
    expect(unknown.subject).toBe(en.subject);
  });

  it('uses a generic admin when adminName is null', () => {
    const out = renderAdminPasswordResetEmail({ ...base, locale: 'en', adminName: null });
    expect(out.body).toContain('a system administrator');
  });
});
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter backend test
```

Expected: the `templates.spec.ts` suite passes (3 `describe` blocks). Implementation was written alongside the tests in this config-heavy task; if it fails, fix the template before proceeding.

- [ ] **Step 7: Commit**

```
git add apps/backend/src/infrastructure/email/email.types.ts apps/backend/src/infrastructure/email/templates/invite.template.ts apps/backend/src/infrastructure/email/templates/password-reset.template.ts apps/backend/src/infrastructure/email/templates/admin-password-reset.template.ts apps/backend/src/infrastructure/email/templates/templates.spec.ts
git commit -m "feat(backend): email service interface + plain-text templates"
```

---

### Task 5: ConsoleEmailService + EmailModule

**Files:**
- Create: `apps/backend/src/infrastructure/email/console-email.service.ts`
- Create: `apps/backend/src/infrastructure/email/email.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/infrastructure/email/console-email.service.spec.ts`

- [ ] **Step 1: Add the failing test**

Create `apps/backend/src/infrastructure/email/console-email.service.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleEmailService } from './console-email.service.js';

describe('ConsoleEmailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the set-password URL when sending an invite', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new ConsoleEmailService();
    await service.sendInvite({
      to: 'new@example.com',
      locale: 'en',
      setPasswordUrl: 'http://localhost:5173/set-password?token=abc',
      inviterName: 'Ada',
    });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('http://localhost:5173/set-password?token=abc');
    expect(output).toContain('new@example.com');
  });

  it('logs the reset URL when sending a self-service reset', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new ConsoleEmailService();
    await service.sendPasswordReset({
      to: 'u@example.com',
      locale: 'en',
      resetUrl: 'http://localhost:5173/set-password?token=xyz',
    });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('http://localhost:5173/set-password?token=xyz');
  });

  it('logs the reset URL when sending an admin-triggered reset', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new ConsoleEmailService();
    await service.sendAdminPasswordReset({
      to: 'u@example.com',
      locale: 'en',
      resetUrl: 'http://localhost:5173/set-password?token=zzz',
      adminName: 'Grace',
    });
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('http://localhost:5173/set-password?token=zzz');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter backend test
```

Expected: `console-email.service.spec.ts` fails to compile/run because `./console-email.service.js` does not exist yet.

- [ ] **Step 3: Create `ConsoleEmailService`**

Create `apps/backend/src/infrastructure/email/console-email.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';

import {
  type EmailService,
  type SendAdminPasswordResetArgs,
  type SendInviteArgs,
  type SendPasswordResetArgs,
} from './email.types.js';
import { renderAdminPasswordResetEmail } from './templates/admin-password-reset.template.js';
import { renderInviteEmail } from './templates/invite.template.js';
import { renderPasswordResetEmail } from './templates/password-reset.template.js';

/**
 * v1 `EmailService` — renders each template and writes a single parseable
 * line plus the full subject/body to stdout. The parseable line lets
 * integration tests grep the set-password URL out of captured output
 * (see the invitation-flow e2e spec).
 */
@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  async sendInvite(args: SendInviteArgs): Promise<void> {
    const rendered = renderInviteEmail(args);
    console.log(`[email] invite to=${args.to} url=${args.setPasswordUrl}`);
    console.log(`[email] subject: ${rendered.subject}`);
    console.log(rendered.body);
    this.logger.log(`Invite email rendered for ${args.to}`);
    return Promise.resolve();
  }

  async sendPasswordReset(args: SendPasswordResetArgs): Promise<void> {
    const rendered = renderPasswordResetEmail(args);
    console.log(`[email] password-reset to=${args.to} url=${args.resetUrl}`);
    console.log(`[email] subject: ${rendered.subject}`);
    console.log(rendered.body);
    this.logger.log(`Password-reset email rendered for ${args.to}`);
    return Promise.resolve();
  }

  async sendAdminPasswordReset(args: SendAdminPasswordResetArgs): Promise<void> {
    const rendered = renderAdminPasswordResetEmail(args);
    console.log(`[email] admin-password-reset to=${args.to} url=${args.resetUrl}`);
    console.log(`[email] subject: ${rendered.subject}`);
    console.log(rendered.body);
    this.logger.log(`Admin password-reset email rendered for ${args.to}`);
    return Promise.resolve();
  }
}
```

- [ ] **Step 4: Create `EmailModule`**

Create `apps/backend/src/infrastructure/email/email.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';

import { ConsoleEmailService } from './console-email.service.js';
import { EMAIL_SERVICE } from './email.types.js';

/**
 * Global email module. Registers the concrete `ConsoleEmailService` as a
 * class provider and aliases it under the `EMAIL_SERVICE` token via
 * `useExisting`, so callers depend only on the interface token while
 * better-auth's factory (which needs the concrete instance) can also reach
 * it. Swapping in a real provider later means changing only `useClass` /
 * `useExisting` here.
 */
@Global()
@Module({
  providers: [
    ConsoleEmailService,
    { provide: EMAIL_SERVICE, useExisting: ConsoleEmailService },
  ],
  exports: [ConsoleEmailService, EMAIL_SERVICE],
})
export class EmailModule {}
```

- [ ] **Step 5: Register `EmailModule` in `AppModule`**

In `apps/backend/src/app.module.ts`, add the import and the module entry. Add this import alongside the other infrastructure imports:

```ts
import { EmailModule } from './infrastructure/email/email.module.js';
```

Then add `EmailModule` to the `imports` array. It must appear before `InfraAuthModule` so the `EMAIL_SERVICE` token is resolvable when the better-auth factory injects it (Task 13). The resulting `imports` array:

```ts
  imports: [
    AppConfigModule,
    DatabaseModule,
    EmailModule,
    InfraAuthModule,
    AbilityModule,
    AuthDocsModule,
    HealthModule,
    UsersModule,
    OrganisationsModule,
    MembershipsModule,
    AuditLogModule,
  ],
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter backend test
```

Expected: `console-email.service.spec.ts` passes (3 tests), and the rest of the backend suite stays green.

- [ ] **Step 7: Commit**

```
git add apps/backend/src/infrastructure/email/console-email.service.ts apps/backend/src/infrastructure/email/email.module.ts apps/backend/src/infrastructure/email/console-email.service.spec.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): console email service + global email module"
```

---

### Task 6: VerificationTokenService

**Files:**
- Create: `apps/backend/src/infrastructure/auth/verification-token.service.ts`
- Modify: `apps/backend/src/infrastructure/auth/auth.module.ts`
- Test: `apps/backend/src/infrastructure/auth/verification-token.service.e2e.spec.ts`

- [ ] **Step 1: Add the failing integration test**

This service is thin glue over Drizzle; an integration spec against a real DB is more honest than a query-builder mock. Create `apps/backend/src/infrastructure/auth/verification-token.service.e2e.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, hasDatabase } from '../../../test/helpers/app-factory.js';

import { VerificationTokenService } from './verification-token.service.js';

describe.skipIf(!hasDatabase())('VerificationTokenService (integration)', () => {
  let close: () => Promise<void>;
  let tokens: VerificationTokenService;

  beforeAll(async () => {
    const built = await buildTestApp();
    close = built.close;
    tokens = built.app.get(VerificationTokenService);
  });

  afterAll(async () => {
    await close();
  });

  it('issues a token that consume resolves to its identifier exactly once', async () => {
    const identifier = `test:${Date.now()}-a`;
    const value = await tokens.issueToken(identifier, 1);
    expect(value).toMatch(/^[0-9a-f]{64}$/);

    const first = await tokens.consumeToken(value);
    expect(first).toEqual({ identifier });

    const second = await tokens.consumeToken(value);
    expect(second).toBeNull();
  });

  it('invalidates the previous token when re-issuing for the same identifier', async () => {
    const identifier = `test:${Date.now()}-b`;
    const firstValue = await tokens.issueToken(identifier, 1);
    const secondValue = await tokens.issueToken(identifier, 1);
    expect(secondValue).not.toBe(firstValue);

    expect(await tokens.consumeToken(firstValue)).toBeNull();
    expect(await tokens.consumeToken(secondValue)).toEqual({ identifier });
  });

  it('reports hasUnexpiredToken true after issue and false after consume', async () => {
    const identifier = `test:${Date.now()}-c`;
    const value = await tokens.issueToken(identifier, 1);
    expect(await tokens.hasUnexpiredToken(identifier)).toBe(true);

    await tokens.consumeToken(value);
    expect(await tokens.hasUnexpiredToken(identifier)).toBe(false);
  });

  it('returns null for an unknown token value', async () => {
    expect(await tokens.consumeToken('deadbeef-not-a-real-token')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter backend test
```

Expected: the suite fails to import `./verification-token.service.js` (file does not exist). If no database is available the suite is `skipIf`-skipped, but the file still must compile, so the missing-module failure surfaces either way.

- [ ] **Step 3: Create `VerificationTokenService`**

Create `apps/backend/src/infrastructure/auth/verification-token.service.ts`:

```ts
import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../database/client.js';
import { verification } from '../database/schema/index.js';

/**
 * Issues and consumes one-time tokens, stored in better-auth's `verification`
 * table. Used by the invitation and admin-password-reset flows — each token's
 * `identifier` carries a prefix (`invite:<userId>` / `admin-reset:<userId>`)
 * so the consuming endpoint can route on it.
 */
@Injectable()
export class VerificationTokenService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Issue a fresh token for `identifier`, replacing any existing tokens for
   * the same identifier (so an invitee always has exactly one live link).
   * Returns the opaque token value to embed in the email URL.
   */
  async issueToken(identifier: string, ttlHours: number): Promise<string> {
    const value = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
    await this.db.transaction(async (tx) => {
      await tx.delete(verification).where(eq(verification.identifier, identifier));
      await tx.insert(verification).values({
        id: randomUUID(),
        identifier,
        value,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    });
    return value;
  }

  /**
   * Consume a token by value: returns its `identifier` and deletes the row on
   * success. Returns null when the value is unknown or already expired (an
   * expired row is also deleted as a side-effect of consumption).
   */
  async consumeToken(value: string): Promise<{ identifier: string } | null> {
    const rows = await this.db
      .select()
      .from(verification)
      .where(eq(verification.value, value))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    if (row.expiresAt.getTime() < Date.now()) {
      await this.db.delete(verification).where(eq(verification.id, row.id));
      return null;
    }

    await this.db.delete(verification).where(eq(verification.id, row.id));
    return { identifier: row.identifier };
  }

  /** True iff `identifier` currently has a token that has not yet expired. */
  async hasUnexpiredToken(identifier: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(verification)
      .where(eq(verification.identifier, identifier));
    const now = Date.now();
    return rows.some((r) => r.expiresAt.getTime() > now);
  }
}
```

- [ ] **Step 4: Register the service in `InfraAuthModule`**

In `apps/backend/src/infrastructure/auth/auth.module.ts`, add the import:

```ts
import { VerificationTokenService } from './verification-token.service.js';
```

Then add `VerificationTokenService` to both `providers` and `exports`. The resulting `@Module` decorator:

```ts
@Global()
@Module({
  providers: [
    betterAuthProvider,
    AuthGuard,
    VerificationTokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [betterAuthProvider, AuthGuard, VerificationTokenService],
})
export class InfraAuthModule {}
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter backend test
```

Expected: with a database available, the `VerificationTokenService (integration)` suite passes (4 tests). Without a database it is skipped, but the file compiles and the rest of the suite stays green.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/infrastructure/auth/verification-token.service.ts apps/backend/src/infrastructure/auth/auth.module.ts apps/backend/src/infrastructure/auth/verification-token.service.e2e.spec.ts
git commit -m "feat(backend): one-time verification token service"
```

---

### Task 7: UsersRepository lifecycle methods

**Files:**
- Modify: `apps/backend/src/modules/users/users.repository.ts`

- [ ] **Step 1: Add `insert`, `deactivate`, `reactivate`, `delete`**

In `apps/backend/src/modules/users/users.repository.ts`, add the four methods below inside the `UsersRepository` class, after the existing `countActiveSysadmins` method (before the closing `}` of the class):

```ts
  /**
   * Insert a new user row. Used by the invitation flow — the row has no
   * credential `account` until the invitee sets a password. The `set` object
   * omits absent optional keys to satisfy `exactOptionalPropertyTypes`.
   */
  async insert(
    values: {
      id: string;
      email: string;
      name?: string;
      role: string;
      emailVerified: boolean;
    },
    tx?: DrizzleExecutor,
  ): Promise<DbUser> {
    const conn = tx ?? this.db;
    const now = new Date();
    const set: Record<string, unknown> = {
      id: values.id,
      email: values.email,
      role: values.role,
      emailVerified: values.emailVerified,
      createdAt: now,
      updatedAt: now,
    };
    if (values.name !== undefined) set.name = values.name;
    const rows = await conn.insert(user).values(set).returning();
    const row = rows[0];
    if (!row) {
      throw new Error('UsersRepository.insert returned no row.');
    }
    return row;
  }

  /** Soft-deactivate a user; returns the updated row or null if not found. */
  async deactivate(id: string, tx?: DrizzleExecutor): Promise<DbUser | null> {
    const conn = tx ?? this.db;
    const now = new Date();
    const rows = await conn
      .update(user)
      .set({ deactivatedAt: now, updatedAt: now })
      .where(eq(user.id, id))
      .returning();
    return rows[0] ?? null;
  }

  /** Clear a user's deactivation; returns the updated row or null if missing. */
  async reactivate(id: string, tx?: DrizzleExecutor): Promise<DbUser | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(user)
      .set({ deactivatedAt: null, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    return rows[0] ?? null;
  }

  /** Hard-delete a user row. FK cascades remove sessions/accounts/memberships. */
  async delete(id: string, tx?: DrizzleExecutor): Promise<void> {
    const conn = tx ?? this.db;
    await conn.delete(user).where(eq(user.id, id));
  }
```

- [ ] **Step 2: Verify with typecheck — expect PASS**

```
pnpm --filter backend typecheck
```

Expected: no errors. These four repository methods carry no branching logic of their own — they are exercised through `UsersService` specs in Tasks 8–10. There is no separate repository spec file in this module, so this task is implement + typecheck + commit; no standalone test is added.

- [ ] **Step 3: Commit**

```
git add apps/backend/src/modules/users/users.repository.ts
git commit -m "feat(backend): user repository insert + lifecycle mutations"
```

---

### Task 8: UsersService.deactivate + reactivate

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

In `apps/backend/src/modules/users/users.service.spec.ts`, first extend the `repoStub()` factory so it includes the new repo methods. Replace the existing `repoStub` function with:

```ts
function repoStub() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    countActiveSysadmins: vi.fn(),
    insert: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    delete: vi.fn(),
  } satisfies Record<keyof UsersRepository, ReturnType<typeof vi.fn>>;
}
```

Next, the service constructor gains new dependencies. Add their imports to the top of the spec file:

```ts
import { ConfigService } from '@nestjs/config';

import { BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { EMAIL_SERVICE } from '../../infrastructure/email/email.types.js';
```

Add these shared stub factories immediately after `auditStub`:

```ts
function tokensStub() {
  return {
    issueToken: vi.fn().mockResolvedValue('tok-123'),
    consumeToken: vi.fn(),
    hasUnexpiredToken: vi.fn().mockResolvedValue(false),
  };
}

function emailStub() {
  return {
    sendInvite: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendAdminPasswordReset: vi.fn().mockResolvedValue(undefined),
  };
}

function configStub() {
  return {
    get: vi.fn((key: string) => {
      const map: Record<string, unknown> = {
        INVITE_TOKEN_TTL_HOURS: 48,
        RESET_TOKEN_TTL_HOURS: 1,
        WEB_ORIGIN: 'http://localhost:5173',
      };
      return map[key];
    }),
  };
}
```

Then replace the `makeService` helper so it wires the new providers. The new signature accepts optional `tokens`/`email`/`config` stubs so later tasks can pass custom ones:

```ts
async function makeService(
  repo: ReturnType<typeof repoStub>,
  audit: ReturnType<typeof auditStub> = auditStub(),
  tokens: ReturnType<typeof tokensStub> = tokensStub(),
  email: ReturnType<typeof emailStub> = emailStub(),
  config: ReturnType<typeof configStub> = configStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      UsersService,
      AbilityFactory,
      UsersAbilityRules,
      { provide: OrganisationsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: AuditLogAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: MembershipsAbilityRules, useValue: { contributeTo: () => {} } },
      { provide: UsersRepository, useValue: repo },
      { provide: AuditLogService, useValue: audit },
      { provide: DRIZZLE, useValue: fakeDb },
      { provide: VerificationTokenService, useValue: tokens },
      { provide: EMAIL_SERVICE, useValue: email },
      { provide: BETTER_AUTH, useValue: {} },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();
  return module.get(UsersService);
}
```

Append the following `describe` block to the end of the spec file:

```ts
describe('UsersService — deactivate / reactivate', () => {
  it('deactivates an active user and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'u-target' });
    repo.deactivate.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      deactivatedAt: new Date('2026-05-21T00:00:00.000Z'),
    });
    const audit = auditStub();
    const service = await makeService(repo, audit);

    const out = await service.deactivate('u-target', sysadmin);

    expect(out.deactivatedAt).toBe('2026-05-21T00:00:00.000Z');
    expect(repo.deactivate).toHaveBeenCalledWith('u-target', FAKE_TX);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'deactivate',
      userId: sysadmin.id,
    });
  });

  it('rejects deactivating yourself (SELF_DEACTIVATE)', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.deactivate(sysadmin.id, sysadmin)).rejects.toThrow(ConflictException);
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.deactivate('missing', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('rejects deactivating an already-deactivated user (ALREADY_DEACTIVATED)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const service = await makeService(repo);
    await expect(service.deactivate('u-target', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('rejects deactivating the last active sysadmin (LAST_SYSADMIN)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'other-sysadmin',
      role: 'sysadmin',
    });
    repo.countActiveSysadmins.mockResolvedValue(1);
    const service = await makeService(repo);
    await expect(service.deactivate('other-sysadmin', sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('reactivates a deactivated user and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    repo.reactivate.mockResolvedValue({ ...USER_ROW, id: 'u-target', deactivatedAt: null });
    const audit = auditStub();
    const service = await makeService(repo, audit);

    const out = await service.reactivate('u-target', sysadmin);

    expect(out.deactivatedAt).toBeNull();
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'reactivate',
    });
  });

  it('rejects reactivating an already-active user (ALREADY_ACTIVE)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'u-target', deactivatedAt: null });
    const service = await makeService(repo);
    await expect(service.reactivate('u-target', sysadmin)).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter backend test
```

Expected: `users.service.spec.ts` fails — `service.deactivate` / `service.reactivate` are not functions, and the new DI tokens are not yet referenced by the service constructor.

- [ ] **Step 3: Extend the service constructor + imports**

In `apps/backend/src/modules/users/users.service.ts`, add these imports alongside the existing ones:

```ts
import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { type Env } from '../../config/env.schema.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../infrastructure/email/email.types.js';
```

> `randomUUID` is used by `invite` in Task 10; importing it now keeps Task 10 a pure addition.

Replace the constructor with:

```ts
  constructor(
    private readonly repo: UsersRepository,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditLogService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService<Env, true>,
    private readonly tokens: VerificationTokenService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}
```

> The spec wires a `{ provide: BETTER_AUTH, useValue: {} }` provider purely to keep its provider list a superset of the service's real dependency graph; the service itself does not inject `BETTER_AUTH`. That extra provider is harmless — Nest ignores providers nothing depends on.

- [ ] **Step 4: Add `deactivate` and `reactivate`**

In `apps/backend/src/modules/users/users.service.ts`, add the two methods below after the `update` method and before the private `assertCan` method:

```ts
  /** Soft-deactivate a user. Self-deactivation and last-sysadmin are blocked. */
  async deactivate(id: string, adminUser: AuthenticatedUser): Promise<User> {
    this.assertCan(adminUser, 'manage');

    if (id === adminUser.id) {
      throw new ConflictException({
        error: { code: 'SELF_DEACTIVATE', message: 'You cannot deactivate yourself.' },
      });
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    if (existing.deactivatedAt !== null) {
      throw new ConflictException({
        error: { code: 'ALREADY_DEACTIVATED', message: 'This user is already deactivated.' },
      });
    }

    return this.db.transaction(async (tx) => {
      if (existing.role === 'sysadmin') {
        const remaining = await this.repo.countActiveSysadmins(tx);
        if (remaining <= 1) {
          throw new ConflictException({
            error: {
              code: 'LAST_SYSADMIN',
              message: 'Cannot deactivate the last active sysadmin.',
            },
          });
        }
      }
      const row = await this.repo.deactivate(id, tx);
      if (!row) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
        });
      }
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'deactivate',
        userId: adminUser.id,
        before: this.toApi(existing),
        after,
      });
      return after;
    });
  }

  /** Clear a user's deactivation. */
  async reactivate(id: string, adminUser: AuthenticatedUser): Promise<User> {
    this.assertCan(adminUser, 'manage');

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    if (existing.deactivatedAt === null) {
      throw new ConflictException({
        error: { code: 'ALREADY_ACTIVE', message: 'This user is already active.' },
      });
    }

    return this.db.transaction(async (tx) => {
      const row = await this.repo.reactivate(id, tx);
      if (!row) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
        });
      }
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'reactivate',
        userId: adminUser.id,
        before: this.toApi(existing),
        after,
      });
      return after;
    });
  }
```

- [ ] **Step 5: Run the tests — expect PASS**

```
pnpm --filter backend test
```

Expected: the `UsersService — deactivate / reactivate` block passes (7 tests); all pre-existing `users.service.spec.ts` tests stay green with the widened `makeService`.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(backend): user deactivate + reactivate with self-protection"
```

---

### Task 9: UsersService.delete

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append this `describe` block to the end of `apps/backend/src/modules/users/users.service.spec.ts`:

```ts
describe('UsersService — delete', () => {
  it('hard-deletes a user and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'u-target' });
    repo.delete.mockResolvedValue(undefined);
    const audit = auditStub();
    const service = await makeService(repo, audit);

    await service.delete('u-target', sysadmin);

    expect(repo.delete).toHaveBeenCalledWith('u-target', FAKE_TX);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'delete',
      userId: sysadmin.id,
    });
    expect(audit.record.mock.calls[0]?.[0]?.after).toBeNull();
  });

  it('rejects deleting yourself (SELF_DELETE)', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.delete(sysadmin.id, sysadmin)).rejects.toThrow(ConflictException);
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.delete('missing', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('rejects deleting the last active sysadmin (LAST_SYSADMIN)', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'other-sysadmin',
      role: 'sysadmin',
      deactivatedAt: null,
    });
    repo.countActiveSysadmins.mockResolvedValue(1);
    const service = await makeService(repo);
    await expect(service.delete('other-sysadmin', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('allows deleting a deactivated sysadmin when another active one remains', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'old-sysadmin',
      role: 'sysadmin',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    repo.delete.mockResolvedValue(undefined);
    const service = await makeService(repo);
    await expect(service.delete('old-sysadmin', sysadmin)).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith('old-sysadmin', FAKE_TX);
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter backend test
```

Expected: `users.service.spec.ts` fails — `service.delete` is not a function.

- [ ] **Step 3: Add `delete`**

In `apps/backend/src/modules/users/users.service.ts`, add the method below after `reactivate` and before the private `assertCan` method:

```ts
  /**
   * Hard-delete a user. FK cascades remove their sessions, accounts, and
   * memberships. Blocked for self and for the last active sysadmin. A
   * deactivated sysadmin can be deleted as long as another active one exists.
   */
  async delete(id: string, adminUser: AuthenticatedUser): Promise<void> {
    this.assertCan(adminUser, 'manage');

    if (id === adminUser.id) {
      throw new ConflictException({
        error: { code: 'SELF_DELETE', message: 'You cannot delete yourself.' },
      });
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }

    await this.db.transaction(async (tx) => {
      if (existing.role === 'sysadmin' && existing.deactivatedAt === null) {
        const remaining = await this.repo.countActiveSysadmins(tx);
        if (remaining <= 1) {
          throw new ConflictException({
            error: {
              code: 'LAST_SYSADMIN',
              message: 'Cannot delete the last active sysadmin.',
            },
          });
        }
      }
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'delete',
        userId: adminUser.id,
        before: this.toApi(existing),
        after: null,
      });
      await this.repo.delete(id, tx);
    });
  }
```

- [ ] **Step 4: Run the tests — expect PASS**

```
pnpm --filter backend test
```

Expected: the `UsersService — delete` block passes (5 tests); the full backend suite stays green.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(backend): user hard-delete with self-protection"
```

---

### Task 10: UsersService.invite

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append this `describe` block to the end of `apps/backend/src/modules/users/users.service.spec.ts`:

```ts
describe('UsersService — invite', () => {
  it('creates a new user, emits a create audit event, and sends an invite email', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue(null);
    repo.insert.mockResolvedValue({
      ...USER_ROW,
      id: 'u-new',
      email: 'new@example.com',
      name: 'New User',
      emailVerified: false,
    });
    const audit = auditStub();
    const tokens = tokensStub();
    const email = emailStub();
    const service = await makeService(repo, audit, tokens, email);

    const out = await service.invite({ email: 'new@example.com', name: 'New User' }, sysadmin);

    expect(out.email).toBe('new@example.com');
    expect(repo.insert).toHaveBeenCalled();
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      action: 'create',
      userId: sysadmin.id,
    });
    expect(tokens.issueToken).toHaveBeenCalledWith('invite:u-new', 48);
    expect(email.sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        setPasswordUrl: 'http://localhost:5173/set-password?token=tok-123',
        inviterName: sysadmin.name,
      }),
    );
  });

  it('re-sends the invite for a pending user without creating a new row', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-pending',
      email: 'pending@example.com',
      deactivatedAt: null,
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(true);
    const email = emailStub();
    const service = await makeService(repo, auditStub(), tokens, email);

    const out = await service.invite({ email: 'pending@example.com' }, sysadmin);

    expect(out.id).toBe('u-pending');
    expect(repo.insert).not.toHaveBeenCalled();
    expect(tokens.issueToken).toHaveBeenCalledWith('invite:u-pending', 48);
    expect(email.sendInvite).toHaveBeenCalled();
  });

  it('rejects inviting an email already in use by an active user (EMAIL_IN_USE)', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-active',
      email: 'active@example.com',
      deactivatedAt: null,
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(false);
    const service = await makeService(repo, auditStub(), tokens);

    await expect(service.invite({ email: 'active@example.com' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects inviting an email belonging to a deactivated user (EMAIL_DEACTIVATED)', async () => {
    const repo = repoStub();
    repo.findByEmail.mockResolvedValue({
      ...USER_ROW,
      id: 'u-deact',
      email: 'deact@example.com',
      deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const tokens = tokensStub();
    tokens.hasUnexpiredToken.mockResolvedValue(false);
    const service = await makeService(repo, auditStub(), tokens);

    await expect(service.invite({ email: 'deact@example.com' }, sysadmin)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects a non-sysadmin caller', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.invite({ email: 'x@example.com' }, plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter backend test
```

Expected: `users.service.spec.ts` fails — `service.invite` is not a function.

- [ ] **Step 3: Add `invite`**

In `apps/backend/src/modules/users/users.service.ts`, add the method below after `delete` and before the private `assertCan` method. It uses the `config`, `tokens`, `email`, and `randomUUID` wired/imported in Task 8:

```ts
  /**
   * Invite a new user by email. Three branches:
   * - email belongs to an active user → 409 EMAIL_IN_USE
   * - email belongs to a deactivated user → 409 EMAIL_DEACTIVATED
   * - email belongs to a still-pending invitee (has an unexpired invite
   *   token) → re-issue the token and re-send the email, no new row
   * Otherwise inserts a fresh `role: 'user'` row, issues an invite token, and
   * sends the invite email. The set-password URL points at the first
   * configured WEB_ORIGIN.
   */
  async invite(input: InviteUserInput, adminUser: AuthenticatedUser): Promise<User> {
    this.assertCan(adminUser, 'manage');

    const webOrigin = this.config
      .get('WEB_ORIGIN', { infer: true })
      .split(',')[0]
      ?.trim();
    if (!webOrigin) {
      throw new Error('WEB_ORIGIN is not configured.');
    }
    const ttl = this.config.get('INVITE_TOKEN_TTL_HOURS', { infer: true });

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      const pending = await this.tokens.hasUnexpiredToken(`invite:${existing.id}`);
      if (pending) {
        const token = await this.tokens.issueToken(`invite:${existing.id}`, ttl);
        await this.email.sendInvite({
          to: existing.email,
          locale: existing.locale,
          setPasswordUrl: `${webOrigin}/set-password?token=${token}`,
          inviterName: adminUser.name,
        });
        return this.toApi(existing);
      }
      if (existing.deactivatedAt !== null) {
        throw new ConflictException({
          error: {
            code: 'EMAIL_DEACTIVATED',
            message: 'A deactivated user already has this email. Reactivate them instead.',
          },
        });
      }
      throw new ConflictException({
        error: { code: 'EMAIL_IN_USE', message: 'A user with this email already exists.' },
      });
    }

    const id = randomUUID();
    const row = await this.db.transaction(async (tx) => {
      const created = await this.repo.insert(
        {
          id,
          email: input.email,
          ...(input.name !== undefined && { name: input.name }),
          role: 'user',
          emailVerified: false,
        },
        tx,
      );
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'create',
        userId: adminUser.id,
        before: null,
        after: this.toApi(created),
      });
      return created;
    });

    const token = await this.tokens.issueToken(`invite:${id}`, ttl);
    await this.email.sendInvite({
      to: input.email,
      locale: 'en',
      setPasswordUrl: `${webOrigin}/set-password?token=${token}`,
      inviterName: adminUser.name,
    });

    return this.toApi(row);
  }
```

Also add `InviteUserInput` to the type import from `@repo/contracts/users` at the top of `users.service.ts`. The import becomes:

```ts
import {
  type InviteUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type Role,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';
```

- [ ] **Step 4: Run the tests — expect PASS**

```
pnpm --filter backend test
```

Expected: the `UsersService — invite` block passes (5 tests); the full backend suite stays green.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(backend): invite user by email with re-invite handling"
```

---

### Task 11: UsersService.sendPasswordReset

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append this `describe` block to the end of `apps/backend/src/modules/users/users.service.spec.ts`:

```ts
describe('UsersService — sendPasswordReset', () => {
  it('issues an admin-reset token, sends an email, and emits an audit event', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue({
      ...USER_ROW,
      id: 'u-target',
      email: 'target@example.com',
      locale: 'sv',
    });
    const audit = auditStub();
    const tokens = tokensStub();
    const email = emailStub();
    const service = await makeService(repo, audit, tokens, email);

    await service.sendPasswordReset('u-target', sysadmin);

    expect(tokens.issueToken).toHaveBeenCalledWith('admin-reset:u-target', 1);
    expect(email.sendAdminPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'target@example.com',
        locale: 'sv',
        resetUrl: 'http://localhost:5173/set-password?token=tok-123',
        adminName: sysadmin.name,
      }),
    );
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u-target',
      action: 'password_reset_triggered',
      userId: sysadmin.id,
    });
  });

  it('404s when the user does not exist', async () => {
    const repo = repoStub();
    repo.findById.mockResolvedValue(null);
    const service = await makeService(repo);
    await expect(service.sendPasswordReset('missing', sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a non-sysadmin caller', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(service.sendPasswordReset('u-target', plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter backend test
```

Expected: `users.service.spec.ts` fails — `service.sendPasswordReset` is not a function.

- [ ] **Step 3: Add `sendPasswordReset`**

In `apps/backend/src/modules/users/users.service.ts`, add the method below after `invite` and before the private `assertCan` method:

```ts
  /**
   * Trigger an admin-initiated password reset. Issues an `admin-reset:<id>`
   * token, emails the user a set-password link, and audits the action with
   * the triggering admin recorded in the `after` payload.
   */
  async sendPasswordReset(userId: string, adminUser: AuthenticatedUser): Promise<void> {
    this.assertCan(adminUser, 'manage');

    const target = await this.repo.findById(userId);
    if (!target) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      });
    }

    const webOrigin = this.config
      .get('WEB_ORIGIN', { infer: true })
      .split(',')[0]
      ?.trim();
    if (!webOrigin) {
      throw new Error('WEB_ORIGIN is not configured.');
    }
    const ttl = this.config.get('RESET_TOKEN_TTL_HOURS', { infer: true });

    const token = await this.tokens.issueToken(`admin-reset:${userId}`, ttl);
    await this.email.sendAdminPasswordReset({
      to: target.email,
      locale: target.locale,
      resetUrl: `${webOrigin}/set-password?token=${token}`,
      adminName: adminUser.name,
    });

    await this.db.transaction(async (tx) => {
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: userId,
        action: 'password_reset_triggered',
        userId: adminUser.id,
        before: null,
        after: { triggeredBy: adminUser.id },
      });
    });
  }
```

- [ ] **Step 4: Run the tests — expect PASS**

```
pnpm --filter backend test
```

Expected: the `UsersService — sendPasswordReset` block passes (3 tests); the full backend suite stays green.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(backend): admin-triggered password reset"
```

---

### Task 12: UsersController lifecycle endpoints

**Files:**
- Create: `apps/backend/src/modules/users/dto/invite-user.dto.ts`
- Modify: `apps/backend/src/modules/users/users.controller.ts`

- [ ] **Step 1: Create the invite DTO**

Create `apps/backend/src/modules/users/dto/invite-user.dto.ts`:

```ts
import { InviteUserSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class InviteUserDto extends createZodDto(InviteUserSchema) {}
```

- [ ] **Step 2: Add the lifecycle endpoints to the controller**

Replace the entire contents of `apps/backend/src/modules/users/users.controller.ts` with the version below. The key ordering rule: `@Post('invite')` is declared **before** the `:id` routes so `invite` is not swallowed by the `:id` param matcher.

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { ListUsersResponse, User } from '@repo/contracts/users';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { InviteUserDto } from './dto/invite-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ListUsersResponseDto } from './dto/list-users-response.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiCookieAuth('session')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user.', operationId: 'UsersController_me' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthenticatedUser | undefined): Promise<User> {
    if (!user) {
      // `AuthGuard` should have rejected the request already; defensive only.
      throw new Error('CurrentUser missing on a non-public route.');
    }
    return this.users.findOne(user.id, user);
  }

  @Get()
  @CheckAbility('manage', 'User')
  @ApiEndpoint({
    summary: 'List users — paginated and filterable (sysadmin only).',
    operationId: 'UsersController_list',
    ok: ListUsersResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListUsersResponse> {
    return this.users.list(query, user);
  }

  @Post('invite')
  @CheckAbility('manage', 'User')
  @ApiBody({ type: InviteUserDto })
  @ApiEndpoint({
    summary: 'Invite a new user by email (sysadmin only).',
    operationId: 'UsersController_invite',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '409'],
  })
  invite(
    @Body() body: InviteUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.invite(body, user);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiEndpoint({
    summary: 'Get a single user by id.',
    operationId: 'UsersController_findOne',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.findOne(id, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserDto })
  @ApiEndpoint({
    summary: "Update a user's name or role (sysadmin only).",
    operationId: 'UsersController_update',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.update(id, body, user);
  }

  @Patch(':id/deactivate')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiEndpoint({
    summary: 'Deactivate a user (sysadmin only).',
    operationId: 'UsersController_deactivate',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.deactivate(id, user);
  }

  @Patch(':id/reactivate')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiEndpoint({
    summary: 'Reactivate a deactivated user (sysadmin only).',
    operationId: 'UsersController_reactivate',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.reactivate(id, user);
  }

  @Delete(':id')
  @CheckAbility('manage', 'User')
  @HttpCode(204)
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiNoContentResponse({ description: 'User deleted.' })
  @ApiEndpoint({
    summary: 'Hard-delete a user (sysadmin only).',
    operationId: 'UsersController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.users.delete(id, user);
  }

  @Post(':id/send-password-reset')
  @CheckAbility('manage', 'User')
  @HttpCode(204)
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiNoContentResponse({ description: 'Password-reset email sent.' })
  @ApiEndpoint({
    summary: 'Trigger a password-reset email for a user (sysadmin only).',
    operationId: 'UsersController_sendPasswordReset',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  sendPasswordReset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.users.sendPasswordReset(id, user);
  }
}
```

- [ ] **Step 2: Verify with typecheck — expect PASS**

```
pnpm --filter backend typecheck
```

Expected: no errors. This task is HTTP wiring only — the service-layer logic is fully covered by the specs in Tasks 8–11, so no fake controller unit test is added.

- [ ] **Step 3: Verify the existing suite still passes**

```
pnpm --filter backend test
```

Expected: all pre-existing tests stay green; the new routes do not break controller/e2e coverage.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/modules/users/dto/invite-user.dto.ts apps/backend/src/modules/users/users.controller.ts
git commit -m "feat(backend): user lifecycle controller endpoints"
```

---

### Task 13: Wire better-auth sendResetPassword

**Files:**
- Modify: `apps/backend/src/infrastructure/auth/better-auth.ts`
- Modify: `apps/backend/src/infrastructure/auth/auth.module.ts`

- [ ] **Step 1: Thread `EmailService` into `buildBetterAuth`**

In `apps/backend/src/infrastructure/auth/better-auth.ts`, add the import:

```ts
import { type EmailService } from '../email/email.types.js';
```

Change the function signature from `export function buildBetterAuth(env: Env)` to `export function buildBetterAuth(env: Env, emailService: EmailService)`.

Then replace the `emailAndPassword` block with:

```ts
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // Self-service reset only — admin-triggered resets bypass this callback
      // and go through UsersService.sendPasswordReset directly.
      sendResetPassword: async ({ user, url }): Promise<void> => {
        await emailService.sendPasswordReset({
          to: user.email,
          locale: (user as { locale?: string }).locale ?? 'en',
          resetUrl: url,
        });
      },
    },
```

- [ ] **Step 2: Pass the email service from the DI factory**

In `apps/backend/src/infrastructure/auth/auth.module.ts`, add the import:

```ts
import { EMAIL_SERVICE, type EmailService } from '../email/email.types.js';
```

Then update `betterAuthProvider` to inject `EMAIL_SERVICE` and pass it to `buildBetterAuth`. Replace the provider with:

```ts
const betterAuthProvider: Provider = {
  provide: BETTER_AUTH,
  inject: [ConfigService, EMAIL_SERVICE],
  useFactory: (config: ConfigService<Env, true>, emailService: EmailService) => {
    const backendUrl = config.get('BACKEND_URL', { infer: true });
    const enableSwagger = config.get('ENABLE_SWAGGER', { infer: true });
    const env: Env = {
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      PORT: config.get('PORT', { infer: true }),
      WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
      DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
      DIRECT_URL: config.get('DIRECT_URL', { infer: true }),
      BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
      BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
      SYSADMIN_EMAIL: config.get('SYSADMIN_EMAIL', { infer: true }),
      SYSADMIN_PASSWORD: config.get('SYSADMIN_PASSWORD', { infer: true }),
      INVITE_TOKEN_TTL_HOURS: config.get('INVITE_TOKEN_TTL_HOURS', { infer: true }),
      RESET_TOKEN_TTL_HOURS: config.get('RESET_TOKEN_TTL_HOURS', { infer: true }),
      ...(backendUrl !== undefined ? { BACKEND_URL: backendUrl } : {}),
      ...(enableSwagger !== undefined ? { ENABLE_SWAGGER: enableSwagger } : {}),
    };
    return buildBetterAuth(env, emailService);
  },
};
```

> The `INVITE_TOKEN_TTL_HOURS` / `RESET_TOKEN_TTL_HOURS` keys are added to the reconstructed `env` object because `Env` (Task 3) now requires them; omitting them would be a type error.

- [ ] **Step 3: Verify with typecheck — expect PASS**

```
pnpm --filter backend typecheck
```

Expected: no errors. `EmailModule` is registered before `InfraAuthModule` in `AppModule` (Task 5), so the `EMAIL_SERVICE` token resolves for this factory.

- [ ] **Step 4: Verify the existing suite still passes**

```
pnpm --filter backend test
```

Expected: all pre-existing auth and e2e tests stay green.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/infrastructure/auth/better-auth.ts apps/backend/src/infrastructure/auth/auth.module.ts
git commit -m "feat(backend): wire better-auth sendResetPassword to email service"
```

---

### Task 14: AuthService.setInitialPassword + endpoint

**Files:**
- Create: `apps/backend/src/modules/auth/auth.service.ts`
- Create: `apps/backend/src/modules/auth/dto/set-initial-password.dto.ts`
- Modify: `apps/backend/src/modules/auth/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Test: `apps/backend/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

Create `apps/backend/src/modules/auth/auth.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE } from '../../infrastructure/database/client.js';

import { AuthService } from './auth.service.js';

const FAKE_TX = { __tx: true } as any;

const TARGET_USER = {
  id: 'u-target',
  email: 'target@example.com',
  name: 'Target',
  emailVerified: false,
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null as Date | null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function tokensStub() {
  return {
    issueToken: vi.fn(),
    consumeToken: vi.fn(),
    hasUnexpiredToken: vi.fn(),
  };
}

function authStub() {
  return {
    $context: Promise.resolve({ password: { hash: vi.fn().mockResolvedValue('hashed-pw') } }),
    api: { signInEmail: vi.fn().mockResolvedValue({ headers: new Headers() }) },
  };
}

/**
 * A fake Drizzle-ish db. `select()` returns a thenable builder whose resolved
 * value is set per-test via `selectResult`. `transaction(cb)` runs cb(FAKE_TX)
 * where the tx object also exposes select/insert/update builders.
 */
function dbStub(opts: {
  userRows: unknown[];
  accountRows: unknown[];
}) {
  let selectCall = 0;
  const makeSelectBuilder = (rows: unknown[]) => {
    const builder: any = {
      from: () => builder,
      where: () => builder,
      limit: () => Promise.resolve(rows),
      then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  };
  const txInsert = vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
  const txUpdate = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }));
  const tx = {
    select: vi.fn(() => {
      // first select inside the tx is the credential account lookup
      return makeSelectBuilder(opts.accountRows);
    }),
    insert: txInsert,
    update: txUpdate,
  };
  return {
    select: vi.fn(() => {
      // top-level select is the user lookup
      selectCall += 1;
      return makeSelectBuilder(opts.userRows);
    }),
    transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    __tx: tx,
    __txInsert: txInsert,
    __txUpdate: txUpdate,
    __selectCalls: () => selectCall,
  };
}

async function makeService(
  tokens: ReturnType<typeof tokensStub>,
  auth: ReturnType<typeof authStub>,
  db: ReturnType<typeof dbStub>,
) {
  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: VerificationTokenService, useValue: tokens },
      { provide: BETTER_AUTH, useValue: auth },
      { provide: DRIZZLE, useValue: db },
    ],
  }).compile();
  return module.get(AuthService);
}

describe('AuthService — setInitialPassword', () => {
  let tokens: ReturnType<typeof tokensStub>;
  let auth: ReturnType<typeof authStub>;

  beforeEach(() => {
    tokens = tokensStub();
    auth = authStub();
  });

  it('throws INVALID_TOKEN when the token cannot be consumed', async () => {
    tokens.consumeToken.mockResolvedValue(null);
    const db = dbStub({ userRows: [], accountRows: [] });
    const service = await makeService(tokens, auth, db);
    await expect(
      service.setInitialPassword({ token: 'bad', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws INVALID_TOKEN when the identifier has no known prefix', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'weird:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const service = await makeService(tokens, auth, db);
    await expect(
      service.setInitialPassword({ token: 'tok', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws INVALID_TOKEN when the user no longer exists', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const db = dbStub({ userRows: [], accountRows: [] });
    const service = await makeService(tokens, auth, db);
    await expect(
      service.setInitialPassword({ token: 'tok', password: 'longenough' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hashes, inserts a credential account, and returns sign-in headers for an invite token', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'invite:u-target' });
    const db = dbStub({ userRows: [TARGET_USER], accountRows: [] });
    const service = await makeService(tokens, auth, db);

    const headers = await service.setInitialPassword({ token: 'tok', password: 'longenough' });

    expect(headers).toBeInstanceOf(Headers);
    expect(db.__txInsert).toHaveBeenCalled();
    expect(auth.api.signInEmail).toHaveBeenCalledWith({
      returnHeaders: true,
      body: { email: 'target@example.com', password: 'longenough' },
    });
  });

  it('updates the existing credential account for an admin-reset token', async () => {
    tokens.consumeToken.mockResolvedValue({ identifier: 'admin-reset:u-target' });
    const db = dbStub({
      userRows: [TARGET_USER],
      accountRows: [{ id: 'acc-1', userId: 'u-target', providerId: 'credential' }],
    });
    const service = await makeService(tokens, auth, db);

    await service.setInitialPassword({ token: 'tok', password: 'longenough' });

    expect(db.__txUpdate).toHaveBeenCalled();
    expect(db.__txInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter backend test
```

Expected: `auth.service.spec.ts` fails to import `./auth.service.js` (file does not exist).

- [ ] **Step 3: Create the set-initial-password DTO**

Create `apps/backend/src/modules/auth/dto/set-initial-password.dto.ts`:

```ts
import { SetInitialPasswordSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class SetInitialPasswordDto extends createZodDto(SetInitialPasswordSchema) {}
```

- [ ] **Step 4: Create `AuthService`**

Create `apps/backend/src/modules/auth/auth.service.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { SetInitialPasswordInput } from '@repo/contracts/users';
import { and, eq } from 'drizzle-orm';

import { BETTER_AUTH, type Auth } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { account, user } from '../../infrastructure/database/schema/index.js';

/** Token-identifier prefixes the set-password flow accepts. */
const TOKEN_PREFIXES = ['invite:', 'admin-reset:'] as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly tokens: VerificationTokenService,
    @Inject(BETTER_AUTH) private readonly auth: Auth,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  /**
   * Consume a one-time invite/reset token and set the user's password.
   * Hashes the password via better-auth's exposed helper, writes/updates the
   * `credential` account row, marks the email verified, then signs the user
   * in and returns the resulting `Headers` (set-cookie carried by the caller).
   */
  async setInitialPassword(input: SetInitialPasswordInput): Promise<Headers> {
    const consumed = await this.tokens.consumeToken(input.token);
    if (!consumed) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }

    const prefix = TOKEN_PREFIXES.find((p) => consumed.identifier.startsWith(p));
    if (!prefix) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }
    const userId = consumed.identifier.slice(prefix.length);

    const userRows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const target = userRows[0];
    if (!target) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }

    const ctx = await this.auth.$context;
    const hash = await ctx.password.hash(input.password);

    await this.db.transaction(async (tx) => {
      const existingAccounts = await tx
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
        .limit(1);
      const now = new Date();
      if (existingAccounts[0]) {
        await tx
          .update(account)
          .set({ password: hash, updatedAt: now })
          .where(eq(account.id, existingAccounts[0].id));
      } else {
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: hash,
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx
        .update(user)
        .set({ emailVerified: true, updatedAt: now })
        .where(eq(user.id, userId));
    });

    const { headers } = await this.auth.api.signInEmail({
      returnHeaders: true,
      body: { email: target.email, password: input.password },
    });
    return headers;
  }
}
```

- [ ] **Step 5: Add the endpoint to `AuthController`**

In `apps/backend/src/modules/auth/auth.controller.ts`, add these imports:

```ts
import { Body, Res } from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from './auth.service.js';
import { SetInitialPasswordDto } from './dto/set-initial-password.dto.js';
```

> `Body` and `Res` join the existing `@nestjs/common` import — merge them into the single import statement at the top (`import { All, Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';`).

Add a constructor to the `AuthController` class (it currently has none) and the new endpoint method. Insert at the top of the class body, before `signInEmail`:

```ts
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('set-initial-password')
  @ApiOperation({
    summary: 'Set a password from a one-time invite or reset token.',
    operationId: 'AuthController_setInitialPassword',
    description:
      'Consumes the token, sets the password, marks the email verified, and ' +
      'signs the user in by appending the better-auth session cookie.',
  })
  @ApiBody({ type: SetInitialPasswordDto })
  @ApiOkResponse({ description: 'Password set; session cookie issued.' })
  async setInitialPassword(
    @Body() body: SetInitialPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const headers = await this.authService.setInitialPassword(body);
    for (const cookie of headers.getSetCookie()) {
      res.append('set-cookie', cookie);
    }
    return { ok: true };
  }
```

- [ ] **Step 6: Register `AuthService` in `AuthDocsModule`**

Replace `apps/backend/src/modules/auth/auth.module.ts` with:

```ts
import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/**
 * Wraps the `AuthController`. Most `/api/auth/*` routing is handled at the
 * Express layer in `main.ts`; the one real Nest-handled route is
 * `POST /api/auth/set-initial-password`, backed by `AuthService`.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthDocsModule {}
```

- [ ] **Step 7: Run the tests — expect PASS**

```
pnpm --filter backend test
```

Expected: the `AuthService — setInitialPassword` block passes (5 tests); the full backend suite stays green.

- [ ] **Step 8: Commit**

```
git add apps/backend/src/modules/auth/auth.service.ts apps/backend/src/modules/auth/dto/set-initial-password.dto.ts apps/backend/src/modules/auth/auth.controller.ts apps/backend/src/modules/auth/auth.module.ts apps/backend/src/modules/auth/auth.service.spec.ts
git commit -m "feat(backend): public set-initial-password endpoint"
```

---

### Task 15: Invitation-flow integration test

**Files:**
- Create: `apps/backend/test/e2e/invitation.e2e.spec.ts`

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/e2e/invitation.e2e.spec.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { type AuthenticatedUser } from '../../src/infrastructure/auth/auth.types.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { UsersService } from '../../src/modules/users/users.service.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/** A sysadmin actor — mirrors the shape from users.service.spec.ts. */
const SYSADMIN: AuthenticatedUser = {
  id: 'integration-sysadmin',
  email: 'integration-sysadmin@example.com',
  emailVerified: true,
  name: 'Integration Sysadmin',
  image: null,
  role: 'sysadmin',
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

describe.skipIf(!hasDatabase())('Invitation flow (integration)', () => {
  let close: () => Promise<void>;
  let users: UsersService;
  let auth: AuthService;
  let betterAuth: Auth;

  beforeAll(async () => {
    const built = await buildTestApp();
    close = built.close;
    users = built.app.get(UsersService);
    auth = built.app.get(AuthService);
    betterAuth = built.app.get<Auth>(BETTER_AUTH);
  });

  afterAll(async () => {
    await close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invites a user, sets their password from the logged link, and signs them in', async () => {
    const email = `invitee-${Date.now()}@example.com`;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const created = await users.invite({ email, name: 'Invited User' }, SYSADMIN);
    expect(created.email).toBe(email);

    // Pull the set-password URL out of the captured ConsoleEmailService output.
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const match = output.match(/set-password\?token=([0-9a-f]{64})/);
    expect(match).not.toBeNull();
    const token = match![1]!;

    const headers = await auth.setInitialPassword({ token, password: 'test-password-123' });
    expect(headers).toBeInstanceOf(Headers);
    expect(headers.getSetCookie().length).toBeGreaterThan(0);

    // The new user can now sign in with the chosen password.
    await expect(
      betterAuth.api.signInEmail({ body: { email, password: 'test-password-123' } }),
    ).resolves.toBeDefined();

    // Clean up so re-runs stay deterministic.
    await users.delete(created.id, SYSADMIN);
  });
});
```

- [ ] **Step 2: Run the test — expect PASS (or skipped without a DB)**

```
pnpm --filter backend test
```

Expected: with a database available, the `Invitation flow (integration)` test passes — invite logs a URL, the token sets the password, and sign-in resolves. Without a database the suite is `skipIf`-skipped; the file still compiles, keeping the suite green.

- [ ] **Step 3: Commit**

```
git add apps/backend/test/e2e/invitation.e2e.spec.ts
git commit -m "test(backend): invitation-to-sign-in integration test"
```

---

### Task 16: Regenerate OpenAPI

**Files:**
- Modify: `packages/contracts/openapi/openapi.json`
- Modify: `packages/contracts/openapi/openapi.yaml`

- [ ] **Step 1: Regenerate the OpenAPI document**

```
pnpm openapi:generate
```

Expected: the command completes; the two new request schemas (`InviteUserInput`, `SetInitialPasswordInput`) and the five new paths (`POST /users/invite`, `PATCH /users/{id}/deactivate`, `PATCH /users/{id}/reactivate`, `DELETE /users/{id}`, `POST /users/{id}/send-password-reset`, `POST /auth/set-initial-password`) appear in the regenerated files.

- [ ] **Step 2: Check for drift**

```
git status --short packages/contracts/openapi
```

Expected: `openapi.json` and `openapi.yaml` show as modified.

- [ ] **Step 3: Commit (only if changed)**

If Step 2 showed changes:

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(contracts): regenerate openapi for user lifecycle endpoints"
```

If `git status` showed no change, state that explicitly in the task log and skip the commit — there is nothing to commit.

---

### Task 17: Frontend entities/user lifecycle API + hooks

**Files:**
- Modify: `apps/frontend/src/entities/user/api/user.api.ts`
- Modify: `apps/frontend/src/entities/user/model/user.queries.ts`
- Modify: `apps/frontend/src/entities/user/index.ts`
- Test: `apps/frontend/src/entities/user/api/user.api.test.ts`

- [ ] **Step 1: Add the failing API test**

Create `apps/frontend/src/entities/user/api/user.api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import {
  deactivateUser,
  deleteUser,
  inviteUser,
  reactivateUser,
  sendPasswordReset,
  setInitialPassword,
} from './user.api.js';

const USER_RESPONSE = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'new@example.com',
  name: 'New User',
  emailVerified: false,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('user lifecycle api', () => {
  it('inviteUser POSTs to /api/users/invite', async () => {
    mockedHttp.mockResolvedValueOnce(USER_RESPONSE);
    await inviteUser({ email: 'new@example.com', name: 'New User' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/invite', {
      method: 'POST',
      body: { email: 'new@example.com', name: 'New User' },
    });
  });

  it('deactivateUser PATCHes /api/users/:id/deactivate', async () => {
    mockedHttp.mockResolvedValueOnce({ ...USER_RESPONSE, deactivatedAt: '2026-05-21T01:00:00.000Z' });
    await deactivateUser(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/users/${USER_RESPONSE.id}/deactivate`, {
      method: 'PATCH',
    });
  });

  it('reactivateUser PATCHes /api/users/:id/reactivate', async () => {
    mockedHttp.mockResolvedValueOnce(USER_RESPONSE);
    await reactivateUser(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/users/${USER_RESPONSE.id}/reactivate`, {
      method: 'PATCH',
    });
  });

  it('deleteUser DELETEs /api/users/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteUser(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/users/${USER_RESPONSE.id}`, {
      method: 'DELETE',
    });
  });

  it('sendPasswordReset POSTs /api/users/:id/send-password-reset', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await sendPasswordReset(USER_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/users/${USER_RESPONSE.id}/send-password-reset`,
      { method: 'POST' },
    );
  });

  it('setInitialPassword POSTs /api/auth/set-initial-password', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await setInitialPassword({ token: 'tok', password: 'longenough' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/auth/set-initial-password', {
      method: 'POST',
      body: { token: 'tok', password: 'longenough' },
    });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: `user.api.test.ts` fails — the six functions are not yet exported from `./user.api.js`.

- [ ] **Step 3: Add the API functions**

Replace the entire contents of `apps/frontend/src/entities/user/api/user.api.ts` with:

```ts
import { AuthRoutes, UsersRoutes } from '@repo/contracts/routes';
import {
  ListUsersResponseSchema,
  UserSchema,
  type InviteUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type SetInitialPasswordInput,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';

import { httpClient } from '@/shared/api';

/** Network surface for the admin-facing User operations. */

export async function listUsers(query: ListUsersQuery): Promise<ListUsersResponse> {
  const raw = await httpClient(UsersRoutes.base, {
    query: {
      q: query.q,
      role: query.role,
      deactivated: query.deactivated,
      page: query.page,
      perPage: query.perPage,
    },
  });
  return ListUsersResponseSchema.parse(raw);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const raw = await httpClient(UsersRoutes.byId(id), { method: 'PATCH', body: input });
  return UserSchema.parse(raw);
}

export async function inviteUser(input: InviteUserInput): Promise<User> {
  const raw = await httpClient(UsersRoutes.invite, { method: 'POST', body: input });
  return UserSchema.parse(raw);
}

export async function deactivateUser(id: string): Promise<User> {
  const raw = await httpClient(UsersRoutes.deactivate(id), { method: 'PATCH' });
  return UserSchema.parse(raw);
}

export async function reactivateUser(id: string): Promise<User> {
  const raw = await httpClient(UsersRoutes.reactivate(id), { method: 'PATCH' });
  return UserSchema.parse(raw);
}

export async function deleteUser(id: string): Promise<void> {
  await httpClient(UsersRoutes.byId(id), { method: 'DELETE' });
}

export async function sendPasswordReset(id: string): Promise<void> {
  await httpClient(UsersRoutes.sendPasswordReset(id), { method: 'POST' });
}

export async function setInitialPassword(input: SetInitialPasswordInput): Promise<void> {
  await httpClient(AuthRoutes.setInitialPassword, { method: 'POST', body: input });
}
```

- [ ] **Step 4: Add the mutation hooks**

Replace the entire contents of `apps/frontend/src/entities/user/model/user.queries.ts` with:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import {
  deactivateUser,
  deleteUser,
  inviteUser,
  listUsers,
  reactivateUser,
  sendPasswordReset,
  updateUser,
} from '../api/user.api.js';

import type { InviteUserInput, ListUsersQuery, UpdateUserInput, User } from '@repo/contracts/users';


export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (query: ListUsersQuery) => [...userKeys.lists(), query] as const,
};

export function listUsersQueryOptions(query: ListUsersQuery) {
  return queryOptions({
    queryKey: userKeys.list(query),
    queryFn: () => listUsers(query),
  });
}

export interface UpdateUserVariables {
  id: string;
  input: UpdateUserInput;
}

// onSuccess composition: spread `options` first, then the invalidator last.
export function useUpdateUser(
  options?: Omit<UseMutationOptions<User, Error, UpdateUserVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateUserVariables) => updateUser(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useInviteUser(
  options?: Omit<UseMutationOptions<User, Error, InviteUserInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inviteUser,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateUser(
  options?: Omit<UseMutationOptions<User, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useReactivateUser(
  options?: Omit<UseMutationOptions<User, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reactivateUser(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteUser(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useSendPasswordReset(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendPasswordReset(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 5: Update the entity barrel**

Replace the entire contents of `apps/frontend/src/entities/user/index.ts` with:

```ts
export type {
  InviteUserInput,
  ListUsersQuery,
  ListUsersResponse,
  Role,
  SetInitialPasswordInput,
  UpdateUserInput,
  User,
} from '@repo/contracts/users';

export {
  deactivateUser,
  deleteUser,
  inviteUser,
  listUsers,
  reactivateUser,
  sendPasswordReset,
  setInitialPassword,
  updateUser,
} from './api/user.api.js';

export {
  listUsersQueryOptions,
  useDeactivateUser,
  useDeleteUser,
  useInviteUser,
  useReactivateUser,
  useSendPasswordReset,
  useUpdateUser,
  userKeys,
  type UpdateUserVariables,
} from './model/user.queries.js';
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend test -- --run
```

Expected: `user.api.test.ts` passes (6 tests); the rest of the frontend suite stays green.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/entities/user/api/user.api.ts apps/frontend/src/entities/user/model/user.queries.ts apps/frontend/src/entities/user/index.ts apps/frontend/src/entities/user/api/user.api.test.ts
git commit -m "feat(frontend): user lifecycle api + mutation hooks"
```

---

### Task 18: i18n keys

**Files:**
- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Extend `en.json`**

In `apps/frontend/src/i18n/locales/en.json`, replace the `admin.users.actions` object with the expanded version, and add the `invite`, `delete`, `lifecycle`, `confirm` subtrees plus the new `errors` keys. The resulting `admin.users` block becomes (only the changed/added keys shown — keep `title`, `empty`, `searchPlaceholder`, `fields`, `roles`, `status`, `filters`, `memberships`, `pager` as they are):

```json
      "actions": {
        "edit": "Edit",
        "save": "Save",
        "invite": "Invite user",
        "deactivate": "Deactivate",
        "reactivate": "Reactivate",
        "delete": "Delete",
        "sendPasswordReset": "Send password reset"
      },
      "confirm": {
        "delete": "Delete \"{{email}}\"? This cannot be undone."
      },
      "invite": {
        "title": "Invite a new user",
        "emailLabel": "Email",
        "nameLabel": "Name (optional)",
        "submit": "Send invite",
        "success": "Invitation sent."
      },
      "delete": {
        "title": "Delete user",
        "description": "This permanently deletes \"{{email}}\" and all their data. To confirm, type their email address below.",
        "confirmLabel": "Type the email to confirm",
        "confirm": "Delete user"
      },
      "lifecycle": {
        "sectionTitle": "Account lifecycle",
        "passwordResetSent": "Password-reset email sent."
      },
      "errors": {
        "selfDemote": "You cannot change your own role.",
        "lastSysadmin": "Cannot demote the last active sysadmin.",
        "membershipExists": "That membership already exists.",
        "instructorRequiresClub": "Instructor memberships are only allowed on clubs.",
        "emailInUse": "A user with this email already exists.",
        "emailDeactivated": "A deactivated user already has this email. Reactivate them instead.",
        "selfDeactivate": "You cannot deactivate yourself.",
        "selfDelete": "You cannot delete yourself.",
        "alreadyDeactivated": "This user is already deactivated.",
        "alreadyActive": "This user is already active.",
        "userNotFound": "That user no longer exists."
      }
```

Also add a `setPassword` subtree inside the existing `auth` object (sibling of `login` and `motto`):

```json
    "setPassword": {
      "title": "Set your password",
      "description": "Choose a password to finish setting up your account.",
      "passwordLabel": "Password",
      "confirmLabel": "Confirm password",
      "submit": "Set password",
      "success": "Password set. Signing you in…",
      "invalidToken": "This link is invalid or has expired. Ask an administrator to send a new one.",
      "mismatch": "The passwords do not match."
    }
```

- [ ] **Step 2: Extend `sv.json`**

Apply the same structure to `apps/frontend/src/i18n/locales/sv.json`. The `admin.users` additions:

```json
      "actions": {
        "edit": "Redigera",
        "save": "Spara",
        "invite": "Bjud in användare",
        "deactivate": "Inaktivera",
        "reactivate": "Återaktivera",
        "delete": "Ta bort",
        "sendPasswordReset": "Skicka lösenordsåterställning"
      },
      "confirm": {
        "delete": "Ta bort \"{{email}}\"? Detta kan inte ångras."
      },
      "invite": {
        "title": "Bjud in en ny användare",
        "emailLabel": "E-post",
        "nameLabel": "Namn (valfritt)",
        "submit": "Skicka inbjudan",
        "success": "Inbjudan skickad."
      },
      "delete": {
        "title": "Ta bort användare",
        "description": "Detta tar permanent bort \"{{email}}\" och all data. Skriv e-postadressen nedan för att bekräfta.",
        "confirmLabel": "Skriv e-postadressen för att bekräfta",
        "confirm": "Ta bort användare"
      },
      "lifecycle": {
        "sectionTitle": "Kontots livscykel",
        "passwordResetSent": "E-post för lösenordsåterställning skickad."
      },
      "errors": {
        "selfDemote": "Du kan inte ändra din egen roll.",
        "lastSysadmin": "Kan inte degradera den sista aktiva systemadministratören.",
        "membershipExists": "Det medlemskapet finns redan.",
        "instructorRequiresClub": "Instruktörsmedlemskap tillåts endast för klubbar.",
        "emailInUse": "En användare med denna e-postadress finns redan.",
        "emailDeactivated": "En inaktiverad användare har redan denna e-postadress. Återaktivera den användaren istället.",
        "selfDeactivate": "Du kan inte inaktivera dig själv.",
        "selfDelete": "Du kan inte ta bort dig själv.",
        "alreadyDeactivated": "Den här användaren är redan inaktiverad.",
        "alreadyActive": "Den här användaren är redan aktiv.",
        "userNotFound": "Den användaren finns inte längre."
      }
```

The `auth.setPassword` subtree for `sv.json`:

```json
    "setPassword": {
      "title": "Ange ditt lösenord",
      "description": "Välj ett lösenord för att slutföra konfigurationen av ditt konto.",
      "passwordLabel": "Lösenord",
      "confirmLabel": "Bekräfta lösenord",
      "submit": "Ange lösenord",
      "success": "Lösenordet är angett. Loggar in dig…",
      "invalidToken": "Den här länken är ogiltig eller har upphört att gälla. Be en administratör skicka en ny.",
      "mismatch": "Lösenorden matchar inte."
    }
```

- [ ] **Step 3: Extend `fi.json`**

Apply the same structure to `apps/frontend/src/i18n/locales/fi.json`. The `admin.users` additions:

```json
      "actions": {
        "edit": "Muokkaa",
        "save": "Tallenna",
        "invite": "Kutsu käyttäjä",
        "deactivate": "Poista käytöstä",
        "reactivate": "Ota uudelleen käyttöön",
        "delete": "Poista",
        "sendPasswordReset": "Lähetä salasanan palautus"
      },
      "confirm": {
        "delete": "Poistetaanko \"{{email}}\"? Tätä ei voi kumota."
      },
      "invite": {
        "title": "Kutsu uusi käyttäjä",
        "emailLabel": "Sähköposti",
        "nameLabel": "Nimi (valinnainen)",
        "submit": "Lähetä kutsu",
        "success": "Kutsu lähetetty."
      },
      "delete": {
        "title": "Poista käyttäjä",
        "description": "Tämä poistaa pysyvästi käyttäjän \"{{email}}\" ja kaikki hänen tietonsa. Vahvista kirjoittamalla sähköpostiosoite alle.",
        "confirmLabel": "Vahvista kirjoittamalla sähköpostiosoite",
        "confirm": "Poista käyttäjä"
      },
      "lifecycle": {
        "sectionTitle": "Tilin elinkaari",
        "passwordResetSent": "Salasanan palautusviesti lähetetty."
      },
      "errors": {
        "selfDemote": "Et voi muuttaa omaa rooliasi.",
        "lastSysadmin": "Viimeistä aktiivista pääkäyttäjää ei voi alentaa.",
        "membershipExists": "Kyseinen jäsenyys on jo olemassa.",
        "instructorRequiresClub": "Ohjaajajäsenyydet ovat sallittuja vain seuroille.",
        "emailInUse": "Tällä sähköpostiosoitteella on jo käyttäjä.",
        "emailDeactivated": "Käytöstä poistetulla käyttäjällä on jo tämä sähköpostiosoite. Ota hänet sen sijaan uudelleen käyttöön.",
        "selfDeactivate": "Et voi poistaa itseäsi käytöstä.",
        "selfDelete": "Et voi poistaa itseäsi.",
        "alreadyDeactivated": "Tämä käyttäjä on jo poistettu käytöstä.",
        "alreadyActive": "Tämä käyttäjä on jo aktiivinen.",
        "userNotFound": "Kyseistä käyttäjää ei ole enää olemassa."
      }
```

The `auth.setPassword` subtree for `fi.json`:

```json
    "setPassword": {
      "title": "Aseta salasanasi",
      "description": "Valitse salasana viimeistelläksesi tilisi käyttöönoton.",
      "passwordLabel": "Salasana",
      "confirmLabel": "Vahvista salasana",
      "submit": "Aseta salasana",
      "success": "Salasana asetettu. Kirjataan sinua sisään…",
      "invalidToken": "Tämä linkki on virheellinen tai vanhentunut. Pyydä ylläpitäjää lähettämään uusi.",
      "mismatch": "Salasanat eivät täsmää."
    }
```

> When merging: `admin.users.actions` and `admin.users.errors` already exist in each file — replace those two objects with the expanded versions above. `confirm`, `invite`, `delete`, `lifecycle` under `admin.users` and `setPassword` under `auth` are new — insert them. Keep all unrelated keys intact and the JSON well-formed (commas between sibling keys).

- [ ] **Step 4: Verify with typecheck — expect PASS**

```
pnpm --filter frontend typecheck
```

Expected: no errors. The locale files are plain JSON; this is a content-only change, verified by the typecheck passing (the JSON must remain valid for the build to load it).

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/i18n/locales/en.json apps/frontend/src/i18n/locales/sv.json apps/frontend/src/i18n/locales/fi.json
git commit -m "feat(frontend): i18n keys for user lifecycle + set-password"
```

---

### Task 19: InviteUserDialog feature

**Files:**
- Create: `apps/frontend/src/features/invite-user-dialog/index.ts`
- Create: `apps/frontend/src/features/invite-user-dialog/ui/InviteUserDialog.tsx`
- Test: `apps/frontend/src/features/invite-user-dialog/ui/InviteUserDialog.test.tsx`
- Modify: `apps/frontend/steiger.config.js`

- [ ] **Step 1: Add the failing test**

Create `apps/frontend/src/features/invite-user-dialog/ui/InviteUserDialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteUserDialog } from './InviteUserDialog.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

// Mock the entity API module by its deep path — user.queries.ts imports the
// fetcher from there directly, so mocking the barrel would not reach it.
vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return { ...actual, inviteUser: vi.fn() };
});

import { inviteUser } from '@/entities/user/api/user.api.js';

const mockedInvite = vi.mocked(inviteUser);

function renderDialog(overrides: Partial<React.ComponentProps<typeof InviteUserDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onInvited = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <InviteUserDialog open onOpenChange={onOpenChange} onInvited={onInvited} {...overrides} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange, onInvited, user: userEvent.setup() };
}

const INVITED_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'new@example.com',
  name: null,
  emailVerified: false,
  image: null,
  role: 'user' as const,
  deactivatedAt: null,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

describe('<InviteUserDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedInvite.mockReset();
  });

  it('renders an email and a name field', () => {
    renderDialog();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('submits the entered email to inviteUser', async () => {
    mockedInvite.mockResolvedValueOnce(INVITED_USER);
    const { user, onInvited } = renderDialog();
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() => {
      expect(mockedInvite).toHaveBeenCalledWith({ email: 'new@example.com' });
    });
    expect(onInvited).toHaveBeenCalledWith(INVITED_USER);
  });

  it('shows the mapped error when the API rejects with EMAIL_IN_USE', async () => {
    mockedInvite.mockRejectedValueOnce(
      new HttpError(409, { code: 'EMAIL_IN_USE', message: 'in use' }),
    );
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
```

> If the `HttpError` constructor signature in `@/shared/api` differs from `new HttpError(status, payload)`, adjust the two `HttpError` instantiations to match — read `apps/frontend/src/shared/api` to confirm before running.

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: `InviteUserDialog.test.tsx` fails — `./InviteUserDialog.js` does not exist.

- [ ] **Step 3: Create the dialog**

Create `apps/frontend/src/features/invite-user-dialog/ui/InviteUserDialog.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useInviteUser, type InviteUserInput, type User } from '@/entities/user';
import { HttpError } from '@/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Input,
  Label,
} from '@/shared/ui';

export interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created user after a successful invite. */
  onInvited?: (user: User) => void;
}

/**
 * Dialog for inviting a new user by email (and an optional display name).
 * On success it closes itself and hands the created user to `onInvited`.
 * `EMAIL_IN_USE` / `EMAIL_DEACTIVATED` backend codes map to friendly copy.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteUserDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  // Reset local state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setName('');
      setError(undefined);
    }
  }, [open]);

  const mapError = React.useCallback(
    (err: unknown): string => {
      if (err instanceof HttpError) {
        switch (err.payload.code) {
          case 'EMAIL_IN_USE':
            return t('admin.users.errors.emailInUse', {
              defaultValue: 'A user with this email already exists.',
            });
          case 'EMAIL_DEACTIVATED':
            return t('admin.users.errors.emailDeactivated', {
              defaultValue:
                'A deactivated user already has this email. Reactivate them instead.',
            });
          default:
            return err.message;
        }
      }
      return err instanceof Error
        ? err.message
        : t('common.unknownError', { defaultValue: 'Unknown error' });
    },
    [t],
  );

  const inviteMut = useInviteUser({
    onSuccess: (user) => {
      onInvited?.(user);
      onOpenChange(false);
    },
    onError: (err) => setError(mapError(err)),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(undefined);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('zod.invalidEmail', { defaultValue: 'Please enter a valid email address.' }));
      return;
    }
    const input: InviteUserInput = { email: trimmedEmail };
    const trimmedName = name.trim();
    if (trimmedName) input.name = trimmedName;
    inviteMut.mutate(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.invite.title', { defaultValue: 'Invite a new user' })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField>
            <Label htmlFor="invite-email">
              {t('admin.users.invite.emailLabel', { defaultValue: 'Email' })}
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="invite-name">
              {t('admin.users.invite.nameLabel', { defaultValue: 'Name (optional)' })}
            </Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormMessage message={error} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={inviteMut.isPending}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={inviteMut.isPending}>
              {t('admin.users.invite.submit', { defaultValue: 'Send invite' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/features/invite-user-dialog/index.ts`:

```ts
export { InviteUserDialog, type InviteUserDialogProps } from './ui/InviteUserDialog.js';
```

- [ ] **Step 5: Add the steiger test-file override**

The test mocks `@/entities/user/api/user.api.js` by its deep path. Add an override block to `apps/frontend/steiger.config.js`, mirroring the existing `user-form` block. Insert this object as the last entry of the array passed to `defineConfig`:

```js
  {
    // The invite-user-dialog test mocks the user entity API module by its
    // deep path because `user.queries.ts` imports the fetcher from there
    // directly (not via the barrel). Mocking the barrel wouldn't reach that
    // import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/invite-user-dialog/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 6: Run the test + arch lint — expect PASS**

```
pnpm --filter frontend test -- --run
pnpm --filter frontend arch
```

Expected: `InviteUserDialog.test.tsx` passes (3 tests); `pnpm --filter frontend arch` reports no errors.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/features/invite-user-dialog/index.ts apps/frontend/src/features/invite-user-dialog/ui/InviteUserDialog.tsx apps/frontend/src/features/invite-user-dialog/ui/InviteUserDialog.test.tsx apps/frontend/steiger.config.js
git commit -m "feat(frontend): invite-user dialog"
```

---

### Task 20: UserDeleteDialog feature (typed-email)

**Files:**
- Create: `apps/frontend/src/features/user-delete-dialog/index.ts`
- Create: `apps/frontend/src/features/user-delete-dialog/ui/UserDeleteDialog.tsx`
- Test: `apps/frontend/src/features/user-delete-dialog/ui/UserDeleteDialog.test.tsx`

- [ ] **Step 1: Add the failing test**

Create `apps/frontend/src/features/user-delete-dialog/ui/UserDeleteDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserDeleteDialog } from './UserDeleteDialog.js';

import type { User } from '@/entities/user';

import i18n from '@/i18n';

const TARGET: User = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'doomed@example.com',
  name: 'Doomed User',
  emailVerified: true,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof UserDeleteDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(
    <I18nextProvider i18n={i18n}>
      <UserDeleteDialog
        user={TARGET}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { onOpenChange, onConfirm, user: userEvent.setup() };
}

describe('<UserDeleteDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('disables Delete until the exact email is typed', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled();
  });

  it('keeps Delete disabled when the wrong email is typed', async () => {
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type the email/i), 'wrong@example.com');
    expect(screen.getByRole('button', { name: /delete user/i })).toBeDisabled();
  });

  it('enables Delete when the exact email is typed', async () => {
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type the email/i), TARGET.email);
    expect(screen.getByRole('button', { name: /delete user/i })).not.toBeDisabled();
  });

  it('calls onConfirm when Delete is clicked after typing the email', async () => {
    const { user, onConfirm } = renderDialog();
    await user.type(screen.getByLabelText(/type the email/i), TARGET.email);
    await user.click(screen.getByRole('button', { name: /delete user/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: `UserDeleteDialog.test.tsx` fails — `./UserDeleteDialog.js` does not exist.

- [ ] **Step 3: Create the dialog**

Create `apps/frontend/src/features/user-delete-dialog/ui/UserDeleteDialog.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { User } from '@/entities/user';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Label,
} from '@/shared/ui';

export interface UserDeleteDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs the actual delete. The dialog closes itself after it resolves. */
  onConfirm: () => Promise<void>;
}

/**
 * Hard-delete confirmation with a typed-email gate: the destructive button
 * stays disabled until the admin types the target's exact email address.
 * Deliberately stricter than `OrganisationDeleteDialog` because user deletion
 * is irreversible and cascades.
 */
export function UserDeleteDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
}: UserDeleteDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // Reset the typed value whenever the dialog closes.
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const confirmed = typed === user.email;

  const handleConfirm = async (): Promise<void> => {
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.delete.title', { defaultValue: 'Delete user' })}
          </DialogTitle>
          <DialogDescription>
            {t('admin.users.delete.description', {
              defaultValue:
                'This permanently deletes "{{email}}" and all their data. ' +
                'To confirm, type their email address below.',
              email: user.email,
            })}
          </DialogDescription>
        </DialogHeader>

        <FormField>
          <Label htmlFor="user-delete-confirm">
            {t('admin.users.delete.confirmLabel', {
              defaultValue: 'Type the email to confirm',
            })}
          </Label>
          <Input
            id="user-delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </FormField>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!confirmed || submitting}
          >
            {t('admin.users.delete.confirm', { defaultValue: 'Delete user' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/features/user-delete-dialog/index.ts`:

```ts
export { UserDeleteDialog, type UserDeleteDialogProps } from './ui/UserDeleteDialog.js';
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter frontend test -- --run
```

Expected: `UserDeleteDialog.test.tsx` passes (4 tests). No steiger override is needed — this dialog imports only the `User` type from the entity barrel, not a deep API path.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/features/user-delete-dialog/index.ts apps/frontend/src/features/user-delete-dialog/ui/UserDeleteDialog.tsx apps/frontend/src/features/user-delete-dialog/ui/UserDeleteDialog.test.tsx
git commit -m "feat(frontend): typed-email user delete dialog"
```

---

### Task 21: UserForm lifecycle action row

**Files:**
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.tsx`
- Modify: `apps/frontend/src/features/user-form/index.ts`
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append the following tests to the `describe('<UserForm>', ...)` block in `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`:

```tsx
  it('hides the lifecycle section when editing yourself', () => {
    renderForm({ currentUserId: TARGET.id });
    expect(
      screen.queryByText(/account lifecycle/i),
    ).not.toBeInTheDocument();
  });

  it('shows the lifecycle section when editing someone else', () => {
    renderForm({ currentUserId: 'some-other-admin' });
    expect(screen.getByText(/account lifecycle/i)).toBeInTheDocument();
  });

  it('shows Deactivate for an active user', () => {
    renderForm({ currentUserId: 'some-other-admin' });
    expect(screen.getByRole('button', { name: /^deactivate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reactivate$/i })).not.toBeInTheDocument();
  });

  it('shows Reactivate for a deactivated user', () => {
    renderForm({
      currentUserId: 'some-other-admin',
      user: { ...TARGET, deactivatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(screen.getByRole('button', { name: /^reactivate$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^deactivate$/i })).not.toBeInTheDocument();
  });
```

> `renderForm` already spreads `overrides` onto `<UserForm>`, so passing `user` and `currentUserId` overrides works without changing the helper.

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: the four new `<UserForm>` tests fail — there is no "Account lifecycle" section yet.

- [ ] **Step 3: Add the lifecycle props + action row**

In `apps/frontend/src/features/user-form/ui/UserForm.tsx`, extend `UserFormProps` with four optional callbacks:

```ts
export interface UserFormProps {
  /** The user being edited. */
  user: User;
  /** Id of the currently signed-in admin — used to disable self-role-change. */
  currentUserId: string;
  /** Submit the Details-tab patch (name / role). */
  onSubmit: (input: UpdateUserInput) => Promise<void>;
  submitting?: boolean;
  /** Lifecycle actions — omitted callers simply hide the corresponding button. */
  onDeactivate?: () => void | Promise<void>;
  onReactivate?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onSendPasswordReset?: () => void | Promise<void>;
}
```

Update the function signature to destructure the new props:

```tsx
export function UserForm({
  user,
  currentUserId,
  onSubmit,
  submitting,
  onDeactivate,
  onReactivate,
  onDelete,
  onSendPasswordReset,
}: UserFormProps): React.ReactElement {
```

Extend the `mapErrorCode` switch with the new codes. Replace the `switch (err.payload.code) { ... }` body with:

```tsx
      switch (err.payload.code) {
        case 'SELF_DEMOTE': return t('admin.users.errors.selfDemote', { defaultValue: 'You cannot change your own role.' });
        case 'LAST_SYSADMIN': return t('admin.users.errors.lastSysadmin', { defaultValue: 'Cannot demote the last active sysadmin.' });
        case 'MEMBERSHIP_EXISTS': return t('admin.users.errors.membershipExists', { defaultValue: 'That membership already exists.' });
        case 'INSTRUCTOR_REQUIRES_CLUB': return t('admin.users.errors.instructorRequiresClub', { defaultValue: 'Instructor memberships are only allowed on clubs.' });
        case 'SELF_DEACTIVATE': return t('admin.users.errors.selfDeactivate', { defaultValue: 'You cannot deactivate yourself.' });
        case 'SELF_DELETE': return t('admin.users.errors.selfDelete', { defaultValue: 'You cannot delete yourself.' });
        case 'ALREADY_DEACTIVATED': return t('admin.users.errors.alreadyDeactivated', { defaultValue: 'This user is already deactivated.' });
        case 'ALREADY_ACTIVE': return t('admin.users.errors.alreadyActive', { defaultValue: 'This user is already active.' });
        case 'EMAIL_IN_USE': return t('admin.users.errors.emailInUse', { defaultValue: 'A user with this email already exists.' });
        case 'EMAIL_DEACTIVATED': return t('admin.users.errors.emailDeactivated', { defaultValue: 'A deactivated user already has this email. Reactivate them instead.' });
        case 'NOT_FOUND': return t('admin.users.errors.userNotFound', { defaultValue: 'That user no longer exists.' });
        default: return err.message;
      }
```

> The backend's lifecycle 404 uses code `NOT_FOUND`; it maps to the `userNotFound` i18n key.

In the `TabsContent value="details"` block, add the lifecycle section immediately **after** the closing `</form>` tag and **before** the closing `</TabsContent>`. The section renders only when `!isSelf`:

```tsx
          {isSelf ? null : (
            <section className="mt-6 space-y-3 border-t pt-6">
              <h3 className="text-sm font-semibold text-on-surface">
                {t('admin.users.lifecycle.sectionTitle', { defaultValue: 'Account lifecycle' })}
              </h3>
              <div className="flex flex-wrap gap-3">
                {user.deactivatedAt !== null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onReactivate?.()}
                  >
                    {t('admin.users.actions.reactivate', { defaultValue: 'Reactivate' })}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onDeactivate?.()}
                  >
                    {t('admin.users.actions.deactivate', { defaultValue: 'Deactivate' })}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onSendPasswordReset?.()}
                >
                  {t('admin.users.actions.sendPasswordReset', {
                    defaultValue: 'Send password reset',
                  })}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void onDelete?.()}
                >
                  {t('admin.users.actions.delete', { defaultValue: 'Delete' })}
                </Button>
              </div>
            </section>
          )}
```

- [ ] **Step 4: Confirm the barrel needs no change**

`apps/frontend/src/features/user-form/index.ts` already exports `UserForm` and `UserFormProps`; the props type is the same exported symbol, so no edit is needed. Leave the file as-is.

- [ ] **Step 5: Run the tests — expect PASS**

```
pnpm --filter frontend test -- --run
```

Expected: the `<UserForm>` suite passes including the four new lifecycle tests; the existing tests stay green.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/features/user-form/ui/UserForm.tsx apps/frontend/src/features/user-form/ui/UserForm.test.tsx
git commit -m "feat(frontend): lifecycle action row in user form"
```

---

### Task 22: AdminUsersPage — discriminated-union refactor + wiring

**Files:**
- Modify: `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx`
- Test: `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.test.tsx`

- [ ] **Step 1: Add the failing test**

Create `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersPage } from './AdminUsersPage.js';

import i18n from '@/i18n';

// Mock the entity API modules by their deep paths — the query-options
// factories capture the fetchers directly from these modules.
vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return {
    ...actual,
    listUsers: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, perPage: 25 }),
    inviteUser: vi.fn(),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});
vi.mock('@/entities/membership/api/membership.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/membership/api/membership.api.js')>();
  return { ...actual, listMemberships: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});

// useSession is consumed for the current user id.
vi.mock('@/features/auth-by-email', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email')>();
  return {
    ...actual,
    useSession: () => ({ data: { user: { id: 'current-admin' } } }),
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AdminUsersPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<AdminUsersPage>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('opens the invite dialog when "Invite user" is clicked', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /invite user/i }));
    expect(
      await screen.findByRole('heading', { name: /invite a new user/i }),
    ).toBeInTheDocument();
  });
});
```

> If `useSession` is not re-exported from `@/features/auth-by-email`, adjust the `vi.mock` target to wherever `AdminUsersPage` imports `useSession` from. Read the page's import block to confirm before running.

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: `AdminUsersPage.test.tsx` fails — there is no "Invite user" button yet.

- [ ] **Step 3: Refactor the page to a discriminated-union state machine**

Replace the entire contents of `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx` with the version below. Before running typecheck, open the current file and confirm the `<UsersFilters>` / `<UsersTable>` prop names (`value`/`onChange`, `users`/`onEdit`) match what Phase 2 actually built — if a widget prop differs, keep the existing prop contract and adapt only the call site here. The structural change this task makes is the `PageMode` state machine plus the invite/delete/lifecycle wiring; the existing list/filter/pager rendering is preserved.

```tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listUsersQueryOptions,
  useDeactivateUser,
  useDeleteUser,
  useReactivateUser,
  useSendPasswordReset,
  useUpdateUser,
  type ListUsersQuery,
  type User,
} from '@/entities/user';
import { useSession } from '@/features/auth-by-email';
import { InviteUserDialog } from '@/features/invite-user-dialog';
import { UserDeleteDialog } from '@/features/user-delete-dialog';
import { UserForm } from '@/features/user-form';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';
import { UsersFilters } from '@/widgets/users-filters';
import { UsersTable } from '@/widgets/users-table';

const INITIAL_QUERY: ListUsersQuery = { deactivated: 'false', page: 1, perPage: 25 };

/** Which dialog/flow is currently active. */
type PageMode =
  | { kind: 'idle' }
  | { kind: 'edit'; user: User }
  | { kind: 'invite' }
  | { kind: 'delete'; user: User };

/**
 * Admin page for managing user accounts: filter the list, invite new users,
 * open a user to edit name/role/memberships, run lifecycle actions, and
 * hard-delete behind a typed-email confirmation. A discriminated-union state
 * machine picks which dialog is open.
 */
export function AdminUsersPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? '';

  const [query, setQuery] = React.useState<ListUsersQuery>(INITIAL_QUERY);
  const [mode, setMode] = React.useState<PageMode>({ kind: 'idle' });

  const { data, isLoading, isError, error } = useQuery(listUsersQueryOptions(query));

  const updateMut = useUpdateUser({ onSuccess: () => setMode({ kind: 'idle' }) });
  const deactivateMut = useDeactivateUser();
  const reactivateMut = useReactivateUser();
  const sendResetMut = useSendPasswordReset();
  const deleteMut = useDeleteUser();

  const setPage = (page: number): void => setQuery((q) => ({ ...q, page }));
  const total = data?.total ?? 0;
  const hasNext = query.page * query.perPage < total;

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.users.title', { defaultValue: 'Users' })}
        </h1>
        <Button onClick={() => setMode({ kind: 'invite' })}>
          {t('admin.users.actions.invite', { defaultValue: 'Invite user' })}
        </Button>
      </div>

      <div className="mb-6">
        <UsersFilters value={query} onChange={setQuery} />
      </div>

      {isLoading ? (
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : isError ? (
        <p className="text-error">
          {error instanceof Error
            ? error.message
            : t('common.unknownError', { defaultValue: 'Unknown error' })}
        </p>
      ) : (
        <>
          <UsersTable
            users={data?.data ?? []}
            onEdit={(u) => setMode({ kind: 'edit', user: u })}
          />

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={query.page <= 1}
              onClick={() => setPage(query.page - 1)}
            >
              {t('admin.users.pager.prev', { defaultValue: 'Previous' })}
            </Button>
            <span className="text-sm text-on-surface-variant">
              {t('admin.users.pager.page', { defaultValue: 'Page {{page}}', page: query.page })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage(query.page + 1)}
            >
              {t('admin.users.pager.next', { defaultValue: 'Next' })}
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={mode.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('admin.users.actions.edit', { defaultValue: 'Edit' })}
            </DialogTitle>
          </DialogHeader>
          {mode.kind === 'edit' ? (
            <UserForm
              key={mode.user.id}
              user={mode.user}
              currentUserId={currentUserId}
              submitting={updateMut.isPending}
              onSubmit={async (input) => {
                await updateMut.mutateAsync({ id: mode.user.id, input });
              }}
              onDeactivate={async () => {
                await deactivateMut.mutateAsync(mode.user.id);
              }}
              onReactivate={async () => {
                await reactivateMut.mutateAsync(mode.user.id);
              }}
              onSendPasswordReset={async () => {
                await sendResetMut.mutateAsync(mode.user.id);
              }}
              onDelete={() => setMode({ kind: 'delete', user: mode.user })}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <InviteUserDialog
        open={mode.kind === 'invite'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      />

      {mode.kind === 'delete' ? (
        <UserDeleteDialog
          user={mode.user}
          open
          onOpenChange={(open) => {
            if (!open) setMode({ kind: 'idle' });
          }}
          onConfirm={async () => {
            await deleteMut.mutateAsync(mode.user.id);
            setMode({ kind: 'idle' });
          }}
        />
      ) : null}
    </main>
  );
}
```

> The lifecycle mutation hooks (`useDeactivateUser` etc.) already invalidate `userKeys.lists()` in their `onSuccess`, so the table refetches after every action with no extra wiring.

- [ ] **Step 4: Run the test + arch lint — expect PASS**

```
pnpm --filter frontend test -- --run
pnpm --filter frontend arch
```

Expected: `AdminUsersPage.test.tsx` passes; `pnpm --filter frontend arch` reports no errors (a page importing features is allowed FSD layering).

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx apps/frontend/src/pages/admin-users/ui/AdminUsersPage.test.tsx
git commit -m "feat(frontend): wire invite/delete/lifecycle into admin users page"
```

---

### Task 23: SetPasswordForm feature

**Files:**
- Create: `apps/frontend/src/features/set-password-form/index.ts`
- Create: `apps/frontend/src/features/set-password-form/ui/SetPasswordForm.tsx`
- Test: `apps/frontend/src/features/set-password-form/ui/SetPasswordForm.test.tsx`
- Modify: `apps/frontend/steiger.config.js`

- [ ] **Step 1: Add the failing test**

Create `apps/frontend/src/features/set-password-form/ui/SetPasswordForm.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetPasswordForm } from './SetPasswordForm.js';

import i18n from '@/i18n';
import { HttpError } from '@/shared/api';

vi.mock('@/entities/user/api/user.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/user/api/user.api.js')>();
  return { ...actual, setInitialPassword: vi.fn() };
});

import { setInitialPassword } from '@/entities/user/api/user.api.js';

const mockedSet = vi.mocked(setInitialPassword);

function renderForm() {
  render(
    <I18nextProvider i18n={i18n}>
      <SetPasswordForm token="tok-abc" />
    </I18nextProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<SetPasswordForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedSet.mockReset();
  });

  it('renders password and confirm fields', () => {
    renderForm();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('shows a mismatch error and does not submit when the passwords differ', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'different22');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('submits matching, long-enough passwords', async () => {
    mockedSet.mockResolvedValueOnce(undefined);
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough1');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => {
      expect(mockedSet).toHaveBeenCalledWith({ token: 'tok-abc', password: 'longenough1' });
    });
  });

  it('shows the invalid-token message when the API rejects with INVALID_TOKEN', async () => {
    mockedSet.mockRejectedValueOnce(
      new HttpError(400, { code: 'INVALID_TOKEN', message: 'bad' }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough1');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough1');
    await user.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: `SetPasswordForm.test.tsx` fails — `./SetPasswordForm.js` does not exist.

- [ ] **Step 3: Create the form**

Create `apps/frontend/src/features/set-password-form/ui/SetPasswordForm.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { setInitialPassword } from '@/entities/user';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';

export interface SetPasswordFormProps {
  /** One-time token from the `?token=` query parameter. */
  token: string;
}

/**
 * Public form for choosing a password from an invite or reset link. Validates
 * the match + minimum length client-side, then posts to the public
 * set-initial-password endpoint. On success it does a full-page navigation to
 * `/dashboard` so the freshly issued session cookie is picked up.
 */
export function SetPasswordForm({ token }: SetPasswordFormProps): React.ReactElement {
  const { t } = useTranslation();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);

    if (password.length < 8) {
      setError(t('zod.tooSmall', { defaultValue: 'Must be at least {{min}}.', min: 8 }));
      return;
    }
    if (password !== confirm) {
      setError(
        t('auth.setPassword.mismatch', { defaultValue: 'The passwords do not match.' }),
      );
      return;
    }

    setSubmitting(true);
    try {
      await setInitialPassword({ token, password });
      // Full navigation so the new session cookie is applied to the next load.
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof HttpError && err.payload.code === 'INVALID_TOKEN') {
        setError(
          t('auth.setPassword.invalidToken', {
            defaultValue:
              'This link is invalid or has expired. Ask an administrator to send a new one.',
          }),
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('common.unknownError', { defaultValue: 'Unknown error' }));
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="set-password">
          {t('auth.setPassword.passwordLabel', { defaultValue: 'Password' })}
        </Label>
        <Input
          id="set-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>

      <FormField>
        <Label htmlFor="set-password-confirm">
          {t('auth.setPassword.confirmLabel', { defaultValue: 'Confirm password' })}
        </Label>
        <Input
          id="set-password-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>

      <FormMessage message={error} />

      <Button type="submit" disabled={submitting} className="w-full">
        {t('auth.setPassword.submit', { defaultValue: 'Set password' })}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/features/set-password-form/index.ts`:

```ts
export { SetPasswordForm, type SetPasswordFormProps } from './ui/SetPasswordForm.js';
```

- [ ] **Step 5: Add the steiger test-file override**

The test mocks `@/entities/user/api/user.api.js` by its deep path. Insert this object as the last entry of the array passed to `defineConfig` in `apps/frontend/steiger.config.js`:

```js
  {
    // The set-password-form test mocks the user entity API module by its
    // deep path; mocking the barrel wouldn't reach the captured fetcher
    // reference. Allow the public-API sidestep for this test file only.
    files: ['src/features/set-password-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 6: Run the test + arch lint — expect PASS**

```
pnpm --filter frontend test -- --run
pnpm --filter frontend arch
```

Expected: `SetPasswordForm.test.tsx` passes (4 tests); `pnpm --filter frontend arch` reports no errors.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/features/set-password-form/index.ts apps/frontend/src/features/set-password-form/ui/SetPasswordForm.tsx apps/frontend/src/features/set-password-form/ui/SetPasswordForm.test.tsx apps/frontend/steiger.config.js
git commit -m "feat(frontend): public set-password form"
```

---

### Task 24: set-password route + page

**Files:**
- Create: `apps/frontend/src/pages/set-password/index.ts`
- Create: `apps/frontend/src/pages/set-password/ui/SetPasswordPage.tsx`
- Create: `apps/frontend/src/app/router/routes/_public.set-password.tsx`
- Modify: `apps/frontend/src/app/router/routes/_public.tsx`
- Modify: `apps/frontend/src/app/router/routeTree.gen.ts` (auto-regenerated)

- [ ] **Step 1: Create the page component**

Create `apps/frontend/src/pages/set-password/ui/SetPasswordPage.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { SetPasswordForm } from '@/features/set-password-form';

export interface SetPasswordPageProps {
  /** One-time token, supplied by the route from its validated `?token=` param. */
  token: string;
}

/**
 * Public page wrapping `<SetPasswordForm>`. The `token` arrives as a prop from
 * the route component — the page never imports from the `app` layer, which
 * FSD / Steiger's `forbidden-imports` rule forbids (`pages` may not import
 * `app`).
 */
export function SetPasswordPage({ token }: SetPasswordPageProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-surface p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('auth.setPassword.title', { defaultValue: 'Set your password' })}
          </h1>
          <p className="text-sm text-on-surface-variant">
            {t('auth.setPassword.description', {
              defaultValue: 'Choose a password to finish setting up your account.',
            })}
          </p>
        </div>
        <SetPasswordForm token={token} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create the page barrel**

Create `apps/frontend/src/pages/set-password/index.ts`:

```ts
export { SetPasswordPage, type SetPasswordPageProps } from './ui/SetPasswordPage.js';
```

- [ ] **Step 3: Create the route**

Create `apps/frontend/src/app/router/routes/_public.set-password.tsx`:

```tsx
import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { SetPasswordPage } from '@/pages/set-password';

import { publicLayoutRoute } from './_public.js';

/** `?token=` is required — an absent/empty token fails validation. */
const SetPasswordSearchSchema = z.object({
  token: z.string(),
});

export const setPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/set-password',
  validateSearch: (raw: Record<string, unknown>) => SetPasswordSearchSchema.parse(raw),
  component: SetPasswordRouteComponent,
});

/**
 * Thin route component: reads the validated `token` search param and passes it
 * to the page as a prop. Keeping the `useSearch` call in this `app`-layer file
 * means `SetPasswordPage` (a `pages` slice) never imports from `app` — which
 * Steiger's `fsd/forbidden-imports` rule rejects.
 */
function SetPasswordRouteComponent() {
  const { token } = setPasswordRoute.useSearch();
  return <SetPasswordPage token={token} />;
}

export const Route = setPasswordRoute;
```

- [ ] **Step 4: Suppress the header on `/set-password`**

In `apps/frontend/src/app/router/routes/_public.tsx`, extend the `isAuthPage` check so the set-password page carries no global header. Change:

```ts
  const isAuthPage = pathname === '/login' || pathname === '/signup';
```

to:

```ts
  const isAuthPage =
    pathname === '/login' || pathname === '/signup' || pathname === '/set-password';
```

- [ ] **Step 5: Regenerate the route tree**

Run a build (or a brief dev start) so the TanStack Router Vite plugin regenerates `routeTree.gen.ts` with the new route:

```
pnpm --filter frontend build
```

Expected: the build completes; `apps/frontend/src/app/router/routeTree.gen.ts` is updated to include `_public/set-password`.

- [ ] **Step 6: Verify with typecheck + arch — expect PASS**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: no errors. `arch` must be clean — the page takes `token` as a prop precisely so the `pages` slice never imports the `app`-layer route. A standalone route-level test is not added: `SetPasswordForm` (Task 23) already covers the form behavior, and the route is pure wiring verified by typecheck, arch, and the build's route-tree regeneration.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/pages/set-password/index.ts apps/frontend/src/pages/set-password/ui/SetPasswordPage.tsx apps/frontend/src/app/router/routes/_public.set-password.tsx apps/frontend/src/app/router/routes/_public.tsx apps/frontend/src/app/router/routeTree.gen.ts
git commit -m "feat(frontend): public /set-password route + page"
```

---

### Task 25: Full pipeline + manual verification

**Files:**
- None created. Possible commit of regenerated artefacts only.

- [ ] **Step 1: Run the full pipeline — expect all green**

```
pnpm turbo run typecheck lint arch test build
```

Expected: every task (`typecheck`, `lint`, `arch`, `test`, `build`) passes across `contracts`, `backend`, and `frontend`. If anything fails, fix it before continuing — the plan is not complete until this is green.

- [ ] **Step 2: Confirm OpenAPI has no drift**

```
pnpm openapi:generate
git status --short packages/contracts/openapi
```

Expected: no changes (Task 16 already regenerated). If the command produced a diff, commit it:

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(contracts): regenerate openapi"
```

- [ ] **Step 3: Manual end-to-end verification (document the result, do not automate)**

Start both dev servers:

```
pnpm --filter backend dev
pnpm --filter frontend dev
```

Then walk this checklist and record the outcome of each item in the task log:

1. Sign in as the seeded sysadmin and navigate to `/admin/users`.
2. Click **Invite user**, enter a fresh email, submit. The dialog closes; the new user appears in the table with a "Deactivated"-free / pending state.
3. In the **backend stdout**, find the `[email] invite to=… url=…` line and copy the `set-password` URL.
4. Open the URL in a fresh browser/profile. The `/set-password` page renders with no global header.
5. Enter a password + matching confirmation, submit. Confirm you land on `/dashboard`, signed in as the new user.
6. Sign back in as the sysadmin. Open the new user, use **Deactivate** — the user shows the deactivated state. Use **Reactivate** — it clears.
7. With the user open, click **Send password reset**. Confirm a `[email] admin-password-reset to=… url=…` line appears in backend stdout and the URL works.
8. Open the user, click **Delete**, type the user's exact email into the confirmation field (verify Delete is disabled until the email matches), confirm. The user disappears from the table.
9. Navigate to `/admin/audit-log`. Confirm `create`, `deactivate`, `reactivate`, `password_reset_triggered`, and `delete` entries with `entityType: user` are present for the actions above.
10. Open your own row in `/admin/users`. Confirm the **Account lifecycle** section is hidden when viewing yourself.

- [ ] **Step 4: Final commit (only if there are committable changes)**

If Step 2 or any pipeline step produced regenerated/committable files not already committed:

```
git add <the regenerated files>
git commit -m "chore: regenerated artefacts from phase-3 pipeline run"
```

If the working tree is clean after Steps 1–3, state that explicitly and create no commit.

---

## Notes

### Self-protection error codes

Every lifecycle mutation enforces server-side invariants. The frontend maps these codes to friendly i18n strings (`admin.users.errors.*` / `auth.setPassword.*`); the table below is the contract between backend and UI.

| Code | HTTP status | Meaning |
|---|---|---|
| `SELF_DEACTIVATE` | 409 Conflict | An admin attempted to deactivate their own account. A different sysadmin must do it. |
| `SELF_DELETE` | 409 Conflict | An admin attempted to hard-delete their own account. |
| `LAST_SYSADMIN` | 409 Conflict | The action (demote / deactivate / delete) would leave zero active sysadmins. Counted inside the mutation transaction for race-safety. |
| `EMAIL_IN_USE` | 409 Conflict | An invite targeted an email already held by an active user (and no pending invite token exists). |
| `EMAIL_DEACTIVATED` | 409 Conflict | An invite targeted an email held by a deactivated user — reactivate that user instead of inviting. |
| `ALREADY_DEACTIVATED` | 409 Conflict | Deactivate was called on a user who is already deactivated. |
| `ALREADY_ACTIVE` | 409 Conflict | Reactivate was called on a user who is already active. |
| `INVALID_TOKEN` | 400 Bad Request | The set-initial-password token was unknown, expired, or carried an unrecognised identifier prefix. |

`SELF_DEMOTE` (409) from Phase 2 remains in force for role changes; it is not re-listed here because it predates Phase 3.

### YAGNI: single-click vs confirmed actions

Deactivate, reactivate, and send-password-reset are **single-click** actions with no extra confirmation modal. Deactivate and reactivate are fully reversible (they toggle `deactivated_at`), and a password-reset email is harmless — at worst it sends a link the recipient ignores. Only **hard-delete** is irreversible and cascades across sessions, accounts, and memberships, so it alone gets the typed-email confirmation dialog (`UserDeleteDialog`). This is a deliberate scope decision consistent with spec §2's non-goals — no bulk operations, no confirmation ceremony where the action is cheap to undo.

### Email templates: plain text, console transport

Email templates ship as plain-text TypeScript render functions — one file per template (`invite.template.ts`, `password-reset.template.ts`, `admin-password-reset.template.ts`), each with the locale switch (`en` / `sv` / `fi`, fallback `en`) inside. There is no HTML rendering and no real outbound provider in v1: `ConsoleEmailService` writes the rendered email to backend stdout. HTML bodies and a real provider (Resend / SMTP / Postmark) are deferred to v2 per spec §6.3 — both slot in behind the unchanged `EmailService` interface as a single new class, with no changes to `UsersService`, `AuthService`, or the better-auth wiring.
