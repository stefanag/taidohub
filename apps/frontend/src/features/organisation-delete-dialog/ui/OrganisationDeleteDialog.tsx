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
} from '@/shared/ui';

export interface OrganisationDeleteDialogProps {
  organisation: Organisation;
  childCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirms a hard delete. When the org still has children, swaps the confirm
 * button for a disabled "has children" notice — the sysadmin must reparent
 * or delete the children first.
 */
export function OrganisationDeleteDialog({
  organisation,
  childCount,
  open,
  onOpenChange,
  onConfirm,
}: OrganisationDeleteDialogProps): React.ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = React.useState(false);
  const hasChildren = childCount > 0;

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm();
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
            {t('admin.organisations.actions.delete', { defaultValue: 'Delete' })}
          </DialogTitle>
          <DialogDescription>
            {hasChildren
              ? t('admin.organisations.errors.hasChildren', {
                  defaultValue:
                    'This organisation still has {{count}} child(ren). Reparent or delete them first.',
                  count: childCount,
                })
              : t('admin.organisations.confirm.delete', {
                  defaultValue: 'Delete "{{name}}"? This cannot be undone.',
                  name: organisation.nameEn,
                })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          {hasChildren ? null : (
            <Button
              variant="destructive"
              onClick={() => void handleConfirm()}
              disabled={submitting}
            >
              {t('admin.organisations.actions.delete', { defaultValue: 'Delete' })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
