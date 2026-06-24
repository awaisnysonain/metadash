import React from 'react';
import type { DataMode } from '../lib/config';
import type { AppUser } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Inbox,
  Facebook,
  Instagram,
  Globe,
  Megaphone,
  Users,
  BarChart3,
  Settings,
  UserCircle,
  LogOut,
  Shield,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  unseenCount: number;
  dataMode?: DataMode;
}

const menuItems = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, badge: true, permission: 'inbox.view' as const },
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, permission: 'inbox.view' as const },
  { id: 'facebook', label: 'Facebook', icon: Facebook, iconColor: 'text-[#1877F2]', permission: 'inbox.view' as const },
  { id: 'instagram', label: 'Instagram', icon: Instagram, iconColor: 'text-pink-600', permission: 'inbox.view' as const },
  { id: 'accounts', label: 'Accounts', icon: Globe, permission: 'campaigns.view' as const },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, permission: 'campaigns.view' as const },
  { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' as const },
  { id: 'team', label: 'Team', icon: Users, permission: 'team.view' as const },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view' as const },
];

export default function Sidebar({ currentTab, setCurrentTab, unseenCount }: SidebarProps) {
  const { user, logout, hasPermission } = useAuth();

  const visibleItems = menuItems.filter(item => hasPermission(item.permission));

  const initials = user?.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  return (
    <aside className="w-60 bg-white flex flex-col border-r border-slate-200/80 h-screen sticky top-0 shrink-0" id="app-sidebar">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/25">
            M
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 tracking-tight">MetaDash</h1>
            <p className="text-[10px] text-slate-400 font-medium">Social comments</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          const badge = item.badge && unseenCount > 0 ? unseenCount : undefined;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left text-sm group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-medium'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-[18px] h-[18px] transition-colors ${
                    item.iconColor && !isActive
                      ? item.iconColor
                      : isActive
                        ? 'text-white'
                        : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {badge !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center ${
                  isActive ? 'bg-white/25 text-white' : 'bg-blue-600 text-white'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User profile footer */}
      <div className="p-3 border-t border-slate-100 space-y-1">
        <button
          onClick={() => setCurrentTab('profile')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
            currentTab === 'profile' ? 'bg-slate-100' : 'hover:bg-slate-50'
          }`}
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
              {user?.role === 'admin' && <Shield className="w-2.5 h-2.5 text-amber-500" />}
              {user?.title || user?.username}
            </p>
          </div>
          <UserCircle className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
