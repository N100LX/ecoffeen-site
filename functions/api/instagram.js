// GET /api/instagram -> recent public grid posts for @emily_coffeen_photography:
//   {"count":N,"updated":"ISO","posts":[{"code","url","thumb","video"}, ...]}
// Zero-token: fetches the logged-out Instagram profile HTML and reads the
// embedded Relay payload (polaris_ordered_timeline_connection in data-sjs).
// Same edge-cache pattern as /api/shows. Instagram may rate-limit datacenter
// IPs; on failure we return 502 and the client hides the section.
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

async function load() {
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

function keyFor(request) {
  const u = new URL(request.url); u.search = '';
  return new Request(u.toString(), { method: 'GET' });
}

async function refresh(cache, request) {
  const posts = await load();
  const body = JSON.stringify({ count: posts.length, updated: new Date().toISOString(), handle: HANDLE, posts });
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
    if (age > FRESH) ctx.waitUntil(refresh(cache, ctx.request).catch(() => {}));
    if (age <= STALE) return respond(body, 200, age);
  }
  try {
    return respond(await refresh(cache, ctx.request), 200, 0);
  } catch (e) {
    return respond(JSON.stringify({ error: 'upstream', detail: String(e && e.message || e) }), 502);
  }
}
