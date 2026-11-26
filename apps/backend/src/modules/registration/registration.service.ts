import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '@repo/contracts/errors';
import { ageOn, SELF_REGISTRATION_MIN_AGE } from '@repo/contracts/registration';

import { type Env } from '../../config/env.schema.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  AuthHooksRegistry,
  type SocialSignUpHandler,
} from '../../infrastructure/auth/auth-hooks.registry.js';
import { BETTER_AUTH, type Auth } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { LegalDocumentsService } from '../legal-documents/legal-documents.service.js';
import { OrganisationsService } from '../organisations/organisations.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { RankHistoryService } from '../rank-history/rank-history.service.js';
import { UsersService } from '../users/users.service.js';

import { FixedWindowLimiter } from './rate-limiter.js';

import type {
  ApplicableLegalTexts,
  LegalAcknowledgementInput,
  LegalLocale,
} from '@repo/contracts/legal-documents';
import type {
  RegisterInput,
  RegisterResponse,
  RegisterWithGoogleInput,
  RegistrationFederation,
  RegistrationIntent,
} from '@repo/contracts/registration';

const INTENT_PREFIX = 'registration-intent:';

/** What a Google registration intent carries through the sign-in round trip. */
interface IntentPayload {
  locale: LegalLocale;
  dateOfBirth: string;
  federationId: string;
  acknowledgements: LegalAcknowledgementInput[];
}

/** Today's date as `YYYY-MM-DD` in UTC. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Self-registration (docs/superpowers/plans/2026-11-26-self-registration.md):
 * people who are not in a club create an account themselves, choose the
 * national federation whose grading requirements apply, and accept the
 * platform's self-registration texts. The account can sign in once the email
 * address is confirmed. Also handles deleting one's own account.
 */
@Injectable()
export class RegistrationService implements OnModuleInit, SocialSignUpHandler {
  private readonly logger = new Logger(RegistrationService.name);
  /** At most 5 registrations per address and hour. */
  private readonly limiter = new FixedWindowLimiter(5, 60 * 60 * 1000);

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: Auth,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService<Env, true>,
    private readonly legal: LegalDocumentsService,
    private readonly organisations: OrganisationsService,
    private readonly profiles: ProfileService,
    private readonly users: UsersService,
    private readonly rankHistory: RankHistoryService,
    private readonly tokens: VerificationTokenService,
    private readonly hooks: AuthHooksRegistry,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Lets better-auth ask this service whether a Google sign-up may create an account. */
  onModuleInit(): void {
    this.hooks.socialSignUp = this;
  }

  async federations(): Promise<RegistrationFederation[]> {
    const rows = await this.organisations.listNationalFederations();
    return rows
      .map((o) => ({
        id: o.id,
        nameEn: o.nameEn,
        nameSv: o.nameSv,
        nameFi: o.nameFi,
        country: o.country,
      }))
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }

  legalTexts(locale?: LegalLocale): Promise<ApplicableLegalTexts> {
    return this.legal.applicableForSelfRegistration(locale);
  }

