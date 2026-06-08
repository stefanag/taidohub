import { ChevronDown, ChevronRight, MoreHorizontal, Tag } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { IsoAlpha3 } from '@repo/contracts/organisations';

import {
  countryAlpha2,
  countryName,
  displayName,
  type Organisation,
  type OrganisationNode,
} from '@/entities/organisation';
import { LabelsAttacher } from '@/features/labels';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui';

export interface OrganisationTreeProps {
  nodes: OrganisationNode[];
  onEdit: (org: Organisation) => void;
  onMove: (org: Organisation) => void;
  onDelete: (org: Organisation) => void;
}

/**
 * Recursive tree renderer. Each row carries a per-row dropdown menu with the
 * three management actions; the caller wires the callbacks to its dialog
 * state machine.
 */
export function OrganisationTree({
  nodes,
  onEdit,
  onMove,
  onDelete,
}: OrganisationTreeProps): React.ReactElement {
  return (
    <ul className="space-y-1" role="tree">
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          onEdit={onEdit}
          onMove={onMove}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

interface TreeRowProps {
  node: OrganisationNode;
  depth: number;
  onEdit: (org: Organisation) => void;
  onMove: (org: Organisation) => void;
  onDelete: (org: Organisation) => void;
}

function TreeRow({ node, depth, onEdit, onMove, onDelete }: TreeRowProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = React.useState(true);
  const [labelsOpen, setLabelsOpen] = React.useState(false);
  const hasChildren = node.children.length > 0;
  const indent = { paddingLeft: `${depth * 1.25}rem` };

  const typeKey =
    node.type === 'international_federation'
      ? 'internationalFederation'
      : node.type === 'national_federation'
        ? 'nationalFederation'
        : 'club';

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={false}
    >
      <div
        className="flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-surface-container-low/50"
        style={indent}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={() => setExpanded((v) => !v)}
            className="flex size-5 items-center justify-center rounded text-on-surface-variant hover:text-on-surface"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="size-5" aria-hidden />
        )}

        <span className="flex-1 truncate text-sm">{displayName(node, i18n.language)}</span>

        <Badge variant="outline" className="font-mono text-xs">
          {t(`admin.organisations.types.${typeKey}`, { defaultValue: node.type })}
        </Badge>
        {node.country ? (
          <Badge variant="secondary" className="inline-flex items-center gap-1 font-mono text-xs">
            {(() => {
              const alpha2 = countryAlpha2(node.country as IsoAlpha3);
              return alpha2 ? (
                <span
                  className={`fi fi-${alpha2}`}
                  aria-label={countryName(node.country as IsoAlpha3, i18n.language)}
                />
              ) : null;
            })()}
            {node.country}
          </Badge>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('labels.attach.toggle', { defaultValue: 'Labels' })}
          aria-expanded={labelsOpen}
          onClick={() => setLabelsOpen((v) => !v)}
        >
          <Tag className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(node)}>
              {t('admin.organisations.actions.edit', { defaultValue: 'Edit' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(node)}>
              {t('admin.organisations.actions.move', { defaultValue: 'Move…' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(node)}>
              {t('admin.organisations.actions.delete', { defaultValue: 'Delete' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {labelsOpen ? (
        <div
          className="rounded-md border bg-surface-container-lowest/40 px-3 py-2"
          style={indent}
        >
          <LabelsAttacher targetType="organisation" targetId={node.id} />
        </div>
      ) : null}

      {hasChildren && expanded ? (
        <ul role="group" className="space-y-1">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
