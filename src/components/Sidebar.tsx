import React from 'react';
import type { DataMode } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard,
  Inbox,
  Globe,
  Megaphone,
  Users,
  BarChart3,
  Settings,
  UserCircle,
  LogOut,
  Shield,
  MessageSquare,
  Sun,
  Moon,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  unseenCount: number;
  brandCounts?: { flo: number; nobl: number };
  onBrandSelect?: (brand: 'Flo' | 'Nobl') => void;
  onSelectPage?: (pageId: string, brand: 'Flo' | 'Nobl') => void;
  dataMode?: DataMode;
}

const menuItems = [
  { id: 'inbox', label: 'Comments', icon: MessageSquare, badge: true, permission: 'inbox.view' as const },
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, permission: 'inbox.view' as const },
  { id: 'facebook', label: 'Facebook Feed', icon: Inbox, permission: 'inbox.view' as const },
  { id: 'instagram', label: 'Instagram Feed', icon: Inbox, permission: 'inbox.view' as const },
  { id: 'accounts', label: 'Assets', icon: Globe, permission: 'campaigns.view' as const },
  { id: 'campaigns', label: 'Ads & Campaigns', icon: Megaphone, permission: 'campaigns.view' as const },
  { id: 'reports', label: 'Insights', icon: BarChart3, permission: 'reports.view' as const },
  { id: 'team', label: 'Users', icon: Users, permission: 'team.view' as const },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view' as const },
];

export default function Sidebar({ currentTab, setCurrentTab, unseenCount, brandCounts, onBrandSelect }: SidebarProps) {
  const { user, logout, hasPermission } = useAuth();
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  const visibleItems = menuItems.filter(item => hasPermission(item.permission));

  const displayName = user?.name || user?.username || 'User';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  return (
    <aside className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 md:sticky md:top-0 md:h-screen md:w-[250px] md:shrink-0 md:flex md:flex-col md:border-r md:border-t-0" id="app-sidebar">
      <div className="hidden md:block px-[18px] py-[18px] border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
            <img src="/metadash-icon.svg" alt="MetaDash" className="h-9 w-9 rounded-xl object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold tracking-tight text-slate-950 dark:text-slate-50">MetaDash</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Comment operations</p>
          </div>
        </div>
      </div>

      <nav className="flex h-full items-center gap-1 overflow-x-auto px-2 py-2 md:block md:h-auto md:flex-1 md:space-y-1 md:overflow-y-auto md:px-3 md:py-[14px]">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          const badge = item.badge && unseenCount > 0 ? unseenCount : undefined;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`relative min-w-[70px] flex h-full flex-col items-center justify-center gap-1 rounded-[11px] px-2 py-1.5 text-center text-[11px] transition-all md:h-auto md:w-full md:min-w-0 md:flex-row md:justify-between md:px-3 md:py-[9px] md:text-left md:text-[13.5px] group ${
                isActive
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex flex-col items-center gap-1 md:flex-row md:gap-2.5">
                <Icon
                  className={`w-[18px] h-[18px] transition-colors ${
                    isActive ? 'text-white dark:text-slate-900' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                  }`}
                />
                <span className="leading-none md:leading-normal">{item.label}</span>
              </div>
              {badge !== undefined && (
                <span className={`absolute -mt-9 ml-9 rounded-md px-1.5 py-0.5 text-[10px] font-bold min-w-[20px] text-center md:static md:mt-0 md:ml-0 ${
                  isActive ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900' : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        {hasPermission('inbox.view') && (
          <div className="hidden md:block pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Brands</p>
            <button
              onClick={() => onBrandSelect?.('Flo')}
              className="w-full flex items-center justify-between rounded-[11px] px-3 py-[9px] text-[13.5px] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            >
              <span className="flex items-center gap-2.5"><img src="/brands/flologo.avif" alt="FLO" className="h-5 w-5 rounded-full object-contain ring-1 ring-slate-200 dark:ring-slate-700" /> FLO</span>
              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5">{brandCounts?.flo ?? 0}</span>
            </button>
            <button
              onClick={() => onBrandSelect?.('Nobl')}
              className="w-full flex items-center justify-between rounded-[11px] px-3 py-[9px] text-[13.5px] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            >
              <span className="flex items-center gap-2.5"><img src="/brands/nobllogo.avif" alt="NOBL" className="h-5 w-5 rounded-full object-contain ring-1 ring-slate-200 dark:ring-slate-700" /> NOBL</span>
              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5">{brandCounts?.nobl ?? 0}</span>
            </button>
          </div>
        )}
      </nav>

      {/* User profile footer */}
      <div className="hidden md:block p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <button
          onClick={toggle}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-500" />}
          <span className="flex-1 text-left">{isDark ? 'Light mode' : 'Dark mode'}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{isDark ? 'On' : 'Off'}</span>
        </button>
        <button
          onClick={() => setCurrentTab('profile')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[11px] transition-all text-left ${
            currentTab === 'profile' ? 'bg-slate-100 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
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
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-1">
              {user?.role === 'admin' && <Shield className="w-2.5 h-2.5 text-amber-500" />}
              {user?.title || user?.username}
            </p>
          </div>
          <UserCircle className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
