import React, { useState, useMemo, useEffect } from 'react';
import { Campaign, Comment, Platform, CommentPriority, CommentSentiment, Ad } from '../types';
import { autoTag, getAdsForCampaign, getAdsetsForCampaign } from '../data';
import {
  Bot,
  Send,
  CheckCircle,
  Facebook,
  Instagram,
  Terminal,
  Copy,
  Info,
} from 'lucide-react';

interface WebhookSimulatorProps {
  campaigns: Campaign[];
  ads: Ad[];
  onAddSimulatedComment: (comment: Comment) => void;
}

export default function WebhookSimulator({ campaigns, ads, onAddSimulatedComment }: WebhookSimulatorProps) {
  const [platform, setPlatform] = useState<Platform>('facebook');
  const [commenterName, setCommenterName] = useState('Sarah Connor');
  const [commentText, setCommentText] = useState('Does the clearance event include free shipping to Los Angeles?');
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id || 'camp-1');
  const [selectedAdset, setSelectedAdset] = useState('');
  const [selectedAdId, setSelectedAdId] = useState('');
  const [sentiment, setSentiment] = useState<CommentSentiment>('Question');
  const [priority, setPriority] = useState<CommentPriority>('Medium');
  const [showNotification, setShowNotification] = useState(false);
  const [generatedPayload, setGeneratedPayload] = useState<object | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) || campaigns[0];
  const campaignAds = useMemo(
    () => getAdsForCampaign(selectedCampaign?.campaignName || '').filter(a => a.platform === platform),
    [selectedCampaign, platform]
  );
  const adsets = useMemo(
    () => getAdsetsForCampaign(selectedCampaign?.campaignName || ''),
    [selectedCampaign]
  );
  const filteredAds = useMemo(
    () => (selectedAdset ? campaignAds.filter(a => a.adsetName === selectedAdset) : campaignAds),
    [campaignAds, selectedAdset]
  );
  const selectedAd = ads.find(a => a.id === selectedAdId) || filteredAds[0];

  useEffect(() => {
    if (adsets.length > 0) setSelectedAdset(adsets[0]);
  }, [adsets]);

  useEffect(() => {
    if (filteredAds.length > 0) setSelectedAdId(filteredAds[0].id);
  }, [filteredAds]);

  const presets = [
    { title: 'Shipping delay complaint', text: "Total scam! Still haven't got tracking numbers for my eco bottles ordered 4 weeks ago!", sentiment: 'Complaint' as CommentSentiment, priority: 'Urgent' as CommentPriority, platform: 'facebook' as Platform },
    { title: 'Positive review', text: 'The tech sleeve looks incredibly elegant. Fits my iPad perfectly!', sentiment: 'Positive' as CommentSentiment, priority: 'Low' as CommentPriority, platform: 'instagram' as Platform },
    { title: 'Pricing inquiry', text: 'Any coupon codes active? How much is custom logo engraving?', sentiment: 'Question' as CommentSentiment, priority: 'Medium' as CommentPriority, platform: 'instagram' as Platform },
  ];

  const fireSimulation = () => {
    const tagging = autoTag(commentText);
    const finalPriority = tagging.priority || priority;
    const randomID = Math.floor(Math.random() * 10000000);
    const dateNow = new Date().toISOString();
    const ad = selectedAd || campaignAds[0];

    const newComment: Comment = {
      id: `sim-comment-${randomID}`,
      platform,
      commentId: `c_sim_${randomID}`,
      commentText,
      commenterName,
      commenterProfileUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120',
      originalCommentUrl: platform === 'facebook'
        ? `https://facebook.com/ads/comments/${randomID}`
        : `https://instagram.com/p/C_simulated/#c_${randomID}`,
      campaignId: selectedCampaign.id,
      campaignName: selectedCampaign.campaignName,
      adsetId: `adset_sim_${randomID}`,
      adsetName: ad?.adsetName || selectedAdset || 'Simulated Audience',
      adId: ad?.id || 'ad-1',
      adName: ad?.adName || 'Simulated Ad Creative',
      pageId: platform === 'facebook' ? 'page_growthdigital' : undefined,
      pageName: platform === 'facebook' ? 'GrowthDigital Eco Store' : undefined,
      instagramAccountId: platform === 'instagram' ? 'ig_growth_eco' : undefined,
      instagramAccountName: platform === 'instagram' ? '@growth_eco_tech' : undefined,
      status: 'Unseen',
      priority: finalPriority,
      sentiment,
      tags: tagging.tags.length > 0 ? tagging.tags : ['Webhook Simulation'],
      createdAt: dateNow,
      updatedAt: dateNow,
    };

    const metaWebhookPayload = {
      object: platform === 'facebook' ? 'page' : 'instagram',
      entry: [{
        id: platform === 'facebook' ? 'page_growth_sim' : 'ig_growth_eco',
        time: Math.floor(Date.now() / 1000),
        changes: [{
          field: platform === 'facebook' ? 'feed_comments' : 'comments',
          value: {
            id: `c_sim_${randomID}`,
            from: { name: commenterName },
            message: commentText,
            ad_metadata: {
              campaign_name: selectedCampaign.campaignName,
              adset_name: ad?.adsetName,
              ad_id: ad?.adId,
              ad_name: ad?.adName,
            },
          },
        }],
      }],
    };

    setGeneratedPayload(metaWebhookPayload);
    onAddSimulatedComment(newComment);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 4000);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="webhook-screen">
      {showNotification && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white rounded-xl p-4 shadow-xl max-w-sm flex items-start gap-3 animate-slide-over">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <div>
            <strong className="block text-sm">Webhook Triggered!</strong>
            <span className="text-xs text-emerald-100">New comment added to inbox with activity log.</span>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" /> Webhook Simulator
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Simulate incoming Facebook or Instagram ad comments via Meta webhook payloads.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Event Configuration</h3>

            <div>
              <label className="label-text">Platform</label>
              <div className="grid grid-cols-2 gap-2">
                {(['facebook', 'instagram'] as Platform[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      platform === p
                        ? p === 'facebook' ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-100' : 'bg-pink-50 border-pink-300 text-pink-700 ring-2 ring-pink-100'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {p === 'facebook' ? <Facebook className="w-4 h-4" /> : <Instagram className="w-4 h-4" />}
                    {p === 'facebook' ? 'Facebook' : 'Instagram'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label-text">Campaign</label>
              <select value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)} className="filter-select">
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.campaignName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-text">Ad Set</label>
              <select value={selectedAdset} onChange={e => setSelectedAdset(e.target.value)} className="filter-select">
                {adsets.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-text">Ad Creative</label>
              <select value={selectedAdId} onChange={e => setSelectedAdId(e.target.value)} className="filter-select">
                {filteredAds.map(a => (
                  <option key={a.id} value={a.id}>{a.adName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-text">Commenter Name</label>
              <input type="text" value={commenterName} onChange={e => setCommenterName(e.target.value)} className="filter-select" />
            </div>

            <div>
              <label className="label-text">Comment Text</label>
              <textarea rows={3} value={commentText} onChange={e => setCommentText(e.target.value)} className="filter-select resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-text">Sentiment</label>
                <select value={sentiment} onChange={e => setSentiment(e.target.value as CommentSentiment)} className="filter-select">
                  {(['Question', 'Positive', 'Neutral', 'Complaint', 'Negative'] as CommentSentiment[]).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as CommentPriority)} className="filter-select">
                  {(['Low', 'Medium', 'High', 'Urgent'] as CommentPriority[]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={fireSimulation}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
            >
              Trigger Webhook <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-xl">
            <h3 className="font-bold text-sm mb-3">Quick Presets</h3>
            <div className="space-y-2">
              {presets.map((pre, idx) => (
                <button
                  key={idx}
                  onClick={() => { setCommentText(pre.text); setSentiment(pre.sentiment); setPriority(pre.priority); setPlatform(pre.platform); }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 text-left transition-colors"
                >
                  <span className="text-xs font-bold text-slate-800">{pre.title}</span>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{pre.text}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-slate-950 text-slate-100 p-5 rounded-xl min-h-[480px] flex flex-col font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-pink-500" />
                <span className="text-xs text-slate-400 font-bold uppercase">Webhook Payload Output</span>
              </div>
              {generatedPayload && (
                <button
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(generatedPayload, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="px-2 py-1 text-[11px] border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto text-xs text-emerald-400">
              {generatedPayload ? (
                <pre>{JSON.stringify(generatedPayload, null, 2)}</pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Bot className="w-10 h-10 text-slate-700 mb-2" />
                  <p className="text-slate-500 text-sm">Trigger a simulation to see the payload</p>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2 text-[10px] text-slate-500">
              <Info className="w-3.5 h-3.5" />
              Auto-tagging rules apply keywords from comment text on submission.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
