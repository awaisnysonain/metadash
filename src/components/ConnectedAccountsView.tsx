import React, { useEffect, useState } from 'react';
import { Comment, Ad } from '../types';
import { apiClient } from '../services/apiClient';
import { getCommentsForCampaign, formatSpend } from '../utils/campaignHelpers';
import {
  Facebook,
  Instagram,
  Megaphone,
  Globe,
  TrendingUp,
  MessageCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface ConnectedData {
  adAccounts: Array<{ id: string; accountId: string; name: string; spend: string; status: string; isConnected: boolean; label: string }>;
  pages: Array<{ id: string; pageId: string; pageName: string; isConnected: boolean }>;
  instagram: Array<{ id: string; accountId: string; username: string; followers: string; isConnected: boolean }>;
  topAds: Array<{ id: string; adId: string; adName: string; campaignName: string; platform: string; spend: number; accountLabel: string; thumbnailUrl?: string; mediaUrl?: string; commentsCount: number }>;
}

interface ConnectedAccountsViewProps {
  comments: Comment[];
  ads: Ad[];
  onNavigateToInbox: (filters?: { platform?: string }) => void;
}

export default function ConnectedAccountsView({ comments, ads, onNavigateToInbox }: ConnectedAccountsViewProps) {
  const [data, setData] = useState<ConnectedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getConnectedAccounts()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">{error}</div>
    );
  }

  const fbComments = comments.filter(c => c.platform === 'facebook').length;
  const igComments = comments.filter(c => c.platform === 'instagram').length;
  const topAds = data?.topAds ?? [...ads].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, 15);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Connected Accounts</h2>
        <p className="text-sm text-slate-500 mt-1">NOBL & FLO ad accounts, Facebook pages, Instagram, and top-performing ads.</p>
      </div>

      {/* Platform summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Facebook comments', value: fbComments, icon: Facebook, color: 'text-[#1877F2] bg-blue-50' },
          { label: 'Instagram comments', value: igComments, icon: Instagram, color: 'text-pink-600 bg-pink-50' },
          { label: 'Connected pages', value: data?.pages.length ?? 0, icon: Globe, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total ads', value: ads.length, icon: Megaphone, color: 'text-violet-600 bg-violet-50' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${stat.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Ad accounts */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Ad Accounts</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.adAccounts ?? []).length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No ad accounts synced yet. Run sync from Settings.</p>
          ) : (
            data!.adAccounts.map(acc => {
              const accAds = ads.filter(a => a.accountLabel === acc.label || a.metaAccountId === acc.accountId);
              const accComments = comments.filter(c => accAds.some(ad => ad.adId === c.adId || ad.adName === c.adName));
              return (
                <div key={acc.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                      {acc.label.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{acc.name}</p>
                      <p className="text-xs text-slate-500">{acc.accountId} · {acc.status}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{acc.spend || '—'}</p>
                    <p className="text-xs text-slate-500">{accAds.length} ads · {accComments.length} comments</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Facebook Pages */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Facebook className="w-4 h-4 text-[#1877F2]" />
            <h3 className="font-semibold text-slate-900">Facebook Pages</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {(data?.pages ?? []).length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No pages connected.</p>
            ) : (
              data!.pages.map(page => (
                <div key={page.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{page.pageName}</p>
                    <p className="text-xs text-slate-400">ID: {page.pageId}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${page.isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {page.isConnected ? 'Connected' : 'Offline'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instagram */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Instagram className="w-4 h-4 text-pink-600" />
            <h3 className="font-semibold text-slate-900">Instagram Accounts</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {(data?.instagram ?? []).length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No Instagram accounts linked.</p>
            ) : (
              data!.instagram.map(ig => (
                <div key={ig.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{ig.username}</p>
                    <p className="text-xs text-slate-400">{ig.followers || 'Instagram Business'}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">Connected</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top ads by spend */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-slate-900">Top Ads by Spend (last 30 days)</h3>
        </div>
        {topAds.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No spend data yet. Sync ads to load spend insights.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {topAds.map((ad, i) => {
              const adComments = comments.filter(c => c.adId === ad.adId || c.adName === ad.adName);
              const unseen = adComments.filter(c => c.status === 'Unseen').length;
              return (
                <div key={ad.id} className="px-5 py-3 flex items-center gap-4">
                  <span className="w-6 text-center text-sm font-bold text-slate-400">#{i + 1}</span>
                  <div className="w-12 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    {(ad.thumbnailUrl || ad.mediaUrl) && (
                      <img src={ad.thumbnailUrl || ad.mediaUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{ad.adName}</p>
                    <p className="text-xs text-slate-500 truncate">{ad.campaignName} · {ad.accountLabel}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">{formatSpend(ad.spend)}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                      <MessageCircle className="w-3 h-3" /> {adComments.length}
                      {unseen > 0 && <span className="text-blue-600 font-semibold">· {unseen} new</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
