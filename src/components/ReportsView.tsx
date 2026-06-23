import React from 'react';
import { Comment, TeamMember, Campaign } from '../types';
import { groupCommentsByDate } from '../utils/helpers';
import {
  BarChart3,
  Users,
  Facebook,
  Instagram,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import type { InboxFilters } from './UnifiedInbox';

interface ReportsViewProps {
  comments: Comment[];
  teamMembers: TeamMember[];
  campaigns: Campaign[];
  onNavigateToInbox: (filters?: InboxFilters) => void;
}

export default function ReportsView({ comments, teamMembers, campaigns, onNavigateToInbox }: ReportsViewProps) {
  const totalComments = comments.length;
  const repliedCount = comments.filter(c => c.status === 'Replied').length;
  const unrepliedCount = comments.filter(c => c.status === 'Unseen' || c.status === 'Seen').length;
  const fbCount = comments.filter(c => c.platform === 'facebook').length;
  const igCount = comments.filter(c => c.platform === 'instagram').length;
  const highPriority = comments.filter(c => (c.priority === 'Urgent' || c.priority === 'High') && c.status !== 'Replied');
  const negativeComments = comments.filter(c => c.sentiment === 'Negative' || c.sentiment === 'Complaint');

  const dailyVolume = groupCommentsByDate(comments);
  const maxDaily = Math.max(...dailyVolume.map(d => d.count), 1);

  const campaignVolume = campaigns.map(c => ({
    ...c,
    count: comments.filter(cm => cm.campaignId === c.id).length,
  })).sort((a, b) => b.count - a.count);

  const adCommentCounts = comments.reduce((acc, curr) => {
    acc[curr.adName] = (acc[curr.adName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedAds = Object.entries(adCommentCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const teamWorkload = teamMembers.map(member => {
    const assigned = comments.filter(c => c.assignedTo === member.id);
    const resolved = assigned.filter(c => c.status === 'Replied').length;
    const pending = assigned.filter(c => c.status !== 'Replied' && c.status !== 'Ignored').length;
    const urgent = assigned.filter(c => c.priority === 'Urgent' && c.status !== 'Replied').length;
    return { ...member, assigned: assigned.length, resolved, pending, urgent, rate: assigned.length > 0 ? Math.round((resolved / assigned.length) * 100) : 0 };
  }).sort((a, b) => b.assigned - a.assigned);

  return (
    <div className="space-y-5 animate-fade-in" id="reports-screen">
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" /> Reports & Analytics
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Comment volume, platform breakdown, team workload, and priority backlog.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Comments', value: totalComments, color: 'text-slate-900' },
          { label: 'Replied', value: repliedCount, color: 'text-emerald-600' },
          { label: 'Unreplied', value: unrepliedCount, color: 'text-amber-600' },
          { label: 'High Priority Open', value: highPriority.length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] font-bold uppercase text-slate-400">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Daily volume */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" /> Daily Comment Volume
          </h3>
          <p className="text-xs text-slate-500 mb-4">Comments received per day</p>
          <div className="flex items-end gap-2 h-40">
            {dailyVolume.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-600">{day.count}</span>
                <div
                  className="w-full bg-blue-500 rounded-t-md transition-all hover:bg-blue-600"
                  style={{ height: `${(day.count / maxDaily) * 100}%`, minHeight: day.count > 0 ? '8px' : '2px' }}
                />
                <span className="text-[9px] text-slate-400 truncate w-full text-center">{day.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="lg:col-span-5 bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-4">Platform Breakdown</h3>
          <div className="space-y-4">
            {[
              { name: 'Facebook', count: fbCount, icon: Facebook, color: 'bg-[#1877F2]' },
              { name: 'Instagram', count: igCount, icon: Instagram, color: 'bg-pink-500' },
            ].map(p => {
              const pct = totalComments > 0 ? Math.round((p.count / totalComments) * 100) : 0;
              const Icon = p.icon;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2 font-semibold"><Icon className="w-4 h-4" /> {p.name}</span>
                    <span className="font-bold">{p.count} ({pct}%)</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${p.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-bold text-sm text-slate-900 mt-6 mb-3">Replied vs Unreplied</h3>
          <div className="flex h-10 rounded-lg overflow-hidden text-xs font-bold text-white">
            <div className="bg-emerald-500 flex items-center justify-center" style={{ width: `${totalComments > 0 ? (repliedCount / totalComments) * 100 : 50}%` }}>
              {repliedCount} Replied
            </div>
            <div className="bg-amber-400 flex items-center justify-center" style={{ width: `${totalComments > 0 ? (unrepliedCount / totalComments) * 100 : 50}%` }}>
              {unrepliedCount} Open
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Campaign volume */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-4">Campaigns with Most Comments</h3>
          <div className="space-y-2">
            {campaignVolume.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onNavigateToInbox({ campaign: c.campaignName })}
                className="w-full p-3 bg-slate-50 hover:bg-blue-50 rounded-lg border border-slate-100 hover:border-blue-200 flex items-center justify-between transition-colors text-left"
              >
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-slate-400">#{i + 1}</span>
                  <p className="text-xs font-bold text-slate-800 truncate">{c.campaignName}</p>
                </div>
                <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Team workload */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Team Workload
          </h3>
          <div className="space-y-3">
            {teamWorkload.map(m => (
              <div key={m.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{m.name}</p>
                    <p className="text-[10px] text-slate-500">{m.assigned} assigned · {m.pending} pending · {m.urgent} urgent</p>
                  </div>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${m.rate}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{m.rate}% resolved</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* High priority */}
        <div className="bg-red-50 border border-red-200 p-5 rounded-xl">
          <h3 className="font-bold text-sm text-red-900 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> High Priority Comments ({highPriority.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {highPriority.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-4">No open high-priority comments</p>
            ) : (
              highPriority.map(c => (
                <button
                  key={c.id}
                  onClick={() => onNavigateToInbox({ priority: c.priority })}
                  className="w-full p-3 bg-white border border-red-100 rounded-lg text-left hover:border-red-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800">{c.commenterName}</span>
                    <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{c.priority}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-1">{c.commentText}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Negative/complaint */}
        <div className="bg-orange-50 border border-orange-200 p-5 rounded-xl">
          <h3 className="font-bold text-sm text-orange-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Negative & Complaint Comments ({negativeComments.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {negativeComments.map(c => (
              <button
                key={c.id}
                onClick={() => onNavigateToInbox({ sentiment: c.sentiment })}
                className="w-full p-3 bg-white border border-orange-100 rounded-lg text-left hover:border-orange-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-800">{c.commenterName}</span>
                  <span className="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{c.sentiment}</span>
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-1">{c.commentText}</p>
                <span className="text-[10px] text-blue-600 font-bold mt-1 inline-flex items-center gap-0.5">
                  View in inbox <ArrowRight className="w-2.5 h-2.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top ads */}
      <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
        <h3 className="font-bold text-sm text-slate-900 mb-4">Most Commented Ad Creatives</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedAds.map((ad, i) => (
            <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400">#{i + 1}</span>
                <p className="text-xs font-bold text-slate-800 truncate">{ad.name}</p>
              </div>
              <span className="text-sm font-bold text-slate-600 shrink-0 ml-2">{ad.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
