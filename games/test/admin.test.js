const test = require("node:test");
const assert = require("node:assert");

process.env.GAMES_PASSCODE = "open sesame";
process.env.ADMIN_PASSCODE = "boss key";
process.env.SUPABASE_URL = "https://fake.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-key";
process.env.KZ_DB_TOKEN = "server-token";

// Stub only the Supabase host; everything else (the local dev server) is real.
const realFetch = global.fetch;
let calls = [], failRpc = false;
const SUMMARY = { generated_at: "2026-10-15T20:00:00Z", days: 14, totals: { unlocks: 2, fails: 1, plays: 5, visitors: 2, admin_fails: 0 }, daily: [], games: [], devices: [], recent: [] };
global.fetch = async (url, opts) => {
  if (String(url).startsWith("https://fake.supabase.test")) {
    if (failRpc) throw new Error("network down");
    const name = String(url).split("/rpc/")[1];
    const args = JSON.parse(opts.body);
    calls.push({ name, args, headers: opts.headers });
    return new Response(name === "kz_usage_summary" ? JSON.stringify(SUMMARY) : "", { status: name === "kz_usage_summary" ? 200 : 204 });
  }
  return realFetch(url, opts);
};

const { createServer } = require("../dev");
const track = require("../lib/track");
const adminLib = require("../lib/admin");

