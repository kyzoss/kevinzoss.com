// State container. Local-first (localStorage), with an optional Supabase mirror so
// all four players see the same board. Whole-document, last-write-wins: with four
// people it is plenty, and it keeps the schema to one row.

const cfg = window.POOL_CONFIG;
const KEY = `pickem:${cfg.season}`;
const ME_KEY = `pickem:me`;

const listeners = new Set();
let state = load();
let syncStatus = { enabled: false, state: "local", detail: "" };
let saveTimer = null;
let applyingRemote = false;

export function defaultState() {
  return {
    v: 1,
    season: cfg.season,
    players: cfg.players.map((p) => ({ ...p })),
    weeks: {},
    sideBet: { predictions: {}, actual: null },
    adjustments: [],
    pins: {},
    updatedAt: 0,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn("local state unreadable, starting fresh", e); }
  return defaultState();
}

function migrate(s) {
  const d = defaultState();
  const out = { ...d, ...s };
  out.weeks = restableGameIds(s.weeks || {});
  // Player list follows config (names/colours), but never drops a player who has data.
  const byId = Object.fromEntries((s.players || []).map((p) => [p.id, p]));
  out.players = cfg.players.map((p) => ({ ...byId[p.id], ...p }));
  for (const p of s.players || []) if (!out.players.find((x) => x.id === p.id)) out.players.push(p);
  out.sideBet = { predictions: {}, actual: null, ...(s.sideBet || {}) };
  return out;
}

/**
 * Rewrite any legacy random game id to its matchup id, moving that game's picks
 * and keeping whichever pick was already on the matchup id. Idempotent.
 */
function restableGameIds(weeks) {
  const out = {};
  for (const [wk, week] of Object.entries(weeks)) {
    if (!week || !Array.isArray(week.games)) { out[wk] = week; continue; }
    const renames = new Map();
    const games = week.games.map((g) => {
      const want = gameId(g);
      if (g.id && g.id !== want) renames.set(g.id, want);
      return g.id === want ? g : { ...g, id: want };
    });
    if (!renames.size) { out[wk] = { ...week, games }; continue; }
    const picks = {};
    for (const [pid, byGame] of Object.entries(week.picks || {})) {
      const moved = {};
      for (const [gid, side] of Object.entries(byGame || {})) {
        moved[renames.get(gid) || gid] ??= side;
      }
      picks[pid] = moved;
    }
    out[wk] = { ...week, games, picks };
  }
  return out;
}

export function getState() { return state; }
export function getSync() { return syncStatus; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

/** Mutate through here. `fn` receives a draft (the live object; we clone first). */
export function update(fn, { silent = false } = {}) {
  const next = structuredClone(state);
  const r = fn(next);
  if (r === false) return;
  next.updatedAt = Date.now();
  state = next;
  persist();
  if (!silent) emit();
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn("localStorage write failed", e); }
  if (backend && !applyingRemote) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushRemote, 350);
  }
}

export function replaceState(next) {
  state = migrate(next);
  state.updatedAt = Date.now();
  persist();
  emit();
}

/**
 * Fold a document into the current one instead of replacing it: per-player
 * entries are unioned, so restoring a backup can only ever add back what is
 * missing. Mirrors the merge the Apps Script does server-side.
 */
export function mergeIn(incoming) {
  const before = countPicks(state);
  update((d) => {
    const src = migrate(incoming);
    for (const [wk, w] of Object.entries(src.weeks || {})) {
      const mine = ensureWeek(d, wk);
      // keep whichever slate is fuller; a backup may predate a re-pull
      if ((w.games || []).length > (mine.games || []).length) mine.games = w.games;
      for (const [pid, by] of Object.entries(w.picks || {})) {
        mine.picks[pid] = { ...(by || {}), ...(mine.picks[pid] || {}) };
      }
      for (const [pid, team] of Object.entries(w.lms || {})) mine.lms[pid] ??= team;
      mine.dupPrefs ||= {};
      for (const [pid, list] of Object.entries(w.dupPrefs || {})) mine.dupPrefs[pid] ??= list;
    }
    d.sideBet ||= { predictions: {}, actual: null };
    for (const [pid, pr] of Object.entries(src.sideBet?.predictions || {})) {
      d.sideBet.predictions[pid] ??= pr;
    }
    if (d.sideBet.actual == null && src.sideBet?.actual != null) d.sideBet.actual = src.sideBet.actual;
    if (!(d.adjustments || []).length && (src.adjustments || []).length) d.adjustments = src.adjustments;
  });
  return { before, after: countPicks(state) };
}

function countPicks(s) {
  let n = 0;
  for (const w of Object.values(s.weeks || {})) {
    for (const by of Object.values(w.picks || {})) n += Object.keys(by || {}).length;
  }
  return n;
}

