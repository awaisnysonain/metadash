import React, { useRef, useState, useEffect } from 'react';
import { Ad, Comment } from '../types';
import { PlatformBadge } from './ui/Badges';
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
  className?: string;
}

export default function AdPreviewPanel({ ad, comment, compact = false, className = '' }: AdPreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

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
        <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
          Choose a comment from the inbox to preview the related ad creative here.
        </p>
      </div>
    );
  }

  const platform = comment.platform;
  const BrandIcon = platform === 'facebook' ? Facebook : Instagram;

  const renderMedia = () => {
    if (!ad?.mediaUrl) {
      return (
        <div className="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden flex flex-col items-center justify-center border border-slate-200">
          <ImageOff className="w-10 h-10 text-slate-400 mb-2" />
          <p className="text-xs font-semibold text-slate-600">Creative unavailable</p>
          <p className="text-[10px] text-slate-500 mt-0.5 px-4">Media URL not provided for this ad</p>
        </div>
      );
    }

    if (ad.mediaType === 'image') {
      return (
        <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
          <img
            src={ad.mediaUrl}
            alt={ad.adName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      );
    }

    return (
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800">
        <video
          ref={videoRef}
          src={ad.mediaUrl}
          poster={ad.thumbnailUrl}
          className="w-full h-full object-cover"
          loop
          muted={isMuted}
          playsInline
          autoPlay
        />
        <div className="absolute bottom-2 right-2 flex gap-1 bg-black/70 backdrop-blur-sm p-1 rounded-full">
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
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <BrandIcon className={`w-4 h-4 ${platform === 'facebook' ? 'text-[#1877F2]' : 'text-pink-600'}`} />
          <h3 className="text-xs font-bold text-slate-900">Ad Creative Preview</h3>
        </div>
        <PlatformBadge platform={platform} />
      </div>

      <div className={`p-4 space-y-3 ${compact ? 'text-xs' : ''}`}>
        {renderMedia()}

        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Campaign</p>
              <p className="text-xs font-semibold text-slate-800 truncate">{comment.campaignName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Ad Set</p>
              <p className="text-[11px] font-medium text-slate-700 truncate" title={comment.adsetName}>{comment.adsetName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Ad</p>
              <p className="text-[11px] font-medium text-slate-700 truncate" title={comment.adName}>{comment.adName}</p>
            </div>
          </div>
        </div>

        {ad && (
          <>
            {ad.adCopy && (
              <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">{ad.adCopy}</p>
            )}
            {ad.headline && (
              <p className="text-xs font-bold text-slate-900">{ad.headline}</p>
            )}
            {ad.description && (
              <p className="text-[10px] text-slate-500">{ad.description}</p>
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
              {ad.originalAdUrl && (
                <a
                  href={ad.originalAdUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors"
                >
                  Open Ad <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <a
                href={comment.originalCommentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors"
              >
                Open Comment <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
