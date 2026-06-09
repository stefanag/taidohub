import { useQuery } from '@tanstack/react-query';
import { Building2, ScrollText, User as UserIcon, UserRound } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { MembershipEditor } from './MembershipEditor.js';

import type { Role, UpdateUserInput, User } from '@/entities/user';

import { listBeltRanksQueryOptions, type BeltRank } from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import {
  listMembershipsQueryOptions,
  useCreateMembership,
  useDeleteMembership,
  useUpdateMembership,
  type MembershipRole,
} from '@/entities/membership';
import { listOrganisationsQueryOptions, countryName } from '@/entities/organisation';
import { userProfileQueryOptions } from '@/entities/profile';
import {
  gradingHistoryQueryOptions,
  useUnverifyRankHistory,
  useVerifyRankHistory,
  type GradingHistoryRow,
} from '@/entities/rank-history';
import { listShogoTitlesQueryOptions, type ShogoTitle } from '@/entities/shogo-title';
import type { IsoAlpha3 } from '@repo/contracts/organisations';
import { HttpError } from '@/shared/api';
import { FeatureFlag, useFeatureFlag } from '@/shared/lib/feature-flags';
import { Button, FormField, FormMessage, Input, Label, QuillViewer, isEmpty, type Delta } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

import { GradingTimeline } from '@/features/grading-timeline';
import { RankHistoryFormDialog } from '@/features/rank-history-form';
import { ImpersonateActionButton } from '@/features/user-impersonation';

export interface UserFormProps {
  /** The user being edited. */
  user: User;
  /** Id of the currently signed-in admin — used to disable self-role-change. */
  currentUserId: string;
  /** Submit the Details-tab patch (name / role). */
  onSubmit: (input: UpdateUserInput) => Promise<void>;
  submitting?: boolean;
  /** Lifecycle actions — omitted callers simply hide the corresponding button. */
  onDeactivate?: () => void | Promise<void>;
  onReactivate?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onSendPasswordReset?: () => void | Promise<void>;
}

/**
 * Edit form for a user. Four tabs: Details (name + role), Memberships,
 * Profile (read-only view of the user's self-service profile), and
 * Grading history (timeline + admin-side Add/Edit/Verify/Unverify). Email is
 * read-only — better-auth owns it. The role select is disabled when an admin
 * edits their own row (the backend also rejects self-demotion).
 *
 * The Grading history tab reuses the `features/grading-timeline` and
 * `features/rank-history-form` slices bound to `user.id` (not `currentUserId`);
 * verify/unverify is gated server-side by the recorder ≠ verifier rule, so
 * sysadmins cannot verify rows they recorded themselves.
 */
