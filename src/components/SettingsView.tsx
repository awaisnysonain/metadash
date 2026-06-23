import React from 'react';
import type { DataMode } from '../lib/config';
import { AutoTaggingRule, TeamMember } from '../types';
import { connectedPages, mockAdAccounts } from '../data';
import { apiClient, type HealthStatus } from '../services/apiClient';
import {
  Settings, Facebook, Instagram, Key, Trash2, Bell, PlusCircle, Globe, Users, Zap,
  CreditCard, Database, FlaskConical, RefreshCw, CloudDownload, CheckCircle, AlertCircle,
} from 'lucide-react';

interface SettingsViewProps {
  autoTaggingRules: AutoTaggingRule[];
  teamMembers: TeamMember[];
  dataMode: DataMode;
  isDemoMode: boolean;
  onReload: () => Promise<void>;
  onAddRule: (keyword: string, tag: string, priority: string) => void;
  onDeleteRule: (id: string) => void;
}

export default function SettingsView({
  autoTaggingRules, teamMembers, dataMode, isDemoMode, onReload, onAddRule, onDeleteRule,
}: SettingsViewProps) {
  const [keyword, setKeyword] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [priority, setPriority] = React.useState('Medium');
  const [pagesList, setPagesList] = React.useState(connectedPages);
  const [webhookUrl] = React.useState(import.meta.env.VITE_META_WEBHOOK_URL || 'https://meta-dashboard.nysonik.com/api/meta/webhook');
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [syncMessage, setSyncMessage] = React.useState('');
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    apiClient.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const runSync = async (fn: () => Promise<{ message: string }>, label: string) => {
    setSyncing(true);
    setSyncMessage(`Syncing ${label}…`);
    try {
      const result = await fn();
      setSyncMessage(result.message);
      await onReload();
    } catch (err) {
      setSyncMessage(`Sync failed: ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id="settings-screen">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" /> Settings
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Production: meta-dashboard.nysonik.com · PostgreSQL erp_meta_dashboard
        </p>
      </div>

      <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
        <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-600" /> Data Mode
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`p-4 rounded-xl border-2 ${!isDemoMode ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
            <Database className="w-5 h-5 text-indigo-600 mb-2" />
            <p className="font-bold text-sm">Production (PostgreSQL)</p>
            <p className="text-xs text-slate-500 mt-1">VITE_DEMO_MODE=false</p>
          </div>
          <div className={`p-4 rounded-xl border-2 ${isDemoMode ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
            <FlaskConical className="w-5 h-5 text-amber-600 mb-2" />
            <p className="font-bold text-sm">Demo Mode</p>
            <p className="text-xs text-slate-500 mt-1">VITE_DEMO_MODE=true</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">Current mode: <strong>{dataMode}</strong></p>
        {health && (
          <div className="flex flex-wrap gap-3 text-xs mt-3">
            <span className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${health.database ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200'}`}>
              {health.database ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              Database {health.database ? 'connected' : 'offline'}
            </span>
            <span className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${health.metaAccessToken ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {health.metaAccessToken ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              Access token {health.metaAccessToken ? 'set' : 'missing'}
            </span>
            <span className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${health.meta ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200'}`}>
              Meta API {health.meta ? 'configured' : 'placeholder'}
            </span>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
        <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
          <CloudDownload className="w-4 h-4 text-indigo-600" /> Meta Sync
        </h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { label: 'Ads', fn: apiClient.syncAds },
            { label: 'Pages', fn: apiClient.syncPages },
            { label: 'Instagram', fn: apiClient.syncInstagram },
            { label: 'Campaigns', fn: apiClient.syncCampaigns },
          ].map(item => (
            <button key={item.label} disabled={syncing || isDemoMode} onClick={() => runSync(item.fn, item.label)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold disabled:opacity-50">
              Sync {item.label}
            </button>
          ))}
          <button disabled={syncing || isDemoMode} onClick={() => runSync(apiClient.syncAll, 'all')}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} /> Sync All
          </button>
        </div>
        {syncMessage && <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">{syncMessage}</p>}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-600" /> Meta App Credentials
            </h3>
            <p className="text-xs text-slate-500">Set META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, and META_ACCESS_TOKEN on the server.</p>
          </section>

          <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" /> Webhook
            </h3>
            <label className="label-text">Callback URL (Meta App Dashboard)</label>
            <input type="url" readOnly value={webhookUrl} className="filter-select font-mono text-xs bg-slate-50" />
            <p className="text-xs text-slate-500 mt-2">Verify token: META_VERIFY_TOKEN env var on server</p>
          </section>

          <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 mb-4">Connected Pages & Instagram</h3>
            <div className="space-y-2">
              {pagesList.map(page => (
                <div key={page.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{page.avatar}</span>
                    <div>
                      <p className="text-xs font-bold flex items-center gap-1">{page.name}
                        {page.platform === 'facebook' ? <Facebook className="w-3 h-3 text-[#1877F2]" /> : <Instagram className="w-3 h-3 text-pink-600" />}
                      </p>
                      <p className="text-[10px] text-slate-500">{page.fans}</p>
                    </div>
                  </div>
                  <button onClick={() => setPagesList(pagesList.map(p => p.id === page.id ? { ...p, isConnected: !p.isConnected } : p))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${page.isConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white'}`}>
                    {page.isConnected ? 'Connected' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Ad Accounts
            </h3>
            {mockAdAccounts.map(acc => (
              <div key={acc.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-2 flex justify-between">
                <div><p className="text-xs font-bold">{acc.name}</p><p className="text-[10px] font-mono text-slate-500">{acc.id}</p></div>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded">{acc.status}</span>
              </div>
            ))}
          </section>

          <section className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
            <h3 className="font-bold text-sm mb-4">Auto-Tagging Rules</h3>
            {autoTaggingRules.map(rule => (
              <div key={rule.id} className="p-3 bg-slate-50 border rounded-lg mb-2 flex justify-between text-xs">
                <span>&quot;{rule.keyword}&quot; → #{rule.tag} · {rule.priority}</span>
                <button onClick={() => onDeleteRule(rule.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <form onSubmit={e => { e.preventDefault(); if (keyword && tag) { onAddRule(keyword, tag, priority); setKeyword(''); setTag(''); } }} className="grid grid-cols-3 gap-2 mt-3">
              <input placeholder="Keyword" value={keyword} onChange={e => setKeyword(e.target.value)} className="filter-select text-xs" />
              <input placeholder="Tag" value={tag} onChange={e => setTag(e.target.value)} className="filter-select text-xs" />
              <select value={priority} onChange={e => setPriority(e.target.value)} className="filter-select text-xs">
                <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
              </select>
              <button type="submit" className="col-span-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                <PlusCircle className="w-3.5 h-3.5" /> Add Rule
              </button>
            </form>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white border border-slate-200 p-5 rounded-xl">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Team</h3>
            {teamMembers.map(m => (
              <div key={m.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg mb-2">
                <img src={m.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                <div><p className="text-xs font-bold">{m.name}</p><p className="text-[10px] text-slate-500">{m.role}</p></div>
              </div>
            ))}
          </section>
          <section className="bg-white border border-slate-200 p-5 rounded-xl">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Zap className="w-4 h-4" /> Status Rules</h3>
            {['New webhook → Unseen', 'Open comment → Seen', 'Reply on Meta → Replied', 'Assign → Auto Seen'].map(r => (
              <div key={r} className="p-2 bg-slate-50 rounded-lg mb-1 text-xs">{r}</div>
            ))}
          </section>
          <section className="bg-white border border-slate-200 p-5 rounded-xl">
            <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</h3>
            {['Webhook sound', 'Urgent alerts', 'Slack SLA'].map((l, i) => (
              <label key={l} className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
                <input type="checkbox" defaultChecked={i < 2} className="w-4 h-4" /> {l}
              </label>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
