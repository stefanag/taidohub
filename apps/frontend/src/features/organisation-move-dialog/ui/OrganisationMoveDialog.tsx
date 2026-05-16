import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Organisation } from '@/entities/organisation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

export interface OrganisationMoveDialogProps {
  organisation: Organisation;
  /** Pre-filtered list of legal parents (caller excludes self + descendants + illegal type combos). */
  candidates: Organisation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (parentId: string | null) => Promise<void>;
}

/**
 * Modal that re-parents an organisation. The caller is responsible for
 * computing the candidate list (excluding self + descendants + illegal type
 * combinations); this component only handles selection and confirmation.
 *
 * The "—" option is offered only for international federations (which must
 * have parent_id = null). For NF / club the user must pick a parent.
 */
export function OrganisationMoveDialog({
  organisation,
  candidates,
  open,
  onOpenChange,
  onConfirm,
}: OrganisationMoveDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const allowNoParent = organisation.type === 'international_federation';
  const [selected, setSelected] = React.useState<string>(
    () => organisation.parentId ?? '__none',
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSelected(organisation.parentId ?? '__none');
    }
  }, [open, organisation.parentId]);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    try {
      const parentId = selected === '__none' ? null : selected;
      await onConfirm(parentId);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.organisations.actions.move', { defaultValue: 'Move' })}: {organisation.nameEn}
          </DialogTitle>
          <DialogDescription>
            {t('admin.organisations.move.description', {
              defaultValue: 'Pick a new parent organisation.',
            })}
          </DialogDescription>
        </DialogHeader>

        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger
            aria-label={t('admin.organisations.fields.parent', { defaultValue: 'Parent' })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowNoParent ? <SelectItem value="__none">—</SelectItem> : null}
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nameEn} ({c.shortCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={submitting}>
            {t('common.confirm', { defaultValue: 'Confirm' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