let server, base;
test.before(async () => { server = createServer(); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { calls = []; failRpc = false; });

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";
const json = (code) => ({ method: "POST", headers: { "Content-Type": "application/json", "user-agent": PHONE, "x-vercel-ip-country": "US" }, body: JSON.stringify({ code }) });
const cookiesOf = (r) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const events = () => calls.filter((c) => c.name === "kz_log").map((c) => c.args);

async function unlock() { const r = await realFetch(base + "/api/unlock", json("open sesame")); return cookiesOf(r); }
async function adminIn() { const r = await realFetch(base + "/api/admin", json("boss key")); return cookiesOf(r); }

test("device classes", () => {
  assert.equal(track.deviceOf(PHONE), "phone");
  assert.equal(track.deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(track.deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari"), "phone");
  assert.equal(track.deviceOf("Mozilla/5.0 (Linux; Android 14; SM-X900) Safari"), "tablet");
  assert.equal(track.deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome"), "desktop");
});

test("unlock success is tracked with a visitor id and sets the visitor cookie", async () => {
  const r = await realFetch(base + "/api/unlock", json("open sesame"));
  assert.equal(r.status, 200);
  const cookies = r.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  const v = cookies.find((c) => c.startsWith("kz_v="));
  assert.match(v, /kz_v=[0-9a-f]{16};/);
  assert.match(v, /HttpOnly/);
  const [e] = events();
  assert.equal(e.p_event, "unlock_ok");
  assert.equal(e.p_device, "phone");
  assert.equal(e.p_country, "US");
  assert.equal(e.p_visitor, v.match(/kz_v=([0-9a-f]{16})/)[1]);
  assert.equal(calls[0].headers.apikey, "anon-key");
  assert.equal(calls[0].args.p_token, "server-token");
});

test("a returning visitor keeps the same id", async () => {
  const first = await realFetch(base + "/api/unlock", json("open sesame"));
  const vcookie = first.headers.getSetCookie().find((c) => c.startsWith("kz_v=")).split(";")[0];
  calls = [];
  const second = await realFetch(base + "/api/unlock", { ...json("open sesame"), headers: { ...json("x").headers, cookie: vcookie } });
  assert.equal(second.headers.getSetCookie().filter((c) => c.startsWith("kz_v=")).length, 0);
  assert.equal(events()[0].p_visitor, vcookie.split("=")[1]);
});

test("a wrong passcode is tracked as a failure and never stores the guess", async () => {
  const r = await realFetch(base + "/api/unlock", json("guess123"));
  assert.equal(r.status, 401);
  const [e] = events();
  assert.equal(e.p_event, "unlock_fail");
  assert.ok(!JSON.stringify(calls).includes("guess123"));
});

test("opening a game page is tracked once; its assets are not", async () => {
  const cookie = await unlock(); calls = [];
  await realFetch(base + "/play/ballast/", { headers: { cookie } });
  await realFetch(base + "/play/ballast/game.js", { headers: { cookie } });
  assert.deepEqual(events().map((e) => [e.p_event, e.p_game]), [["open", "ballast"]]);
  calls = [];
  await realFetch(base + "/play/", { headers: { cookie } });
  assert.deepEqual(events().map((e) => [e.p_event, e.p_game]), [["open", "hub"]]);
});

test("opens without a login are not tracked", async () => {
  await realFetch(base + "/play/ballast/", { redirect: "manual" });
  assert.equal(events().length, 0);
});

test("the admin's own opens are not counted", async () => {
  const cookie = (await unlock()) + "; " + (await adminIn()); calls = [];
  await realFetch(base + "/play/ballast/", { headers: { cookie } });
  assert.equal(events().length, 0);
});

test("tracking failures never break a page", async () => {
  const cookie = await unlock(); failRpc = true;
  const r = await realFetch(base + "/play/ballast/", { headers: { cookie } });
  assert.equal(r.status, 200);
  const u = await realFetch(base + "/api/unlock", json("open sesame"));
  assert.equal(u.status, 200);
});

test("tracking does nothing when Supabase is not configured", async () => {
  const keep = process.env.SUPABASE_URL; delete process.env.SUPABASE_URL;
  const cookie = await unlock();
  const r = await realFetch(base + "/play/ballast/", { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
  process.env.SUPABASE_URL = keep;
});

test("tracking does nothing without the server token", async () => {
  const keep = process.env.KZ_DB_TOKEN; delete process.env.KZ_DB_TOKEN;
  const cookie = await unlock();
  await realFetch(base + "/play/ballast/", { headers: { cookie } });
  assert.equal(calls.length, 0);
  process.env.KZ_DB_TOKEN = keep;
});

test("admin data needs the admin cookie; the games cookie is not enough", async () => {
  assert.equal((await realFetch(base + "/api/admin?data=1")).status, 401);
  const games = await unlock();
  assert.equal((await realFetch(base + "/api/admin?data=1", { headers: { cookie: games } })).status, 401);
  assert.equal(calls.filter((c) => c.name === "kz_usage_summary").length, 0);
});

test("admin sign-in: wrong code fails and is tracked, right code works", async () => {
  const bad = await realFetch(base + "/api/admin", json("nope"));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("set-cookie"), null);
  assert.equal(events()[0].p_event, "admin_fail");
  calls = [];
  const ok = await realFetch(base + "/api/admin", json("boss key"));
  assert.equal(ok.status, 200);
  const sc = ok.headers.get("set-cookie");
  assert.match(sc, /kz_admin=/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  assert.equal(events()[0].p_event, "admin_ok");
});

test("admin gets the summary, days are clamped", async () => {
  const cookie = await adminIn(); calls = [];
  const r = await realFetch(base + "/api/admin?data=1&days=30", { headers: { cookie } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true); assert.equal(d.totals.plays, 5);
  assert.equal(calls[0].args.p_days, 30);
  calls = [];
  await realFetch(base + "/api/admin?data=1&days=99999", { headers: { cookie } });
  await realFetch(base + "/api/admin?data=1&days=abc", { headers: { cookie } });
  assert.deepEqual(calls.map((c) => c.args.p_days), [180, 14]);
});

test("a database failure gives 502, not a crash", async () => {
  const cookie = await adminIn(); failRpc = true;
  const r = await realFetch(base + "/api/admin?data=1", { headers: { cookie } });
  assert.equal(r.status, 502);
});

test("admin cookie: forged, expired and changed-passcode cookies fail", () => {
  const good = adminLib.issueAdminCookie().split(";")[0];
  const req = (c) => ({ headers: { cookie: c } });
  assert.ok(adminLib.isAdmin(req(good)));
  const [name, val] = good.split("="); const [exp, sig] = val.split(".");
  assert.ok(!adminLib.isAdmin(req(`${name}=${Number(exp) + 9}.${sig}`)));
  assert.ok(!adminLib.isAdmin(req(`${name}=${exp}.${"0".repeat(64)}`)));
  assert.ok(!adminLib.isAdmin(req(good), Date.now() + 13 * 3600 * 1000));
  process.env.ADMIN_PASSCODE = "changed";
  assert.ok(!adminLib.isAdmin(req(good)));
  process.env.ADMIN_PASSCODE = "boss key";
});

test("admin sign-out clears the cookie", async () => {
  const r = await realFetch(base + "/api/admin", { method: "DELETE" });
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
});

test("admin fails closed when ADMIN_PASSCODE is not set", async () => {
  const keep = process.env.ADMIN_PASSCODE; delete process.env.ADMIN_PASSCODE;
  assert.equal((await realFetch(base + "/api/admin")).status, 500);
  assert.equal((await realFetch(base + "/api/admin", json("boss key"))).status, 500);
  assert.ok(!adminLib.checkAdminPasscode("boss key"));
  process.env.ADMIN_PASSCODE = keep;
});

test("the admin page is served, is noindex, and holds no data", async () => {
  const r = await realFetch(base + "/admin");
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /name="robots" content="noindex/);
  assert.ok(!html.includes("boss key") && !html.includes("open sesame"));
  assert.ok(!html.includes(String.fromCharCode(8212)), "no em dash");
});
