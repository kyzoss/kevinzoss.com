// Exercise the Sheet backend against a stubbed Apps Script endpoint: first run,
// adopting a newer remote, pushing a newer local, conflict hand-back, and the
// polling pull. script.google.com is unreachable from here, so the transport is
// faked but the request shape is asserted.
import fs from "node:fs";
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const listeners = [];
globalThis.document = {
  hidden: false,
  addEventListener: (ev, fn) => listeners.push([ev, fn]),
  createElement: () => ({ set onload(f) { f(); }, set onerror(_) {} }),
  head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.window = {};
new Function("window", fs.readFileSync("/home/user/kevinzoss.com/nfl/config.js", "utf8"))(globalThis.window);
const cfg = globalThis.window.POOL_CONFIG;
cfg.sheet.url = "https://script.google.com/macros/s/FAKE/exec";

let pass = 0, fail = 0;
const eq = (n, got, want) => { JSON.stringify(got) === JSON.stringify(want) ? pass++
  : (fail++, console.log(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)); };

// the fake Sheet
let remote = null;            // { state, updatedAt }
const seen = { gets: 0, posts: [], urls: [] };
globalThis.fetch = async (url, opts = {}) => {
  seen.urls.push(url);
  if (!opts.method || opts.method === "GET") {
    seen.gets++;
    return { ok: true, json: async () => (remote ? { state: remote.state, updatedAt: remote.updatedAt } : { state: null }) };
  }
  const body = JSON.parse(opts.body);
  seen.posts.push({ headers: opts.headers, body });
  if (remote && remote.updatedAt > body.updatedAt) {
    return { ok: true, json: async () => ({ state: remote.state, updatedAt: remote.updatedAt, stale: true }) };
  }
  remote = { state: body.state, updatedAt: body.updatedAt };
  return { ok: true, json: async () => ({ ok: true }) };
};

const base = { v: 1, season: 2026, players: cfg.players, weeks: {}, sideBet: { predictions: {}, actual: null }, adjustments: [] };
store.set("pickem:2026", JSON.stringify({ ...base, updatedAt: 1000, weeks: { 1: { games: [], picks: { kz: {} }, lms: {} } } }));

const S = await import("/home/user/kevinzoss.com/nfl/js/store.js");

console.log("— first connect, empty Sheet");
let st = await S.initSync();
eq("reports the sheet backend", [st.enabled, st.state, st.via], [true, "live", "sheet"]);
eq("seeded the Sheet from this device", remote.updatedAt, 1000);
eq("POST is a simple request (no preflight)", seen.posts[0].headers["Content-Type"], "text/plain;charset=utf-8");
eq("POST carries the season", seen.posts[0].body.season, "2026");
eq("GET is cache-busted", /[?&]t=\d+/.test(seen.urls[0]), true);

console.log("— a teammate's newer save wins");
remote = { state: { ...base, updatedAt: 5000, weeks: { 1: { games: [{ id: "CLE@CIN", away: "CLE", home: "CIN", spread: -6.5 }], picks: { az: { "CLE@CIN": "away" } }, lms: {} } } }, updatedAt: 5000 };
const pull = listeners.filter(([ev]) => ev === "visibilitychange").at(-1)[1];
await pull(); await new Promise((r) => setTimeout(r, 20));
eq("adopted the newer board", S.getState().updatedAt, 5000);
eq("their pick is here", S.getState().weeks[1].picks.az, { "CLE@CIN": "away" });
eq("mirrored to this device", JSON.parse(store.get("pickem:2026")).updatedAt, 5000);

console.log("— my pick pushes up");
S.update((d) => { d.weeks[1].picks.kz = { "CLE@CIN": "home" }; });
S.flush();
await new Promise((r) => setTimeout(r, 20));
eq("Sheet took my pick", remote.state.weeks[1].picks.kz, { "CLE@CIN": "home" });
eq("their pick preserved",  remote.state.weeks[1].picks.az, { "CLE@CIN": "away" });

console.log("— a conflicting save: the newer copy wins and is adopted");
const future = Date.now() + 60_000;   // a teammate whose clock runs ahead
const winner = { ...base, updatedAt: future, weeks: { 1: { games: [], picks: { hz: { "CLE@CIN": "home" } }, lms: {} } } };
remote = { state: winner, updatedAt: future };
S.update((d) => { d.weeks[1].picks.jv = { "CLE@CIN": "home" }; });
S.flush();
await new Promise((r) => setTimeout(r, 20));
eq("newer remote was not clobbered", remote.updatedAt, future);
eq("remote content intact", remote.state.weeks[1].picks.hz, { "CLE@CIN": "home" });
eq("this device adopted the winner", S.getState().updatedAt, future);
eq("and shows their picks", S.getState().weeks[1].picks.hz, { "CLE@CIN": "home" });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
