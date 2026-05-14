/**
 * Pure seed logic — given concrete dependencies, ensures a sysadmin row
 * exists and has role='admin'. The CLI wrapper in `./seed.ts` injects real
 * implementations against drizzle + better-auth; tests inject stubs.
 */

export interface SeedDeps {
  /** Returns `null` when no row matches, or `{ id, role }` when one does. */
  findUserByEmail(email: string): Promise<{ id: string; role: string } | null>;
  /** Calls better-auth's server-side sign-up (handles password hashing). */
  signUpEmail(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<void>;
  /** Issues a direct `UPDATE user SET role = ? WHERE email = ?`. */
  setRoleByEmail(email: string, role: string): Promise<void>;
}

export interface SeedConfig {
  email: string;
  password: string;
  name: string;
}

export interface SeedResult {
  /** `true` if a new user row was created; `false` if it already existed. */
  created: boolean;
  /** `true` if the role had to be set to 'admin'; `false` if already admin. */
  promoted: boolean;
}

export async function seedSysadmin(
  deps: SeedDeps,
  config: SeedConfig,
): Promise<SeedResult> {
  const existing = await deps.findUserByEmail(config.email);

  if (!existing) {
    await deps.signUpEmail({
      email: config.email,
      password: config.password,
      name: config.name,
    });
    await deps.setRoleByEmail(config.email, 'admin');
    return { created: true, promoted: true };
  }

  if (existing.role === 'admin') {
    return { created: false, promoted: false };
  }

  await deps.setRoleByEmail(config.email, 'admin');
  return { created: false, promoted: true };
}
