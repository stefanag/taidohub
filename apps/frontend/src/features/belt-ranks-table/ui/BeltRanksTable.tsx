import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDeleteBeltRank,
  type BeltRank,
} from '@/entities/belt-rank';
import { type BeltSystem } from '@/entities/belt-system';
import { getBeltVisuals } from '@/shared/lib/belt-visuals';
import { Button } from '@/shared/ui';
import { BeltGraphic } from '@/shared/ui/belt-graphic';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.js';

export interface BeltRanksTableProps {
  ranks: BeltRank[];
  systems: BeltSystem[];
  onEdit: (rank: BeltRank) => void;
}

export function BeltRanksTable({
  ranks,
  systems,
  onEdit,
}: BeltRanksTableProps): React.ReactElement {
  const { t } = useTranslation();
  const del = useDeleteBeltRank();
  const [pendingDelete, setPendingDelete] = React.useState<BeltRank | null>(null);

  const systemsById = React.useMemo(() => {
    const map = new Map<string, BeltSystem>();
    for (const s of systems) map.set(s.id, s);
    return map;
  }, [systems]);

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-on-surface-variant">
          <tr>
            <th className="py-2">{t('admin.beltCatalog.preview')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.nameRomaji')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.level')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.system')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.organisation')}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {ranks.map((r) => {
            const sys = systemsById.get(r.systemId);
            const visuals = sys
              ? getBeltVisuals(sys.code, r.level)
              : { gradient: 'white' as const };
            return (
              <tr key={r.id}>
                <td className="w-32 py-2">
                  <BeltGraphic {...visuals} className="w-24" />
                </td>
                <td className="py-2">{r.nameRomaji}</td>
                <td className="py-2">{r.level}</td>
                <td className="py-2">{sys?.nameEn ?? '—'}</td>
                <td className="py-2">
                  {r.organisationId ?? t('admin.beltCatalog.organisationGlobal')}
                </td>
                <td className="py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                    {t('admin.beltCatalog.actions.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() => setPendingDelete(r)}
                  >
                    {t('admin.beltCatalog.actions.delete')}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.beltCatalog.confirmDelete.title')}</DialogTitle>
            <DialogDescription>
              {t('admin.beltCatalog.confirmDelete.rankBody', {
                romaji: pendingDelete?.nameRomaji ?? '',
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