export function resetState() {
  state = defaultState();
  state.updatedAt = Date.now();
  persist();
  emit();
}

// ---- identity -------------------------------------------------------------
export function getMe() { return localStorage.getItem(ME_KEY) || ""; }
export function setMe(id) { if (id) localStorage.setItem(ME_KEY, id); else localStorage.removeItem(ME_KEY); emit(); }
export function isCommish(id = getMe()) { return Boolean(id) && id === cfg.commissioner; }

// ---- week helpers ----------------------------------------------------------
export function ensureWeek(draft, week) {
  draft.weeks[week] ||= { games: [], picks: {}, lms: {} };
  draft.weeks[week].games ||= [];
  draft.weeks[week].picks ||= {};
  draft.weeks[week].lms ||= {};
  return draft.weeks[week];
}

let idCounter = 0;
export function newId(prefix = "a") {
  return `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

/**
 * A game's id is derived from the matchup, not generated. Two teams meet at most
 * once in a week, so this is unique, and it is identical on every device and
 * across every re-pull -- which is what keeps picks attached to their game.
 * Earlier builds used a random id; migrate() below moves those picks over.
 */
export function gameId(game) {
  return `${game.away}@${game.home}`;
}

// ---- shared board ----------------------------------------------------------
// Two backends, both free. A Google Sheet needs nothing but the Google account
// you already have and doubles as a readable backup; Supabase adds realtime but
// caps the free tier at two projects and pauses one after a week idle.
// Whichever is configured, the whole pool is one JSON document, last write wins.

let backend = null;      // { name, read(), write(state), watch?(onRemote) }
let pollTimer = null;
let readOk = false;      // has this device seen the shared board yet?
let scriptVersion = "";  // reported by the Apps Script, so a stale deploy shows up
// What sheet/Code.gs says in this checkout. If the deployment reports anything
// else it is running older code, which last time meant the pool's picks were
// one blank device away from being wiped.
const EXPECTED_SCRIPT_VERSION = "straight-up-1";

export async function initSync() {
  backend = pickBackend();
  if (!backend) return syncStatus;
  syncStatus = { enabled: true, state: "connecting", detail: "", via: backend.name };
  emit();
  // Polling starts whatever happens: a home-screen app cold-starting before the
  // network is up used to fail once and stay disconnected for the whole session,
  // which on a fresh install means the board never arrives at all.
  if (!backend.watch) startPolling();
  await connect(3);
  return syncStatus;
}

/** Try the first read, retrying a few times before settling into polling. */
async function connect(tries) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (!backend) return;
    try {
      await backend.open?.();
      const remote = await backend.read();
      readOk = true;   // only now may this device write to the board
      if (remote?.state) {
        const incoming = migrate(remote.state);
        const theirs = Number(remote.updatedAt || incoming.updatedAt || 0);
        const mine = Number(state.updatedAt || 0);
        if (theirs > mine || !mine) applyRemote(incoming);
        else if (mine > theirs) await pushRemote();
      } else {
        await pushRemote();
      }
      if (backend.watch) {
        backend.watch((next, at) => {
          if (next && Number(at || next.updatedAt || 0) > Number(state.updatedAt || 0)) applyRemote(migrate(next));
        }, (st) => { syncStatus = { ...syncStatus, state: st }; emit(); });
      }
      syncStatus = { enabled: true, state: "live", detail: "", via: backend.name };
      emit();
      return;
    } catch (e) {
      console.error(`sync attempt ${attempt} failed`, e);
      syncStatus = { enabled: true, state: attempt < tries ? "connecting" : "error",
                     detail: e.message || String(e), via: backend.name };
      emit();
      if (attempt < tries) await new Promise((r) => setTimeout(r, attempt * 1200));
    }
  }
  // The backend is deliberately kept: polling and the next save can still
  // recover once the network comes back.
}

if (typeof window !== "undefined") {
  addEventListener("online", () => { if (backend && syncStatus.state === "error") connect(1); });
}

function pickBackend() {
  const sheet = cfg.sheet || {};
  if (sheet.url) return sheetBackend(sheet);
  const sb = cfg.supabase || {};
  if (sb.url && sb.anonKey) return supabaseBackend(sb);
  return null;
}

/** No push channel from a Sheet, so ask for changes while the tab is in front. */
function startPolling() {
  const every = Math.max(5, Number(cfg.sheet?.pollSeconds) || 15) * 1000;
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) pull(); }, every);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
}

async function pull() {
  if (!backend) return;
  try {
    const remote = await backend.read();
    readOk = true;
    if (!remote?.state) return;
    const theirs = Number(remote.updatedAt || remote.state.updatedAt || 0);
    if (theirs > Number(state.updatedAt || 0)) applyRemote(migrate(remote.state));
    if (syncStatus.state === "error") { syncStatus = { ...syncStatus, state: "live", detail: "" }; emit(); }
  } catch (e) {
    syncStatus = { ...syncStatus, state: "error", detail: e.message || String(e) };
    emit();
  }
}

function applyRemote(remote) {
  applyingRemote = true;
  state = remote;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  applyingRemote = false;
  emit();
}

async function pushRemote() {
  if (!backend) return;
  if (!readOk) {
    // Everything is still saved locally and will go up as soon as a read lands.
    console.warn("holding the save: this device has not read the shared board yet");
    return;
  }
  try {
    // Two phones can save at almost the same moment. The backend keeps whichever
    // is newer and hands the winner back; take it rather than carrying on with a
    // copy that has already been superseded.
    const reply = await backend.write(state);
    if (reply?.stale && reply.state && Number(reply.updatedAt || 0) > Number(state.updatedAt || 0)) {
      applyRemote(migrate(reply.state));
    }
    if (syncStatus.state === "error") { syncStatus = { ...syncStatus, state: "live", detail: "" }; emit(); }
  } catch (e) {
    console.error("push failed", e);
    syncStatus = { ...syncStatus, state: "error", detail: e.message || String(e) };
    emit();
  }
}

/**
 * Read the shared board once and report what came back, without touching local
 * state. The Setup tab uses this to prove the backend is wired up.
 */
export async function testSync() {
  const chosen = pickBackend();
  if (!chosen) return { ok: false, detail: "No shared board configured in config.js." };
  try {
    await chosen.open?.();
    const remote = await chosen.read();
    const at = Number(remote?.updatedAt || remote?.state?.updatedAt || 0);
    const guard = !scriptVersion
      ? "Script has no version, so it predates the merge guard. Re-deploy sheet/Code.gs."
      : scriptVersion === EXPECTED_SCRIPT_VERSION
        ? `Script ${scriptVersion} — up to date.`
        : `Script ${scriptVersion}, but this app expects ${EXPECTED_SCRIPT_VERSION}. Re-deploy sheet/Code.gs (Manage deployments → pencil → New version).`;
    return {
      ok: true,
      via: chosen.name,
      empty: !remote?.state,
      detail: (remote?.state
        ? `Read the board, last saved ${at ? new Date(at).toLocaleString() : "at an unknown time"}. `
        : "Connected. The board is empty, so the first save will seed it. ") + guard,
    };
  } catch (e) {
    return { ok: false, via: chosen.name, detail: e.message || String(e) };
  }
}

/** Push immediately instead of waiting out the debounce. */
export function flush() {
  if (!backend || !saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  pushRemote();
}

if (typeof document !== "undefined") {
  // pagehide is the one that fires reliably when a phone backgrounds the tab.
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
}

// ---- Google Sheet (via an Apps Script web app) ------------------------------
function sheetBackend(conf) {
  const url = conf.url;
  const season = String(cfg.season);
  return {
    name: "sheet",
    async read() {
      // A cache-buster matters here: Apps Script responses are aggressively cached.
      const res = await fetch(`${url}?season=${encodeURIComponent(season)}&t=${Date.now()}`, {
        method: "GET", redirect: "follow",
      });
      if (!res.ok) throw new Error(`Sheet read failed (${res.status})`);
      const body = await res.json();
      if (body.error) throw new Error(body.error);
      scriptVersion = body.version || "";
      return body.state ? { state: body.state, updatedAt: body.updatedAt } : null;
    },
    async write(next) {
      // text/plain keeps this a "simple" request, so the browser skips the
      // preflight that Apps Script will not answer.
      const res = await fetch(url, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ season, updatedAt: next.updatedAt, state: next }),
      });
      if (!res.ok) throw new Error(`Sheet write failed (${res.status})`);
      const body = await res.json().catch(() => ({}));
      if (body.error) throw new Error(body.error);
      return body;
    },
  };
}

// ---- Supabase --------------------------------------------------------------
function supabaseBackend(conf) {
    return {
    name: "supabase",
    async open() {
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js");
      sb = window.supabase.createClient(conf.url, conf.anonKey);
    },
    async read() {
      const { data, error } = await sb.from("pool_state").select("state, updated_at").eq("id", String(cfg.season)).maybeSingle();
      if (error) throw error;
      return data?.state ? { state: data.state, updatedAt: data.state.updatedAt } : null;
    },
    async write(next) {
      const { error } = await sb.from("pool_state").upsert({ id: String(cfg.season), state: next, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    watch(onRemote, onStatus) {
      sb.channel("pool_state_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "pool_state", filter: `id=eq.${cfg.season}` },
            (payload) => onRemote(payload.new?.state, payload.new?.state?.updatedAt))
        .subscribe((st) => onStatus(st === "SUBSCRIBED" ? "live" : "connecting"));
    },
  };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src; el.async = true;
    el.onload = resolve; el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
  });
}
