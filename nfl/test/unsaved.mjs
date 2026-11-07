// The week 9 outage, from a phone's side. Every save was refused (the board had
// outgrown a spreadsheet cell), so each phone's picks lived only on that phone;
// then reopening the app, or anyone else's save arriving, replaced the phone's
// copy with the board's -- which had no week 9. Picks gone, for everyone.
//
// This drives the real store.js against a fake Sheet that refuses saves the way
// the real one did, and checks a phone never lets go of picks the board has not
// accepted: not on a poll, not on a reload, not on a refused save.
import fs from "node:fs";
const disk = new Map();
globalThis.localStorage = {
  getItem: (k) => (disk.has(k) ? disk.get(k) : null),
  setItem: (k, v) => disk.set(k, String(v)),
  removeItem: (k) => disk.delete(k),
};
let listeners = [];
globalThis.document = { hidden: false, addEventListener: (ev, fn) => listeners.push([ev, fn]) };
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
const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));   // past the 350ms save debounce

// ---- the fake Sheet: merges like Code.gs, or refuses like it did in week 9 ------
let board = null;      // { state, updatedAt }
let broken = false;
let posts = 0;
globalThis.fetch = async (url, opts = {}) => {
  if (!opts.method || opts.method === "GET") {
    return { ok: true, json: async () => (board ? { state: board.state, updatedAt: board.updatedAt, version: "chunked-1" } : { state: null }) };
  }
  posts++;
  const body = JSON.parse(opts.body);
  if (broken) return { ok: true, json: async () => ({ error: "Your input contains more than the maximum of 50000 characters in a single cell." }) };
  if (board && board.updatedAt > body.updatedAt) {
    return { ok: true, json: async () => ({ state: board.state, updatedAt: board.updatedAt, stale: true }) };
  }
  // the server's rule, simplified: the saver's own picks replace, others' are added to
  const next = JSON.parse(JSON.stringify(board ? board.state : body.state));
  for (const [wk, w] of Object.entries(body.state.weeks || {})) {
    const into = (next.weeks[wk] ||= { games: [], picks: {}, lms: {} });
    if ((w.games || []).length >= (into.games || []).length) into.games = w.games;
    for (const [pid, by] of Object.entries(w.picks || {})) {
      into.picks[pid] = pid === body.actor ? by : { ...by, ...(into.picks[pid] || {}) };
    }
  }
  next.updatedAt = body.updatedAt;
  board = { state: next, updatedAt: body.updatedAt };
  return { ok: true, json: async () => ({ ok: true, updatedAt: body.updatedAt, state: next }) };
};

const games9 = [{ id: "MIA@BUF", away: "MIA", home: "BUF" }, { id: "KC@DEN", away: "KC", home: "DEN" }];
const base = (at, weeks) => ({ v: 1, season: 2026, players: cfg.players, weeks, sideBet: { predictions: {}, actual: null }, adjustments: [], updatedAt: at });
const week8 = { 8: { games: [{ id: "A@B", away: "A", home: "B" }], picks: { kz: { "A@B": "home" }, az: { "A@B": "away" } }, lms: {} } };

let n = 0;
async function openApp(who) {
  // A fresh copy of the module is a phone opening the app: memory gone, disk kept.
  listeners = [];
  const S = await import(`/home/user/kevinzoss.com/nfl/js/store.js?open=${++n}`);
  localStorage.setItem("pickem:me", who);
  S.setActor(who);
  await S.initSync();
  const poll = async () => { listeners.filter(([ev]) => ev === "visibilitychange").at(-1)[1](); await wait(30); };
  return { S, poll };
}
const mine9 = (S) => S.getState().weeks?.[9]?.picks?.kz || {};

console.log("— the board is refusing saves; Kevin makes his week 9 picks");
board = { state: base(1000, JSON.parse(JSON.stringify(week8))), updatedAt: 1000 };
broken = true;
let { S, poll } = await openApp("kz");
S.update((d) => { const w = S.ensureWeek(d, 9); w.games = games9; w.picks.kz = { "MIA@BUF": "home", "KC@DEN": "away" }; });
await wait();
eq("the save failed and the app knows", S.getSync().state, "error");
eq("the picks are marked as not on the board", S.hasPending(), true);
eq("the picks are still on this phone", mine9(S), { "MIA@BUF": "home", "KC@DEN": "away" });

console.log("— somebody else's save lands on the board meanwhile");
board = { state: base(2000, { ...JSON.parse(JSON.stringify(week8)), 9: { games: games9, picks: { az: { "MIA@BUF": "away" } }, lms: {} } }), updatedAt: 2000 };
await poll();
eq("a poll of a newer board keeps Kevin's unsaved picks", mine9(S), { "MIA@BUF": "home", "KC@DEN": "away" });
eq("and shows Andrew's", S.getState().weeks[9].picks.az, { "MIA@BUF": "away" });
await wait();

console.log("— Kevin closes the app and opens it again (the step that wiped everyone)");
({ S, poll } = await openApp("kz"));
eq("reopening keeps the unsaved picks", mine9(S), { "MIA@BUF": "home", "KC@DEN": "away" });
eq("still pending, because the board still refuses", S.hasPending(), true);
await wait();

console.log("— the board is fixed (redeployed); the next attempt goes through");
broken = false;
({ S, poll } = await openApp("kz"));
await wait();
eq("Kevin's week 9 picks reach the board", board.state.weeks[9].picks.kz, { "MIA@BUF": "home", "KC@DEN": "away" });
eq("Andrew's are still there", board.state.weeks[9].picks.az, { "MIA@BUF": "away" });
eq("nothing pending any more", S.hasPending(), false);
eq("the app says synced", S.getSync().state, "live");

console.log("— a refused-as-stale save keeps what it carried");
board = { state: { ...board.state, updatedAt: Date.now() + 60_000 }, updatedAt: Date.now() + 60_000 };   // a phone with a fast clock
S.update((d) => { d.weeks[9].picks.kz["KC@DEN"] = "home"; });
await wait(); await wait();
eq("the pick survives the refusal", mine9(S)["KC@DEN"], "home");
eq("and is re-sent stamped after the board, so it lands", board.state.weeks[9].picks.kz["KC@DEN"], "home");
eq("nothing pending after it lands", S.hasPending(), false);

console.log("— a phone left holding week 9 picks from before this fix (no pending flag)");
disk.clear();
board = { state: base(5000, JSON.parse(JSON.stringify(week8))), updatedAt: 5000 };
disk.set("pickem:2026", JSON.stringify(base(3000, { ...JSON.parse(JSON.stringify(week8)), 9: { games: games9, picks: { kz: { "MIA@BUF": "away" } }, lms: {} } })));
({ S, poll } = await openApp("kz"));
await wait();
eq("its picks are kept though the board is newer", mine9(S), { "MIA@BUF": "away" });
eq("and sent to the board", board.state.weeks[9]?.picks?.kz, { "MIA@BUF": "away" });

console.log("— but an untouched phone with nothing unsaved still defers to the board");
disk.clear();
board = { state: base(7000, { 8: { games: week8[8].games, picks: { kz: { "A@B": "away" } }, lms: {} } }), updatedAt: 7000 };
disk.set("pickem:2026", JSON.stringify(base(6000, JSON.parse(JSON.stringify(week8)))));
({ S, poll } = await openApp("kz"));
await wait();
eq("a change Kevin made on another device wins", S.getState().weeks[8].picks.kz, { "A@B": "away" });
eq("and this phone sent nothing over it", board.state.weeks[8].picks.kz, { "A@B": "away" });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
