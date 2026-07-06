import React from 'react';
import { Comment, TeamMember, Campaign } from '../types';
import { groupCommentsByDate } from '../utils/helpers';
import {
  Users,
  Facebook,
  Instagram,
  AlertCircle,
  ArrowRight,
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
  const highPriority = comments.filter(
    c => (c.priority === 'Urgent' || c.priority === 'High') && c.status !== 'Replied'
  );
  const negativeComments = comments.filter(c => c.sentiment === 'Negative' || c.sentiment === 'Complaint');

  const dailyVolume = groupCommentsByDate(comments);
  const maxDaily = Math.max(...dailyVolume.map(d => d.count), 1);

  const campaignVolume = campaigns
    .map(c => ({
      ...c,
      count: comments.filter(cm => cm.campaignId === c.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const adCommentCounts = comments.reduce(
    (acc, curr) => {
      acc[curr.adName] = (acc[curr.adName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const sortedAds = Object.entries(adCommentCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const teamWorkload = teamMembers
    .map(member => {
      const assigned = comments.filter(c => c.assignedTo === member.id);
      const resolved = assigned.filter(c => c.status === 'Replied').length;
      const pending = assigned.filter(c => c.status !== 'Replied' && c.status !== 'Ignored').length;
      const urgent = assigned.filter(c => c.priority === 'Urgent' && c.status !== 'Replied').length;
      return {
        ...member,
        assigned: assigned.length,
        resolved,
        pending,
        urgent,
        rate: assigned.length > 0 ? Math.round((resolved / assigned.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.assigned - a.assigned);

  return (
    <div className="space-y-4 animate-fade-in" id="reports-screen">
      <div>
        <h2 className="text-base font-semibold text-slate-950">Insights</h2>
        <p className="text-sm text-slate-500">
          Comment trends, team performance, and items that need attention.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: 'Total comments', value: totalComments, color: 'text-slate-900' },
          { label: 'Replied', value: repliedCount, color: 'text-emerald-600' },
          { label: 'Waiting for reply', value: unrepliedCount, color: 'text-amber-600' },
          { label: 'High priority', value: highPriority.length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 p-3 rounded-xl">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-xl font-semibold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7 bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-1">Comments per day</h3>
          <p className="text-sm text-slate-500 mb-5">How many comments you received each day</p>
          <div className="flex items-end gap-2 h-40">
            {dailyVolume.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-medium text-slate-600">{day.count}</span>
                <div
                  className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                  style={{ height: `${(day.count / maxDaily) * 100}%`, minHeight: day.count > 0 ? '8px' : '2px' }}
                />
                <span className="text-[10px] text-slate-400 truncate w-full text-center">{day.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-4">By platform</h3>
          <div className="space-y-4">
            {[
              { name: 'Facebook', count: fbCount, icon: Facebook, color: 'bg-[#1877F2]' },
              { name: 'Instagram', count: igCount, icon: Instagram, color: 'bg-pink-500' },
            ].map(p => {
              const pct = totalComments > 0 ? Math.round((p.count / totalComments) * 100) : 0;
              const Icon = p.icon;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="flex items-center gap-2 text-slate-700">
                      <Icon className="w-4 h-4" /> {p.name}
                    </span>
                    <span className="font-medium">
                      {p.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${p.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-medium text-slate-900 mt-6 mb-3">Replied vs waiting</h3>
          <div className="flex h-10 rounded-xl overflow-hidden text-xs font-medium text-white">
            <div
              className="bg-emerald-500 flex items-center justify-center"
              style={{ width: `${totalComments > 0 ? (repliedCount / totalComments) * 100 : 50}%` }}
            >
              {repliedCount} Replied
            </div>
            <div
              className="bg-amber-400 flex items-center justify-center"
              style={{ width: `${totalComments > 0 ? (unrepliedCount / totalComments) * 100 : 50}%` }}
            >
              {unrepliedCount} Waiting
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-4">Busiest campaigns</h3>
          <div className="space-y-2">
            {campaignVolume.length === 0 ? (
              <p className="text-sm text-slate-500">No campaigns yet. Connect your ad accounts in Settings.</p>
            ) : (
              campaignVolume.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => onNavigateToInbox({ campaign: c.campaignName })}
                  className="w-full p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors text-left"
                >
                  <div className="min-w-0">
                    <span className="text-xs text-slate-400">#{i + 1}</span>
                    <p className="text-sm font-medium text-slate-800 truncate">{c.campaignName}</p>
                  </div>
                  <span className="text-base font-semibold text-slate-600 shrink-0 ml-2">{c.count}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" /> Team workload
          </h3>
          <div className="space-y-3">
            {teamWorkload.map(m => (
              <div key={m.id} className="p-2.5 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.name}</p>
                    <p className="text-xs text-slate-500">
                      {m.assigned} assigned · {m.pending} waiting · {m.urgent} urgent
                    </p>
                  </div>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${m.rate}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{m.rate}% replied</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> High priority ({highPriority.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {highPriority.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">All caught up!</p>
            ) : (
              highPriority.map(c => (
                <button
                  key={c.id}
                  onClick={() => onNavigateToInbox({ priority: c.priority })}
                  className="w-full p-2.5 bg-slate-50 rounded-lg text-left hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800">{c.commenterName}</span>
                    <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-lg">
                      {c.priority}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-1">{c.commentText}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Unhappy comments ({negativeComments.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {negativeComments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No negative comments</p>
            ) : (
              negativeComments.map(c => (
                <button
                  key={c.id}
                  onClick={() => onNavigateToInbox({ sentiment: c.sentiment })}
                  className="w-full p-2.5 bg-slate-50 rounded-lg text-left hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800">{c.commenterName}</span>
                    <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg">
                      {c.sentiment}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-1">{c.commentText}</p>
                  <span className="text-xs text-blue-600 font-medium mt-1 inline-flex items-center gap-0.5">
                    View in inbox <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-4">Most talked-about ads</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
          {sortedAds.map((ad, i) => (
            <div
              key={i}
              className="p-3 bg-slate-50 rounded-xl flex justify-between items-center"
            >
              <div className="min-w-0">
                <span className="text-xs text-slate-400">#{i + 1}</span>
                <p className="text-sm font-medium text-slate-800 truncate">{ad.name}</p>
              </div>
              <span className="text-base font-semibold text-slate-600 shrink-0 ml-2">{ad.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
