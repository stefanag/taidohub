import { Plus } from 'lucide-react';
import * as React from 'react';

import { Button } from '../button.js';

export interface ResourceAdminListPageProps {
  /** Page heading; rendered as the H1. */
  title: string;
  /** Short subtitle below the heading. Capped width by the scaffold. */
  description: string;
  /** "New X" CTA in the top-right. Omit for read-only resources. */
  newAction?: {
    label: string;
    onClick: () => void;
  };
  /** Filter UI rendered above the list. Wrap call site in a fragment to compose multiple controls. */
  filters?: React.ReactNode;
  /** The list itself — usually a `<ul>` of per-entity list-item components. */
  children: React.ReactNode;
}

/**
 * Shared shell for resource-list admin pages.
 *
 * Adopted by `AdminTechniquesListPage` and `AdminPatternsListPage` in
 * Chunk 2.3 of the refactor plan to collapse two duplicated header
 * + filter-row + list-section trees into one component. New
 * resources should use this scaffold as the default; explicit
 * one-off layouts are still allowed when a resource has truly
 * bespoke needs (organisations is the existing example — its
 * tree+move+members surface doesn't fit a flat-list shape and is
 * deliberately not migrated here).
 *
 * Slots, not props for visuals: `filters` and `children` are
 * `ReactNode` slots, not config objects. That keeps the scaffold
 * un-opinionated about which filter controls exist (multi-select,
 * date-range, etc.) and which per-row component renders the list.
 * Resources own those choices; the scaffold owns the chrome.
 */
export function ResourceAdminListPage({
  title,
  description,
  newAction,
  filters,
  children,
}: ResourceAdminListPageProps): React.ReactElement {
  return (
    <main className="container py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">{description}</p>
        </div>
        {newAction ? (
          <Button onClick={newAction.onClick} className="gap-2">
            <Plus className="size-4" aria-hidden />
            {newAction.label}
          </Button>
        ) : null}
      </div>

      {filters ? <section className="mt-6 space-y-3">{filters}</section> : null}

      <section className="mt-8">{children}</section>
    </main>
  );
}
