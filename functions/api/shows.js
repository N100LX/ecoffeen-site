// GET /api/shows -> every ShootProof gallery for brand 344693, newest first:
//   {"count":N,"updated":"ISO","shows":[{"name","url","cover","w","h"}, ...]}
// Runs on Cloudflare Pages Functions (deploys with the repo). The browser can't call
// ShootProof itself (CORS only allows studio.shootproof.com), so this proxies + caches it.
const API = 'https://api.shootproof.com/client/brand/344693/event';
const URL_OK = 'https://ecoffeenphoto.shootproof.com/';
const IMG_OK = 'https://d2rxqglyhdohqf.cloudfront.net/';
const FRESH = 300;          // serve from edge cache for 5 min without asking ShootProof
const STALE = 86400;        // after that, serve stale (up to 1 day) while refreshing in the background
const clean = s => String(s == null ? '' : s)
  .replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
const int = (n, d) => (Number.isFinite(+n) && +n > 0 && +n < 20000 ? Math.round(+n) : d);

async function load() {
  const out = [];
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const r = await fetch(`${API}?page=${page}&rows=100`, {
      headers: { Accept: 'application/vnd.shootproof+json', 'User-Agent': 'ecoffeenphotography.com shows' },
      cf: { cacheTtl: 0 },
    });
    if (!r.ok) throw new Error('ShootProof HTTP ' + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.items)) throw new Error('ShootProof: bad payload');
    pages = int(j.meta && j.meta.totalPages, 1);
    for (const it of j.items) {
      const url = it && it.links && it.links.client && it.links.client.href;
      const cp = (it && it.coverPhoto) || {}, du = cp.displayUrl || {};
      const cover = du.large || du.medium;
      const name = clean(it && it.name);
      if (!name || typeof url !== 'string' || !url.startsWith(URL_OK) || /["'<>\s]/.test(url)) continue;
      out.push({
        name, url,
        cover: typeof cover === 'string' && cover.startsWith(IMG_OK) && !/["'<>\s]/.test(cover) ? cover : null,
        w: int(cp.width, 566), h: int(cp.height, 388),
      });
    }
  }
  if (!out.length) throw new Error('ShootProof: no events');
  return out;
}

const respond = (body, status, age) => new Response(body, {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    ...(age != null ? { 'X-Cache-Age': String(age) } : {}),
  },
});

function keyFor(request){const u=new URL(request.url);u.search='';return new Request(u.toString(),{method:'GET'})}
async function refresh(cache, request) {
  const shows = await load();
  const body = JSON.stringify({ count: shows.length, updated: new Date().toISOString(), shows });
  const stored = new Response(body, { headers: {
    'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STALE}`, 'X-Stored': String(Date.now()),
  } });
  try { await cache.put(keyFor(request), stored); } catch (e) { console.log('cache put failed', e); }
  return body;
}

export async function onRequestGet(ctx) {
  const cache = caches.default, key = keyFor(ctx.request);
  let hit = null;
  try { hit = await cache.match(key); } catch (e) { console.log('cache match failed', e); }
  if (hit) {
    const age = Math.round((Date.now() - +(hit.headers.get('X-Stored') || 0)) / 1000);
    const body = await hit.text();
    if (age > FRESH) ctx.waitUntil(refresh(cache, ctx.request).catch(() => {}));   // stale-while-revalidate
    if (age <= STALE) return respond(body, 200, age);
  }
  try {
    return respond(await refresh(cache, ctx.request), 200, 0);
  } catch (e) {
    return respond(JSON.stringify({ error: 'upstream', detail: String(e && e.message || e) }), 502);
  }
}
