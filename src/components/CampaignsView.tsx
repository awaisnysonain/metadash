import React from 'react';
import { Campaign, Comment, Ad } from '../types';
import { mockAds } from '../data';
import { 
  Megaphone, 
  Facebook, 
  Instagram, 
  MessageSquare, 
  TrendingUp, 
  Activity, 
  Search,
  PlusCircle,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Percent
} from 'lucide-react';

interface CampaignsViewProps {
  campaigns: Campaign[];
  comments: Comment[];
  ads?: Ad[];
  onNavigateToInbox: (filters?: any) => void;
}

export default function CampaignsView({ campaigns, comments, ads = mockAds, onNavigateToInbox }: CampaignsViewProps) {
  
  // Quick calculations for each campaign
  const campaignData = campaigns.map(camp => {
    const totalComments = comments.filter(c => c.campaignId === camp.id).length;
    const unseenComments = comments.filter(c => c.campaignId === camp.id && c.status === 'Unseen').length;
    const repliedComments = comments.filter(c => c.campaignId === camp.id && c.status === 'Replied').length;
    
    // Sentiment ratios
    const totalSenti = comments.filter(c => c.campaignId === camp.id && c.sentiment !== 'Neutral').length;
    const positiveSenti = comments.filter(c => c.campaignId === camp.id && c.sentiment === 'Positive').length;
    const complaintSenti = comments.filter(c => c.campaignId === camp.id && (c.sentiment === 'Complaint' || c.sentiment === 'Negative')).length;
    
    let sentimentIndex = 50; // default neutral
    if (totalSenti > 0) {
      sentimentIndex = Math.round((positiveSenti / (positiveSenti + complaintSenti || 1)) * 100);
    }

    return {
      ...camp,
      totalComments,
      unseenComments,
      repliedComments,
      replyRate: totalComments > 0 ? Math.round((repliedComments / totalComments) * 100) : 0,
      sentimentIndex
    };
  });

  return (
    <div className="space-y-4 animate-fadeIn text-xs" id="campaigns-screen">
      {/* Title */}
      <div>
        <h2 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
          <Megaphone className="w-4 h-4 text-blue-600" /> Active Ad Campaigns Monitor
        </h2>
        <p className="text-[11px] text-slate-500">
          Sync status, budget parameters, comment volume, and audience response metrics across connected ads properties.
        </p>
      </div>

      {/* Campaigns Listing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaignData.map(camp => {
          const isFB = camp.platform === 'facebook';
          
          return (
            <div 
              key={camp.id}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* Header Platform & status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded ${
                      isFB ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
                    }`}>
                      {isFB ? <Facebook className="w-4 h-4" /> : <Instagram className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 font-mono">Campaign ID: {camp.campaignId}</span>
                      <h3 className="font-bold text-slate-800 text-xs leading-tight truncate max-w-[220px]">{camp.campaignName}</h3>
                    </div>
                  </div>
                  
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                    camp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    ● {camp.status}
                  </span>
                </div>

                {/* Substats Grid */}
                <div className="grid grid-cols-2 gap-2 mt-3 mb-4">
                  <div className="bg-slate-50 p-2 rounded border border-slate-150">
                    <span className="text-[9px] text-slate-400 font-mono block">Spent Budget</span>
                    <span className="text-xs font-extrabold text-slate-800 mt-0.5 block">{camp.budget}</span>
                  </div>
                  <div className="bg-blue-50/20 p-2 rounded border border-blue-105">
                    <span className="text-[9px] text-slate-400 font-mono block">Total Comments</span>
                    <span className="text-xs font-extrabold text-slate-900 mt-0.5 block">{camp.totalComments} comments</span>
                  </div>
                </div>

                {/* Engagement SLA bars */}
                <div className="space-y-2.5 mb-4 border-t border-slate-100 pt-3">
                  {/* Replied SLA progress */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="text-slate-500 font-medium font-sans">Reply Processing Resolution Rate</span>
                      <span className="font-mono text-slate-900 font-bold">{camp.replyRate}% resolve</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded overflow-hidden">
                      <div className="h-full bg-blue-600 rounded" style={{ width: `${camp.replyRate}%` }}></div>
                    </div>
                  </div>

                  {/* Customer Sentiment Index */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="text-slate-500 font-medium font-sans">Customer Sentiment Index</span>
                      <span className="font-mono text-slate-700 font-bold">{camp.sentimentIndex}% satisfaction</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded overflow-hidden">
                      <div className={`h-full rounded ${
                        camp.sentimentIndex >= 60 ? 'bg-emerald-500' : camp.sentimentIndex >= 40 ? 'bg-amber-400' : 'bg-rose-500'
                      }`} style={{ width: `${camp.sentimentIndex}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Active Ad Creatives displaying and playing */}
                {(() => {
                  const campaignAds = ads.filter(ad => ad.campaignName === camp.campaignName || ad.id === camp.id);
                  if (campaignAds.length === 0) return null;
                  return (
                    <div className="mt-3.5 pt-3.5 border-t border-slate-100">
                      <h4 className="text-[9px] uppercase font-bold text-slate-450 font-mono tracking-wider mb-2 flex items-center justify-between">
                        <span>🎬 Associated Active Creatives ({campaignAds.length})</span>
                        <span className="text-emerald-600 font-bold">● Active Loops</span>
                      </h4>
                      <div className="space-y-2">
                        {campaignAds.map(ad => (
                          <div key={ad.id} className="p-2 bg-slate-50 border border-slate-200 rounded flex gap-2.5 items-start">
                            {/* Miniature loop video player */}
                            <div className="relative w-16 h-11 bg-black rounded overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                              {ad.mediaType === 'image' && ad.mediaUrl ? (
                                <img src={ad.mediaUrl} alt="" className="w-full h-full object-cover" />
                              ) : ad.mediaUrl ? (
                                <video src={ad.mediaUrl} className="w-full h-full object-cover" loop muted playsInline autoPlay />
                              ) : ad.thumbnailUrl ? (
                                <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              ) : null}
                              <div className="absolute top-0.5 left-0.5 bg-neutral-900/80 rounded px-1 text-[7px] text-slate-300 font-mono">
                                loop
                              </div>
                            </div>
                            {/* Ad info summary */}
                            <div className="min-w-0 flex-1 text-left">
                              <div className="flex justify-between items-start gap-1">
                                <span className="text-[10px] font-extrabold text-slate-800 truncate block leading-tight">{ad.adName}</span>
                                <span className="text-[8px] font-mono text-slate-400 shrink-0 uppercase">{ad.adId}</span>
                              </div>
                              <p className="text-[9.5px] text-slate-500 line-clamp-2 leading-tight mt-0.5" title={ad.adCopy}>
                                {ad.adCopy}
                              </p>
                              <div className="flex gap-2 items-center text-[8.5px] font-mono text-slate-400 mt-1 leading-none">
                                <span>👍 {ad.likesCount} metrics</span>
                                <span>•</span>
                                <span>🔄 {ad.sharesCount} shares</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Card Footer Triage Quicklinks */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1.5">
                <span className="text-[11px] text-rose-600 font-bold font-mono">
                  {camp.unseenComments > 0 ? `🚨 ${camp.unseenComments} unseen comments` : '✅ All comments triaged'}
                </span>
                
                <button 
                  onClick={() => onNavigateToInbox({ platform: camp.platform })}
                  className="text-[11px] text-blue-600 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  Inspect comments group ➔
                </button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
