import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';


import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { type DbUserProfile } from '../../infrastructure/database/schema/index.js';
import { OrganisationsService } from '../organisations/organisations.service.js';
import { UsersRepository } from '../users/users.repository.js';

import { ProfilePatch, ProfileRepository } from './profile.repository.js';

import type { UpdateUserProfileInput, UserProfile } from '@repo/contracts/profile';

@Injectable()
export class ProfileService {
  constructor(
    private readonly repo: ProfileRepository,
    private readonly usersRepo: UsersRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly organisations: OrganisationsService,
  ) {}

  /**
   * The national federation whose grading requirements apply to a user
   * without a student membership. For another module's resolution logic.
   */
  async getReferenceFederationId(userId: string): Promise<string | null> {
    const row = await this.repo.findByUserId(userId);
    return row?.referenceFederationId ?? null;
  }

  /** True when the user registered themselves (and so must verify their email). */
  async isSelfRegistered(userId: string): Promise<boolean> {
    const row = await this.repo.findByUserId(userId);
    return row?.selfRegisteredAt != null;
  }

  /** Writes the profile of a self-registered user inside the registration transaction. */
  async initialiseSelfRegistered(
    userId: string,
    input: { dateOfBirth: string; referenceFederationId: string },
    tx: DrizzleExecutor,
  ): Promise<void> {
    await this.repo.upsert(
      userId,
      {
        dateOfBirth: input.dateOfBirth,
        referenceFederationId: input.referenceFederationId,
        selfRegisteredAt: new Date(),
      },
      tx,
    );
  }

  /** Return the caller's own profile — the empty shape if no row exists yet. */
  async getOwn(user: AuthenticatedUser): Promise<UserProfile> {
    const row = await this.repo.findByUserId(user.id);
    return row ? this.toApi(row) : this.emptyProfile(user.id);
  }

  /**
   * Sysadmin read of any user's profile. The controller's
   * `@CheckAbility('manage', 'User')` gate covers HTTP authorization; this
   * method just performs the lookup. 404s an unknown user; returns the empty
   * shape when the user exists but has no profile row.
   */
  async getByUserId(userId: string, _caller: AuthenticatedUser): Promise<UserProfile> {
    const target = await this.usersRepo.findById(userId);
    if (!target) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      });
    }
    const row = await this.repo.findByUserId(userId);
    return row ? this.toApi(row) : this.emptyProfile(userId);
  }

  /**
   * Upsert the caller's profile from a partial patch. If the patch changes
   * `firstName` / `lastName`, the same transaction syncs `user.name` to the
   * joined "First Last" value (left unchanged when both are empty).
   */
  async updateOwn(user: AuthenticatedUser, input: UpdateUserProfileInput): Promise<UserProfile> {
    if (input.referenceFederationId && !(await this.organisations.isNationalFederation(input.referenceFederationId))) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_FAILED', message: 'Choose a national federation.' },
      });
    }
    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByUserId(user.id, tx);
      const patch = this.buildPatch(input);
      const row = await this.repo.upsert(user.id, patch, tx);

      if ('firstName' in input || 'lastName' in input) {
        const effFirst =
          'firstName' in input ? input.firstName ?? null : existing?.firstName ?? null;
        const effLast =
          'lastName' in input ? input.lastName ?? null : existing?.lastName ?? null;
        const name = [effFirst, effLast]
          .filter((s): s is string => Boolean(s))
          .join(' ')
          .trim();
        if (name) {
          await this.repo.syncUserName(user.id, name, tx);
        }
      }

      return this.toApi(row);
    });
  }

  /**
   * Translate the contract patch into a column patch, copying only the keys
   * that are actually present in `input` so `exactOptionalPropertyTypes` is
   * honoured (an absent key is never written as `undefined`).
   */
  private buildPatch(input: UpdateUserProfileInput): ProfilePatch {
    const patch: ProfilePatch = {};
    if ('firstName' in input) patch.firstName = input.firstName ?? null;
    if ('lastName' in input) patch.lastName = input.lastName ?? null;
    if ('dateOfBirth' in input) patch.dateOfBirth = input.dateOfBirth ?? null;
    if ('taidoStartDate' in input) patch.taidoStartDate = input.taidoStartDate ?? null;
    if ('addressStreet' in input) patch.addressStreet = input.addressStreet ?? null;
    if ('addressPostalCode' in input) patch.addressPostalCode = input.addressPostalCode ?? null;
    if ('addressCity' in input) patch.addressCity = input.addressCity ?? null;
    if ('addressCountry' in input) patch.addressCountry = input.addressCountry ?? null;
    if ('citizenships' in input && input.citizenships) patch.citizenships = input.citizenships;
    if ('aboutMe' in input) patch.aboutMe = input.aboutMe ?? null;
    if ('referenceFederationId' in input) patch.referenceFederationId = input.referenceFederationId ?? null;
    return patch;
  }

  private emptyProfile(userId: string): UserProfile {
    return {
      userId,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      taidoStartDate: null,
      addressStreet: null,
      addressPostalCode: null,
      addressCity: null,
      addressCountry: null,
      citizenships: [],
      aboutMe: null,
      referenceFederationId: null,
    };
  }

  private toApi(row: DbUserProfile): UserProfile {
    return {
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth,
      taidoStartDate: row.taidoStartDate,
      addressStreet: row.addressStreet,
      addressPostalCode: row.addressPostalCode,
      addressCity: row.addressCity,
      addressCountry: row.addressCountry,
      citizenships: row.citizenships,
      aboutMe: row.aboutMe ?? null,
      referenceFederationId: row.referenceFederationId,
    };
  }
}
