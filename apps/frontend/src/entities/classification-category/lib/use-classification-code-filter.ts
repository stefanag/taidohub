import * as React from 'react';

import type {
  ClassificationCategory,
  RootCode,
} from '@repo/contracts/classification-category';

import { useClassificationCategoriesByRootQuery } from './hooks.js';

export interface ClassificationCodeFilter {
  /**
   * The full options list — pass straight to
   * `<ClassificationMultiSelect>`. Mutable type (not `readonly`) so
   * the multi-select's props (which expect a non-readonly array)
   * accept it without a cast at the call site.
   */
  options: ClassificationCategory[];
  /** Whether the query is still loading. */
  isPending: boolean;
  /** Convert a CSV of codes (URL-stable) → an array of UUIDs (API-stable). */
  codesToIds: (csv: string | undefined) => string[];
  /** Convert an array of UUIDs → a CSV of codes, or `undefined` when empty. */
  idsToCsv: (ids: string[]) => string | undefined;
}

/**
 * Bridges URL search state (human-readable codes) and API filter
 * state (database UUIDs) for a classification root.
 *
 * Before this hook, every admin list page that filtered by
 * classification re-implemented the same 30-line code↔id memo
 * pattern. The pattern was identical across techniques and
 * patterns — see `AdminTechniquesListPage` and
 * `AdminPatternsListPage` git history before Chunk 2.3 for the
 * duplication.
 *
 * The hook keeps `options` available to callers so they can also
 * pass them straight to `<ClassificationMultiSelect>` without
 * pulling the query in twice.
 */
export function useClassificationCodeFilter(root: RootCode): ClassificationCodeFilter {
  const query = useClassificationCategoriesByRootQuery(root);
  const options = React.useMemo(() => query.data ?? [], [query.data]);

  const idByCode = React.useMemo(
    () => new Map(options.map((c) => [c.code, c.id] as const)),
    [options],
  );
  const codeById = React.useMemo(
    () => new Map(options.map((c) => [c.id, c.code] as const)),
    [options],
  );

  const codesToIds = React.useCallback(
    (csv: string | undefined): string[] =>
      (csv ?? '')
        .split(',')
        .filter(Boolean)
        .map((code) => idByCode.get(code))
        .filter((id): id is string => Boolean(id)),
    [idByCode],
  );

  const idsToCsv = React.useCallback(
    (ids: string[]): string | undefined => {
      const codes = ids
        .map((id) => codeById.get(id))
        .filter((c): c is string => Boolean(c));
      return codes.length > 0 ? codes.join(',') : undefined;
    },
    [codeById],
  );

  return {
    options,
    isPending: query.isPending,
    codesToIds,
    idsToCsv,
  };
}
