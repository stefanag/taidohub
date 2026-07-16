/**
 * Idempotent seeder for the Stockholms Taidoförening (STAF) member roster:
 * users, credential accounts (via better-auth's signUpEmail), profiles,
 * org memberships, and rank-history rows.
 *
 * Per the decisions captured in the conversation that produced this seeder:
 *
 *   - Members without an explicit `password` in the fixture get the shared
 *     dev password `password123` and have `(TEST)` appended to their display
 *     name. The marker is the only visible "this user has the shared dev
 *     password, do not use in prod" signal at the DB level.
 *   - `["student"]` role gets no `organisation_membership` row — the
 *     `membership_role` enum only allows `'orgadmin' | 'instructor'`. Pure
 *     students therefore exist as users + profile + rank-history but won't
 *     show up in the org's roster query (the students module INNER-joins
 *     organisation_membership). Filed under: data-model gap to fix later.
 *   - `["clubadmin"]` → membership row with role `orgadmin`.
 *   - Stefan's rank-history rows ship with `source: 'event'`, but the
 *     schema's CHECK constraint requires `eventId NOT NULL` for `event`-
 *     sourced rows. We have no event ids, so all his rows are downgraded
 *     to `source: 'external'` (eventId stays null).
 *   - `verified: true` requires the verified-triple
 *     (verified + verifiedByUserId + verifiedAt) to be set together; we
 *     set `verifiedByUserId = sysadmin`, `verifiedAt = <grading date>T12:00:00Z`.
 *   - Rank slug resolution prefers the SWETA-scoped row for that slug
 *     (STAF is a club under SWETA, so SWETA-curriculum ranks are the
 *     correct ones). Falls back to the global row if no SWETA-scoped one
 *     exists.
 *
 * Re-runs are safe: users resolve by email, profile/membership/rank-history
 * by their natural keys (userId; userId+orgId+role; userId+rankId+date
 * respectively).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import {
  beltRanks,
  organisationMembership,
  organisations,
  rankHistory,
  user,
  userProfile,
} from '../schema/index.js';

const DEFAULT_PASSWORD = 'password123';
const TEST_NAME_MARKER = '(TEST)';

interface SeedRankHistoryEntry {
  rank: string;
  date: string;
  examiner: string;
  /** Default `'external'`; `'event'` is downgraded since we have no event id. */
  source?: 'event' | 'external';
  verified?: boolean;
  shogoTitle?: string;
}

interface SeedMember {
  email: string;
  name: string;
  birthDate: string;
  roles: Array<'instructor' | 'clubadmin' | 'student'>;
  /** Optional explicit password. When omitted, falls back to DEFAULT_PASSWORD. */
  password?: string;
  shogoTitle?: string;
  joinDate: string;
  rankHistory: SeedRankHistoryEntry[];
}

interface ClubMembersSeedJson {
  organisationSlug: string;
  members: SeedMember[];
}

export interface ClubMembersSeedDeps {
  signUpEmail: (input: {
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  /** Email of the user used as `recordedByUserId` / `verifiedByUserId`. */
  sysadminEmail: string;
}

export interface ClubMembersSeedResult {
  users: { inserted: number; updated: number };
  profiles: { inserted: number; updated: number };
  memberships: { inserted: number; updated: number };
  rankHistory: { inserted: number; updated: number };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'club-members.seed.json');

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

function dateToVerifiedAt(date: string): Date {
  // The grading date is a calendar day; treat noon UTC as a neutral point in
  // time on that day so the verified-triple constraint is satisfied without
  // pretending we know the wall-clock minute.
  return new Date(`${date}T12:00:00.000Z`);
}

export async function seedClubMembers(
  db: DrizzleDb,
  deps: ClubMembersSeedDeps,
): Promise<ClubMembersSeedResult> {
  const raw = readFileSync(FIXTURE_PATH, 'utf8').replace(/^ /, '');
  const fixture = JSON.parse(raw) as ClubMembersSeedJson;

  // --- Resolve fixed references --------------------------------------------
  const orgRow = (
    await db
      .select({ id: organisations.id, parentId: organisations.parentId })
      .from(organisations)
      .where(eq(organisations.slug, fixture.organisationSlug))
      .limit(1)
  )[0];
  if (!orgRow) {
    throw new Error(
      `Seed error: organisation with slug "${fixture.organisationSlug}" not found. ` +
        `Run seedOrganisations before seedClubMembers.`,
    );
  }
  const orgId = orgRow.id;
  // The parent (SWETA) provides the curriculum that STAF members are graded
  // against. Used as the preferred lookup scope for rank slugs that exist
  // both globally and per-federation.
  const parentOrgId = orgRow.parentId;

  const sysadminRow = (
    await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, deps.sysadminEmail))
      .limit(1)
  )[0];
  if (!sysadminRow) {
    throw new Error(
      `Seed error: sysadmin user with email "${deps.sysadminEmail}" not found. ` +
        `Run seedSysadmin before seedClubMembers.`,
    );
  }
  const sysadminId = sysadminRow.id;

