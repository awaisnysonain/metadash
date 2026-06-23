import React from 'react';
import { Comment, Campaign, TeamMember } from '../types';
import {
  Inbox,
  MessageSquare,
  CheckCircle2,
  Clock,
  Facebook,
  Instagram,
  ShieldAlert,
  UserPlus,
  ThumbsDown,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Eye,
} from 'lucide-react';
import type { InboxFilters } from './UnifiedInbox';

interface DashboardOverviewProps {
  comments: Comment[];
  campaigns: Campaign[];
  teamMembers: TeamMember[];
  onNavigateToInbox: (filters?: InboxFilters) => void;
}

export default function DashboardOverview({ comments, campaigns, onNavigateToInbox }: DashboardOverviewProps) {
  const totalComments = comments.length;
  const unseenCount = comments.filter(c => c.status === 'Unseen').length;
  const seenCount = comments.filter(c => c.status === 'Seen').length;
  const repliedCount = comments.filter(c => c.status === 'Replied').length;
  const ignoredCount = comments.filter(c => c.status === 'Ignored').length;
  const unrepliedCount = comments.filter(c => c.status === 'Unseen' || c.status === 'Seen').length;
  const urgentCount = comments.filter(c => c.priority === 'Urgent').length;
  const fbCount = comments.filter(c => c.platform === 'facebook').length;
  const igCount = comments.filter(c => c.platform === 'instagram').length;
  const assignedToMeCount = comments.filter(c => c.assignedTo === 'team-1').length;

  const positiveCount = comments.filter(c => c.sentiment === 'Positive').length;
  const neutralCount = comments.filter(c => c.sentiment === 'Neutral').length;
  const negativeCount = comments.filter(c => c.sentiment === 'Negative').length;
  const questionCount = comments.filter(c => c.sentiment === 'Question').length;
  const complaintCount = comments.filter(c => c.sentiment === 'Complaint').length;

  const campStats = campaigns.map(camp => ({
    ...camp,
    count: comments.filter(c => c.campaignId === camp.id).length,
  })).sort((a, b) => b.count - a.count);

  const replyRate = totalComments - ignoredCount > 0
    ? Math.round((repliedCount / (totalComments - ignoredCount)) * 100)
    : 0;

  const stats = [
    { label: 'Total Comments', value: totalComments, sub: 'All active ads', icon: MessageSquare, color: 'bg-indigo-50 text-indigo-600 border-indigo-100', action: () => onNavigateToInbox({}) },
    { label: 'Unseen', value: unseenCount, sub: 'Awaiting triage', icon: Inbox, color: 'bg-rose-50 text-rose-600 border-rose-100', action: () => onNavigateToInbox({ status: 'Unseen' }) },
    { label: 'Replied', value: repliedCount, sub: 'Completed responses', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', action: () => onNavigateToInbox({ status: 'Replied' }) },
    { label: 'Unreplied', value: unrepliedCount, sub: 'Needs attention', icon: Eye, color: 'bg-amber-50 text-amber-600 border-amber-100', action: () => onNavigateToInbox({ status: 'Unreplied' }) },
    { label: 'Urgent', value: urgentCount, sub: 'High SLA risk', icon: ShieldAlert, color: 'bg-red-50 text-red-600 border-red-100', action: () => onNavigateToInbox({ priority: 'Urgent' }) },
    { label: 'Assigned To Me', value: assignedToMeCount, sub: 'Your queue', icon: UserPlus, color: 'bg-purple-50 text-purple-600 border-purple-100', action: () => onNavigateToInbox({ assignedTo: 'team-1' }) },
  ];

  const platformStats = [
    { name: 'Facebook', count: fbCount, color: 'bg-[#1877F2]', icon: Facebook },
    { name: 'Instagram', count: igCount, color: 'bg-gradient-to-r from-purple-500 to-pink-500', icon: Instagram },
  ];

  return (
    <div className="space-y-5 animate-fade-in" id="dashboard-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900">Dashboard Overview</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time metrics for Facebook & Instagram ad comment management.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
            <span className="font-bold text-slate-700">{fbCount}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <Instagram className="w-3.5 h-3.5 text-pink-600" />
            <span className="font-bold text-slate-700">{igCount}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-semibold text-emerald-700">Live</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <button
              key={idx}
              onClick={stat.action}
              className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-lg border ${stat.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 flex items-center justify-between">
                {stat.sub}
                <ArrowRight className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            </button>
          );
        })}
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <p className="text-[10px] font-bold uppercase text-slate-400">Avg Response Time</p>
          <p className="text-xl font-bold text-slate-900 mt-1">14.2 min</p>
          <p className="text-xs text-slate-500">Goal: under 15 min</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <p className="text-[10px] font-bold uppercase text-slate-400">Reply Rate</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{replyRate}%</p>
          <p className="text-xs text-slate-500">{repliedCount} of {totalComments - ignoredCount} active</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl">
          <p className="text-[10px] font-bold uppercase text-slate-400">Seen (not replied)</p>
          <p className="text-xl font-bold text-sky-600 mt-1">{seenCount}</p>
          <p className="text-xs text-slate-500">Awaiting response</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Platform + Replied vs Unreplied */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-4">Comments by Platform</h3>
          <div className="space-y-4">
            {platformStats.map(p => {
              const pct = totalComments > 0 ? Math.round((p.count / totalComments) * 100) : 0;
              const Icon = p.icon;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2 font-semibold text-slate-700">
                      <Icon className="w-4 h-4" /> {p.name}
                    </span>
                    <span className="font-bold text-slate-900">{p.count} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-bold text-sm text-slate-900 mt-6 mb-4">Replied vs Unreplied</h3>
          <div className="flex h-8 rounded-lg overflow-hidden">
            <div
              className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${totalComments > 0 ? (repliedCount / totalComments) * 100 : 50}%` }}
            >
              {repliedCount > 0 && `Replied ${repliedCount}`}
            </div>
            <div
              className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${totalComments > 0 ? (unrepliedCount / totalComments) * 100 : 50}%` }}
            >
              {unrepliedCount > 0 && `Unreplied ${unrepliedCount}`}
            </div>
            {ignoredCount > 0 && (
              <div
                className="bg-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-700"
                style={{ width: `${(ignoredCount / totalComments) * 100}%` }}
              >
                Ignored {ignoredCount}
              </div>
            )}
          </div>
        </div>

        {/* Sentiment breakdown */}
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-4">Sentiment Breakdown</h3>
          <div className="space-y-2.5">
            {[
              { name: 'Positive', count: positiveCount, color: 'bg-emerald-500' },
              { name: 'Question', count: questionCount, color: 'bg-blue-500', icon: HelpCircle },
              { name: 'Neutral', count: neutralCount, color: 'bg-slate-400' },
              { name: 'Complaint', count: complaintCount, color: 'bg-red-500', icon: AlertTriangle },
              { name: 'Negative', count: negativeCount, color: 'bg-orange-500', icon: ThumbsDown },
            ].map(sent => {
              const pct = totalComments > 0 ? Math.round((sent.count / totalComments) * 100) : 0;
              return (
                <div key={sent.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">{sent.name}</span>
                    <span className="text-slate-500">{sent.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${sent.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Campaign volume */}
        <div className="lg:col-span-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-4">By Campaign</h3>
          <div className="space-y-3">
            {campStats.map(camp => {
              const pct = totalComments > 0 ? Math.round((camp.count / totalComments) * 100) : 0;
              const isFB = camp.platform === 'facebook';
              return (
                <button
                  key={camp.id}
                  onClick={() => onNavigateToInbox({ campaign: camp.campaignName })}
                  className="w-full text-left p-2.5 bg-slate-50 hover:bg-blue-50 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {isFB ? <Facebook className="w-3 h-3 text-[#1877F2]" /> : <Instagram className="w-3 h-3 text-pink-600" />}
                    <span className="text-[11px] font-bold text-slate-800 truncate">{camp.campaignName}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">{camp.count} comments</span>
                    <span className="font-bold text-slate-600">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${isFB ? 'bg-[#1877F2]' : 'bg-pink-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Urgent backlog */}
      {urgentCount > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-red-900 text-sm">Urgent Comments ({urgentCount})</h4>
              <p className="text-red-700 text-xs mt-0.5">High-priority comments requiring immediate response.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToInbox({ priority: 'Urgent' })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
          >
            Triage Now <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
