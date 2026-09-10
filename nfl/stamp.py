#!/usr/bin/env python3
"""Stamp one build version onto every local asset reference so a phone can never
run a stale mix of files. Run before committing any change under nfl/.

    python3 nfl/stamp.py

index.html can only bust the entry points; the ES module imports inside js/*.js
have to be stamped too, or a fresh app.js will still pull a cached scoring.js.
One version for all of them keeps it simple and impossible to get half-applied.
The version is computed from the files with any existing stamp stripped, so
running this twice is a no-op rather than a moving target.
"""
import hashlib, pathlib, re

here = pathlib.Path(__file__).parent
ASSETS = ["config.js", "css/app.css"] + sorted(p.relative_to(here).as_posix() for p in (here / "js").glob("*.js"))
# index.html and the manifest carry no stamp of their own, but a change to
# either -- the origin guard, the share tags, where an installed icon points --
# is a change to the app, and the version has to move or the running app will
# never notice. version.json itself is excluded: it is written from this hash.
HASHED = ["index.html", "manifest.webmanifest"] + ASSETS
STAMP = re.compile(r"\?v=[0-9a-f]{8}")

def bare(text):
    """The file as it would be without any stamp, so the hash is stable."""
    return STAMP.sub("", text)

digest = hashlib.md5()
for a in HASHED:
    digest.update(a.encode())
    digest.update(bare((here / a).read_text(encoding="utf-8")).encode())
version = digest.hexdigest()[:8]

def stamp(text):
    text = bare(text)
    # entry points in the HTML, and relative module imports in the JS
    text = re.sub(r'(["\'])(\./(?:config\.js|css/app\.css|js/[a-z]+\.js))\1',
                  lambda m: f'{m.group(1)}{m.group(2)}?v={version}{m.group(1)}', text)
    text = re.sub(r'(from\s*["\'])(\./[a-z]+\.js)(["\'])',
                  lambda m: f'{m.group(1)}{m.group(2)}?v={version}{m.group(3)}', text)
    return text

changed = []
for f in ["index.html"] + ASSETS:
    path = here / f
    if path.suffix == ".css":
        continue                      # nothing inside the CSS references our own files
    before = path.read_text(encoding="utf-8")
    after = stamp(before)
    if after != before:
        path.write_text(after, encoding="utf-8")
        changed.append(f)

# A tiny file the running app can poll. A Home Screen app resumes instead of
# reloading, so it needs something cheap to ask "am I still the current build?"
(here / "version.json").write_text('{"v":"%s"}\n' % version, encoding="utf-8")

print(f"  version v={version}")
print("  stamped:", ", ".join(changed) if changed else "nothing to do")
