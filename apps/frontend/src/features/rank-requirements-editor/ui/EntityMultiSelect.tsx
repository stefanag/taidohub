import * as React from 'react';

import { Badge, Button, Label } from '@/shared/ui';

/**
 * Chip-style multi-select for arbitrary `{ id, label }` entities (techniques,
 * patterns) with an optional per-chip "Tested" toggle.
 *
 * `ClassificationMultiSelect` (shared/ui) is shaped specifically around
 * `ClassificationCategory` (nameEn/nameSv/nameFi/code) and stays
 * presentational to avoid an `entities`-layer dependency from `shared`. It
 * isn't reusable here — techniques/patterns carry a different localisation
 * shape and this component also needs a second, dependent "tested" selection
 * layered on top of the primary selection, which `ClassificationMultiSelect`
 * has no concept of. Rather than bend that primitive, this is a small
 * sibling built for the two-selection (selected + tested subset) case,
 * copying the same chip visual idiom.
 *
 * Invariant: `tested` is always a subset of `selected`. Toggling an item off
 * `selected` also removes it from `tested`.
 */
export interface EntityOption {
  id: string;
  label: string;
}

export interface EntityMultiSelectProps {
  options: EntityOption[];
  isPending?: boolean;
  selectedIds: string[];
  onSelectedChange: (next: string[]) => void;
  /**
   * Omit to render a plain multi-select with no per-chip "Tested" toggle
   * (e.g. hokei group `patternIds`, which has no per-pattern tested concept
   * — `isTested` is scope-level there). Provide both `testedIds` and
   * `onTestedChange` together to render the toggle.
   */
  testedIds?: string[];
  onTestedChange?: (next: string[]) => void;
  label?: string;
  emptyLabel?: string;
  testedLabel?: string;
  className?: string;
}

export function EntityMultiSelect({
  options,
  isPending = false,
  selectedIds,
  onSelectedChange,
  testedIds,
  onTestedChange,
  label,
  emptyLabel,
  testedLabel = 'Tested',
  className,
}: EntityMultiSelectProps): React.ReactElement {
  const showTested = testedIds !== undefined && onTestedChange !== undefined;
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const testedSet = React.useMemo(() => new Set(testedIds ?? []), [testedIds]);

  const toggleSelected = React.useCallback(
    (id: string) => {
      if (selectedSet.has(id)) {
        onSelectedChange(selectedIds.filter((existing) => existing !== id));
        // Keep the tested-subset invariant: removing from `selected` must
        // also remove from `tested`.
        if (showTested && testedSet.has(id)) {
          onTestedChange!((testedIds ?? []).filter((existing) => existing !== id));
        }
      } else {
        onSelectedChange([...selectedIds, id]);
      }
    },
    [onSelectedChange, onTestedChange, selectedIds, selectedSet, showTested, testedIds, testedSet],
  );

  const toggleTested = React.useCallback(
    (id: string) => {
      if (!showTested) return;
      const current = testedIds ?? [];
      if (testedSet.has(id)) {
        onTestedChange!(current.filter((existing) => existing !== id));
      } else {
        onTestedChange!([...current, id]);
      }
    },
    [onTestedChange, showTested, testedIds, testedSet],
  );

  const selectedOptions = options.filter((opt) => selectedSet.has(opt.id));
  const availableOptions = options.filter((opt) => !selectedSet.has(opt.id));

  return (
    <div className={className}>
      {label ? <Label className="mb-2 block">{label}</Label> : null}

      {selectedOptions.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {selectedOptions.map((opt) => {
            const tested = testedSet.has(opt.id);
            return (
              <li
                key={opt.id}
                className="flex items-center gap-1 rounded-md border border-outline-variant/60 px-2 py-1"
              >
                <Badge variant="secondary">{opt.label}</Badge>
                {showTested ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={tested ? 'default' : 'outline'}
                    aria-pressed={tested}
                    onClick={() => toggleTested(opt.id)}
                  >
                    {testedLabel}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${opt.label}`}
                  onClick={() => toggleSelected(opt.id)}
                >
                  ×
                </Button>
              </li>
            );
          })}
        </ul>
      ) : emptyLabel ? (
        <p className="mb-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : null}

      {isPending && availableOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {availableOptions.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={false}
              onClick={() => toggleSelected(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
