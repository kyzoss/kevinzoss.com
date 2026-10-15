// Applies vercel.json "rewrites" the way the platform does for the simple forms we use
// (literal segments and named :params). The dev server and the tests use this, so the
// local routing cannot drift from what ships. Returns {pathname, query} or null.
function compile(source) {
  const names = [];
  const re = new RegExp("^" + source.split("/").map((seg) => {
    if (seg.startsWith(":")) { names.push(seg.slice(1)); return "([^/]+)"; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/") + "$");
  return { re, names };
}

function applyRewrites(rewrites, pathname) {
  for (const r of rewrites) {
    const { re, names } = compile(r.source);
    const m = re.exec(pathname);
    if (!m) continue;
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const dest = r.destination.replace(/:([A-Za-z_]+)/g, (_, n) => (n in params ? params[n] : ":" + n));
    const u = new URL(dest, "http://x");
    return { pathname: u.pathname, query: Object.fromEntries(u.searchParams) };
  }
  return null;
}

module.exports = { applyRewrites };
