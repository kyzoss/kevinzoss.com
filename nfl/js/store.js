// State container. Local-first (localStorage), with an optional Supabase mirror so
// all four players see the same board. Whole-document, last-write-wins: with four
// people it is plenty, and it keeps the schema to one row.

const cfg = window.POOL_CONFIG;
const KEY = `pickem:${cfg.season}`;
const ME_KEY = `pickem:me`;

const listeners = new Set();
let state = load();
let sb = null;
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
  // Player list follows config (names/colours), but never drops a player who has data.
  const byId = Object.fromEntries((s.players || []).map((p) => [p.id, p]));
  out.players = cfg.players.map((p) => ({ ...byId[p.id], ...p }));
  for (const p of s.players || []) if (!out.players.find((x) => x.id === p.id)) out.players.push(p);
  out.sideBet = { predictions: {}, actual: null, ...(s.sideBet || {}) };
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
  if (sb && !applyingRemote) {
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
export function newId(prefix = "g") {
  return `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

// ---- Supabase --------------------------------------------------------------
export async function initSync() {
  const s = cfg.supabase || {};
  if (!s.url || !s.anonKey) return syncStatus;
  syncStatus = { enabled: true, state: "connecting", detail: "" };
  emit();
  try {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js");
    sb = window.supabase.createClient(s.url, s.anonKey);
    const { data, error } = await sb.from("pool_state").select("state, updated_at").eq("id", String(cfg.season)).maybeSingle();
    if (error) throw error;
    if (data?.state) {
      const remote = migrate(data.state);
      if ((remote.updatedAt || 0) > (state.updatedAt || 0) || !state.updatedAt) {
        applyRemote(remote);
      } else if ((state.updatedAt || 0) > (remote.updatedAt || 0)) {
        await pushRemote();
      }
    } else {
      await pushRemote();
    }
    sb.channel("pool_state_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pool_state", filter: `id=eq.${cfg.season}` }, (payload) => {
        const remote = payload.new?.state;
        if (remote && (remote.updatedAt || 0) > (state.updatedAt || 0)) applyRemote(migrate(remote));
      })
      .subscribe((status) => {
        syncStatus = { enabled: true, state: status === "SUBSCRIBED" ? "live" : "connected", detail: status };
        emit();
      });
    syncStatus = { enabled: true, state: "connected", detail: "" };
  } catch (e) {
    console.error("sync failed", e);
    sb = null;
    syncStatus = { enabled: true, state: "error", detail: e.message || String(e) };
  }
  emit();
  return syncStatus;
}

function applyRemote(remote) {
  applyingRemote = true;
  state = remote;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  applyingRemote = false;
  emit();
}

async function pushRemote() {
  if (!sb) return;
  const { error } = await sb.from("pool_state").upsert({ id: String(cfg.season), state, updated_at: new Date().toISOString() });
  if (error) {
    console.error("push failed", error);
    syncStatus = { ...syncStatus, state: "error", detail: error.message };
    emit();
  } else if (syncStatus.state === "error") {
    syncStatus = { ...syncStatus, state: "live", detail: "" };
    emit();
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src; el.async = true;
    el.onload = resolve; el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
  });
}
