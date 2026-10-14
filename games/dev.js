// Local stand-in for Vercel: serves public/, /api/*, and the /play rewrites.
//   GAMES_PASSCODE=letmein node dev.js [port]
// The Secure cookie flag is dropped locally because http://localhost is not https.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function createServer() {
  const unlock = require("./api/unlock");
  const g = require("./api/g");
  const wrap = (res) => {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    const set = res.setHeader.bind(res);
    res.setHeader = (k, v) => set(k, k.toLowerCase() === "set-cookie" ? String(v).replace("; Secure", "") : v);
    return res;
  };
  return http.createServer((req, res) => {
    wrap(res);
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/unlock" || url.pathname === "/api/g") return collect(req, (body) => {
      req.body = body; req.query = Object.fromEntries(url.searchParams);
      (url.pathname === "/api/g" ? g : unlock)(req, res);
    });
    if (url.pathname === "/play" || url.pathname.startsWith("/play/")) {
      req.query = { p: decodeURIComponent(url.pathname.slice("/play/".length) || "") };
      req.url = url.pathname;
      return g(req, res);
    }
    const file = path.join(__dirname, "public", url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(path.join(__dirname, "public")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404; return res.end("Not found");
    }
    const types = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain" };
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
}
function collect(req, cb) {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => { try { cb(raw ? JSON.parse(raw) : {}); } catch { cb({}); } });
}
module.exports = { createServer };
if (require.main === module) {
  const port = Number(process.argv[2]) || 3000;
  createServer().listen(port, () => console.log(`games dev on http://localhost:${port}`));
}
