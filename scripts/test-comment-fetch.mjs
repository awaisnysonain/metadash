import 'dotenv/config';
import { initDatabase } from '../server/db/pool.js';
import { resolveAdStoryId, fetchStoryComments } from '../server/lib/meta-graph.js';
import { getPageAccessToken } from '../server/db/sync-repository.js';
import { getAllAds } from '../server/db/repository.js';

await initDatabase();
const ads = await getAllAds();
const ad = ads[0];
if (!ad) {
  console.log('No ads');
  process.exit(1);
}

console.log('Testing ad:', ad.adId, ad.adName);
console.log('Cached story:', ad.postStoryId ?? 'none');

const resolved = await resolveAdStoryId(ad.adId);
console.log('Resolved story:', resolved);

const storyId = ad.postStoryId || resolved.storyId;
if (!storyId) {
  console.log('No story id');
  process.exit(1);
}

const pageToken = resolved.pageId ? await getPageAccessToken(resolved.pageId) : null;
console.log('Page token available:', Boolean(pageToken));

const since = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);

for (const label of ['page', 'user', 'no-since']) {
  try {
    const opts =
      label === 'page'
        ? { limit: 5, pageAccessToken: pageToken, since }
        : label === 'user'
          ? { limit: 5, since }
          : { limit: 5 };
    const comments = await fetchStoryComments(storyId, undefined, opts);
    console.log(label, 'OK', comments.length, comments[0]?.message?.slice(0, 60));
  } catch (err) {
    console.log(label, 'ERR', err instanceof Error ? err.message : err);
  }
}
