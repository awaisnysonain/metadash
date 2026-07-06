import React, { useRef, useState, useEffect } from 'react';
import { Ad, Comment } from '../types';
import { apiClient } from '../services/apiClient';
import { inferBrandLabel, safeExternalUrl, commentLinkLabel, adLinkLabel, commentExternalUrl } from '../utils/helpers';
import { formatSpend } from '../utils/campaignHelpers';
import { PlatformBadge } from './ui/Badges';
import { BrandLogoBadge } from './BrandLogo';
import {
  ExternalLink,
  Facebook,
  Instagram,
  ImageOff,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Heart,
  MessageCircle,
  Share2,
  Megaphone,
} from 'lucide-react';

interface AdPreviewPanelProps {
  ad?: Ad;
  comment?: Comment;
  compact?: boolean;
  detail?: boolean;
  className?: string;
}

export default function AdPreviewPanel({ ad: adProp, comment, compact = false, detail = false, className = '' }: AdPreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [ad, setAd] = useState<Ad | undefined>(adProp);
  const [loadingAd, setLoadingAd] = useState(false);

  useEffect(() => {
    setAd(adProp);
  }, [adProp]);

  useEffect(() => {
    if (!comment?.adId) return;
    const hasDirectVideo = Boolean(adProp?.mediaType === 'video' && adProp.mediaUrl && !adProp.mediaUrl.includes('facebook.com'));
    const hasStaticPreview = Boolean(adProp?.mediaType === 'image' && (adProp.mediaUrl || adProp.thumbnailUrl));
    if (hasDirectVideo || hasStaticPreview) {
      setAd(adProp);
      return;
    }
    let cancelled = false;
    setLoadingAd(true);
    apiClient
      .getAdById(comment.adId)
      .then(full => {
        if (!cancelled) setAd(full);
      })
      .catch(() => {
        if (!cancelled) setAd(adProp);
      })
      .finally(() => {
        if (!cancelled) setLoadingAd(false);
      });
    return () => {
      cancelled = true;
    };
  }, [comment?.adId, adProp?.id, adProp?.mediaUrl, adProp?.thumbnailUrl]);

  useEffect(() => {
    setIsPlaying(true);
    setIsMuted(true);
  }, [ad?.id, comment?.id]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [isPlaying, ad?.id]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  if (!comment) {
    return (
      <div className={`bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center min-h-[320px] ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
          <Megaphone className="w-7 h-7 text-slate-300" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">Select a comment</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-[220px]">
          Click any comment to see the ad it came from.
        </p>
      </div>
    );
  }

  const platform = comment.platform;
  const BrandIcon = platform === 'facebook' ? Facebook : Instagram;
  const brand = inferBrandLabel(comment, ad);
  const commentUrl = commentExternalUrl(comment);
  const adUrl = safeExternalUrl(ad?.originalAdUrl);
  const canRenderDirectVideo = Boolean(ad?.mediaUrl && !ad.mediaUrl.includes('facebook.com'));
  const mediaClass = detail ? 'h-[300px] 2xl:h-[380px]' : compact ? 'h-40' : 'aspect-video';

  const renderMedia = () => {
    if (loadingAd) {
      return (
        <div className={`relative ${mediaClass} bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200`}>
          <p className="text-sm text-slate-500">Loading ad preview…</p>
        </div>
      );
    }

    const mediaSrc = ad?.mediaType === 'video' && !canRenderDirectVideo
      ? ad.thumbnailUrl || ad.mediaUrl
      : ad?.mediaUrl || ad?.thumbnailUrl;
    if (!mediaSrc) {
      return (
        <div className={`relative ${mediaClass} bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden flex flex-col items-center justify-center border border-slate-200`}>
          <ImageOff className={`${compact ? 'w-6 h-6 mb-1' : 'w-10 h-10 mb-2'} text-slate-400`} />
          <p className="text-sm text-slate-600">Preview not available</p>
          <p className="text-xs text-slate-400 mt-0.5 px-4">The comment is still visible above; Meta did not return playable media for this asset.</p>
        </div>
      );
    }

    if (ad.mediaType === 'image' || !ad.mediaUrl || !canRenderDirectVideo) {
      return (
        <div className={`relative ${mediaClass} ${detail ? 'bg-slate-950' : 'bg-slate-100'} rounded-lg overflow-hidden border border-slate-200`}>
          <img
            src={mediaSrc}
            alt={ad.adName}
            className={`w-full h-full ${detail ? 'object-contain' : 'object-cover'}`}
            referrerPolicy="no-referrer"
          />
          {ad.mediaType === 'video' && !canRenderDirectVideo && (
            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-slate-950/85 px-3 py-2 text-[11px] font-bold text-white shadow-lg backdrop-blur">
              Meta returned a preview image for this video. Use the ad link below if direct playback is blocked.
            </div>
          )}
        </div>
      );
    }

    return (
        <div className={`relative ${mediaClass} bg-black rounded-xl overflow-hidden border border-slate-800 group`}>
        <video
          ref={videoRef}
          src={ad.mediaUrl}
          poster={ad.thumbnailUrl}
          className="w-full h-full object-contain bg-black"
          loop
          muted={isMuted}
          playsInline
          autoPlay
          controls
        />
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={() => setIsPlaying(true)}
          >
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
              <Play className="w-6 h-6 text-slate-900 fill-current ml-0.5" />
            </div>
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex gap-1.5 bg-black/70 backdrop-blur-sm p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-white border border-slate-200 ${detail ? 'rounded-2xl shadow-none' : 'rounded-xl shadow-sm'} overflow-hidden ${className}`}>
      <div className={`${compact || detail ? 'px-3 py-2' : 'px-4 py-3'} border-b border-slate-100 flex items-center justify-between bg-slate-50/80`}>
        <div className="flex items-center gap-2">
          <BrandIcon className={`w-4 h-4 ${platform === 'facebook' ? 'text-[#1877F2]' : 'text-pink-600'}`} />
          <h3 className="text-sm font-medium text-slate-900">Comment source</h3>
        </div>
        <div className="flex items-center gap-2">
          <BrandLogoBadge brand={brand} />
          <PlatformBadge platform={platform} />
        </div>
      </div>

      <div className={`${compact || detail ? 'p-3 space-y-2' : 'p-4 space-y-3'} ${compact || detail ? 'text-xs' : ''}`}>
        {renderMedia()}

        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Campaign</p>
              <p className="text-sm font-medium text-slate-800 truncate">{ad ? comment.campaignName : 'Organic / no ad campaign'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-500">Account</p>
              <p className="text-sm text-slate-700 truncate">{ad?.accountLabel || brand}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Spend</p>
              <p className="text-sm text-slate-700 truncate">{ad?.spend != null ? formatSpend(ad.spend) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ad set</p>
              <p className="text-sm text-slate-700 truncate" title={comment.adsetName}>{ad ? comment.adsetName : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ad</p>
              <p className="text-sm text-slate-700 truncate" title={comment.adName}>{ad ? comment.adName : 'Organic comment'}</p>
            </div>
          </div>
        </div>

        {ad && (
          <>
            {(!compact || detail) && ad.adCopy && (
              <p className="detail-line-clamp-2 text-[11px] text-slate-600 leading-relaxed">{ad.adCopy}</p>
            )}
            {ad.headline && (
              <p className="text-xs font-bold text-slate-900">{ad.headline}</p>
            )}
            {(!compact || detail) && ad.description && (
              <p className="detail-line-clamp-2 text-[10px] text-slate-500">{ad.description}</p>
            )}

            <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1 border-t border-slate-100">
              {ad.likesCount != null && (
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-rose-400" /> {ad.likesCount.toLocaleString()}
                </span>
              )}
              {ad.sharesCount != null && (
                <span className="flex items-center gap-1">
                  <Share2 className="w-3 h-3 text-blue-400" /> {ad.sharesCount.toLocaleString()}
                </span>
              )}
              {ad.commentsCount != null && (
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3 text-emerald-400" /> {ad.commentsCount.toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              {adUrl && (
                <a
                  href={adUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors"
                >
                  {adLinkLabel(ad.originalAdUrl)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {commentUrl && (
                <a
                  href={commentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 text-[11px] font-bold rounded-lg transition-colors"
                >
                  {commentLinkLabel(comment.platform)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
