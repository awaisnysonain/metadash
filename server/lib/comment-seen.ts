import { getCommentById, updateCommentStatus, insertActivityLog } from '../db/repository.js';
import { getCommentViews, recordCommentView } from '../db/user-repository.js';

type TeamUser = { id: string; name: string };

/**
 * Record that a teammate opened/interacted with a comment and promote Unseen → Seen
 * for the whole team (global status + seen_at on the comment row).
 */
export async function markCommentSeenForTeam(
  commentId: string,
  user: TeamUser,
  options?: { logActivity?: boolean }
) {
  await recordCommentView(commentId, user.id, user.name);

  const existing = await getCommentById(commentId);
  if (!existing) {
    return { comment: null, views: [], statusChanged: false };
  }

  let comment = existing;
  let statusChanged = false;

  if (existing.status === 'Unseen') {
    const now = new Date().toISOString();
    comment = (await updateCommentStatus(commentId, 'Seen', { seenAt: now })) ?? existing;
    statusChanged = true;
    if (options?.logActivity) {
      await insertActivityLog({
        id: `log-${Date.now()}`,
        comment_id: commentId,
        user_id: user.id,
        user_name: user.name,
        action: 'Viewed',
        old_value: 'Unseen',
        new_value: 'Seen',
        created_at: now,
      });
    }
  }

  const views = await getCommentViews(commentId);
  return { comment, views, statusChanged };
}
