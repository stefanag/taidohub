import { Link, useRouterState } from '@tanstack/react-router';
import { Award, BookOpen, Building2, ClipboardCheck, ClipboardList, Flag, GraduationCap, History, LayoutDashboard, LibraryBig, ScrollText, Swords, Tag, UserRound, Users, Wrench } from 'lucide-react';
import * as React from 'react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { NavUser } from './NavUser.js';

import { useMyMembershipsQuery } from '@/entities/me';
import { AbilityContext } from '@/shared/lib/casl';
import {
  Logo,
  LogoMark,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/shared/ui';


// Static nav config. Each entry is a route the authenticated user can reach
// from the sidebar. When new sections land, add a row here.
const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' as const },
  { to: '/profile', icon: UserRound, labelKey: 'nav.profile' as const },
  { to: '/grading-history', icon: ScrollText, labelKey: 'nav.gradingHistory' as const },
  { to: '/techniques', icon: Swords, labelKey: 'nav.techniques' as const },
  { to: '/patterns', icon: BookOpen, labelKey: 'nav.patterns' as const },
] as const;

export function AppSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ability = useContext(AbilityContext);

  // Students entry is visible to instructors (org-scoped role from
  // /api/me/memberships) and to sysadmins (CASL `manage all`). The
  // membership query is cheap and cached for 5 min by the entity layer.
  const { data: memberships = [] } = useMyMembershipsQuery();
  const isInstructor = memberships.some((m) => m.role === 'instructor');
  const showStudents = isInstructor || ability?.can('manage', 'all') === true;
  const isOrgAdmin = memberships.some((m) => m.role === 'orgadmin');

  // RequirementSet is manageable by sysadmins (CASL `manage all`) and by
  // org-scoped orgadmin/instructor members (mirrors the backend's
  // `GradingRequirementsAbilityRules`, which the frontend ability doesn't
  // model since better-auth sessions carry no memberships).
  const canManageRequirementSets =
    ability?.can('manage', 'all') === true ||
    memberships.some((m) => m.role === 'orgadmin' || m.role === 'instructor');

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        <Logo className="h-8 w-auto group-data-[collapsible=icon]:hidden" />
        <LogoMark className="hidden size-6 group-data-[collapsible=icon]:block" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.to)}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {showStudents ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith('/students')}
                  >
                    <Link to="/students">
                      <GraduationCap />
                      <span>{t('nav.students')}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              {isOrgAdmin ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith('/my-organisation')}
                  >
                    <Link to="/my-organisation">
                      <Building2 />
                      <span>{t('nav.myOrganisation')}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {ability?.can('manage', 'Organisation') || canManageRequirementSets ? (
          <SidebarGroup>
            <SidebarGroupLabel>{t('admin.title')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ability?.can('manage', 'User') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/users')}
                    >
                      <Link to="/admin/users">
                        <Users />
                        <span>{t('nav.adminUsers')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('manage', 'Organisation') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/organisations')}
                    >
                      <Link to="/admin/organisations">
                        <Building2 />
                        <span>{t('nav.adminOrganisations')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('manage', 'Organisation') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/audit-log')}
                    >
                      <Link to="/admin/audit-log">
                        <History />
                        <span>{t('nav.adminAuditLog')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('manage', 'BeltRank') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/belt-catalog')}
                    >
                      <Link to="/admin/belt-catalog">
                        <Award />
                        <span>{t('nav.adminBeltCatalog')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('manage', 'Tag') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/labels')}
                    >
                      <Link to="/admin/labels">
                        <Tag />
                        <span>{t('nav.adminLabels')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('create', 'Technique') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/techniques')}
                    >
                      <Link to="/admin/techniques">
                        <Wrench />
                        <span>{t('nav.adminTechniques')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('create', 'Pattern') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/patterns')}
                    >
                      <Link to="/admin/patterns">
                        <LibraryBig />
                        <span>{t('nav.adminPatterns')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {ability?.can('manage', 'FeatureFlag') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/feature-flags')}
                    >
                      <Link to="/admin/feature-flags">
                        <Flag />
                        <span>{t('nav.adminFeatureFlags')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {canManageRequirementSets ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/requirement-sets')}
                    >
                      <Link to="/admin/requirement-sets">
                        <ClipboardList />
                        <span>{t('nav.adminRequirementSets')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {canManageRequirementSets ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/rank-requirements')}
                    >
                      <Link to="/admin/rank-requirements">
                        <ClipboardCheck />
                        <span>{t('nav.adminRankRequirements')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
