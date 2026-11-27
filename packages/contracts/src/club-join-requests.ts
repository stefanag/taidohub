import { z } from 'zod';

/**
 * Requests from users without a club to join one, decided by the club's
 * orgadmin or instructor. See docs/superpowers/plans/2026-11-26-self-registration.md
 * (phase 3).
 */

const UUID_EXAMPLE = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';

export const CLUB_JOIN_REQUEST_STATUSES = ['pending', 'approved', 'declined', 'cancelled'] as const;
export const ClubJoinRequestStatusSchema = z
  .enum(CLUB_JOIN_REQUEST_STATUSES)
  .meta({ id: 'ClubJoinRequestStatus' });
export type ClubJoinRequestStatus = z.infer<typeof ClubJoinRequestStatusSchema>;

export const JoinableClubSchema = z
  .object({
    id: z.uuid(),
    shortCode: z.string(),
    nameEn: z.string(),
    nameSv: z.string(),
    nameFi: z.string(),
    country: z.string().nullable(),
  })
  .meta({ id: 'JoinableClub', description: 'A club a user can ask to join.' });
export type JoinableClub = z.infer<typeof JoinableClubSchema>;

export const ClubJoinRequestSchema = z
  .object({
    id: z.uuid(),
    club: JoinableClubSchema,
    status: ClubJoinRequestStatusSchema,
    message: z.string().nullable(),
    applicant: z.object({
      userId: z.string(),
      name: z.string().nullable(),
      email: z.string(),
      /** The rank on the applicant's latest passed grading (self-reported until verified). */
      currentRankId: z.uuid().nullable(),
    }),
    createdAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .meta({
    id: 'ClubJoinRequest',
    description:
      'A request to join a club. The club sees name, e-mail, current rank and the message; the grading history only after approval.',
    example: {
      id: UUID_EXAMPLE,
      club: {
        id: UUID_EXAMPLE,
        shortCode: 'STK',
        nameEn: 'Stockholm Taido Club',
        nameSv: 'Stockholms Taidoklubb',
        nameFi: 'Tukholman Taidoseura',
        country: 'SE',
      },
      status: 'pending',
      message: 'I trained in Helsinki for three years.',
      applicant: { userId: 'u_123', name: 'Alex Example', email: 'alex@example.com', currentRankId: null },
      createdAt: '2026-11-27T10:00:00.000Z',
      decidedAt: null,
    },
  });
export type ClubJoinRequest = z.infer<typeof ClubJoinRequestSchema>;

export const CreateClubJoinRequestSchema = z
  .object({
    organisationId: z.uuid(),
    message: z.string().trim().max(1000).nullable().optional(),
  })
  .meta({
    id: 'CreateClubJoinRequestInput',
    description: 'Only a user without any membership may ask, with at most one pending request.',
  });
export type CreateClubJoinRequestInput = z.infer<typeof CreateClubJoinRequestSchema>;

export const ClubJoinRequestsOpenApiRegistry = {
  ClubJoinRequestStatus: ClubJoinRequestStatusSchema,
  JoinableClub: JoinableClubSchema,
  ClubJoinRequest: ClubJoinRequestSchema,
  CreateClubJoinRequestInput: CreateClubJoinRequestSchema,
} as const;
