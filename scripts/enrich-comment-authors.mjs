/**
 * Re-fetch comment author names from Meta and update the database.
 * Run on server: node scripts/enrich-comment-authors.mjs
 */
import 'dotenv/config';
import pg from 'pg';

function resolveCommenterInfo(from, username) {
  const id = from?.id;
  const profileUrl =
    from?.picture?.data?.url || (id ? `https://www.facebook.com/profile.php?id=${id}` : '');
  const name = from?.name?.trim() || username?.trim() || (id ? 'Facebook User' : 'Commenter');
  return { name, profileUrl, id };
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows: stories } = await pool.query(`
  SELECT DISTINCT a.post_story_id, p.access_token
  FROM comments c
  JOIN ads a ON a.ad_id = c.ad_id
  LEFT JOIN connected_pages p ON p.page_id = split_part(a.post_story_id, '_', 1)
  WHERE a.post_story_id IS NOT NULL
    AND c.commenter_name IN ('Unknown User', 'Commenter', 'Facebook User', 'Facebook commenter')
`);

let updated = 0;
let scanned = 0;

for (const { post_story_id, access_token } of stories) {
  if (!access_token) continue;

  let url = `https://graph.facebook.com/v21.0/${post_story_id}/comments?fields=id,from{id,name,picture},username&limit=100&access_token=${encodeURIComponent(access_token)}`;

  while (url) {
    const body = await (await fetch(url)).json();
    if (body.error) {
      console.warn('ERR', post_story_id, body.error.message);
      break;
    }

    for (const c of body.data ?? []) {
      scanned++;
      const author = resolveCommenterInfo(c.from, c.username);
      if (author.name === 'Commenter') continue;

      const res = await pool.query(
        `UPDATE comments SET
          commenter_name = $1,
          commenter_profile_url = COALESCE(NULLIF($2, ''), commenter_profile_url),
          updated_at = NOW()
         WHERE comment_id = $3
           AND commenter_name IN ('Unknown User', 'Commenter', 'Facebook User', 'Facebook commenter')`,
        [author.name, author.profileUrl, c.id]
      );
      if (res.rowCount) updated++;
    }

    url = body.paging?.next ?? null;
    if (url) await new Promise(r => setTimeout(r, 150));
  }
}

console.log(`Enrichment done: updated ${updated} comment(s), scanned ${scanned} from Meta`);
await pool.end();
