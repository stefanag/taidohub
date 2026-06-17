import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useDeleteBeltSystem, type BeltSystem } from '@/entities/belt-system';
import { Button } from '@/shared/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.js';

export interface BeltSystemsTableProps {
  systems: BeltSystem[];
  onEdit: (system: BeltSystem) => void;
}

export function BeltSystemsTable({
  systems,
  onEdit,
}: BeltSystemsTableProps): React.ReactElement {
  const { t } = useTranslation();
  const del = useDeleteBeltSystem();
  const [pendingDelete, setPendingDelete] = React.useState<BeltSystem | null>(null);

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-on-surface-variant">
          <tr>
            <th className="py-2">{t('admin.beltCatalog.fields.code')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.nameEn')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.sortOrder')}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {systems.map((s) => (
            <tr key={s.id}>
              <td className="py-2 font-mono">{s.code}</td>
              <td className="py-2">{s.nameEn}</td>
              <td className="py-2">{s.sortOrder}</td>
              <td className="py-2 text-right">
                <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
                  {t('admin.beltCatalog.actions.edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => setPendingDelete(s)}
                >
                  {t('admin.beltCatalog.actions.delete')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.beltCatalog.confirmDelete.title')}</DialogTitle>
            <DialogDescription>
              {t('admin.beltCatalog.confirmDelete.systemBody', {
                code: pendingDelete?.code ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pendingDelete) {
                  del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
                }
              }}
              disabled={del.isPending}
            >
              {t('admin.beltCatalog.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
