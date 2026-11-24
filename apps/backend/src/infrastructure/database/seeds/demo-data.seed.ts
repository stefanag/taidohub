/**
 * Idempotent seeder for fictional demo data, for testing a deployed staging
 * environment (and the MCP server) without real people's data.
 *
 * Creates, under the Swedish federation:
 *   - the club "Demo Taido Club (fictional)";
 *   - a demo orgadmin and a demo instructor for that club;
 *   - six fictional students with grading history and some progress.
 *
 * Every name ends with "(DEMO)" and every address is @example.com, so the
 * rows can never be mistaken for real members. All demo accounts share one
 * password, chosen by whoever runs the seed (never stored in the repo).
 *
 * Refuses to run against production (see `assertDemoSeedAllowed`).
 *
 * Re-runs are safe: the club resolves by slug, users by email, memberships,
 * rank history and progress by their natural keys.
 */
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import {
  beltRanks,
  organisationMembership,
  organisations,
  rankHistory,
  technique,
  user,
  userContentProgress,
  userProfile,
} from '../schema/index.js';

const PRODUCTION_HOSTS = new Set(['taidohub.se', 'www.taidohub.se']);
const DEMO_MARKER = '(DEMO)';
const FEDERATION_SLUG = 'swedish-taido-association';
const CLUB = {
  slug: 'demo-taido-club',
  shortCode: 'DEMO',
  nameEn: 'Demo Taido Club (fictional)',
  nameSv: 'Demo Taidoklubb (påhittad)',
  nameFi: 'Demo Taidoseura (keksitty)',
};

type MembershipRole = 'orgadmin' | 'instructor' | 'student';
type ProgressStatus = 'not_started' | 'learning' | 'competent' | 'grading_ready';

interface DemoPerson {
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  startDate: string;
  roles: MembershipRole[];
  /** Passed gradings, oldest first, by rank slug. */
  gradings: { rank: string; date: string }[];
  /** Progress on the first techniques of the catalogue, in order. */
  progress: ProgressStatus[];
}

const PEOPLE: DemoPerson[] = [
  {
    email: 'demo.orgadmin@example.com',
    firstName: 'Olle',
    lastName: 'Orgadmin',
    birthDate: '1980-03-14',
    startDate: '2005-09-01',
    roles: ['orgadmin'],
    gradings: [],
    progress: [],
  },
  {
    email: 'demo.instructor@example.com',
    firstName: 'Ingrid',
    lastName: 'Instruktör',
    birthDate: '1985-07-02',
    startDate: '2002-01-15',
    roles: ['instructor'],
    gradings: [],
    progress: [],
  },
  {
    email: 'demo.student1@example.com',
    firstName: 'Alva',
    lastName: 'Exempelsson',
    birthDate: '2010-04-21',
    startDate: '2023-08-28',
    roles: ['student'],
    gradings: [
      { rank: '6-kyu', date: '2024-05-18' },
      { rank: '5-kyu', date: '2025-05-17' },
    ],
    progress: ['competent', 'learning', 'learning', 'not_started'],
  },
  {
    email: 'demo.student2@example.com',
    firstName: 'Elis',
    lastName: 'Provsson',
    birthDate: '2008-11-03',
    startDate: '2021-09-01',
    roles: ['student'],
    gradings: [
      { rank: '6-kyu', date: '2022-05-21' },
      { rank: '5-kyu', date: '2023-05-20' },
      { rank: '4-kyu', date: '2024-05-18' },
    ],
    progress: ['grading_ready', 'competent', 'competent', 'learning'],
  },
  {
    email: 'demo.student3@example.com',
    firstName: 'Saga',
    lastName: 'Testberg',
    birthDate: '1999-02-09',
    startDate: '2024-01-10',
    roles: ['student'],
    gradings: [{ rank: '6-kyu', date: '2024-12-07' }],
    progress: ['learning', 'learning', 'not_started', 'not_started'],
  },
  {
    email: 'demo.student4@example.com',
    firstName: 'Noah',
    lastName: 'Mallström',
    birthDate: '2012-06-30',
    startDate: '2025-08-25',
    roles: ['student'],
    gradings: [],
    progress: ['learning', 'not_started', 'not_started', 'not_started'],
  },
  {
    email: 'demo.student5@example.com',
    firstName: 'Freja',
    lastName: 'Påhittad',
    birthDate: '1994-09-12',
    startDate: '2019-02-04',
    roles: ['student'],
    gradings: [
      { rank: '6-kyu', date: '2019-12-14' },
      { rank: '5-kyu', date: '2020-12-12' },
      { rank: '4-kyu', date: '2022-05-21' },
      { rank: '3-kyu', date: '2024-05-18' },
    ],
    progress: ['grading_ready', 'grading_ready', 'competent', 'competent'],
  },
  {
    email: 'demo.student6@example.com',
    firstName: 'Liam',
    lastName: 'Fiktivsson',
    birthDate: '2009-01-25',
    startDate: '2022-09-05',
    roles: ['student'],
    gradings: [{ rank: '6-kyu', date: '2023-05-20' }],
    progress: ['competent', 'learning', 'not_started', 'not_started'],
  },
];

