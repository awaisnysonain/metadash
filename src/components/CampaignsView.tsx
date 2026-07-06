import React from 'react';
import { Campaign, Comment, Ad } from '../types';
import { getCommentsForCampaign, getAdsForCampaign } from '../utils/campaignHelpers';
import { Facebook, Instagram, Megaphone, MessageCircle, Heart, ArrowRight } from 'lucide-react';

interface CampaignsViewProps {
  campaigns: Campaign[];
  comments: Comment[];
  ads: Ad[];
  isDemoMode?: boolean;
  onNavigateToInbox: (filters?: { platform?: string }) => void;
  onNavigateToSettings?: () => void;
}

export default function CampaignsView({
  campaigns,
  comments,
  ads,
  isDemoMode = false,
  onNavigateToInbox,
  onNavigateToSettings,
}: CampaignsViewProps) {
  const campaignData = campaigns.map(camp => {
    const campComments = getCommentsForCampaign(comments, camp);
    const totalComments = campComments.length;
    const unseenComments = campComments.filter(c => c.status === 'Unseen').length;
    const repliedComments = campComments.filter(c => c.status === 'Replied').length;

    const positiveSenti = campComments.filter(c => c.sentiment === 'Positive').length;
    const negativeSenti = campComments.filter(
      c => c.sentiment === 'Complaint' || c.sentiment === 'Negative'
    ).length;
    const sentimentTotal = positiveSenti + negativeSenti;

    let happinessScore = 50;
    if (sentimentTotal > 0) {
      happinessScore = Math.round((positiveSenti / sentimentTotal) * 100);
    }

    return {
      ...camp,
      totalComments,
      unseenComments,
      replyRate: totalComments > 0 ? Math.round((repliedComments / totalComments) * 100) : 0,
      happinessScore,
    };
  });

  const accountGroups = campaignData.reduce<Record<string, typeof campaignData>>((acc, camp) => {
    const key = camp.accountLabel || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(camp);
    return acc;
  }, {});

  return (
    <div className="space-y-4 animate-fade-in" id="campaigns-screen">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">Ads & Campaigns</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Campaigns from NOBL & FLO ad accounts — Facebook and Instagram.
        </p>
      </div>

      {campaignData.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
          <Megaphone className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-base font-medium text-slate-700 dark:text-slate-200">No campaigns yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {isDemoMode
              ? 'Sample campaigns will appear here when demo data is loaded.'
              : 'Connect your ad accounts in Settings to see your campaigns here.'}
          </p>
          {!isDemoMode && onNavigateToSettings && (
            <button
              onClick={onNavigateToSettings}
              className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Go to Settings
            </button>
          )}
        </div>
      ) : (
        Object.entries(accountGroups).map(([accountLabel, camps]) => (
          <div key={accountLabel} className="space-y-2.5">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Megaphone className="w-4 h-4" /> {accountLabel} ({camps.length} campaigns)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {camps.map(camp => {
            const isFB = camp.platform === 'facebook';
            const campaignAds = getAdsForCampaign(ads, camp);

            return (
              <div
                key={camp.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          isFB ? 'bg-blue-50 text-[#1877F2]' : 'bg-pink-50 text-pink-600'
                        }`}
                      >
                        {isFB ? <Facebook className="w-5 h-5" /> : <Instagram className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">{camp.campaignName}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                          {camp.budget} spent · {camp.status}
                        </p>
                      </div>
                    </div>
                    {camp.unseenComments > 0 && (
                      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700">
                        {camp.unseenComments} new
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="text-center p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{camp.totalComments}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Comments</p>
                    </div>
                    <div className="text-center p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{camp.replyRate}%</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Replied</p>
                    </div>
                    <div className="text-center p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{camp.happinessScore}%</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Positive</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">Reply progress</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{camp.replyRate}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${camp.replyRate}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">Audience mood</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{camp.happinessScore}% positive</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            camp.happinessScore >= 60
                              ? 'bg-emerald-500'
                              : camp.happinessScore >= 40
                                ? 'bg-amber-400'
                                : 'bg-rose-500'
                          }`}
                          style={{ width: `${camp.happinessScore}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {campaignAds.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
                        Ads in this campaign ({campaignAds.length})
                      </p>
                      <div className="space-y-2">
                        {campaignAds.slice(0, 2).map(ad => (
                          <div
                            key={ad.id}
                            className="flex gap-3 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg items-center"
                          >
                            <div className="w-14 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden shrink-0">
                              {ad.mediaType === 'image' && ad.mediaUrl ? (
                                <img src={ad.mediaUrl} alt="" className="w-full h-full object-cover" />
                              ) : ad.thumbnailUrl ? (
                                <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              ) : ad.mediaUrl ? (
                                <video
                                  src={ad.mediaUrl}
                                  className="w-full h-full object-cover"
                                  muted
                                  playsInline
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{ad.adName}</p>
                              <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Heart className="w-3 h-3" /> {ad.likesCount ?? 0}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="w-3 h-3" /> {ad.commentsCount ?? 0}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {campaignAds.length > 2 && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                            +{campaignAds.length - 2} more ads
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {camp.unseenComments > 0
                      ? `${camp.unseenComments} comments need a reply`
                      : 'All caught up'}
                  </span>
                  <button
                    onClick={() => onNavigateToInbox({ platform: camp.platform })}
                    className="text-sm text-slate-900 dark:text-slate-100 font-medium hover:text-slate-600 flex items-center gap-1 transition-colors"
                  >
                    View comments <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
