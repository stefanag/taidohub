import { Link } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { downloadAccountExport, getAccountExport } from '../api/account-export.api.js';

import { Button } from '@/shared/ui';

/**
 * "Your data" on the profile page: download everything as JSON (data
 * portability), or open a printable summary to save as PDF from the browser.
 */
export function ExportOwnDataSection(): React.ReactElement {
  const { t } = useTranslation();
  const [state, setState] = React.useState<'idle' | 'busy' | 'error'>('idle');

  const onDownload = async () => {
    setState('busy');
    try {
      downloadAccountExport(await getAccountExport());
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="export-own-data-heading">
      <h2 id="export-own-data-heading" className="text-lg font-semibold">
        {t('exportData.title')}
      </h2>
      <p className="text-sm text-on-surface-variant">{t('exportData.intro')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => void onDownload()} disabled={state === 'busy'}>
          <Download aria-hidden />
          {t('exportData.download')}
        </Button>
        <Link to="/my-data" className="text-sm text-primary underline">
          {t('exportData.printable')}
        </Link>
      </div>
      {state === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('common.unknownError')}
        </p>
      ) : null}
    </section>
  );
}
