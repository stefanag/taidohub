import { Link, useNavigate } from '@tanstack/react-router';
import { EllipsisVertical, Languages, LogOut, Settings } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { signOut, useSession } from '@/features/auth-by-email';
import { LOCALE_OPTIONS, type LocaleCode, useChangeLocale } from '@/features/locale-switcher';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shared/ui';

function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Sidebar footer row that shows the signed-in user and opens a dropdown
 * with Settings, Language picker, and Log out.
 */
export function NavUser(): React.ReactElement | null {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const session = useSession();
  const user = session.data?.user;
  const navigate = useNavigate();
  const { current: currentLocale, change: changeLocale } = useChangeLocale();

  if (!user) return null;

  const displayName = user.name?.trim() || user.email;
  const fallback = initialsOf(displayName);

  const handleSignOut = async () => {
    await signOut();
    void navigate({ to: '/' });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.image ?? undefined} alt={displayName} />
                <AvatarFallback className="rounded-lg bg-primary-container text-on-primary">
                  {fallback}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                {user.name?.trim() ? (
                  <>
                    <span className="truncate font-medium">{user.name.trim()}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </>
                ) : (
                  <span className="truncate font-medium">{user.email}</span>
                )}
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.image ?? undefined} alt={displayName} />
                  <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings />
                  {t('nav.settings')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Languages />
                  {t('nav.language')}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={currentLocale}
                      onValueChange={(value) => changeLocale(value as LocaleCode)}
                    >
                      {LOCALE_OPTIONS.map((opt) => (
                        <DropdownMenuRadioItem key={opt.code} value={opt.code}>
                          {opt.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void handleSignOut();
              }}
            >
              <LogOut />
              {t('header.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
