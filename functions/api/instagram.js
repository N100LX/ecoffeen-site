// GET /api/instagram -> recent public grid posts for @emily_coffeen_photography:
//   {"count":N,"updated":"ISO","posts":[{"code","url","thumb","video"}, ...]}
// Zero-token: fetches the logged-out Instagram profile HTML and reads the
// embedded Relay payload (polaris_ordered_timeline_connection in data-sjs).
// Same edge-cache pattern as /api/shows. Instagram often rate-limits / blocks
// datacenter IPs (HTTP 429); on scrape failure we serve data/instagram.json
// (refreshed at build time) so the home-page row still appears.
const HANDLE = 'emily_coffeen_photography';
const PROFILE = 'https://www.instagram.com/' + HANDLE + '/';
const FRESH = 600;    // 10 min: serve cached without re-hitting Instagram
const STALE = 86400;  // up to 1 day stale-while-revalidate
const LIMIT = 9;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-CH-UA': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function cookieFrom(res) {
  let raw = [];
  try {
    if (typeof res.headers.getSetCookie === 'function') raw = res.headers.getSetCookie() || [];
  } catch (e) {}
  if (!raw.length) {
    const one = res.headers.get('set-cookie');
    if (one) raw = [one];
  }
  const parts = [];
  for (const line of raw) {
    const nv = String(line).split(';')[0].trim();
    if (nv && !/=$/.test(nv)) parts.push(nv);
  }
  return parts.join('; ');
}

function walk(node, visit) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) walk(c, visit); return; }
  visit(node);
  for (const v of Object.values(node)) walk(v, visit);
}

function thumbOk(u) {
  if (typeof u !== 'string' || !u.startsWith('https://') || /["'<>\s]/.test(u)) return false;
  try {
    const h = new URL(u).hostname;
    return h === 'cdninstagram.com' || h.endsWith('.cdninstagram.com')
      || h === 'fbcdn.net' || h.endsWith('.fbcdn.net');
  } catch (e) { return false; }
}

function sanitize(posts) {
  const out = [];
  for (const p of posts || []) {
    if (!p || typeof p.code !== 'string' || !/^[A-Za-z0-9_-]{5,20}$/.test(p.code)) continue;
    if (!thumbOk(p.thumb)) continue;
    let url = p.url;
    if (typeof url !== 'string' || !/^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\//.test(url)) {
      url = 'https://www.instagram.com/' + (p.video ? 'reel' : 'p') + '/' + p.code + '/';
    }
    out.push({ code: p.code, url, thumb: p.thumb, video: !!p.video });
    if (out.length >= LIMIT) break;
  }
  return out;
}

function parsePosts(html) {
  if (!html || html.length < 1000) throw new Error('Instagram: empty page');
  if (/\/accounts\/login/.test(html) && !/xig_user_by_username/.test(html)) {
    throw new Error('Instagram: login wall');
  }
  const blocks = [];
  const re = /<script[^>]*type="application\/json"[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  let best = [];
  for (const block of blocks) {
    let data;
    try { data = JSON.parse(block); } catch (e) { continue; }
    walk(data, (obj) => {
      const user = obj.xig_user_by_username;
      if (!user || typeof user !== 'object') return;
      const edges = user.polaris_ordered_timeline_connection && user.polaris_ordered_timeline_connection.edges;
      if (!Array.isArray(edges) || edges.length <= best.length) return;
      const out = [];
      for (const edge of edges) {
        const n = edge && edge.node;
        if (!n || typeof n.code !== 'string' || !/^[A-Za-z0-9_-]{5,20}$/.test(n.code)) continue;
        const thumb = n.display_uri;
        if (!thumbOk(thumb)) continue;
        const video = n.media_type === 2 || n.product_type === 'clips'
          || n.__typename === 'XIGPolarisVideoMedia';
        const path = video ? 'reel' : 'p';
        out.push({
          code: n.code,
          url: 'https://www.instagram.com/' + path + '/' + n.code + '/',
          thumb,
          video: !!video,
        });
      }
      if (out.length > best.length) best = out;
    });
  }
  if (!best.length) throw new Error('Instagram: no posts in payload');
  return best.slice(0, LIMIT);
}

async function scrape() {
  let res = await fetch(PROFILE, { headers: PAGE_HEADERS, redirect: 'follow', cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error('Instagram HTTP ' + res.status);
  let html = await res.text();
  if (!/polaris_ordered_timeline_connection/.test(html)) {
    const cookie = cookieFrom(res);
    if (cookie) {
      res = await fetch(PROFILE, {
        headers: { ...PAGE_HEADERS, Cookie: cookie, 'Sec-Fetch-Site': 'same-origin', Referer: PROFILE },
        redirect: 'follow',
        cf: { cacheTtl: 0 },
      });
      if (!res.ok) throw new Error('Instagram HTTP ' + res.status + ' (retry)');
      html = await res.text();
    }
  }
  return parsePosts(html);
}

async function loadFallback(request) {
  const url = new URL('/data/instagram.json', request.url);
  const r = await fetch(url.toString(), { cf: { cacheTtl: 60 } });
  if (!r.ok) throw new Error('fallback HTTP ' + r.status);
  const j = await r.json();
  const posts = sanitize(j && j.posts);
  if (!posts.length) throw new Error('fallback empty');
  return { posts, updated: (j && j.updated) || new Date().toISOString(), source: 'fallback' };
}

async function load(request) {
  try {
    const posts = await scrape();
    return { posts, updated: new Date().toISOString(), source: 'live' };
  } catch (e) {
    console.log('instagram scrape failed', String(e && e.message || e));
    const fb = await loadFallback(request);
    return fb;
  }
}

const respond = (body, status, age, source) => new Response(body, {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    ...(age != null ? { 'X-Cache-Age': String(age) } : {}),
    ...(source ? { 'X-IG-Source': source } : {}),
  },
});

function keyFor(request) {
  const u = new URL(request.url); u.search = '';
  return new Request(u.toString(), { method: 'GET' });
}

async function refresh(cache, request) {
  const { posts, updated, source } = await load(request);
  const body = JSON.stringify({ count: posts.length, updated, handle: HANDLE, source, posts });
  // Only cache live scrapes for the long STALE window; fallback gets a short edge TTL
  // so we keep retrying Instagram after a rate-limit clears.
  const ttl = source === 'live' ? STALE : 300;
  const stored = new Response(body, { headers: {
    'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`,
    'X-Stored': String(Date.now()), 'X-IG-Source': source,
  } });
  try { await cache.put(keyFor(request), stored); } catch (e) { console.log('cache put failed', e); }
  return { body, source };
}

export async function onRequestGet(ctx) {
  const cache = caches.default, key = keyFor(ctx.request);
  let hit = null;
  try { hit = await cache.match(key); } catch (e) { console.log('cache match failed', e); }
  if (hit) {
    const age = Math.round((Date.now() - +(hit.headers.get('X-Stored') || 0)) / 1000);
    const source = hit.headers.get('X-IG-Source') || '';
    const body = await hit.text();
    const freshFor = source === 'live' ? FRESH : 120;
    if (age > freshFor) ctx.waitUntil(refresh(cache, ctx.request).catch(() => {}));
    if (age <= STALE) return respond(body, 200, age, source);
  }
  try {
    const { body, source } = await refresh(cache, ctx.request);
    return respond(body, 200, 0, source);
  } catch (e) {
    return respond(JSON.stringify({ error: 'upstream', detail: String(e && e.message || e) }), 502);
  }
}
