#!/usr/bin/env python3
"""Build step for the static site (run from repo root before committing):

    python3 tools/build.py

- site.css + fonts/fonts.css  -> minified and inlined into each page's <style id="css"></style>
- site.js                     -> site.min.js (terser)
- every local asset reference (img/, fonts/, site.min.js, manifest icons) gets ?v=<content hash>,
  so a changed file always gets a new URL and can be cached as immutable (see _headers).
- shows.html cards                -> refreshed from the public ShootProof API (all galleries, newest first),
  as the no-JS / instant fallback. The live list comes from functions/api/shows.js at runtime; if the API
  is unreachable at build time the existing cards are kept. Skip with --no-shows.
Edit site.css / site.js / *.html normally, then rerun this. Needs node (npx terser).
"""
import hashlib, html, json, os, re, subprocess, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
PAGES = ['index.html', 'shows.html', '404.html']
_h = {}
def ver(path):
    p = path.split('?')[0].lstrip('/')
    if p not in _h:
        if not os.path.isfile(p): sys.exit('missing asset: ' + p)
        _h[p] = hashlib.md5(open(p, 'rb').read()).hexdigest()[:10]
    return _h[p]
ASSET = re.compile(r'''((?<![\w.:/-])/?(?:img|fonts)/[\w./-]+\.(?:webp|jpe?g|png|woff2|ico)|/site\.min\.js)(\?v=[\w]+)?''')
def stamp(text):
    return ASSET.sub(lambda m: m.group(1) + '?v=' + ver(m.group(1)), text)
def minify_css(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};,>])\s*', r'\1', css)   # no CSS here needs spaces around these
    css = re.sub(r'\s*:\s*(?=[^{}]*;|[^{}]*})', ':', css)  # only inside declarations
    return css.replace(';}', '}').strip()
def minify_js(src, out):
    r = subprocess.run(['npx', '--yes', 'terser@5', src, '-c', '-m', '-o', out], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
SP = 'https://api.shootproof.com/client/brand/344693/event?page=%d&rows=100'
def shows_api():
    out, page, pages = [], 1, 1
    while page <= pages and page <= 20:
        req = urllib.request.Request(SP % page, headers={'Accept': 'application/vnd.shootproof+json', 'User-Agent': 'ecoffeen build'})
        j = json.load(urllib.request.urlopen(req, timeout=20))
        pages = int(j['meta']['totalPages'])
        for it in j['items']:
            url = it['links']['client']['href']; cp = it.get('coverPhoto') or {}; du = cp.get('displayUrl') or {}
            cover = du.get('large') or du.get('medium') or ''
            if not url.startswith('https://ecoffeenphoto.shootproof.com/') or not cover.startswith('https://d2rxqglyhdohqf.cloudfront.net/'): continue
            name = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', it.get('name') or '')).strip()[:140]
            if name: out.append((name, url, cover, int(cp.get('width') or 566), int(cp.get('height') or 388)))
        page += 1
    return out
def refresh_shows():
    try: shows = shows_api()
    except Exception as e: print('shows: API unavailable, keeping existing cards (%s)' % e); return
    if not shows: return
    e = lambda t: html.escape(t, quote=True)
    cards = []
    for i, (n, u, c, w, h) in enumerate(shows):
        att = ' fetchpriority="high"' if i == 0 else (' loading="lazy"' if i > 3 else '')
        cards.append('<a class="card" href="%s" target="_blank" rel="noopener"><picture><img src="%s" alt="Cover photo: %s" width="%d" height="%d"%s decoding="async"></picture><div><h3>%s</h3><span>View &amp; order photos &#8599;</span></div></a>' % (e(u), e(c), e(n), w, h, att, e(n)))
    h = open('shows.html').read()
    h2 = re.sub(r'(<div class="cards"><p class="none" hidden>.*?</p>).*?(</div>\n<p style="margin-top:2rem")', lambda m: m.group(1) + '\n'.join(cards) + m.group(2), h, count=1, flags=re.S)
    if h2 == h and len(shows): print('shows: unchanged')
    open('shows.html', 'w').write(h2); print('shows:', len(shows), 'cards')
if '--no-shows' not in sys.argv: refresh_shows()
minify_js('site.js', 'site.min.js')
js = open('site.min.js').read(); open('site.min.js', 'w').write(stamp(js))
css = stamp(minify_css(open('fonts/fonts.css').read() + '\n' + open('site.css').read()))
for f in PAGES:
    h = open(f).read()
    h = re.sub(r'<style id="css">.*?</style>', lambda m: '<style id="css">' + css + '</style>', h, flags=re.S)
    h = stamp(h)
    open(f, 'w').write(h)
m = open('site.webmanifest').read(); open('site.webmanifest', 'w').write(stamp(m))
print('built', len(css), 'bytes css;', os.path.getsize('site.min.js'), 'bytes js')
