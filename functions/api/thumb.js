// GET /api/thumb?u=<ShootProof cover URL> -> same image, served from our origin's edge cache.
// Cuts the third-party DNS/TLS hop + cold CloudFront latency for /shows thumbnails.
// Only proxies the ShootProof CloudFront host (no open proxy). Covers are content-addressed
// per upload, so they're cached long at the edge and in the browser.
const IMG_OK = 'https://d2rxqglyhdohqf.cloudfront.net/';
const EDGE_TTL = 2592000;   // 30 days at the edge
const BROWSER_TTL = 604800; // 7 days in the browser

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url).searchParams.get('u') || '';
  if (!u.startsWith(IMG_OK) || u.length > 600 || /["'<>\s\\]/.test(u)) {
    return new Response('bad thumb url', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const cache = caches.default;
  const key = new Request(new URL('/api/thumb?u=' + encodeURIComponent(u), ctx.request.url).toString(), { method: 'GET' });
  let hit = null;
  try { hit = await cache.match(key); } catch (e) {}
  if (hit) return hit;
  let r;
  try {
    r = await fetch(u, { cf: { cacheEverything: true, cacheTtl: EDGE_TTL }, headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
  } catch (e) {
    return Response.redirect(u, 302);
  }
  const ct = r.headers.get('Content-Type') || '';
  if (!r.ok || !ct.startsWith('image/')) return Response.redirect(u, 302);
  const res = new Response(r.body, { status: 200, headers: {
    'Content-Type': ct,
    'Cache-Control': `public, max-age=${BROWSER_TTL}, s-maxage=${EDGE_TTL}, immutable`,
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  } });
  ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}
