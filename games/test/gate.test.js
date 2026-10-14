const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../dev");

process.env.GAMES_PASSCODE = "open sesame";
const auth = require("../lib/auth");

let server, base;
test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

const post = (code) => fetch(base + "/api/unlock", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
});
const cookieOf = (r) => r.headers.get("set-cookie").split(";")[0];

test("passcode check", () => {
  assert.ok(auth.checkPasscode("open sesame"));
  assert.ok(auth.checkPasscode("  open sesame "));
  assert.ok(!auth.checkPasscode("open sesam"));
  assert.ok(!auth.checkPasscode(""));
  assert.ok(!auth.checkPasscode({ $ne: 1 }));
  assert.ok(!auth.checkPasscode("x".repeat(500)));
});

test("games are not served without the cookie", async () => {
  for (const p of ["/play/", "/play/ballast/", "/play/ballast/game.js"]) {
    const r = await fetch(base + p, { redirect: "manual" });
    assert.equal(r.status, 302, p);
    assert.equal(r.headers.get("location"), "/");
  }
});

test("wrong passcode is refused and sets no cookie", async () => {
  const r = await post("nope");
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("set-cookie"), null);
});

test("right passcode unlocks the games", async () => {
  const r = await post("open sesame");
  assert.equal(r.status, 200);
  const sc = r.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  const cookie = cookieOf(r);
  const hub = await fetch(base + "/play/", { headers: { cookie } });
  assert.equal(hub.status, 200);
  assert.match(await hub.text(), /Ballast/);
  const js = await fetch(base + "/play/ballast/game.js", { headers: { cookie } });
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.equal(js.headers.get("cache-control"), "private, no-store");
  const status = await (await fetch(base + "/api/unlock", { headers: { cookie } })).json();
  assert.equal(status.ok, true);
});

test("forged, tampered and expired cookies fail", () => {
  const good = auth.issueCookie().split(";")[0];
  const req = (c) => ({ headers: { cookie: c } });
  assert.ok(auth.isAuthed(req(good)));
  const [name, val] = good.split("=");
  const [exp, sig] = val.split(".");
  assert.ok(!auth.isAuthed(req(`${name}=${Number(exp) + 999}.${sig}`)));
  assert.ok(!auth.isAuthed(req(`${name}=${exp}.${"0".repeat(64)}`)));
  assert.ok(!auth.isAuthed(req(`${name}=garbage`)));
  assert.ok(!auth.isAuthed({ headers: {} }));
  assert.ok(!auth.isAuthed(req(good), Date.now() + 31 * 86400 * 1000));
});

test("changing the passcode signs everyone out", () => {
  const good = auth.issueCookie().split(";")[0];
  process.env.GAMES_PASSCODE = "different";
  assert.ok(!auth.isAuthed({ headers: { cookie: good } }));
  process.env.GAMES_PASSCODE = "open sesame";
});

test("path traversal and dotfiles are blocked", async () => {
  const cookie = cookieOf(await post("open sesame"));
  for (const p of ["/play/..%2Fapi%2Fg.js", "/play/..%2f..%2fpackage.json", "/play/ballast/..%2F..%2Flib%2Fauth.js", "/play/%2e%2e/api/g.js", "/play/.hidden"]) {
    const r = await fetch(base + p, { headers: { cookie }, redirect: "manual" });
    assert.ok([404, 302].includes(r.status) && r.status !== 200, `${p} -> ${r.status}`);
    const body = await r.text();
    assert.ok(!/timingSafeEqual/.test(body), p);
  }
});

test("unconfigured passcode fails closed", async () => {
  delete process.env.GAMES_PASSCODE;
  assert.equal((await post("anything")).status, 500);
  assert.ok(!auth.checkPasscode("anything"));
  assert.ok(!auth.isAuthed({ headers: { cookie: "kz_games=1.abc" } }));
  process.env.GAMES_PASSCODE = "open sesame";
});

test("hub and every game open with or without a trailing slash, no redirects", async () => {
  const cookie = cookieOf(await post("open sesame"));
  const slugs = require("node:fs").readdirSync(require("node:path").join(__dirname, "..", "private"), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(slugs.length >= 6, "found the games: " + slugs);
  for (const p of ["/play", "/play/", ...slugs.flatMap((s) => [`/play/${s}`, `/play/${s}/`])]) {
    const r = await fetch(base + p, { headers: { cookie }, redirect: "manual" });
    assert.equal(r.status, 200, `${p} -> ${r.status}`);
    assert.match(r.headers.get("content-type"), /text\/html/, p);
  }
});

test("every game page pins its own base path so relative files load either way", () => {
  const fs = require("node:fs"), path = require("node:path");
  const root = path.join(__dirname, "..", "private");
  for (const e of fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const html = fs.readFileSync(path.join(root, e.name, "index.html"), "utf8");
    assert.ok(html.includes(`<base href="/play/${e.name}/"`), `${e.name} is missing its <base href>`);
  }
});

test("vercel.json routes /play, /play/ and /play/<path> to the file function", () => {
  const rw = require("../vercel.json").rewrites;
  const dest = (src) => (rw.find((r) => r.source === src) || {}).destination;
  assert.equal(dest("/play"), "/api/g?p=index.html");
  assert.equal(dest("/play/"), "/api/g?p=index.html");
  assert.equal(dest("/play/:path+"), "/api/g?p=:path+");
});
