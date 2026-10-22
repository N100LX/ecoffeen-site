#!/usr/bin/env python3
"""Refresh the home-page Instagram row with self-hosted thumbnails.

    python3 tools/refresh_instagram.py            # update files only
    python3 tools/refresh_instagram.py --commit   # also git commit + push to main, only when something changed

Why: Instagram's thumbnail URLs (scontent-*.cdninstagram.com ... &oe=<expiry>) are signed and expire after
a few days, and Instagram blocks Cloudflare's IPs, so /api/instagram usually serves data/instagram.json.
This script downloads each post's thumbnail ONCE into assets/ig/<code>.jpg (640px wide, centre-cropped to the 4:5 tile shape), writes
data/instagram.json (latest 9, newest first) pointing at those files, and prunes images no longer listed.
The site never hotlinks Instagram's CDN, so tiles can't go stale.

Sources (first that applies):
  1. IG_ACCESS_TOKEN set (or IG_TOKEN_FILE pointing at a file holding it): the official Instagram API with
     Instagram Login (graph.instagram.com/me/media). The long-lived token is refreshed every ~50 days; see
     docs/INSTAGRAM-OFFICIAL.md.
  2. Otherwise: the public, logged-out profile page (no login, cookies or tokens), as a normal browser visitor.
     Falls back to headless Chromium via Playwright if it is installed and plain HTTP gets a stripped page.

Prints one summary line ("no change", "added 2 posts, removed 2 posts", ...). If Instagram blocks the
fetch it exits 2 with a clear message and leaves the existing data and images untouched.
Needs Pillow (pip install pillow).
"""
import hashlib, io, json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HANDLE = 'emily_coffeen_photography'
PROFILE = 'https://www.instagram.com/%s/' % HANDLE
DATA = os.path.join(ROOT, 'data', 'instagram.json')
TOKEN_STATE = os.path.join(ROOT, 'data', 'ig-token-state.json')   # last refresh date only, never the token
IMG_DIR = os.path.join(ROOT, 'assets', 'ig')
LIMIT, WIDTH, QUALITY = 9, 640, 84
TOKEN_REFRESH_DAYS = 50
CODE_RE = re.compile(r'^[A-Za-z0-9_-]{5,20}$')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
PAGE_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-CH-UA': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'Sec-CH-UA-Mobile': '?0', 'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
}


class Blocked(Exception):
    pass


TOKEN_REFRESHED = False


def cdn_ok(u):
    if not isinstance(u, str) or not u.startswith('https://') or re.search(r'["\'<>\s]', u):
        return False
    h = urllib.parse.urlsplit(u).hostname or ''
    return h in ('cdninstagram.com', 'fbcdn.net') or h.endswith('.cdninstagram.com') or h.endswith('.fbcdn.net')


def http(url, headers=None, timeout=25):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.geturl(), r.headers


# ---------- source 2: public profile page (logged-out) ----------
def parse_profile(html):
    best = []
    for block in re.findall(r'<script[^>]*type="application/json"[^>]*data-sjs[^>]*>(.*?)</script>', html, re.S):
        if 'polaris_ordered_timeline_connection' not in block:
            continue
        try:
            stack = [json.loads(block)]
        except Exception:
            continue
        while stack:
            o = stack.pop()
            if isinstance(o, dict):
                u = o.get('xig_user_by_username')
                if isinstance(u, dict):
                    edges = (u.get('polaris_ordered_timeline_connection') or {}).get('edges') or []
                    out = []
                    for e in edges:
                        n = (e or {}).get('node') or {}
                        code, src = n.get('code'), n.get('display_uri')
                        if not isinstance(code, str) or not CODE_RE.match(code) or not cdn_ok(src):
                            continue
                        video = n.get('media_type') == 2 or n.get('product_type') == 'clips' or n.get('__typename') == 'XIGPolarisVideoMedia'
                        try:
                            order = int(n.get('pk') or str(n.get('id') or '0').split('_')[0])
                        except ValueError:
                            order = 0
                        out.append({'code': code, 'video': bool(video), 'src': src, 'order': order})
                    if len(out) > len(best):
                        best = out
                stack.extend(o.values())
            elif isinstance(o, list):
                stack.extend(o)
    # Grid order puts pinned posts first; media pk grows with time, so sort by it for newest-first.
    best.sort(key=lambda p: p['order'], reverse=True)
    return best


