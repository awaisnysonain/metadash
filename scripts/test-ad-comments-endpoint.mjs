import 'dotenv/config';
import { metaGraphGet } from '../server/lib/meta.js';

const adId = process.argv[2] || '120238834160000085';
const token = process.env.META_ACCESS_TOKEN;

const endpoints = [
  `/${adId}?fields=id,name,creative{effective_object_story_id}`,
  `/${adId}/comments?fields=id,message,from,created_time&limit=3`,
];

for (const path of endpoints) {
  try {
    const res = await metaGraphGet(path, token);
    console.log('OK', path.split('?')[0], JSON.stringify(res).slice(0, 400));
  } catch (err) {
    console.log('ERR', path.split('?')[0], err instanceof Error ? err.message : err);
  }
}

const story = await metaGraphGet(`/${adId}?fields=creative{effective_object_story_id}`, token);
const sid = story.creative?.effective_object_story_id;
if (sid) {
  const pageId = sid.split('_')[0];
  try {
    const page = await metaGraphGet(`/${pageId}?fields=id,name`, token);
    console.log('Page info:', page);
  } catch (e) {
    console.log('Page info err:', e instanceof Error ? e.message : e);
  }
}
