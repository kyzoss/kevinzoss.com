// Serves files from ../private only to a valid session. vercel.json rewrites
// /play/<path> to /api/g?p=<path>. Unauthed requests go back to the gate.
const fs = require("node:fs");
const path = require("node:path");
const { isAuthed } = require("../lib/auth");
const { isAdmin } = require("../lib/admin");
const { track } = require("../lib/track");

const ROOT = path.join(__dirname, "..", "private");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wasm": "application/wasm",
};

function resolveFile(p) {
  let rel = decodeURIComponent(String(p || "")).replace(/\\/g, "/");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const full = path.resolve(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null; // traversal
  if (rel.split("/").some((seg) => seg.startsWith("."))) return null; // dotfiles
  return full;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!isAuthed(req)) {
    console.log("g.js signed-out request", JSON.stringify({ p: req.query && req.query.p }));
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  let file;
  try { file = resolveFile(req.query ? req.query.p : new URL(req.url, "http://x").searchParams.get("p")); }
  catch { file = null; }
  if (!file) { console.error("g.js 404 unresolved", JSON.stringify({ p: req.query && req.query.p, url: req.url })); res.statusCode = 404; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Not found"); }
  let st = null;
  try { st = fs.statSync(file); } catch {}
  // A folder serves its index.html. No redirects: the games set <base href>, so
  // their relative URLs resolve the same with or without a trailing slash.
  if (st && st.isDirectory()) {
    file = path.join(file, "index.html");
    try { st = fs.statSync(file); } catch { st = null; }
  }
  if (!st) { console.error("g.js 404 missing file", JSON.stringify({ p: req.query && req.query.p, file, url: req.url })); res.statusCode = 404; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Not found"); }
  // Count a game or hub open once per page load (the index page, not every asset).
  if (path.basename(file) === "index.html" && !isAdmin(req)) {
    const rel = path.relative(ROOT, file).split(path.sep);
    await track("open", req, { game: rel.length > 1 ? rel[0] : "hub" });
  }
  res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.statusCode = 200;
  fs.createReadStream(file).pipe(res);
};
module.exports.ROOT = ROOT;
