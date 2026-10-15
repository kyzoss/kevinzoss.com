// Deploy self-check: does the file function see every game's pages? Public on purpose
// (no secrets: folder names and file counts only) so a deploy can be verified without a login.
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./g");

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const games = {};
  const missing = [];
  try {
    for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const files = fs.readdirSync(path.join(ROOT, e.name));
      const hasIndex = files.includes("index.html");
      games[e.name] = { index: hasIndex, files: files.length };
      if (!hasIndex) missing.push(e.name);
    }
    res.status(200).json({ ok: missing.length === 0 && Object.keys(games).length > 0, hub: fs.existsSync(path.join(ROOT, "index.html")), count: Object.keys(games).length, missing, games });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err), root: ROOT });
  }
};
