import { GradingAgeBasisSchema } from './grading-age.js';
import { z } from './zod-openapi.js';

const ISO_DATE_SCHEMA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD form.')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Date is not a real calendar date.');

export const HokeiGroupInputSchema = z
  .object({
    groupOrder: z.number().int().nonnegative().default(0),
    pickCount: z.number().int().positive().default(1),
    isTested: z.boolean().default(false),
    labelEn: z.string().max(200).nullable().optional(),
    labelFi: z.string().max(200).nullable().optional(),
    labelSv: z.string().max(200).nullable().optional(),
    patternIds: z.array(z.string().uuid()).min(1),
  })
  .meta({
    id: 'HokeiGroupInput',
    description:
      'A pick-N-of-M hokei group. `pickCount` is clamped by the server to `min(pickCount, patternIds.length)`.',
  });

export type HokeiGroupInput = z.infer<typeof HokeiGroupInputSchema>;

export const HokeiGroupSchema = HokeiGroupInputSchema.extend({
  id: z.string().uuid(),
}).meta({
  id: 'HokeiGroup',
  description: 'A hokei group as returned by the resolution endpoint.',
});

export type HokeiGroup = z.infer<typeof HokeiGroupSchema>;

const AgeBound = z.number().int().min(0).max(120).nullable();

export const AgeGroupSchema = z
  .object({ id: z.string().uuid(), ageFrom: AgeBound, ageTo: AgeBound })
  .meta({
    id: 'RequirementAgeGroup',
    description:
      'An age group of one rank in one requirement set. Both bounds inclusive; null = unbounded on that side.',
  });
export type AgeGroup = z.infer<typeof AgeGroupSchema>;

export const AgeGroupInputSchema = z
  .object({
    /** An existing group keeps its variant; omit for a new group. */
    id: z.string().uuid().optional(),
    ageFrom: AgeBound,
    ageTo: AgeBound,
  })
  .refine((g) => g.ageFrom !== null || g.ageTo !== null, { message: 'An age group needs at least one bound.' })
  .refine((g) => g.ageFrom === null || g.ageTo === null || g.ageFrom <= g.ageTo, {
    message: 'ageFrom must not be above ageTo.',
  })
  .meta({ id: 'RequirementAgeGroupInput' });
export type AgeGroupInput = z.infer<typeof AgeGroupInputSchema>;

export const SetAgeGroupsSchema = z
  .object({
    setId: z.string().uuid(),
    groups: z.array(AgeGroupInputSchema).max(10),
  })
  .meta({
    id: 'SetRequirementAgeGroupsInput',
    description:
      'Whole-list replace of a kyu or dan rank\'s age groups in a set. Groups must not overlap. A new group gets a variant copied from the base requirement; a removed group loses its variant. Needs a base requirement.',
  });
export type SetAgeGroupsInput = z.infer<typeof SetAgeGroupsSchema>;

export const SetGradingRequirementsSchema = z
  .object({
    setId: z.string().uuid(),
    /** Replace this age group's variant instead of the base requirement. */
    ageGroupId: z.string().uuid().nullable().optional(),
    hokeiGroups: z.array(HokeiGroupInputSchema).default([]),
    kobo: z.array(z.string().uuid()).default([]),
    koboTested: z.array(z.string().uuid()).default([]),
    otherPatterns: z.array(z.string().uuid()).default([]),
    otherPatternsTested: z.array(z.string().uuid()).default([]),
    kihon: z.array(z.string().uuid()).default([]),
    kihonTested: z.array(z.string().uuid()).default([]),
    jissenMinutes: z.number().int().positive().nullable().optional(),
    jissenTested: z.boolean().default(false),
    minMonthsSincePreviousRank: z.number().int().nonnegative().nullable().optional(),
    requiresTheoricExam: z.boolean().default(false),
    requiresEssay: z.boolean().default(false),
  })
  .meta({
    id: 'SetGradingRequirementsInput',
    description:
      'Whole-scope replace body for PUT /api/requirements/:rankId. Pass setId — the server rejects 400 otherwise.',
  });

export type SetGradingRequirementsInput = z.infer<typeof SetGradingRequirementsSchema>;

export const GradingRequirementsSchema = z
  .object({
    rankId: z.string().uuid(),
    setId: z.string().uuid().nullable(),
    hokeiGroups: z.array(HokeiGroupSchema),
    kobo: z.array(z.string().uuid()),
    koboTested: z.array(z.string().uuid()),
    otherPatterns: z.array(z.string().uuid()),
    otherPatternsTested: z.array(z.string().uuid()),
    kihon: z.array(z.string().uuid()),
    kihonTested: z.array(z.string().uuid()),
    jissenMinutes: z.number().int().nullable(),
    jissenTested: z.boolean(),
    minMonthsSincePreviousRank: z.number().int().nullable(),
    requiresTheoricExam: z.boolean(),
    requiresEssay: z.boolean(),
    /** The age group whose variant this is; null for the base requirement. */
    ageGroup: AgeGroupSchema.nullable(),
    /** Every age group of this rank in this set (empty when it has none). */
    ageGroups: z.array(AgeGroupSchema),
    /** How age is counted where this set applies. */
    ageBasis: GradingAgeBasisSchema,
    /** True when the rank has age groups but the student's date of birth is unknown (base returned). */
    ageUnknown: z.boolean(),
  })
  .meta({
    id: 'GradingRequirements',
    description:
      'Projected requirements for one rank within a single scope. Returned as a fully-formed empty object when no requirements exist for the scope (NOT 404).',
  });

export type GradingRequirements = z.infer<typeof GradingRequirementsSchema>;

export const RequirementSetSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    organisationId: z.string().uuid().nullable(),
    effectiveDate: ISO_DATE_SCHEMA,
    isActive: z.boolean(),
    clonedFromId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'RequirementSet' });

export type RequirementSet = z.infer<typeof RequirementSetSchema>;

export const CreateRequirementSetSchema = z
  .object({
    name: z.string().min(1).max(200),
    organisationId: z.string().uuid().nullable().optional(),
    effectiveDate: ISO_DATE_SCHEMA,
  })
  .meta({ id: 'CreateRequirementSetInput' });

export type CreateRequirementSetInput = z.infer<typeof CreateRequirementSetSchema>;

export const UpdateRequirementSetSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    effectiveDate: ISO_DATE_SCHEMA.optional(),
  })
  .meta({ id: 'UpdateRequirementSetInput' });

export type UpdateRequirementSetInput = z.infer<typeof UpdateRequirementSetSchema>;

export const CloneRequirementSetSchema = z
  .object({ name: z.string().min(1).max(200).optional() })
  .meta({ id: 'CloneRequirementSetInput' });

export type CloneRequirementSetInput = z.infer<typeof CloneRequirementSetSchema>;

export const GradingRequirementsOpenApiRegistry = {
  HokeiGroup: HokeiGroupSchema,
  HokeiGroupInput: HokeiGroupInputSchema,
  SetGradingRequirementsInput: SetGradingRequirementsSchema,
  GradingRequirements: GradingRequirementsSchema,
  GradingAgeBasis: GradingAgeBasisSchema,
  RequirementAgeGroup: AgeGroupSchema,
  RequirementAgeGroupInput: AgeGroupInputSchema,
  SetRequirementAgeGroupsInput: SetAgeGroupsSchema,
  RequirementSet: RequirementSetSchema,
  CreateRequirementSetInput: CreateRequirementSetSchema,
  UpdateRequirementSetInput: UpdateRequirementSetSchema,
  CloneRequirementSetInput: CloneRequirementSetSchema,
} as const;
