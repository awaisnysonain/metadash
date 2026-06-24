import React from 'react';
import type { DataMode } from '../lib/config';
import {
  LayoutDashboard,
  Inbox,
  Facebook,
  Instagram,
  Megaphone,
  Users,
  BarChart3,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  unseenCount: number;
  dataMode?: DataMode;
}

const menuItems = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, badge: true },
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'facebook', label: 'Facebook', icon: Facebook, iconColor: 'text-[#1877F2]' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, iconColor: 'text-pink-600' },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ currentTab, setCurrentTab, unseenCount }: SidebarProps) {
  return (
    <aside className="w-52 bg-white flex flex-col border-r border-slate-200/80 h-screen sticky top-0 shrink-0" id="app-sidebar">
      <div className="px-5 py-6 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <div>
            <h1 className="font-semibold text-sm text-slate-900">MetaDash</h1>
            <p className="text-[11px] text-slate-400">Social comments</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          const badge = item.badge && unseenCount > 0 ? unseenCount : undefined;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left text-sm ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-[18px] h-[18px] ${
                    item.iconColor && !isActive
                      ? item.iconColor
                      : isActive
                        ? 'text-blue-600'
                        : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {badge !== undefined && (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-blue-600 text-white min-w-[20px] text-center">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