  /**
   * The checks every registration passes, by email or Google: rate limit,
   * age, federation and the platform's texts. Returns the acknowledgement
   * rows to store once the user id is known.
   */
  private async checkEligibility(
    input: Pick<RegisterInput, 'dateOfBirth' | 'federationId' | 'locale' | 'acknowledgements'>,
    clientKey: string,
  ) {
    if (!this.limiter.allow(clientKey)) {
      throw new HttpException(
        {
          error: { code: ErrorCodes.RATE_LIMITED, message: 'Too many attempts. Try again later.' },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (
      input.dateOfBirth > todayUtc() ||
      ageOn(input.dateOfBirth, todayUtc()) < SELF_REGISTRATION_MIN_AGE
    ) {
      throw new BadRequestException({
        error: {
          code: 'TOO_YOUNG',
          message: `You must be at least ${SELF_REGISTRATION_MIN_AGE} to register yourself. Ask your club to invite you.`,
        },
      });
    }
    if (!(await this.organisations.isNationalFederation(input.federationId))) {
      throw new BadRequestException({
        error: { code: ErrorCodes.VALIDATION_FAILED, message: 'Choose a national federation.' },
      });
    }
    // Checked before the account exists; the rows get the user id later.
    const applicable = await this.legal.applicableForSelfRegistration(input.locale);
    return this.legal.prepareAcknowledgements('', applicable, input.acknowledgements ?? [], 'registration');
  }

  async register(input: RegisterInput, clientKey: string): Promise<RegisterResponse> {
    const acknowledgements = await this.checkEligibility(input, clientKey);
    const email = input.email.trim().toLowerCase();
    let userId: string;
    try {
      const created = await this.auth.api.signUpEmail({
        body: { email, password: input.password, name: input.name, locale: input.locale },
      });
      userId = created.user.id;
    } catch (err) {
      // An existing address gets the same answer as a new one, so the endpoint
      // does not reveal who has an account.
      const code = (err as { body?: { code?: string } }).body?.code;
      if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        return { status: 'verification_sent' };
      }
      throw err;
    }
    const ctx = await this.auth.$context;
    // signUpEmail signs the new user in server-side; nobody holds that session.
    await ctx.internalAdapter.deleteUserSessions(userId);

    try {
      await this.db.transaction(async (tx) => {
        await this.profiles.initialiseSelfRegistered(
          userId,
          { dateOfBirth: input.dateOfBirth, referenceFederationId: input.federationId },
          tx,
        );
        await this.legal.recordAcknowledgements(
          tx,
          acknowledgements.map((a) => ({ ...a, userId })),
        );
      });
    } catch (err) {
      // Never leave an account behind without its profile and accepted terms.
      await ctx.internalAdapter.deleteUser(userId);
      throw err;
    }

    await this.auth.api.sendVerificationEmail({
      body: {
        email,
        callbackURL: new URL(
          '/verify-email',
          this.config.get('WEB_APP_URL', { infer: true }),
        ).toString(),
      },
    });
    return { status: 'verification_sent' };
  }

  /**
   * Google registration, step 1: run the same checks as an email registration
   * and hand out a one-hour intent for the Google sign-in. The account is only
   * created in better-auth's callback, after {@link allow} accepts the intent.
   */
  async createGoogleIntent(input: RegisterWithGoogleInput, clientKey: string): Promise<RegistrationIntent> {
    await this.checkEligibility(input, clientKey);
    const payload: IntentPayload = {
      locale: input.locale,
      dateOfBirth: input.dateOfBirth,
      federationId: input.federationId,
      acknowledgements: input.acknowledgements ?? [],
    };
    const intent = await this.tokens.issueToken(`${INTENT_PREFIX}${randomUUID()}:${JSON.stringify(payload)}`, 1);
    return { intent };
  }

  /** Google registration, step 2 (better-auth hook): may this sign-up create an account? */
  async allow(intent: unknown): Promise<boolean> {
    if (typeof intent !== 'string' || !(await this.flags.isEnabled('self-registration'))) return false;
    const peeked = await this.tokens.peekToken(intent);
    return peeked?.identifier.startsWith(INTENT_PREFIX) ?? false;
  }

  /**
   * Google registration, step 3 (better-auth hook, after the user row exists):
   * spend the intent and write the profile and acknowledgements. If that
   * fails, the account is removed again so none exists without them.
   */
  async complete(userId: string, intent: unknown): Promise<void> {
    const ctx = await this.auth.$context;
    try {
      const consumed = typeof intent === 'string' ? await this.tokens.consumeToken(intent) : null;
      if (!consumed?.identifier.startsWith(INTENT_PREFIX)) throw new Error('registration intent missing');
      const rest = consumed.identifier.slice(INTENT_PREFIX.length);
      const payload = JSON.parse(rest.slice(rest.indexOf(':') + 1)) as IntentPayload;
      const applicable = await this.legal.applicableForSelfRegistration(payload.locale);
      const acknowledgements = await this.legal.prepareAcknowledgements(
        userId,
        applicable,
        payload.acknowledgements,
        'registration',
      );
      await this.db.transaction(async (tx) => {
        await this.profiles.initialiseSelfRegistered(
          userId,
          { dateOfBirth: payload.dateOfBirth, referenceFederationId: payload.federationId },
          tx,
        );
        await this.legal.recordAcknowledgements(tx, acknowledgements);
      });
    } catch (err) {
      this.logger.warn(`Google registration could not be completed: ${(err as Error).message}`);
      await ctx.internalAdapter.deleteUser(userId);
      throw err;
    }
  }

  async deleteOwnAccount(actor: AuthenticatedUser, password: string): Promise<void> {
    if (!(await this.users.verifyOwnPassword(actor.id, password))) {
      throw new BadRequestException({
        error: { code: 'INVALID_PASSWORD', message: 'The password is not correct.' },
      });
    }
    try {
      await this.db.transaction(async (tx) => {
        await this.rankHistory.deleteAllForUser(actor.id, tx);
        await this.users.deleteOwnAccount(actor, tx);
      });
    } catch (err) {
      // Gradings this user recorded for others keep a reference to them.
      if ((err as { cause?: { code?: string }; code?: string }).cause?.code === '23503') {
        throw new ConflictException({
          error: {
            code: 'ACCOUNT_IN_USE',
            message:
              'Your account is referenced by gradings you recorded for others. Ask an administrator.',
          },
        });
      }
      throw err;
    }
    this.users.forgetCachedUser(actor.id);
  }
}
