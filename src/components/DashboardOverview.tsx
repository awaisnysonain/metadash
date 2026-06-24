import React from 'react';
import { Comment, Campaign, TeamMember } from '../types';
import {
  Inbox,
  MessageSquare,
  CheckCircle2,
  Eye,
  Facebook,
  Instagram,
  AlertCircle,
  User,
  ThumbsDown,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import type { InboxFilters } from './UnifiedInbox';
import { getCommentsForCampaign } from '../utils/campaignHelpers';

interface DashboardOverviewProps {
  comments: Comment[];
  campaigns: Campaign[];
  teamMembers: TeamMember[];
  currentUserId?: string;
  onNavigateToInbox: (filters?: InboxFilters) => void;
}

export default function DashboardOverview({ comments, campaigns, currentUserId, onNavigateToInbox }: DashboardOverviewProps) {
  const totalComments = comments.length;
  const unseenCount = comments.filter(c => c.status === 'Unseen').length;
  const seenCount = comments.filter(c => c.status === 'Seen').length;
  const repliedCount = comments.filter(c => c.status === 'Replied').length;
  const ignoredCount = comments.filter(c => c.status === 'Ignored').length;
  const unrepliedCount = comments.filter(c => c.status === 'Unseen' || c.status === 'Seen').length;
  const urgentCount = comments.filter(c => c.priority === 'Urgent').length;
  const fbCount = comments.filter(c => c.platform === 'facebook').length;
  const igCount = comments.filter(c => c.platform === 'instagram').length;
  const assignedToMeCount = currentUserId ? comments.filter(c => c.assignedTo === currentUserId).length : 0;

  const positiveCount = comments.filter(c => c.sentiment === 'Positive').length;
  const neutralCount = comments.filter(c => c.sentiment === 'Neutral').length;
  const negativeCount = comments.filter(c => c.sentiment === 'Negative').length;
  const questionCount = comments.filter(c => c.sentiment === 'Question').length;
  const complaintCount = comments.filter(c => c.sentiment === 'Complaint').length;

  const campStats = campaigns
    .map(camp => ({
      ...camp,
      count: getCommentsForCampaign(comments, camp).length,
    }))
    .sort((a, b) => b.count - a.count);

  const replyRate =
    totalComments - ignoredCount > 0
      ? Math.round((repliedCount / (totalComments - ignoredCount)) * 100)
      : 0;

  const stats = [
    {
      label: 'Total comments',
      value: totalComments,
      icon: MessageSquare,
      color: 'text-indigo-600 bg-indigo-50',
      action: () => onNavigateToInbox({}),
    },
    {
      label: 'New',
      value: unseenCount,
      icon: Inbox,
      color: 'text-rose-600 bg-rose-50',
      action: () => onNavigateToInbox({ status: 'Unseen' }),
    },
    {
      label: 'Replied',
      value: repliedCount,
      icon: CheckCircle2,
      color: 'text-emerald-600 bg-emerald-50',
      action: () => onNavigateToInbox({ status: 'Replied' }),
    },
    {
      label: 'Waiting for reply',
      value: unrepliedCount,
      icon: Eye,
      color: 'text-amber-600 bg-amber-50',
      action: () => onNavigateToInbox({ status: 'Unreplied' }),
    },
    {
      label: 'Urgent',
      value: urgentCount,
      icon: AlertCircle,
      color: 'text-red-600 bg-red-50',
      action: () => onNavigateToInbox({ priority: 'Urgent' }),
    },
    {
      label: 'Assigned to me',
      value: assignedToMeCount,
      icon: User,
      color: 'text-purple-600 bg-purple-50',
      action: () => currentUserId && onNavigateToInbox({ assignedTo: currentUserId }),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in" id="dashboard-screen">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">At a glance</h2>
        <p className="text-sm text-slate-500 mt-1">
          Your comment activity across Facebook and Instagram ads.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <button
              key={idx}
              onClick={stat.action}
              className="bg-white border border-slate-200 p-4 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all text-left group"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color} mb-3`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500 mt-0.5 flex items-center justify-between">
                {stat.label}
                <ArrowRight className="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl">
          <p className="text-sm text-slate-500">Avg. response time</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">14 min</p>
          <p className="text-xs text-slate-400 mt-1">Target: under 15 min</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl">
          <p className="text-sm text-slate-500">Reply rate</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-1">{replyRate}%</p>
          <p className="text-xs text-slate-400 mt-1">
            {repliedCount} of {totalComments - ignoredCount} handled
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl">
          <p className="text-sm text-slate-500">Read, not replied</p>
          <p className="text-2xl font-semibold text-sky-600 mt-1">{seenCount}</p>
          <p className="text-xs text-slate-400 mt-1">Still need a response</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200">
          <h3 className="font-medium text-slate-900 mb-4">By platform</h3>
          <div className="space-y-4">
            {[
              { name: 'Facebook', count: fbCount, color: 'bg-[#1877F2]', icon: Facebook },
              { name: 'Instagram', count: igCount, color: 'bg-pink-500', icon: Instagram },
            ].map(p => {
              const pct = totalComments > 0 ? Math.round((p.count / totalComments) * 100) : 0;
              const Icon = p.icon;
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="flex items-center gap-2 text-slate-700">
                      <Icon className="w-4 h-4" /> {p.name}
                    </span>
                    <span className="font-medium text-slate-900">
                      {p.count} <span className="text-slate-400 font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-medium text-slate-900 mt-6 mb-4">Replied vs waiting</h3>
          <div className="flex h-8 rounded-xl overflow-hidden text-xs font-medium text-white">
            <div
              className="bg-emerald-500 flex items-center justify-center"
              style={{ width: `${totalComments > 0 ? (repliedCount / totalComments) * 100 : 50}%` }}
            >
              {repliedCount > 0 && `Replied ${repliedCount}`}
            </div>
            <div
              className="bg-amber-400 flex items-center justify-center"
              style={{ width: `${totalComments > 0 ? (unrepliedCount / totalComments) * 100 : 50}%` }}
            >
              {unrepliedCount > 0 && `Waiting ${unrepliedCount}`}
            </div>
            {ignoredCount > 0 && (
              <div
                className="bg-slate-300 flex items-center justify-center text-slate-700"
                style={{ width: `${(ignoredCount / totalComments) * 100}%` }}
              >
                Ignored {ignoredCount}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200">
          <h3 className="font-medium text-slate-900 mb-4">How people feel</h3>
          <div className="space-y-3">
            {[
              { name: 'Positive', count: positiveCount, color: 'bg-emerald-500' },
              { name: 'Questions', count: questionCount, color: 'bg-blue-500', icon: HelpCircle },
              { name: 'Neutral', count: neutralCount, color: 'bg-slate-400' },
              { name: 'Complaints', count: complaintCount, color: 'bg-red-500', icon: AlertCircle },
              { name: 'Negative', count: negativeCount, color: 'bg-orange-500', icon: ThumbsDown },
            ].map(sent => {
              const pct = totalComments > 0 ? Math.round((sent.count / totalComments) * 100) : 0;
              return (
                <div key={sent.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-700">{sent.name}</span>
                    <span className="text-slate-500">
                      {sent.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${sent.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200">
          <h3 className="font-medium text-slate-900 mb-4">Top campaigns</h3>
          <div className="space-y-2">
            {campStats.length === 0 ? (
              <p className="text-sm text-slate-500">Connect your ad accounts in Settings to see campaigns.</p>
            ) : (
              campStats.map(camp => {
                const pct = totalComments > 0 ? Math.round((camp.count / totalComments) * 100) : 0;
                const isFB = camp.platform === 'facebook';
                return (
                  <button
                    key={camp.id}
                    onClick={() => onNavigateToInbox({ campaign: camp.campaignName })}
                    className="w-full text-left p-3 bg-slate-50 hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {isFB ? (
                        <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
                      ) : (
                        <Instagram className="w-3.5 h-3.5 text-pink-600" />
                      )}
                      <span className="text-sm font-medium text-slate-800 truncate">{camp.campaignName}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{camp.count} comments</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isFB ? 'bg-[#1877F2]' : 'bg-pink-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {urgentCount > 0 && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-900">{urgentCount} urgent comments</h4>
              <p className="text-red-700 text-sm mt-0.5">These need your attention right away.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToInbox({ priority: 'Urgent' })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
          >
            View now <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