export interface DemoSeedDeps {
  signUpEmail: (input: { email: string; password: string; name: string }) => Promise<void>;
  /** Email of the user recorded as `recordedByUserId` on demo gradings. */
  sysadminEmail: string;
  /** Shared password for every demo account. At least 12 characters. */
  password: string;
}

export interface DemoSeedResult {
  club: 'inserted' | 'existing';
  users: { inserted: number; existing: number };
  memberships: number;
  rankHistory: number;
  progress: number;
}

/**
 * Throws unless the target is a non-production environment. Production is
 * recognised by its public host, which the app knows as `BETTER_AUTH_URL`.
 */
export function assertDemoSeedAllowed(env: { BETTER_AUTH_URL: string }): void {
  const host = new URL(env.BETTER_AUTH_URL).hostname;
  if (PRODUCTION_HOSTS.has(host)) {
    throw new Error(`Refusing to seed demo data into production (${host}).`);
  }
}

export async function seedDemoData(db: DrizzleDb, deps: DemoSeedDeps): Promise<DemoSeedResult> {
  if (deps.password.length < 12) {
    throw new Error('Seed error: the demo password must be at least 12 characters.');
  }

  const federation = (
    await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.slug, FEDERATION_SLUG))
      .limit(1)
  )[0];
  if (!federation) {
    throw new Error(`Seed error: organisation "${FEDERATION_SLUG}" not found. Run seedOrganisations first.`);
  }
  const sysadmin = (
    await db.select({ id: user.id }).from(user).where(eq(user.email, deps.sysadminEmail)).limit(1)
  )[0];
  if (!sysadmin) {
    throw new Error(`Seed error: sysadmin "${deps.sysadminEmail}" not found. Run seedSysadmin first.`);
  }

  const result: DemoSeedResult = {
    club: 'existing',
    users: { inserted: 0, existing: 0 },
    memberships: 0,
    rankHistory: 0,
    progress: 0,
  };

  // --- Club ---------------------------------------------------------------
  let clubId = (
    await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.slug, CLUB.slug)).limit(1)
  )[0]?.id;
  if (!clubId) {
    const [created] = await db
      .insert(organisations)
      .values({
        ...CLUB,
        parentId: federation.id,
        type: 'club',
        country: 'SWE',
        nameJa: '',
        address: 'Fictional — demo data only',
      })
      .returning({ id: organisations.id });
    clubId = created!.id;
    result.club = 'inserted';
  }

  // --- Reference data -----------------------------------------------------
  const rankSlugs = [...new Set(PEOPLE.flatMap((p) => p.gradings.map((g) => g.rank)))];
  const rankRows = await db
    .select({ id: beltRanks.id, slug: beltRanks.slug, organisationId: beltRanks.organisationId })
    .from(beltRanks)
    .where(
      and(
        sql`${beltRanks.slug} IN (${sql.join(
          rankSlugs.map((s) => sql`${s}`),
          sql`, `,
        )})`,
        or(eq(beltRanks.organisationId, federation.id), isNull(beltRanks.organisationId)),
      ),
    );
  const rankIdBySlug = new Map<string, string>();
  for (const row of rankRows) {
    if (!row.slug) continue;
    // Prefer the federation's own rank over the global one.
    if (rankIdBySlug.has(row.slug) && row.organisationId === null) continue;
    rankIdBySlug.set(row.slug, row.id);
  }
  const techniqueIds = (
    await db.select({ id: technique.id }).from(technique).orderBy(asc(technique.nameEn), asc(technique.id)).limit(4)
  ).map((t) => t.id);

  // --- People -------------------------------------------------------------
  for (const person of PEOPLE) {
    const name = `${person.firstName} ${person.lastName} ${DEMO_MARKER}`;
    const found = (await db.select({ id: user.id }).from(user).where(eq(user.email, person.email)).limit(1))[0];
    if (found) {
      result.users.existing += 1;
    } else {
      await deps.signUpEmail({ email: person.email, password: deps.password, name });
      result.users.inserted += 1;
    }
    const userId = (
      await db.select({ id: user.id }).from(user).where(eq(user.email, person.email)).limit(1)
    )[0]!.id;
    await db
      .update(user)
      .set({ name, emailVerified: true, locale: 'sv', updatedAt: new Date() })
      .where(eq(user.id, userId));

    await db
      .insert(userProfile)
      .values({
        userId,
        firstName: person.firstName,
        lastName: `${person.lastName} ${DEMO_MARKER}`,
        dateOfBirth: person.birthDate,
        taidoStartDate: person.startDate,
      })
      .onConflictDoNothing();

    for (const role of person.roles) {
      const hasMembership = (
        await db
          .select({ id: organisationMembership.id })
          .from(organisationMembership)
          .where(
            and(
              eq(organisationMembership.userId, userId),
              eq(organisationMembership.organisationId, clubId),
              eq(organisationMembership.role, role),
            ),
          )
          .limit(1)
      ).length > 0;
      if (!hasMembership) {
        await db.insert(organisationMembership).values({ userId, organisationId: clubId, role });
        result.memberships += 1;
      }
    }

    for (const grading of person.gradings) {
      const rankId = rankIdBySlug.get(grading.rank);
      if (!rankId) {
        throw new Error(`Seed error: no belt rank with slug "${grading.rank}". Check the belt-catalog seed.`);
      }
      const exists = (
        await db
          .select({ id: rankHistory.id })
          .from(rankHistory)
          .where(
            and(eq(rankHistory.userId, userId), eq(rankHistory.rankId, rankId), eq(rankHistory.date, grading.date)),
          )
          .limit(1)
      ).length > 0;
      if (!exists) {
        await db.insert(rankHistory).values({
          userId,
          rankId,
          date: grading.date,
          result: 'pass',
          source: 'external',
          recordedByUserId: sysadmin.id,
          examinerName: `Examinator ${DEMO_MARKER}`,
          organisationName: CLUB.nameSv,
        });
        result.rankHistory += 1;
      }
    }

    for (const [index, status] of person.progress.entries()) {
      const techniqueId = techniqueIds[index];
      if (!techniqueId) break;
      const exists = (
        await db
          .select({ id: userContentProgress.id })
          .from(userContentProgress)
          .where(and(eq(userContentProgress.userId, userId), eq(userContentProgress.techniqueId, techniqueId)))
          .limit(1)
      ).length > 0;
      if (!exists) {
        await db.insert(userContentProgress).values({
          userId,
          contentType: 'technique',
          techniqueId,
          status,
        });
        result.progress += 1;
      }
    }
  }

  return result;
}
