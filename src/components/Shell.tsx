import type { ReactNode } from 'react';
import * as Avatar from '@radix-ui/react-avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, CircleUserRound, LogOut, Settings } from 'lucide-react';
import { NavLink } from 'react-router';
import { Brand } from './Brand';

export type NavigationItem = {
  label: string;
  to: string;
  icon: ReactNode;
  // Sections with detail routes below them stay highlighted when nested.
  nested?: boolean;
};

export function Shell({
  admin = false,
  identity,
  navigation,
  title,
  description,
  actions,
  onLogout,
  children,
}: {
  admin?: boolean;
  identity: string;
  navigation: NavigationItem[];
  title: string;
  description: string;
  actions?: ReactNode;
  onLogout: () => void;
  children: ReactNode;
}) {
  const initials = identity.slice(0, 2).toUpperCase();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">{admin ? 'System control' : 'Workspace'}</div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink to={item.to} end={!item.nested} className="nav-item">
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <div className="sidebar-footer">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="profile-trigger">
              <Avatar.Root className="avatar"><Avatar.Fallback>{initials}</Avatar.Fallback></Avatar.Root>
              <span className="profile-copy"><b>{identity}</b><small>{admin ? 'Administrator' : 'Account'}</small></span>
              <ChevronDown size={15} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu" side="top" align="start" sideOffset={8}>
                <DropdownMenu.Item className="menu-item" disabled><CircleUserRound size={15} /> Profile</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" disabled><Settings size={15} /> Settings</DropdownMenu.Item>
                <DropdownMenu.Separator className="menu-separator" />
                <DropdownMenu.Item className="menu-item danger" onSelect={onLogout}><LogOut size={15} /> Sign out</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>
      <main className="content">
        <header className="page-header">
          <div><span className="eyebrow">{admin ? 'Administration' : 'Media workspace'}</span><h1>{title}</h1><p>{description}</p></div>
          {actions && <div className="page-actions">{actions}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}