  const result: ClubMembersSeedResult = {
    users: { inserted: 0, updated: 0 },
    profiles: { inserted: 0, updated: 0 },
    memberships: { inserted: 0, updated: 0 },
    rankHistory: { inserted: 0, updated: 0 },
  };

  // --- Build a slug → rankId map (prefer SWETA's, fall back to global) -----
  const rankSlugs = Array.from(
    new Set(
      fixture.members.flatMap((m) => m.rankHistory.map((r) => r.rank)),
    ),
  );
  const candidateRows = await db
    .select({
      id: beltRanks.id,
      slug: beltRanks.slug,
      organisationId: beltRanks.organisationId,
    })
    .from(beltRanks)
    .where(
      and(
        sql`${beltRanks.slug} IN (${sql.join(
          rankSlugs.map((s) => sql`${s}`),
          sql`, `,
        )})`,
        parentOrgId
          ? or(eq(beltRanks.organisationId, parentOrgId), isNull(beltRanks.organisationId))
          : isNull(beltRanks.organisationId),
      ),
    );

  const rankIdBySlug = new Map<string, string>();
  for (const row of candidateRows) {
    // Prefer the SWETA-scoped row if both exist.
    const existing = rankIdBySlug.get(row.slug ?? '');
    if (!row.slug) continue;
    if (existing && row.organisationId === null) continue;
    rankIdBySlug.set(row.slug, row.id);
  }

  function resolveRankId(slug: string): string {
    const id = rankIdBySlug.get(slug);
    if (!id) {
      throw new Error(
        `Seed error: no belt_rank with slug "${slug}" under organisation ` +
          `${parentOrgId ?? 'global'} or global. Check the belt-catalog seed.`,
      );
    }
    return id;
  }

