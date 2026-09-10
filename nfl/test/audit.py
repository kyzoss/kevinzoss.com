#!/usr/bin/env python3
"""Static audit: could any device end up running a mix of old and new files?

Every local reference the browser follows -- the entry points in index.html and
every relative import inside the modules -- has to carry the CURRENT build
stamp. One unstamped or stale reference is all it takes for a phone to keep a
cached copy of that file forever, which is the failure we kept hitting.
"""
import json, pathlib, re, sys

here = pathlib.Path("nfl")
version = json.loads((here / "version.json").read_text())["v"]
fails, checks = [], 0

def check(name, ok, detail=""):
    global checks
    checks += 1
    if not ok:
        fails.append(f"{name}{': ' + detail if detail else ''}")

# 1. every reference the browser follows is stamped, and stamped CURRENT
REF = re.compile(r'["\'](\./(?:config\.js|css/app\.css|js/[a-z]+\.js))(\?v=([0-9a-f]{8}))?["\']')
IMPORT = re.compile(r'from\s*["\'](\./[a-z]+\.js)(\?v=([0-9a-f]{8}))?["\']')
for f in ["index.html"] + [p.name for p in sorted((here / "js").glob("*.js"))]:
    path = here / f if f == "index.html" else here / "js" / f
    text = path.read_text()
    for pat, kind in ((REF, "reference"), (IMPORT, "import")):
        for m in pat.finditer(text):
            target, stamp = m.group(1), m.group(3)
            check(f"{f} -> {target}", stamp == version,
                  "UNSTAMPED" if not stamp else f"stale ?v={stamp}, current is {version}")

# 2. no module reaches a sibling without a stamp at all
for p in sorted((here / "js").glob("*.js")):
    bare = re.findall(r'from\s*["\']\./[a-z]+\.js["\']', p.read_text())
    check(f"{p.name}: no bare sibling imports", not bare, f"{len(bare)} found")

# 3. re-running the stamper must be a no-op (i.e. the tree is fully stamped)
import subprocess
out = subprocess.run([sys.executable, "nfl/stamp.py"], capture_output=True, text=True).stdout
check("stamp.py is idempotent", "nothing to do" in out, out.strip().replace("\n", " "))
check("version.json still matches", json.loads((here / "version.json").read_text())["v"] == version)

# 4. the hash must cover everything the browser can cache
covered = {"index.html", "manifest.webmanifest", "config.js", "css/app.css"} | {
    f"js/{p.name}" for p in (here / "js").glob("*.js")}
src = (here / "stamp.py").read_text()
hashed = set(re.findall(r'HASHED = \[(.*?)\]', src, re.S)[0].replace('"', "").split(", "))
check("hash covers index.html", "index.html" in src.split("HASHED")[1][:120])
check("hash covers the manifest", "manifest.webmanifest" in src.split("HASHED")[1][:120])

# 5. cache headers exist wherever Vercel might read them
for vj in ("vercel.json", "nfl/vercel.json"):
    d = json.loads(pathlib.Path(vj).read_text())
    sources = " ".join(h.get("source", "") for h in d["headers"])
    check(f"{vj}: html/js/css revalidate", "html|js|css" in sources)
    check(f"{vj}: version.json is no-store",
          any("version.json" in h.get("source", "") for h in d["headers"]))

# 6. nothing RESOLVES to the host that was down. The guard's own CANON constant
#    and the comment explaining it are the point, not a target, so only real
#    URLs count -- href/content/start_url/scope.
for f in ["index.html", "manifest.webmanifest"]:
    t = (here / f).read_text()
    targets = re.findall(r'https?://nfl\.kevinzoss\.com[^"\'\s]*', t)
    check(f"{f}: nothing resolves to nfl.kevinzoss.com", not targets, ", ".join(targets[:3]))
    if f == "index.html":
        check("index.html: the origin guard is present", 'var CANON = "nfl.kevinzoss.com"' in t)
        check("index.html: the guard verifies before moving", "version.json" in t and "location.replace" in t)
        check("index.html: boot errors are surfaced", "could not start" in t)

print(f"  build {version}")
print(f"  {checks} checks, {len(fails)} failed")
for f in fails:
    print("  FAIL", f)
sys.exit(1 if fails else 0)
