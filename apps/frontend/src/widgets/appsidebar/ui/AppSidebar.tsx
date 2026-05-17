import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Building2, LayoutDashboard, LogOut } from 'lucide-react';
import * as React from 'react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut, useSession } from '@/features/auth-by-email';
import { LocaleSwitcher } from '@/features/locale-switcher';
import { AbilityContext } from '@/shared/lib/casl';
import {
  Button,
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
] as const;

export function AppSidebar(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const user = session.data?.user;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const ability = useContext(AbilityContext);

  const handleSignOut = async () => {
    await signOut();
    void navigate({ to: '/' });
  };

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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="gap-3 p-3">
        {user ? (
          <span
            className="truncate text-xs text-on-surface-variant"
            title={user.email}
          >
            {user.email}
          </span>
        ) : null}
        <LocaleSwitcher />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void handleSignOut();
          }}
          className="justify-start gap-2"
        >
          <LogOut className="size-4" />
          {t('header.signOut')}
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
