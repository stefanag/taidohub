import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RootCode } from '@repo/contracts/classification-category';
import {
  PATTERN_ALLOWED_ROOTS,
  PATTERN_REQUIRED_ROOT,
} from '@repo/contracts/patterns';
import {
  TECHNIQUE_ALLOWED_ROOTS,
  TECHNIQUE_REQUIRED_ROOT,
} from '@repo/contracts/techniques';

import type { ClassificationCategoryService } from './classification-category.service.js';

/**
 * Polymorphic entity kinds that consume the classification-category taxonomy
 * via a junction table. Each kind defines its own allowed-root whitelist and a
 * single required root (see `ALLOWED` / `REQUIRED` below).
 */
export type GuardKind = 'technique' | 'pattern';

const ALLOWED: Record<GuardKind, readonly RootCode[]> = {
  technique: TECHNIQUE_ALLOWED_ROOTS,
  pattern: PATTERN_ALLOWED_ROOTS,
};

const REQUIRED: Record<GuardKind, RootCode> = {
  technique: TECHNIQUE_REQUIRED_ROOT,
  pattern: PATTERN_REQUIRED_ROOT,
};

/**
 * Validates that a set of `classification_category` ids is acceptable for the
 * given polymorphic entity (`technique` or `pattern`).
 *
 * Rules (per `kind`):
 *  1. Duplicate ids are deduped before the round-trip.
 *  2. Every id must resolve to an existing row — unknown ids throw
 *     `NotFoundException` with envelope `INVALID_CATEGORY` + `reason: 'not_found'`.
 *  3. Every id's root code must be in `ALLOWED[kind]` — otherwise
 *     `BadRequestException` with envelope `INVALID_CATEGORY`.
 *  4. At least one id must resolve to `REQUIRED[kind]` — otherwise
 *     `BadRequestException` with envelope `MISSING_REQUIRED_CATEGORY`.
 *
 * The envelope shape `{ error: { code, message, details } }` mirrors the rest
 * of the backend (see `feature-flags.service.ts`), and the details payload is
 * intentionally rich so the frontend can highlight the offending picker chip.
 */
export async function validateCategoryLinks(
  classifications: ClassificationCategoryService,
  args: { classificationIds: string[]; kind: GuardKind },
): Promise<void> {
  const allowed = ALLOWED[args.kind];
  const required = REQUIRED[args.kind];
  const dedup = Array.from(new Set(args.classificationIds));
  const roots = await classifications.resolveRootCodes(dedup);

  for (const id of dedup) {
    const r = roots.get(id);
    if (r === null || r === undefined) {
      throw new NotFoundException({
        error: {
          code: 'INVALID_CATEGORY',
          message: `Classification ${id} not found.`,
          details: { offendingId: id, reason: 'not_found' },
        },
      });
    }
    if (!(allowed as readonly string[]).includes(r)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_CATEGORY',
          message: `Classification ${id} has root '${r}', which is not allowed for ${args.kind}s.`,
          details: { offendingId: id, expectedRoots: allowed },
        },
      });
    }
  }

  const hasRequired = dedup.some((id) => roots.get(id) === required);
  if (!hasRequired) {
    throw new BadRequestException({
      error: {
        code: 'MISSING_REQUIRED_CATEGORY',
        message: `At least one '${required}' classification is required.`,
        details: { requiredRoot: required },
      },
    });
  }
}