export function UserForm({
  user,
  currentUserId,
  onSubmit,
  submitting,
  onDeactivate,
  onReactivate,
  onDelete,
  onSendPasswordReset,
}: UserFormProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [name, setName] = React.useState<string>(user.name ?? '');
  const [role, setRole] = React.useState<Role>(user.role);
  const [submitError, setSubmitError] = React.useState<string | undefined>();
  const [lifecycleError, setLifecycleError] = React.useState<string | undefined>();
  const [membershipError, setMembershipError] = React.useState<string | undefined>();

  /** Map a caught mutation error to a localized string using the backend error code. */
  const mapErrorCode = React.useCallback(
    (err: unknown): string => {
      if (err instanceof HttpError) {
        switch (err.payload.code) {
          case 'SELF_DEMOTE':
            return t('admin.users.errors.selfDemote', {
              defaultValue: 'You cannot change your own role.',
            });
          case 'LAST_SYSADMIN':
            return t('admin.users.errors.lastSysadmin', {
              defaultValue: 'Cannot demote the last active sysadmin.',
            });
          case 'MEMBERSHIP_EXISTS':
            return t('admin.users.errors.membershipExists', {
              defaultValue: 'That membership already exists.',
            });
          case 'INSTRUCTOR_REQUIRES_CLUB':
            return t('admin.users.errors.instructorRequiresClub', {
              defaultValue: 'Instructor memberships are only allowed on clubs.',
            });
          case 'SELF_DEACTIVATE':
            return t('admin.users.errors.selfDeactivate', {
              defaultValue: 'You cannot deactivate yourself.',
            });
          case 'SELF_DELETE':
            return t('admin.users.errors.selfDelete', {
              defaultValue: 'You cannot delete yourself.',
            });
          case 'ALREADY_DEACTIVATED':
            return t('admin.users.errors.alreadyDeactivated', {
              defaultValue: 'This user is already deactivated.',
            });
          case 'ALREADY_ACTIVE':
            return t('admin.users.errors.alreadyActive', {
              defaultValue: 'This user is already active.',
            });
          case 'EMAIL_IN_USE':
            return t('admin.users.errors.emailInUse', {
              defaultValue: 'A user with this email already exists.',
            });
          case 'EMAIL_DEACTIVATED':
            return t('admin.users.errors.emailDeactivated', {
              defaultValue: 'A deactivated user already has this email. Reactivate them instead.',
            });
          case 'NOT_FOUND':
            return t('admin.users.errors.userNotFound', {
              defaultValue: 'That user no longer exists.',
            });
          default:
            return err.message;
        }
      }
      return err instanceof Error
        ? err.message
        : t('common.unknownError', { defaultValue: 'Unknown error' });
    },
    [t],
  );

  const isSelf = user.id === currentUserId;

  const orgsQuery = useQuery(listOrganisationsQueryOptions());
  const orgById = React.useMemo(() => {
    const m = new Map<string, { label: string; type: string }>();
    for (const o of orgsQuery.data?.data ?? []) {
      m.set(o.id, { label: `${o.nameEn} (${o.shortCode})`, type: o.type });
    }
    return m;
  }, [orgsQuery.data]);

  const membershipsQuery = useQuery(listMembershipsQueryOptions({ userId: user.id }));
  const memberships = membershipsQuery.data?.data ?? [];

  const profileQuery = useQuery(userProfileQueryOptions(user.id));
  const profile = profileQuery.data;

  const historyQuery = useQuery(gradingHistoryQueryOptions(user.id));
  const ranksQueryGH = useQuery(listBeltRanksQueryOptions());
  const systemsQueryGH = useQuery(listBeltSystemsQueryOptions());
  const shogoQueryGH = useQuery(listShogoTitlesQueryOptions());

  const verifyMutation = useVerifyRankHistory();
  const unverifyMutation = useUnverifyRankHistory();

  const [historyDialog, setHistoryDialog] = React.useState<
    { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; entry: GradingHistoryRow }
  >({ kind: 'closed' });
  const gradingHistoryEnabled = useFeatureFlag('grading-history');

  const rankMap = React.useMemo(() => {
    const m = new Map<string, BeltRank>();
    for (const r of ranksQueryGH.data ?? []) m.set(r.id, r);
    return m;
  }, [ranksQueryGH.data]);
  const systemCodeMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of systemsQueryGH.data ?? []) m.set(s.id, s.code);
    return m;
  }, [systemsQueryGH.data]);
  const shogoTitleMap = React.useMemo(() => {
    const m = new Map<string, ShogoTitle>();
    for (const s of shogoQueryGH.data ?? []) m.set(s.code, s);
    return m;
  }, [shogoQueryGH.data]);

  const profileIsEmpty =
    profile !== undefined &&
    profile.firstName === null &&
    profile.lastName === null &&
    profile.dateOfBirth === null &&
    profile.taidoStartDate === null &&
    profile.addressStreet === null &&
    profile.addressPostalCode === null &&
    profile.addressCity === null &&
    profile.addressCountry === null &&
    profile.citizenships.length === 0 &&
    !(profile.aboutMe && !isEmpty(profile.aboutMe as Delta));

  const [editorOpen, setEditorOpen] = React.useState(false);
  const createMembership = useCreateMembership({ onSuccess: () => setEditorOpen(false) });
  const updateMembership = useUpdateMembership({
    onSuccess: () => setMembershipError(undefined),
    onError: (err) => setMembershipError(mapErrorCode(err)),
  });
  const deleteMembership = useDeleteMembership({
    onSuccess: () => setMembershipError(undefined),
    onError: (err) => setMembershipError(mapErrorCode(err)),
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(undefined);
    const input: UpdateUserInput = {};
    if (name.trim() && name.trim() !== (user.name ?? '')) input.name = name.trim();
    if (role !== user.role) input.role = role;
    if (Object.keys(input).length === 0) return;
    try {
      await onSubmit(input);
    } catch (err) {
      setSubmitError(mapErrorCode(err));
    }
  };

  return (
    <Tabs defaultValue="details" className="md:min-h-[44rem]">
      <TabsList>
        <TabsTrigger value="details" className="gap-2">
          <UserIcon className="size-4" aria-hidden />
          {t('admin.auditLog.tabs.details', { defaultValue: 'Details' })}
        </TabsTrigger>
        <TabsTrigger value="memberships" className="gap-2">
          <Building2 className="size-4" aria-hidden />
          {t('admin.users.memberships.title', { defaultValue: 'Memberships' })}
        </TabsTrigger>
        <TabsTrigger value="profile" className="gap-2">
          <UserRound className="size-4" aria-hidden />
          {t('profile.title', { defaultValue: 'My profile' })}
        </TabsTrigger>
        <TabsTrigger value="grading-history" className="gap-2">
          <ScrollText className="size-4" aria-hidden />
          {t('gradingHistory.title', { defaultValue: 'Grading history' })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField>
            <Label htmlFor="user-email">
              {t('admin.users.fields.email', { defaultValue: 'Email' })}
            </Label>
            <Input id="user-email" value={user.email} readOnly disabled />
          </FormField>

          <FormField>
            <Label htmlFor="user-name">
              {t('admin.users.fields.name', { defaultValue: 'Name' })}
            </Label>
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>

          <FormField>
            <Label htmlFor="user-role">
              {t('admin.users.fields.role', { defaultValue: 'Role' })}
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
              <SelectTrigger
                id="user-role"
                aria-label={t('admin.users.fields.role', { defaultValue: 'Role' })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sysadmin">
                  {t('admin.users.roles.sysadmin', { defaultValue: 'System administrator' })}
                </SelectItem>
                <SelectItem value="user">
                  {t('admin.users.roles.user', { defaultValue: 'User' })}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormMessage message={submitError} />

          <Button type="submit" disabled={submitting}>
            {t('admin.users.actions.save', { defaultValue: 'Save' })}
          </Button>
        </form>

        {isSelf ? null : (
          <section className="mt-6 space-y-3 border-t pt-6">
            <h3 className="text-sm font-semibold text-on-surface">
              {t('admin.users.lifecycle.sectionTitle', { defaultValue: 'Account lifecycle' })}
            </h3>
            <div className="flex flex-wrap gap-3">
              <ImpersonateActionButton user={user} />
              {user.deactivatedAt !== null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLifecycleError(undefined);
                    void (async () => {
                      try {
                        await onReactivate?.();
                      } catch (err) {
                        setLifecycleError(mapErrorCode(err));
                      }
                    })();
                  }}
                >
                  {t('admin.users.actions.reactivate', { defaultValue: 'Reactivate' })}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLifecycleError(undefined);
                    void (async () => {
                      try {
                        await onDeactivate?.();
                      } catch (err) {
                        setLifecycleError(mapErrorCode(err));
                      }
                    })();
                  }}
                >
                  {t('admin.users.actions.deactivate', { defaultValue: 'Deactivate' })}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLifecycleError(undefined);
                  void (async () => {
                    try {
                      await onSendPasswordReset?.();
                    } catch (err) {
                      setLifecycleError(mapErrorCode(err));
                    }
                  })();
                }}
              >
                {t('admin.users.actions.sendPasswordReset', {
                  defaultValue: 'Send password reset',
                })}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setLifecycleError(undefined);
                  void (async () => {
                    try {
                      await onDelete?.();
                    } catch (err) {
                      setLifecycleError(mapErrorCode(err));
                    }
                  })();
                }}
              >
                {t('admin.users.actions.delete', { defaultValue: 'Delete' })}
              </Button>
            </div>
            <FormMessage message={lifecycleError} />
          </section>
        )}
      </TabsContent>

      <TabsContent value="memberships" className="space-y-3">
        {memberships.length === 0 ? (
          <p className="text-on-surface-variant">
            {t('admin.users.memberships.empty', { defaultValue: 'No memberships yet.' })}
          </p>
        ) : (
          <ul className="divide-y">
            {memberships.map((m) => {
              const org = orgById.get(m.organisationId);
              const isClub = org?.type === 'club';
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex-1 truncate text-sm">{org?.label ?? m.organisationId}</span>
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      updateMembership.mutate({ id: m.id, role: v as MembershipRole })
                    }
                  >
                    <SelectTrigger
                      className="w-44"
                      aria-label={t('admin.users.memberships.role', { defaultValue: 'Role' })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="orgadmin">
                        {t('admin.users.roles.orgadmin', {
                          defaultValue: 'Organisation administrator',
                        })}
                      </SelectItem>
                      <SelectItem value="instructor" disabled={!isClub}>
                        {t('admin.users.roles.instructor', { defaultValue: 'Instructor' })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMembership.mutate(m.id)}
                    disabled={deleteMembership.isPending}
                  >
                    {t('admin.users.memberships.remove', { defaultValue: 'Remove' })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <FormMessage message={membershipError} />

        <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
          {t('admin.users.memberships.add', { defaultValue: 'Add membership' })}
        </Button>

        <MembershipEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          submitting={createMembership.isPending}
          onConfirm={async (organisationId, role) => {
            await createMembership.mutateAsync({ userId: user.id, organisationId, role });
          }}
        />
      </TabsContent>

      <TabsContent value="profile" className="space-y-3">
        {profileQuery.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : profileQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {profileQuery.error instanceof Error
              ? profileQuery.error.message
              : t('common.unknownError', { defaultValue: 'Unknown error' })}
          </p>
        ) : profileIsEmpty ? (
          <p className="text-on-surface-variant">{t('profile.empty')}</p>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-on-surface-variant">{t('profile.fields.firstName')}</dt>
            <dd>{profile?.firstName ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.lastName')}</dt>
            <dd>{profile?.lastName ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.dateOfBirth')}</dt>
            <dd>{profile?.dateOfBirth ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.taidoStartDate')}</dt>
            <dd>{profile?.taidoStartDate ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressStreet')}</dt>
            <dd>{profile?.addressStreet ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressPostalCode')}</dt>
            <dd>{profile?.addressPostalCode ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressCity')}</dt>
            <dd>{profile?.addressCity ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressCountry')}</dt>
            <dd>
              {profile?.addressCountry
                ? `${countryName(profile.addressCountry as IsoAlpha3, i18n.language)} (${profile.addressCountry})`
                : '—'}
            </dd>
            <dt className="text-on-surface-variant">{t('profile.fields.citizenships')}</dt>
            <dd>
              {profile && profile.citizenships.length > 0
                ? profile.citizenships
                    .map((c) => `${countryName(c as IsoAlpha3, i18n.language)} (${c})`)
                    .join(', ')
                : '—'}
            </dd>
            <dt className="text-on-surface-variant">{t('profile.fields.aboutMe')}</dt>
            <dd>
              {profile?.aboutMe && !isEmpty(profile.aboutMe as Delta) ? (
                <QuillViewer value={profile.aboutMe as Delta} />
              ) : (
                '—'
              )}
            </dd>
          </dl>
        )}
      </TabsContent>

      <TabsContent value="grading-history" className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-sm text-on-surface-variant">
            {t('gradingHistory.adminDescription', {
              defaultValue: 'Grading history recorded for this user.',
            })}
          </p>
          <FeatureFlag code="grading-history">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryDialog({ kind: 'create' })}
            >
              {t('gradingHistory.addPastGrading', { defaultValue: 'Add past grading' })}
            </Button>
          </FeatureFlag>
        </div>

        {historyQuery.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : historyQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {historyQuery.error instanceof Error
              ? historyQuery.error.message
              : t('common.unknownError')}
          </p>
        ) : (
          <GradingTimeline
            entries={historyQuery.data?.data ?? []}
            rankMap={rankMap}
            systemCodeMap={systemCodeMap}
            shogoTitleMap={shogoTitleMap}
            onEdit={(entry) => setHistoryDialog({ kind: 'edit', entry })}
            onVerify={(id) => verifyMutation.mutate({ id, subjectUserId: user.id })}
            onUnverify={(id) => unverifyMutation.mutate({ id, subjectUserId: user.id })}
          />
        )}

        {gradingHistoryEnabled && historyDialog.kind !== 'closed' ? (
          <RankHistoryFormDialog
            mode={historyDialog.kind}
            open
            onOpenChange={(o) => {
              if (!o) setHistoryDialog({ kind: 'closed' });
            }}
            subjectUserId={user.id}
            {...(historyDialog.kind === 'edit' ? { entry: historyDialog.entry } : {})}
          />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
