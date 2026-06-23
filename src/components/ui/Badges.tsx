import { CommentStatus, CommentPriority, CommentSentiment, Platform } from '../../types';
import { Facebook, Instagram } from 'lucide-react';
import { statusStyles, priorityStyles, sentimentStyles, platformStyles } from '../../utils/helpers';

interface BadgeProps {
  className?: string;
}

export function StatusBadge({ status, className = '' }: { status: CommentStatus } & BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${statusStyles[status]} ${status === 'Unseen' ? 'animate-pulse' : ''} ${className}`}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className = '' }: { priority: CommentPriority } & BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${priorityStyles[priority]} ${className}`}>
      {priority}
    </span>
  );
}

export function SentimentBadge({ sentiment, className = '' }: { sentiment: CommentSentiment } & BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${sentimentStyles[sentiment]} ${className}`}>
      {sentiment}
    </span>
  );
}

export function PlatformBadge({ platform, className = '' }: { platform: Platform } & BadgeProps) {
  const styles = platformStyles[platform];
  const Icon = platform === 'facebook' ? Facebook : Instagram;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles.badge} ${className}`}>
      <Icon className={`w-3 h-3 ${styles.icon}`} />
      {styles.label}
    </span>
  );
}
