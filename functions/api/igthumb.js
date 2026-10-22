// GET /api/igthumb?c=<post code>&u=<signed Instagram CDN URL> -> the image, served from our origin.
// Used only by /api/instagram's live path for posts we have not self-hosted yet (see
// tools/refresh_instagram.py). Instagram's CDN URLs are signed and expire after a few days, so the
// first successful fetch is kept in the Cloudflare edge cache keyed by post code + image path (not the
// expiring query string): the tile keeps working after the signature lapses. Only Instagram CDN hosts
// are allowed (no open proxy). On failure we return 404 (never redirect to the CDN); the page then
// drops that tile.
const EDGE_TTL = 2592000;   // 30 days at the edge
const BROWSER_TTL = 604800; // 7 days in the browser

function hostOk(u) {
  if (typeof u !== 'string' || !u.startsWith('https://') || u.length > 1500 || /["'<>\s\\]/.test(u)) return false;
  try {
    const h = new URL(u).hostname;
    return h === 'cdninstagram.com' || h.endsWith('.cdninstagram.com')
      || h === 'fbcdn.net' || h.endsWith('.fbcdn.net');
  } catch (e) { return false; }
}

const miss = (msg, status) => new Response(msg, { status, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestGet(ctx) {
  const q = new URL(ctx.request.url).searchParams;
  const code = q.get('c') || '', u = q.get('u') || '';
  if (!/^[A-Za-z0-9_-]{5,20}$/.test(code) || !hostOk(u)) return miss('bad thumb', 400);
  const path = new URL(u).pathname;
  if (!/\.(jpe?g|webp|png|heic)$/i.test(path)) return miss('bad thumb', 400);
  const cache = caches.default;
  const key = new Request(new URL('/api/igthumb/' + code + '?p=' + encodeURIComponent(path), ctx.request.url).toString(), { method: 'GET' });
  let hit = null;
  try { hit = await cache.match(key); } catch (e) {}
  if (hit) return hit;
  let r;
  try {
    r = await fetch(u, { headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
  } catch (e) {
    return miss('upstream error', 404);
  }
  const ct = r.headers.get('Content-Type') || '';
  if (!r.ok || !ct.startsWith('image/')) return miss('upstream ' + r.status, 404);
  const res = new Response(r.body, { status: 200, headers: {
    'Content-Type': ct,
    'Cache-Control': `public, max-age=${BROWSER_TTL}, s-maxage=${EDGE_TTL}`,
    'X-Content-Type-Options': 'nosniff',
  } });
  ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}
