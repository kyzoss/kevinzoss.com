// Passionfruit Wall API. Behind the games passcode cookie.
//   GET            -> {ok, entries}                      ({ok:false, reason:"no_db"} without Supabase)
//   POST checkin   -> saves the entry, runs the Claude review, returns {ok, entry, review, stored}
//   POST review    -> re-runs the review for an entry {id, image?}
//   POST quest     -> saves a proofless quest completion {quest_id, value}
//   POST settings  -> saves {settings} as an entry of kind "settings"
//   DELETE {id}    -> removes an entry
const { isAuthed } = require("../lib/auth");
const V = require("../lib/vine");

const KINDS = { growth: 1, sun: 1, proof: 1, problem: 1 };
const THUMB_MAX = 90 * 1024; // the client aims for 60 KB; a little slack for base64 overhead

function json(res, code, o) { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); }
function tooBig(req, body) {
  const cl = Number(req.headers["content-length"] || 0);
  if (cl > V.MAX_BODY) return true;
  try { return JSON.stringify(body || {}).length > V.MAX_BODY; } catch { return true; }
}
function clean(s, n) { return typeof s === "string" ? s.slice(0, n) : ""; }
function dateOf(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? s : new Date().toISOString().slice(0, 10); }
function localId() { return "local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function store(entry) {
  if (!V.dbEnabled()) return { stored: false, reason: "no_db", entry: { ...entry, id: localId(), created_at: new Date().toISOString() } };
  const row = await V.addEntry(entry);
  const flat = row && row.entry ? { ...row.entry, id: row.id, created_at: row.created_at } : { ...entry, id: row && row.id, created_at: row && row.created_at };
  return { stored: true, entry: flat };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!isAuthed(req)) return json(res, 401, { ok: false, reason: "unauthed" });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    if (req.method === "GET") {
      if (!V.dbEnabled()) return json(res, 200, { ok: false, reason: "no_db", entries: [] });
      const rows = await V.listEntries(500);
      const entries = (Array.isArray(rows) ? rows : []).map((r) => (r && r.entry ? { ...r.entry, id: r.id, created_at: r.created_at } : r));
      return json(res, 200, { ok: true, entries });
    }
    if (req.method === "DELETE") {
      if (!V.dbEnabled()) return json(res, 200, { ok: false, reason: "no_db" });
      if (!/^\d+$/.test(String(body.id || ""))) return json(res, 400, { ok: false, reason: "bad_id" });
      const okd = await V.deleteEntry(body.id);
      return json(res, 200, { ok: Boolean(okd) });
    }
    if (req.method !== "POST") return json(res, 405, { ok: false, reason: "method" });
    if (tooBig(req, body)) return json(res, 413, { ok: false, reason: "too_big" });
    const action = String(body.action || "");

    if (action === "checkin") {
      if (!V.imageOk(body.image)) return json(res, 400, { ok: false, reason: "bad_image" });
      const kind = KINDS[body.kind] ? body.kind : "growth";
      const thumb = typeof body.thumb === "string" && body.thumb.startsWith("data:image/jpeg;base64,") && body.thumb.length <= THUMB_MAX ? body.thumb : null;
      const entry = {
        kind, date: dateOf(body.date), chapter: Number(body.chapter) || 0, quest_id: clean(body.quest_id, 40) || null,
        note: clean(body.note, 1000), thumb, feedback: null, xp: Math.max(0, Math.min(200, Number(body.xp) || 0)),
        meta: { slot: clean(body.slot, 5) || null, questTitle: clean(body.questTitle, 80) || null },
      };
      const saved = await store(entry);
      const rv = await V.review({ ...entry, image: body.image, slot: entry.meta.slot, questTitle: entry.meta.questTitle, chapterTitle: clean(body.chapterTitle, 40), vineName: clean(body.vineName, 40), history: Array.isArray(body.history) ? body.history.slice(0, 6).map((h) => clean(h, 200)) : [] });
      if (rv.ok) {
        saved.entry.feedback = rv.feedback;
        if (saved.stored) { try { await V.updateEntry(saved.entry.id, { feedback: rv.feedback }); } catch (e) { rv.saveError = String(e.message || e); } }
      }
      return json(res, 200, { ok: true, stored: saved.stored, reason: saved.reason, entry: saved.entry, review: { ok: rv.ok, reason: rv.reason, status: rv.status, message: rv.message } });
    }

    if (action === "review") {
      let entry = body.entry && typeof body.entry === "object" ? body.entry : null;
      if (!entry && V.dbEnabled() && /^\d+$/.test(String(body.id || ""))) {
        const rows = await V.listEntries(500);
        const row = (rows || []).find((r) => String(r.id) === String(body.id));
        if (row) entry = { ...row.entry, id: row.id, created_at: row.created_at };
      }
      if (!entry) return json(res, 404, { ok: false, reason: "not_found" });
      const image = V.imageOk(body.image) ? body.image : (V.imageOk(entry.thumb) ? entry.thumb : null);
      if (!image) return json(res, 400, { ok: false, reason: "bad_image" });
      const rv = await V.review({ ...entry, image, slot: entry.meta && entry.meta.slot, questTitle: entry.meta && entry.meta.questTitle, history: Array.isArray(body.history) ? body.history.slice(0, 6).map((h) => clean(h, 200)) : [] });
      if (rv.ok) {
        entry.feedback = rv.feedback;
        if (V.dbEnabled() && /^\d+$/.test(String(entry.id))) { try { await V.updateEntry(entry.id, { feedback: rv.feedback }); } catch (e) { rv.saveError = String(e.message || e); } }
      }
      return json(res, 200, { ok: true, entry, review: { ok: rv.ok, reason: rv.reason, status: rv.status, message: rv.message } });
    }

    if (action === "quest") {
      const quest_id = clean(body.quest_id, 40);
      if (!quest_id) return json(res, 400, { ok: false, reason: "bad_quest" });
      const kind = body.kind === "water" ? "water" : "quest";
      const entry = { kind, date: dateOf(body.date), chapter: Number(body.chapter) || 0, quest_id, note: clean(body.note, 500), thumb: null, feedback: null, xp: Math.max(0, Math.min(200, Number(body.xp) || 0)), meta: { value: body.value === undefined ? null : body.value } };
      const saved = await store(entry);
      return json(res, 200, { ok: true, stored: saved.stored, reason: saved.reason, entry: saved.entry });
    }

    if (action === "settings") {
      const s = body.settings && typeof body.settings === "object" ? body.settings : {};
      const meta = {};
      ["vine_name", "bearing", "planting_date", "notifications"].forEach((k) => { if (s[k] !== undefined) meta[k] = typeof s[k] === "string" ? s[k].slice(0, 80) : s[k]; });
      const entry = { kind: "settings", date: dateOf(body.date), chapter: 0, quest_id: null, note: "", thumb: null, feedback: null, xp: 0, meta };
      const saved = await store(entry);
      return json(res, 200, { ok: true, stored: saved.stored, reason: saved.reason, entry: saved.entry });
    }
    return json(res, 400, { ok: false, reason: "bad_action" });
  } catch (e) {
    console.error("vine.js", e && e.message);
    return json(res, 502, { ok: false, reason: "server", message: String(e && e.message || e).slice(0, 200) });
  }
};
