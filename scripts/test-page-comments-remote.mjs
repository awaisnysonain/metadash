import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows: pages } = await pool.query(
  'SELECT page_id, name FROM connected_pages LIMIT 5'
);
console.log('Pages:', pages);

const { rows: ads } = await pool.query(`
  SELECT ad_id, post_story_id, ad_name
  FROM ads
  WHERE post_story_id IS NOT NULL
  LIMIT 10
`);
console.log('Sample ads:', ads);

for (const page of pages.slice(0, 2)) {
  const match = ads.find(a => a.post_story_id?.startsWith(page.page_id + '_'));
  if (!match) {
    console.log('No ad for page', page.page_id, page.name);
    continue;
  }
  const { rows: tok } = await pool.query(
    'SELECT access_token FROM connected_pages WHERE page_id = $1',
    [page.page_id]
  );
  const pt = tok[0]?.access_token;
  const storyId = match.post_story_id;
  console.log('\nTest page', page.name, 'story', storyId, 'pageToken', Boolean(pt));
  for (const [label, token] of [
    ['page', pt],
    ['user', process.env.META_ACCESS_TOKEN],
  ]) {
    if (!token) continue;
    const url = `https://graph.facebook.com/v21.0/${storyId}/comments?fields=id,message&limit=2&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = await res.json();
    console.log(label, res.status, body.error?.message || `count=${body.data?.length ?? 0}`);
  }
}

await pool.end();
