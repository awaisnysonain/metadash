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

export default function Sidebar({ currentTab, setCurrentTab, unseenCount, dataMode }: SidebarProps) {
  const menuItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, badge: unseenCount > 0 ? unseenCount : undefined, section: 'main' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'main' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, iconColor: 'text-[#1877F2]', section: 'platforms' },
    { id: 'instagram', label: 'Instagram', icon: Instagram, iconColor: 'text-pink-600', section: 'platforms' },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone, section: 'management' },
    { id: 'reports', label: 'Reports', icon: BarChart3, section: 'management' },
    { id: 'team', label: 'Team', icon: Users, section: 'management' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'tools' },
  ];

  const sections = [
    { key: 'main', label: 'Main' },
    { key: 'platforms', label: 'Platforms' },
    { key: 'management', label: 'Management' },
    { key: 'tools', label: 'Settings' },
  ];

  return (
    <aside className="w-56 bg-white text-slate-800 flex flex-col border-r border-slate-200 h-screen sticky top-0 shrink-0" id="app-sidebar">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            M
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 leading-tight">MetaDash</h1>
            <p className="text-[10px] text-slate-400 font-medium">Comment Inbox</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {sections.map(section => (
          <div key={section.key} className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1">{section.label}</p>
            <div className="space-y-0.5">
              {menuItems.filter(item => item.section === section.key).map(item => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left text-xs ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${item.iconColor && !isActive ? item.iconColor : isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-600 text-white min-w-[20px] text-center">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className={`w-2 h-2 rounded-full ${dataMode === 'live' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          {dataMode === 'live' ? 'Live · PostgreSQL' : 'Demo mode'}
        </div>
      </div>
    </aside>
  );
}
