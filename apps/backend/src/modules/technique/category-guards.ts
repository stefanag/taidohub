import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RootCode } from '@repo/contracts/classification-category';
import {
  TECHNIQUE_ALLOWED_ROOTS,
  TECHNIQUE_REQUIRED_ROOT,
} from '@repo/contracts/techniques';

import type { ClassificationCategoryService } from '../classification-category/classification-category.service.js';

/**
 * Validates that a set of `classification_category` ids is acceptable for the
 * given polymorphic entity (currently only `'technique'`).
 *
 * Rules (technique):
 *  1. Duplicate ids are deduped before the round-trip.
 *  2. Every id must resolve to an existing row — unknown ids throw
 *     `NotFoundException` with envelope `INVALID_CATEGORY` + `reason: 'not_found'`.
 *  3. Every id's root code must be in {@link TECHNIQUE_ALLOWED_ROOTS} — otherwise
 *     `BadRequestException` with envelope `INVALID_CATEGORY`.
 *  4. At least one id must resolve to {@link TECHNIQUE_REQUIRED_ROOT}
 *     (`technique_type`) — otherwise `BadRequestException` with envelope
 *     `MISSING_REQUIRED_CATEGORY`.
 *
 * The envelope shape `{ error: { code, message, details } }` mirrors the rest
 * of the backend (see `feature-flags.service.ts`), and the details payload is
 * intentionally rich so the frontend can highlight the offending picker chip.
 */
export async function validateCategoryLinks(
  classifications: ClassificationCategoryService,
  args: { classificationIds: string[]; kind: 'technique' },
): Promise<void> {
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
    if (!(TECHNIQUE_ALLOWED_ROOTS as readonly string[]).includes(r)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_CATEGORY',
          message: `Classification ${id} has root '${r}', which is not allowed for techniques.`,
          details: { offendingId: id, expectedRoots: TECHNIQUE_ALLOWED_ROOTS },
        },
      });
    }
  }

  const hasRequired = dedup.some(
    (id) => roots.get(id) === (TECHNIQUE_REQUIRED_ROOT as RootCode),
  );
  if (!hasRequired) {
    throw new BadRequestException({
      error: {
        code: 'MISSING_REQUIRED_CATEGORY',
        message: `At least one '${TECHNIQUE_REQUIRED_ROOT}' classification is required.`,
        details: { requiredRoot: TECHNIQUE_REQUIRED_ROOT },
      },
    });
  }
}
