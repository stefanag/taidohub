import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import {
  pendingOperationsQueryOptions,
  useApprovePendingOperation,
  useRejectPendingOperation,
  type PendingOperation,
  type PendingOperationStatus,
} from '@/entities/pending-operation';
import { rankLabel } from '@/shared/lib/rank-label';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

const STATUS_VARIANT: Record<PendingOperationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  approved: 'secondary',
  rejected: 'outline',
  failed: 'destructive',
};

/**
 * Proposals an AI client made on the user's behalf. Nothing in a proposal is
 * saved until the user approves it here; approval runs the same checks as
 * recording the entry by hand.
 */
export function PendingOperationsPage(): React.ReactElement {
  const { t } = useTranslation();
  const query = useQuery(pendingOperationsQueryOptions());
  const approve = useApprovePendingOperation();
  const reject = useRejectPendingOperation();
  const busyId = approve.isPending ? approve.variables : reject.isPending ? reject.variables : null;

  const operations = query.data?.data ?? [];
  const pending = operations.filter((op) => op.status === 'pending');
  const decided = operations.filter((op) => op.status !== 'pending');

  return (
    <main className="mx-auto max-w-[900px] space-y-8 p-8">
      <header>
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
          {t('pendingOperations.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
          {t('pendingOperations.description')}
        </p>
      </header>

      {query.isPending ? (
        <p className="text-sm text-on-surface-variant">{t('pendingOperations.loading')}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-error">
          {t('pendingOperations.loadFailed')}
        </p>
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="pending-heading">
            <h2 id="pending-heading" className="text-lg font-semibold">
              {t('pendingOperations.waiting')}
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t('pendingOperations.empty')}</p>
            ) : (
              pending.map((op) => (
                <OperationCard key={op.id} operation={op}>
                  <CardFooter className="gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busyId === op.id}
                      onClick={() => reject.mutate(op.id)}
                    >
                      {t('pendingOperations.reject')}
                    </Button>
                    <Button
                      type="button"
                      disabled={busyId === op.id}
                      onClick={() => approve.mutate(op.id)}
                    >
                      {t('pendingOperations.approve')}
                    </Button>
                  </CardFooter>
                </OperationCard>
              ))
            )}
            {approve.isError || reject.isError ? (
              <p role="alert" className="text-sm text-error">
                {t('pendingOperations.actionFailed')}
              </p>
            ) : null}
          </section>

          {decided.length > 0 ? (
            <section className="space-y-4" aria-labelledby="decided-heading">
              <h2 id="decided-heading" className="text-lg font-semibold">
                {t('pendingOperations.decided')}
              </h2>
              {decided.map((op) => (
                <OperationCard key={op.id} operation={op} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function OperationCard({
  operation,
  children,
}: {
  operation: PendingOperation;
  children?: React.ReactNode;
}): React.ReactElement {
  const { t, i18n } = useTranslation();
  const { preview } = operation;
  // The preview stores the rank's name as it was when proposed (English).
  // Show it in the UI language from the catalogue; fall back to the stored
  // name if the rank is gone or the catalogue has not loaded.
  const ranks = useQuery(listBeltRanksQueryOptions());
  const rank = ranks.data?.find((r) => r.id === preview.rankId);
  const rankName = rank ? rankLabel(rank, i18n.language) : preview.rankName;
  const details: [string, string | null][] = [
    [t('pendingOperations.fields.date'), preview.date],
    [t('pendingOperations.fields.examiner'), preview.examinerName],
    [t('pendingOperations.fields.organisation'), preview.organisationName],
    [t('pendingOperations.fields.shogoTitle'), preview.shogoTitle],
    [t('pendingOperations.fields.notes'), preview.notes],
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-base">
            {t('pendingOperations.rankEntry', {
              rank: rankName,
              student: preview.studentName ?? preview.studentUserId,
            })}
          </CardTitle>
          <Badge variant={STATUS_VARIANT[operation.status]}>
            {t(`pendingOperations.status.${operation.status}`)}
          </Badge>
        </div>
        <CardDescription>
          {t('pendingOperations.proposedAt', { date: new Date(operation.createdAt).toLocaleString() })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-on-surface-variant">{label}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
        </dl>
        {operation.status === 'failed' && operation.error ? (
          <p className="mt-3 text-sm text-error">
            {t('pendingOperations.failedReason', { reason: operation.error })}
          </p>
        ) : null}
      </CardContent>
      {children}
    </Card>
  );
}
