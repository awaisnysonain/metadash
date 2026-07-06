import React, { useEffect, useState } from 'react';
import { Comment } from '../types';
import { commenterAvatarUrl, commenterInitial } from '../utils/helpers';

interface CommentAvatarProps {
  comment: Comment;
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
}

const sizeClasses = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-14 w-14 text-base',
};

export default function CommentAvatar({ comment, size = 'sm', highlight = false }: CommentAvatarProps) {
  const avatarUrl = commenterAvatarUrl(comment);
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    setFailedUrl('');
  }, [comment.id, avatarUrl]);

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeClasses[size]} shrink-0 rounded-full object-cover ring-2 ${highlight ? 'ring-blue-200' : 'ring-white'}`}
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(avatarUrl)}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} shrink-0 rounded-full flex items-center justify-center font-extrabold ${highlight ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-200' : 'bg-slate-200 text-slate-500 ring-2 ring-white'}`}>
      {commenterInitial(comment.commenterName)}
    </div>
  );
}
