/**
 * Public API for `features/org-membership-manager`.
 *
 * Sysadmin/orgadmin org-scope members table for one organisation, plus the
 * add-member dialog it owns. Mount from `/admin/organisations` (sysadmin) or
 * `/my-organisation` (orgadmin).
 */
export {
  OrgMembershipManager,
  type OrgMembershipManagerProps,
} from './ui/OrgMembershipManager.js';
export {
  OrgMembershipEditor,
  type OrgMembershipEditorProps,
} from './ui/OrgMembershipEditor.js';
