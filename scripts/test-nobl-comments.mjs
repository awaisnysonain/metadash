import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pageId = '169796022879530'; // Nobl

const { rows: tok } = await pool.query(
  'SELECT access_token, name FROM connected_pages WHERE page_id = $1',
  [pageId]
);
const pt = tok[0]?.access_token;
console.log('Page', tok[0]?.name, 'token', Boolean(pt));

const { rows: ads } = await pool.query(
  `SELECT ad_id, post_story_id FROM ads WHERE post_story_id LIKE $1 LIMIT 1`,
  [`${pageId}_%`]
);
const storyId = ads[0]?.post_story_id;
console.log('Story', storyId);

for (const [label, token] of [
  ['page', pt],
  ['user', process.env.META_ACCESS_TOKEN],
]) {
  if (!token) continue;
  const url = `https://graph.facebook.com/v21.0/${storyId}/comments?fields=id,message,from,created_time&limit=5&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = await res.json();
  if (body.error) {
    console.log(label, 'ERR', body.error.message);
  } else {
    console.log(label, 'OK', body.data?.length, 'comments');
    for (const c of body.data ?? []) console.log(' -', c.message?.slice(0, 80));
  }
}

await pool.end();