  // --- Walk members --------------------------------------------------------
  for (const m of fixture.members) {
    const hasOwnPassword = typeof m.password === 'string' && m.password.length > 0;
    const password = m.password ?? DEFAULT_PASSWORD;
    const displayName = hasOwnPassword ? m.name : `${m.name} ${TEST_NAME_MARKER}`;

    // 1) Upsert user via better-auth's signUpEmail (creates user + credential
    //    account in one call). better-auth surfaces an error if the email
    //    already exists; catch and continue as an update.
    const existing = (
      await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, m.email))
        .limit(1)
    )[0];

    if (!existing) {
      await deps.signUpEmail({ email: m.email, password, name: displayName });
      result.users.inserted += 1;
    } else {
      result.users.updated += 1;
    }

    // 2) Re-read to get the id (better-auth mints text ids on sign-up).
    const userRow = (
      await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, m.email))
        .limit(1)
    )[0];
    if (!userRow) {
      throw new Error(`Seed error: user "${m.email}" missing after signUpEmail.`);
    }
    const userId = userRow.id;

    // 3) Patch the freshly-signed-up user: emailVerified, display name with
    //    the (TEST) marker when applicable, Swedish locale (all members are
    //    in a Swedish club). Role stays at the schema default of 'user'.
    await db
      .update(user)
      .set({
        emailVerified: true,
        name: displayName,
        locale: 'sv',
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    // 4) Upsert user_profile.
    const { firstName, lastName } = splitName(m.name);
    const profileExisting = (
      await db
        .select({ userId: userProfile.userId })
        .from(userProfile)
        .where(eq(userProfile.userId, userId))
        .limit(1)
    )[0];
    if (profileExisting) {
      await db
        .update(userProfile)
        .set({
          firstName,
          lastName,
          dateOfBirth: m.birthDate,
          taidoStartDate: m.joinDate,
          shogoTitle: m.shogoTitle ?? null,
          updatedAt: new Date(),
        })
        .where(eq(userProfile.userId, userId));
      result.profiles.updated += 1;
    } else {
      await db.insert(userProfile).values({
        userId,
        firstName,
        lastName,
        dateOfBirth: m.birthDate,
        taidoStartDate: m.joinDate,
        shogoTitle: m.shogoTitle ?? null,
      });
      result.profiles.inserted += 1;
    }

    // 5) Upsert memberships. "clubadmin" → "orgadmin"; "instructor" and
    //    "student" → as-is. 'student' was added to the membership_role
    //    enum so the feedback feature (and the students roster query) can
    //    resolve "linked instructor of student".
    const membershipRoles = new Set<'orgadmin' | 'instructor' | 'student'>();
    for (const r of m.roles) {
      if (r === 'instructor') membershipRoles.add('instructor');
      else if (r === 'clubadmin') membershipRoles.add('orgadmin');
      else if (r === 'student') membershipRoles.add('student');
    }
    for (const role of membershipRoles) {
      const existingMembership = (
        await db
          .select({ id: organisationMembership.id })
          .from(organisationMembership)
          .where(
            and(
              eq(organisationMembership.userId, userId),
              eq(organisationMembership.organisationId, orgId),
              eq(organisationMembership.role, role),
            ),
          )
          .limit(1)
      )[0];
      if (existingMembership) {
        // Nothing to patch — natural key fully describes the row. Bump
        // updatedAt for visibility.
        await db
          .update(organisationMembership)
          .set({ updatedAt: new Date() })
          .where(eq(organisationMembership.id, existingMembership.id));
        result.memberships.updated += 1;
      } else {
        await db.insert(organisationMembership).values({
          userId,
          organisationId: orgId,
          role,
        });
        result.memberships.inserted += 1;
      }
    }

    // 6) Rank history. Natural key for idempotency: (userId, rankId, date).
    for (const rh of m.rankHistory) {
      const rankId = resolveRankId(rh.rank);
      // Downgrade `event` → `external` since we have no event id and the
      // CHECK constraint would reject `source='event' AND eventId IS NULL`.
      const sourceVal: 'event' | 'external' = 'external';
      const verified = rh.verified === true;
      const verifiedTriple = verified
        ? { verified: true, verifiedByUserId: sysadminId, verifiedAt: dateToVerifiedAt(rh.date) }
        : { verified: false, verifiedByUserId: null, verifiedAt: null };

      const baseValues = {
        userId,
        rankId,
        shogoTitle: rh.shogoTitle ?? null,
        date: rh.date,
        result: 'pass' as const,
        source: sourceVal,
        eventId: null,
        recordedByUserId: sysadminId,
        examinerName: rh.examiner,
        organisationName: 'Stockholms Taidoförening',
        notes: null,
        ...verifiedTriple,
      };

      const existingRh = (
        await db
          .select({ id: rankHistory.id })
          .from(rankHistory)
          .where(
            and(
              eq(rankHistory.userId, userId),
              eq(rankHistory.rankId, rankId),
              eq(rankHistory.date, rh.date),
            ),
          )
          .limit(1)
      )[0];

      if (existingRh) {
        await db
          .update(rankHistory)
          .set({ ...baseValues, updatedAt: new Date(), updatedByUserId: sysadminId })
          .where(eq(rankHistory.id, existingRh.id));
        result.rankHistory.updated += 1;
      } else {
        await db.insert(rankHistory).values(baseValues);
        result.rankHistory.inserted += 1;
      }
    }
  }

  return result;
}
