import { Link, useRouterState } from '@tanstack/react-router';
import { Award, Building2, Flag, History, LayoutDashboard, ScrollText, UserRound, Users } from 'lucide-react';
import * as React from 'react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AbilityContext } from '@/shared/lib/casl';
import {
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

import { NavUser } from './NavUser.js';

// Static nav config. Each entry is a route the authenticated user can reach
// from the sidebar. When new sections land, add a row here.
const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' as const },
  { to: '/profile', icon: UserRound, labelKey: 'nav.profile' as const },
  { to: '/grading-history', icon: ScrollText, labelKey: 'nav.gradingHistory' as const },
] as const;

export function AppSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ability = useContext(AbilityContext);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        <span className="font-headline text-xl font-extrabold tracking-tight">
          taidohub
        </span>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {ability?.can('manage', 'Organisation') ? (
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
