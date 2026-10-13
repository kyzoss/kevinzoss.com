// Serves files from ../private only to a valid session. vercel.json rewrites
// /play/<path> to /api/g?p=<path>. Unauthed requests go back to the gate.
const fs = require("node:fs");
const path = require("node:path");
const { isAuthed } = require("../lib/auth");

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

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!isAuthed(req)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  let file;
  try { file = resolveFile(req.query ? req.query.p : new URL(req.url, "http://x").searchParams.get("p")); }
  catch { file = null; }
  if (!file) { res.statusCode = 404; return res.end("Not found"); }
  let st = null;
  try { st = fs.statSync(file); } catch {}
  if (st && st.isDirectory()) {
    // /play/ballast -> /play/ballast/ so relative URLs inside the game resolve.
    res.statusCode = 302;
    res.setHeader("Location", req.url.split("?")[0].replace(/\/?$/, "/"));
    return res.end();
  }
  if (!st) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.statusCode = 200;
  fs.createReadStream(file).pipe(res);
};
