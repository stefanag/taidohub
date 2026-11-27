import { AccountExportSchema, type AccountExport } from '@repo/contracts/account-export';
import { AccountExportRoutes } from '@repo/contracts/routes';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '@/shared/api';

export async function getAccountExport(): Promise<AccountExport> {
  return AccountExportSchema.parse(await httpClient(AccountExportRoutes.export));
}

export function useAccountExportQuery() {
  return useQuery({
    queryKey: ['account-export'],
    queryFn: getAccountExport,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Saves the export as a JSON file named after today's date. */
export function downloadAccountExport(data: AccountExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `taidohub-data-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
