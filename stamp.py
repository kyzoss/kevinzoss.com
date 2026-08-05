#!/usr/bin/env python3
"""Stamp a content hash onto local css/js references so a browser can never serve
a stale copy against fresh HTML. Run before committing any change to those files.

    python3 stamp.py
"""
import hashlib, pathlib, re

ASSETS = ['scrub-engine.js', 'kz.js', 'kz.css']
here = pathlib.Path(__file__).parent
digest = {a: hashlib.md5((here / a).read_bytes()).hexdigest()[:8]
          for a in ASSETS if (here / a).exists()}

changed = []
for page in sorted(here.glob('*.html')):
    s = o = page.read_text(encoding='utf-8')
    for asset, h in digest.items():
        s = re.sub(r'(["\'])%s(\?v=[0-9a-f]+)?\1' % re.escape(asset),
                   r'\g<1>%s?v=%s\g<1>' % (asset, h), s)
    if s != o:
        page.write_text(s, encoding='utf-8'); changed.append(page.name)

for a, h in digest.items():
    print(f'  {a:18s} v={h}')
print('  stamped:', ', '.join(changed) if changed else 'nothing to do')