def fetch_public():
    why = ''
    try:
        body, _, _ = http(PROFILE, PAGE_HEADERS)
        posts = parse_profile(body.decode('utf-8', 'replace'))
        if posts:
            return posts, 'public profile'
        why = 'profile page had no posts payload (login wall / stripped page)'
    except Exception as e:
        why = 'profile fetch failed: %s' % e
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise Blocked(why)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            try:
                pg = b.new_context(locale='en-US').new_page()
                r = pg.goto(PROFILE, wait_until='domcontentloaded', timeout=45000)
                posts = parse_profile(r.text() if r else '') or parse_profile(pg.content())
            finally:
                b.close()
    except Exception as e:
        raise Blocked(why + '; headless browser failed: %s' % e)
    if not posts:
        raise Blocked(why + '; headless browser also got no posts')
    return posts, 'public profile (headless)'


# ---------- source 1: official Instagram API (Instagram Login) ----------
def read_token():
    tok = os.environ.get('IG_ACCESS_TOKEN', '').strip()
    path = os.environ.get('IG_TOKEN_FILE', '').strip()
    if not tok and path and os.path.isfile(path):
        tok = open(path).read().strip()
    return tok, path


def maybe_refresh_token(tok, path):
    """Long-lived tokens last 60 days; refresh after ~50. Save the new token where we can."""
    state = {}
    if os.path.isfile(TOKEN_STATE):
        try: state = json.load(open(TOKEN_STATE))
        except Exception: state = {}
    last = state.get('refreshed')
    age = 9999
    if last:
        try: age = (datetime.now(timezone.utc) - datetime.fromisoformat(last.replace('Z', '+00:00'))).days
        except ValueError: pass
    if age < TOKEN_REFRESH_DAYS:
        return tok
    q = urllib.parse.urlencode({'grant_type': 'ig_refresh_token', 'access_token': tok})
    try:
        j = json.loads(http('https://graph.instagram.com/refresh_access_token?' + q)[0])
    except Exception as e:
        print('warning: token refresh failed (%s); old token still used' % e, file=sys.stderr); return tok
    new = j.get('access_token') or tok
    saved = []
    if path:
        with open(path, 'w') as f: f.write(new + '\n')
        os.chmod(path, 0o600); saved.append(path)
    if os.environ.get('GH_TOKEN') and os.environ.get('GITHUB_REPOSITORY'):
        # Needs a PAT with "Secrets: read and write" on this repo (stored as secret GH_SECRETS_PAT);
        # the workflow's built-in GITHUB_TOKEN cannot write secrets.
        r = subprocess.run(['gh', 'secret', 'set', 'IG_ACCESS_TOKEN', '--repo', os.environ['GITHUB_REPOSITORY']],
                           input=new, text=True, capture_output=True)
        if r.returncode == 0: saved.append('repo secret IG_ACCESS_TOKEN')
        else: print('warning: could not save refreshed token as a secret: %s' % r.stderr.strip(), file=sys.stderr)
    if not saved:
        print('warning: token refreshed but not saved anywhere; update IG_ACCESS_TOKEN by hand (see docs/INSTAGRAM-OFFICIAL.md)', file=sys.stderr)
    global TOKEN_REFRESHED
    TOKEN_REFRESHED = True
    state['refreshed'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    with open(TOKEN_STATE, 'w') as f: f.write(json.dumps(state) + '\n')
    return new


def fetch_official(tok, path):
    tok = maybe_refresh_token(tok, path)
    q = urllib.parse.urlencode({'fields': 'id,media_type,media_url,thumbnail_url,permalink,timestamp',
                                'limit': LIMIT * 2, 'access_token': tok})
    try:
        j = json.loads(http('https://graph.instagram.com/me/media?' + q)[0])
    except urllib.error.HTTPError as e:
        raise Blocked('Instagram API HTTP %s: %s' % (e.code, e.read()[:300].decode('utf-8', 'replace')))
    except Exception as e:
        raise Blocked('Instagram API failed: %s' % e)
    out = []
    for m in j.get('data') or []:
        mm = re.match(r'^https://www\.instagram\.com/(?:p|reel|reels|tv)/([A-Za-z0-9_-]{5,20})/?', m.get('permalink') or '')
        if not mm: continue
        video = m.get('media_type') == 'VIDEO'
        src = m.get('thumbnail_url') if video else m.get('media_url')
        if not cdn_ok(src): continue
        out.append({'code': mm.group(1), 'video': video, 'src': src, 'order': m.get('timestamp') or ''})
    out.sort(key=lambda p: p['order'], reverse=True)
    if not out:
        raise Blocked('Instagram API returned no usable posts')
    return out, 'official API'


# ---------- images ----------
def download_thumb(code, src):
    from PIL import Image
    # Prefer the full-size image (public /media/?size=l redirect); the grid URL is only 640px *tall* for reels.
    cands = ['https://www.instagram.com/p/%s/media/?size=l' % code, src]
    last = None
    for u in cands:
        try:
            data, final, hdr = http(u, {'User-Agent': UA, 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'})
            if not cdn_ok(final): raise ValueError('unexpected host ' + final[:60])
            im = Image.open(io.BytesIO(data)); im.load()
            im = im.convert('RGB')
            if im.height * 4 > im.width * 5:   # taller than 4:5 (e.g. 9:16 reel covers): centre-crop to the tile shape
                h = round(im.width * 5 / 4); top = (im.height - h) // 2
                im = im.crop((0, top, im.width, top + h))
            if im.width > WIDTH:
                im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
            if im.width < 200: raise ValueError('image too small')
            buf = io.BytesIO()
            im.save(buf, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
            return buf.getvalue()
        except Exception as e:
            last = e
    raise RuntimeError('thumbnail for %s failed: %s' % (code, last))


def git(*a, check=True):
    return subprocess.run(['git', '-C', ROOT] + list(a), check=check, capture_output=True, text=True)


def main():
    commit = '--commit' in sys.argv
    if commit:
        git('pull', '--ff-only', '--quiet')
    try:
        old = json.load(open(DATA))
    except Exception:
        old = {}
    tok, path = read_token()
    try:
        posts, source = fetch_official(tok, path) if tok else fetch_public()
    except Blocked as e:
        print('BLOCKED: Instagram did not return posts (%s). Existing data/instagram.json and assets/ig kept.' % e)
        return 2

    os.makedirs(IMG_DIR, exist_ok=True)
    keep, new_files = [], []
    for p in posts:
        if len(keep) >= LIMIT: break
        fn = os.path.join(IMG_DIR, p['code'] + '.jpg')
        if not os.path.isfile(fn):
            try:
                data = download_thumb(p['code'], p['src'])
            except Exception as e:
                print('warning: %s' % e, file=sys.stderr); continue
            with open(fn, 'wb') as f: f.write(data)
            new_files.append(fn)
        keep.append(p)
    if not keep:
        print('BLOCKED: no thumbnails could be downloaded. Existing data kept.')
        return 2

    entries = []
    for p in keep:
        fn = os.path.join(IMG_DIR, p['code'] + '.jpg')
        v = hashlib.md5(open(fn, 'rb').read()).hexdigest()[:10]
        entries.append({'code': p['code'],
                        'url': 'https://www.instagram.com/%s/%s/' % ('reel' if p['video'] else 'p', p['code']),
                        'thumb': '/assets/ig/%s.jpg?v=%s' % (p['code'], v), 'video': p['video']})

    old_codes = [x.get('code') for x in old.get('posts') or []]
    new_codes = [x['code'] for x in entries]
    listed = set(new_codes)
    pruned = [f for f in os.listdir(IMG_DIR) if f.endswith('.jpg') and f[:-4] not in listed]
    for f in pruned:
        os.remove(os.path.join(IMG_DIR, f))

    if entries == old.get('posts') and not pruned and not new_files and not TOKEN_REFRESHED:
        print('no change (%d posts, via %s)' % (len(entries), source))
        return 0

    if entries == old.get('posts'):
        body = old   # only the token state changed; keep the file byte-identical
    else:
        body = {'count': len(entries), 'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'handle': HANDLE, 'source': 'snapshot', 'posts': entries}
    with open(DATA, 'w') as f: f.write(json.dumps(body, indent=2) + '\n')

    added = [c for c in new_codes if c not in old_codes]
    removed = [c for c in old_codes if c not in listed]
    parts = []
    if added: parts.append('added %d post%s' % (len(added), '' if len(added) == 1 else 's'))
    if removed: parts.append('removed %d post%s' % (len(removed), '' if len(removed) == 1 else 's'))
    if not parts: parts.append('token refreshed' if TOKEN_REFRESHED and entries == old.get('posts') else 'updated thumbnails/order')
    summary = ', '.join(parts) + ' (%d posts, via %s)' % (len(entries), source)

    if commit:
        git('add', '-A', 'data/instagram.json', 'assets/ig')
        if os.path.isfile(TOKEN_STATE): git('add', 'data/ig-token-state.json')
        if git('diff', '--cached', '--quiet', check=False).returncode == 0:
            print('no change (%d posts, via %s)' % (len(entries), source)); return 0
        git('commit', '-q', '-m', 'Instagram row: ' + summary)
        r = git('push', '-q', 'origin', 'HEAD:main', check=False)
        if r.returncode:
            print('ERROR: committed but push failed: %s' % r.stderr.strip()); return 3
        summary += '; committed and pushed'
    print(summary)
    return 0


if __name__ == '__main__':
    sys.exit(main())
