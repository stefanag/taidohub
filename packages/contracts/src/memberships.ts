import { z } from './zod-openapi.js';

const MEMBERSHIP_UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ORGANISATION_UUID_EXAMPLE = '0e2e8c4b-7a9a-46e1-9d1e-54b8f7d3a2e0';
const ISO_DATETIME_EXAMPLE = '2026-05-18T08:00:00.000Z';

export const MembershipRoleSchema = z
  .enum(['orgadmin', 'instructor'])
  .meta({
    id: 'MembershipRole',
    description: 'Org-scoped role on an `organisation_membership` row.',
    example: 'orgadmin',
  });

export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const OrganisationMembershipSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().min(1),
    organisationId: z.string().uuid(),
    role: MembershipRoleSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({
    id: 'OrganisationMembership',
    description: 'A `(user, organisation, role)` binding.',
    example: {
      id: MEMBERSHIP_UUID_EXAMPLE,
      userId: 'u-admin',
      organisationId: ORGANISATION_UUID_EXAMPLE,
      role: 'orgadmin',
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type OrganisationMembership = z.infer<typeof OrganisationMembershipSchema>;

export const CreateMembershipSchema = z
  .object({
    userId: z.string().min(1),
    organisationId: z.string().uuid(),
    role: MembershipRoleSchema,
  })
  .meta({ id: 'CreateMembershipInput' });

export type CreateMembershipInput = z.infer<typeof CreateMembershipSchema>;

export const UpdateMembershipSchema = z
  .object({
    role: MembershipRoleSchema,
  })
  .meta({ id: 'UpdateMembershipInput' });

export type UpdateMembershipInput = z.infer<typeof UpdateMembershipSchema>;

export const ListMembershipsQuerySchema = z
  .object({
    userId: z.string().min(1).optional(),
    organisationId: z.string().uuid().optional(),
  })
  .meta({ id: 'ListMembershipsQuery' });

export type ListMembershipsQuery = z.infer<typeof ListMembershipsQuerySchema>;

export const ListMembershipsResponseSchema = z
  .object({
    data: OrganisationMembershipSchema.array(),
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'ListMembershipsResponse' });

export type ListMembershipsResponse = z.infer<typeof ListMembershipsResponseSchema>;

export const DeleteMembershipQuerySchema = z
  .object({
    confirm: z.boolean().optional(),
  })
  .meta({
    id: 'DeleteMembershipQuery',
    description:
      'Optional flag to bypass the LAST_ORGADMIN guard on DELETE /api/memberships/:id.',
  });

export type DeleteMembershipQuery = z.infer<typeof DeleteMembershipQuerySchema>;

export const MembershipsOpenApiRegistry = {
  MembershipRole: MembershipRoleSchema,
  OrganisationMembership: OrganisationMembershipSchema,
  CreateMembershipInput: CreateMembershipSchema,
  UpdateMembershipInput: UpdateMembershipSchema,
  ListMembershipsQuery: ListMembershipsQuerySchema,
  ListMembershipsResponse: ListMembershipsResponseSchema,
  DeleteMembershipQuery: DeleteMembershipQuerySchema,
} as const;
