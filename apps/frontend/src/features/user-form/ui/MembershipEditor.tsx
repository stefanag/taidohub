import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { MembershipRole } from '@/entities/membership';

import { listOrganisationsQueryOptions } from '@/entities/organisation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Label,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface MembershipEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen organisation + role when the admin confirms. */
  onConfirm: (organisationId: string, role: MembershipRole) => Promise<void>;
  submitting?: boolean;
}

/**
 * Sub-dialog used by the user-form Memberships tab to add a new membership:
 * pick an organisation + a role. The `instructor` role is disabled unless the
 * picked organisation is a club (the backend enforces the same invariant).
 */
export function MembershipEditor({
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: MembershipEditorProps): React.ReactElement {
  const { t } = useTranslation();
  const { data } = useQuery(listOrganisationsQueryOptions());
  const organisations = data?.data ?? [];

  const [organisationId, setOrganisationId] = React.useState<string>('');
  const [role, setRole] = React.useState<MembershipRole>('orgadmin');
  const [error, setError] = React.useState<string | undefined>();

  const pickedOrg = organisations.find((o) => o.id === organisationId);
  const instructorAllowed = pickedOrg?.type === 'club';

  // Reset local state whenever the dialog closes, so a stale validation
  // error or half-filled selection doesn't survive into the next open.
  React.useEffect(() => {
    if (!open) {
      setError(undefined);
      setOrganisationId('');
      setRole('orgadmin');
    }
  }, [open]);

  // Keep role consistent: if the picked org isn't a club, force orgadmin.
  React.useEffect(() => {
    if (!instructorAllowed && role === 'instructor') setRole('orgadmin');
  }, [instructorAllowed, role]);

  const handleConfirm = async (): Promise<void> => {
    setError(undefined);
    if (!organisationId) {
      setError(t('admin.users.memberships.organisation', { defaultValue: 'Organisation' }));
      return;
    }
    try {
      await onConfirm(organisationId, role);
      setOrganisationId('');
      setRole('orgadmin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.memberships.add', { defaultValue: 'Add membership' })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField>
            <Label htmlFor="membership-org">
              {t('admin.users.memberships.organisation', { defaultValue: 'Organisation' })}
            </Label>
            <Select value={organisationId} onValueChange={setOrganisationId}>
              <SelectTrigger
                id="membership-org"
                aria-label={t('admin.users.memberships.organisation', { defaultValue: 'Organisation' })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {organisations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nameEn} ({o.shortCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="membership-role">
              {t('admin.users.memberships.role', { defaultValue: 'Role' })}
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v as MembershipRole)}>
              <SelectTrigger
                id="membership-role"
                aria-label={t('admin.users.memberships.role', { defaultValue: 'Role' })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="orgadmin">
                  {t('admin.users.roles.orgadmin', { defaultValue: 'Organisation administrator' })}
                </SelectItem>
                <SelectItem value="instructor" disabled={!instructorAllowed}>
                  {t('admin.users.roles.instructor', { defaultValue: 'Instructor' })}
                </SelectItem>
              </SelectContent>
            </Select>
            {!instructorAllowed && organisationId ? (
              <p className="text-xs text-on-surface-variant">
                {t('admin.users.memberships.instructorRequiresClub', {
                  defaultValue: 'Instructor is only allowed on clubs.',
                })}
              </p>
            ) : null}
          </FormField>

          <FormMessage message={error} />

          <Button onClick={() => void handleConfirm()} disabled={submitting}>
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
