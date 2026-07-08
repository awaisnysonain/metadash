import React, { useEffect, useState } from 'react';
import type { DataMode } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
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
  PanelLeftClose,
  PanelLeftOpen,
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
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, permission: 'inbox.view' as const },
  { id: 'inbox', label: 'Comments', icon: MessageSquare, badge: true, permission: 'inbox.view' as const },
  { id: 'facebook', label: 'Facebook feed', icon: Inbox, permission: 'inbox.view' as const },
  { id: 'instagram', label: 'Instagram feed', icon: Inbox, permission: 'inbox.view' as const },
  { id: 'accounts', label: 'Assets', icon: Globe, permission: 'campaigns.view' as const },
  { id: 'campaigns', label: 'Ads & campaigns', icon: Megaphone, permission: 'campaigns.view' as const },
  { id: 'reports', label: 'Insights', icon: BarChart3, permission: 'reports.view' as const },
  { id: 'team', label: 'Users', icon: Users, permission: 'team.view' as const },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view' as const },
];

const SIDEBAR_PREF_KEY = 'metadash_sidebar_collapsed';

export default function Sidebar({ currentTab, setCurrentTab, unseenCount, brandCounts, onBrandSelect }: SidebarProps) {
  const { user, logout, hasPermission } = useAuth();
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SIDEBAR_PREF_KEY) : null;
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return null;
  });

  useEffect(() => {
    const update = () => setAutoCollapsed(window.innerWidth < 1280);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const visibleItems = menuItems.filter(item => hasPermission(item.permission));
  const isCollapsed = manualCollapsed ?? autoCollapsed;

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setManualCollapsed(next);
    localStorage.setItem(SIDEBAR_PREF_KEY, String(next));
  };

  const displayName = user?.name || user?.username || 'User';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  return (
    <aside
      className={`fixed bottom-0 left-0 right-0 z-50 h-14 border-t transition-[width] duration-200 md:sticky md:top-0 md:h-screen md:shrink-0 md:flex md:flex-col md:border-r md:border-t-0 ${isCollapsed ? 'md:w-[76px]' : 'md:w-[196px]'}`}
      style={{ background: 'var(--color-ground-2)', borderColor: 'var(--color-line)' }}
      id="app-sidebar"
    >
      <div className={`hidden md:block ${isCollapsed ? 'px-3 py-4' : 'px-4 py-4'}`} style={{ borderBottom: '1px solid var(--color-line)' }}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] shadow-sm"
            style={{ background: 'var(--color-ink)' }}
          >
            <img src="/metadash-icon.svg" alt="" className="h-5 w-5 object-contain invert brightness-0" style={{ filter: 'invert(96%) sepia(3%) saturate(200%) hue-rotate(15deg)' }} />
          </div>
          <div className={`min-w-0 ${isCollapsed ? 'hidden' : ''}`}>
            <h1 className="text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--color-ink)' }}>MetaDash</h1>
            <p className="text-[10.5px] font-medium tracking-wide" style={{ color: 'var(--color-muted)' }}>Comment operations</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`mt-3 hidden h-8 items-center rounded-lg border text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 md:flex ${isCollapsed ? 'w-full justify-center px-0' : 'w-full justify-between px-2.5'}`}
          style={{ borderColor: 'var(--color-line)' }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {!isCollapsed && <span>Collapse</span>}
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className={`flex h-full items-center gap-1 overflow-x-auto px-2 py-1.5 md:block md:h-auto md:flex-1 md:space-y-[2px] md:overflow-y-auto ${isCollapsed ? 'md:px-2 md:py-3' : 'md:px-2.5 md:py-3'}`}>
        <p className={`hidden md:block px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] ${isCollapsed ? 'md:hidden' : ''}`} style={{ color: 'var(--color-muted-2)' }}>Workspace</p>
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          const badge = item.badge && unseenCount > 0 ? unseenCount : undefined;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`relative min-w-[62px] flex h-full flex-col items-center justify-center gap-1 rounded-[9px] px-2 py-1 text-center text-[10.5px] transition-all md:h-auto md:w-full md:min-w-0 md:text-[13px] group ${isCollapsed ? 'md:px-0 md:py-2.5 md:justify-center' : 'md:flex-row md:justify-between md:px-2.5 md:py-[7px] md:text-left'}`}
              style={
                isActive
                  ? { background: 'var(--color-ink)', color: 'var(--color-ground)', fontWeight: 500 }
                  : { color: 'var(--color-ink-2)' }
              }
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(15,18,24,0.05)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <div className={`flex flex-col items-center gap-1 ${isCollapsed ? '' : 'md:flex-row md:gap-2.5'}`}>
                <Icon className="w-[16px] h-[16px] transition-colors" style={{ color: isActive ? 'var(--color-ground)' : 'var(--color-muted-2)' }} />
                <span className={`leading-none md:leading-normal ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
              </div>
              {badge !== undefined && (
                <span
                  className={`absolute -mt-8 ml-8 rounded-md px-1.5 py-0.5 text-[10px] font-bold min-w-[20px] text-center tabular ${isCollapsed ? 'md:-right-1 md:top-1 md:mt-0 md:ml-0' : 'md:static md:mt-0 md:ml-0'}`}
                  style={
                    isActive
                      ? { background: 'rgba(255,255,255,0.15)', color: 'var(--color-ground)' }
                      : { background: 'var(--color-ink)', color: 'var(--color-ground)' }
                  }
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        {hasPermission('inbox.view') && (
          <div className={`hidden md:block pt-3 mt-2 space-y-[2px] ${isCollapsed ? 'md:hidden' : ''}`} style={{ borderTop: '1px solid var(--color-line)' }}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted-2)' }}>Brands</p>
            <button
              onClick={() => onBrandSelect?.('Flo')}
              className="w-full flex items-center justify-between rounded-[9px] px-3 py-[7px] text-[13.5px] transition-colors"
              style={{ color: 'var(--color-ink-2)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,18,24,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: 'var(--color-brand-ig)' }} />
                FLO
              </span>
              <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 tabular" style={{ color: 'var(--color-muted)', background: 'rgba(15,18,24,0.06)' }}>
                {(brandCounts?.flo ?? 0).toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => onBrandSelect?.('Nobl')}
              className="w-full flex items-center justify-between rounded-[9px] px-3 py-[7px] text-[13.5px] transition-colors"
              style={{ color: 'var(--color-ink-2)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,18,24,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: '#3A5F5D' }} />
                NOBL
              </span>
              <span className="text-[10.5px] font-bold rounded-md px-1.5 py-0.5 tabular" style={{ color: 'var(--color-muted)', background: 'rgba(15,18,24,0.06)' }}>
                {(brandCounts?.nobl ?? 0).toLocaleString()}
              </span>
            </button>
          </div>
        )}
      </nav>

      {/* User profile footer */}
      <div className={`hidden md:block p-2.5 space-y-1 ${isCollapsed ? 'px-2' : ''}`} style={{ borderTop: '1px solid var(--color-line)' }}>
        <button
          onClick={() => setCurrentTab('profile')}
          className={`w-full flex items-center rounded-[9px] transition-all text-left ${isCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-2.5 py-2'}`}
          style={{ background: currentTab === 'profile' ? 'rgba(15,18,24,0.06)' : 'transparent' }}
          onMouseEnter={e => { if (currentTab !== 'profile') e.currentTarget.style.background = 'rgba(15,18,24,0.04)'; }}
          onMouseLeave={e => { if (currentTab !== 'profile') e.currentTarget.style.background = 'transparent'; }}
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'linear-gradient(135deg,#4A5B6E,#2A3140)', color: 'var(--color-ground)', fontFamily: 'var(--font-display)' }}
            >
              {initials}
            </div>
          )}
          <div className={`flex-1 min-w-0 ${isCollapsed ? 'hidden' : ''}`}>
            <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-ink)' }}>{displayName}</p>
            <p className="text-[10.5px] truncate flex items-center gap-1" style={{ color: 'var(--color-muted)' }}>
              {user?.role === 'admin' && <Shield className="w-2.5 h-2.5" style={{ color: 'var(--color-sem-amber)' }} />}
              {user?.title || user?.username}
            </p>
          </div>
          <UserCircle className={`w-4 h-4 shrink-0 ${isCollapsed ? 'hidden' : ''}`} style={{ color: 'var(--color-muted-2)' }} />
        </button>
        <button
          onClick={logout}
          className={`w-full flex items-center rounded-[9px] text-[13px] transition-colors ${isCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2'}`}
          style={{ color: 'var(--color-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-sem-red)'; e.currentTarget.style.background = 'var(--color-sem-red-soft)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <LogOut className="w-4 h-4" />
          <span className={isCollapsed ? 'hidden' : ''}>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
