#!/usr/bin/env python3
"""Build step for the static site (run from repo root before committing):

    python3 tools/build.py

- site.css + fonts/fonts.css  -> minified and inlined into each page's <style id="css"></style>
- site.js                     -> site.min.js (terser)
- every local asset reference (img/, fonts/, site.min.js, manifest icons) gets ?v=<content hash>,
  so a changed file always gets a new URL and can be cached as immutable (see _headers).
Edit site.css / site.js / *.html normally, then rerun this. Needs node (npx terser).
"""
import hashlib, os, re, subprocess, sys
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
