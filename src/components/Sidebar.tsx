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
  ShieldAlert,
  Bot,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  unseenCount: number;
  urgentCount: number;
  dataMode?: DataMode;
}

export default function Sidebar({ currentTab, setCurrentTab, unseenCount, urgentCount, dataMode }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'main' },
    { id: 'inbox', label: 'Unified Inbox', icon: Inbox, badge: unseenCount > 0 ? unseenCount : undefined, section: 'main' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, iconColor: 'text-[#1877F2]', section: 'platforms' },
    { id: 'instagram', label: 'Instagram', icon: Instagram, iconColor: 'text-pink-600', section: 'platforms' },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone, section: 'management' },
    { id: 'team', label: 'Team', icon: Users, section: 'management' },
    { id: 'reports', label: 'Reports', icon: BarChart3, section: 'management' },
    { id: 'simulator', label: 'Webhook Simulator', icon: Bot, highlight: true, section: 'tools' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'tools' },
  ];

  const sections = [
    { key: 'main', label: 'Main' },
    { key: 'platforms', label: 'Platforms' },
    { key: 'management', label: 'Management' },
    { key: 'tools', label: 'Tools' },
  ];

  return (
    <aside className="w-60 bg-white text-slate-800 flex flex-col border-r border-slate-200 h-screen sticky top-0 shrink-0" id="app-sidebar">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            UA
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 leading-tight">Unified Ads</h1>
            <p className="text-[10px] text-slate-400 font-medium">Comment Inbox</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
        <img
          src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120"
          alt="User"
          className="w-8 h-8 rounded-full ring-2 ring-white shadow-sm"
        />
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 truncate">Sarah Jenkins</p>
          <p className="text-[10px] text-slate-400">Ad Ops Lead</p>
        </div>
        <span className="ml-auto w-2 h-2 bg-emerald-500 rounded-full" />
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
                      {item.highlight && !isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      )}
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
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dataMode === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            {dataMode === 'live' ? 'PostgreSQL' : 'Demo'}
          </span>
          <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded">v2.2</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            API Connected
          </span>
        </div>
        {urgentCount > 0 && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-lg p-2.5 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <div className="text-[10px] leading-snug">
              <strong className="block text-red-800">{urgentCount} urgent</strong>
              comments need attention
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
