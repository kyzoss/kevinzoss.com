// Passionfruit Wall server helpers: Supabase storage through four SECURITY DEFINER
// RPCs (kz_vine_add / list / update / delete) and the Claude photo review.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, KZ_DB_TOKEN: storage. Missing means no_db and the
// client keeps entries in localStorage.
// ANTHROPIC_API_KEY: the review. Missing means no_key and the entry is saved with
// the review pending.
// VINE_FAKE_AI=1: local dev only. Skips the network and answers with a canned review
// so the UI can be exercised without a key.
const MODEL = "claude-sonnet-5-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_BODY = 1.5 * 1024 * 1024;
const MEDIA = { "image/jpeg": true, "image/png": true, "image/webp": true };

function dbEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.KZ_DB_TOKEN);
}

async function rpc(name, args, timeoutMs) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: process.env.KZ_DB_TOKEN, ...args }),
    signal: AbortSignal.timeout(timeoutMs || 8000),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const listEntries = (limit) => rpc("kz_vine_list", { p_limit: limit || 500 });
const addEntry = (entry) => rpc("kz_vine_add", { p_entry: entry });
const updateEntry = (id, patch) => rpc("kz_vine_update", { p_id: Number(id), p_patch: patch });
const deleteEntry = (id) => rpc("kz_vine_delete", { p_id: Number(id) });

// ------------------------------------------------------------------ the plan
const PLAN = `You are the growing coach inside "Passionfruit Wall", a two year game Kevin plays on his phone. Kevin lives in El Segundo, California (coastal Los Angeles, mild, foggy mornings in late spring, USDA zone 10b).

THE SITE: back yard, a white vinyl fence on top of a stucco wall, about 7 to 8 ft total. A 4 ft x 2 ft x 1 ft galvanized oval raised bed sits on the lawn against that wall. String lights run along the fence, a hot tub is to the right, utility lines are above.

THE GOAL: a living passionfruit privacy wall 10 to 12 ft wide centred on the bed, fence height, that also fruits and makes the hot tub corner feel tropical.

VARIETY: one established Frederick passionfruit (Passiflora edulis 'Frederick') in a 5 gallon pot; purple passionfruit is the alternate. Self-fertile. Ideal 68 to 82 F. Wants 6+ hours of direct sun on the upper foliage in spring and summer; the base can be shaded.

TRELLIS: independent, NOT attached to the vinyl fence. Three anchored posts (metal or wood), 6 to 12 in clearance from the wall, galvanized or stainless wires every 12 to 16 in vertically, about fence height. String lights moved off the growing area. Keep the vine away from the hot tub and the utility lines. Mature vines grow 15 to 20 ft a year and get heavy.

BED: 4 x 2 x 1 ft is fine for one vine if open to the native soil underneath. Remove the grass inside, loosen native soil, drainage test (fill a hole with water, should drain in a few hours), no plastic or landscape fabric below. Fill: 4 cu ft organic raised bed soil, 2 cu ft compost, 1 cu ft pumice, 1 cu ft mulch, organic fruit tree fertilizer per package, 2 drip emitters. Plant slightly above grade to avoid crown rot, mulch but keep a few inches clear of the stem.

SUN AUDIT before planting: photos at 9 am, 11 am, 1 pm, 3 pm, judging the TOP half of the fence, not the bed. Sun angles: late November 35 degrees at midday and 10.1 h daylight; March 56 degrees / 12.1 h; June 80 degrees / 14.4 h; September 56 degrees. Winter shade from low objects mostly disappears in summer; shade from tall trees or the house to the south does not.

TIMELINE: prep Nov 2026 to Feb 2027; plant late Feb or March 2027; Apr to Jun 2027 train one main stem up then two laterals horizontally in opposite directions, water regularly, start feeding; Jul to Oct 2027 heavy foliage, maybe first flowers and fruit; summer to fall 2028 a full privacy wall and a real harvest.

CARE: water deeply 2 to 3 times a week in warm weather, much less in winter; organic fruit tree fertilizer spring and summer, excess nitrogen gives leaves not fruit; bees for pollination, hand pollinate if flowers do not set; prune late winter / early spring removing dead and tangled growth but keeping the main laterals; harvest when fully coloured, often when the fruit drops. Common pests: aphids, Gulf fritillary caterpillars, snails and slugs.`;

function systemPrompt(ctx) {
  const kinds = {
    growth: "a weekly growth photo of the wall taken from the lawn",
    sun: "a sun audit photo of the TOP half of the fence at the " + (ctx.slot || "given") + " slot",
    proof: "proof that a quest step was done",
    problem: "a problem report; Kevin thinks something is wrong",
  };
  return PLAN + `

CONTEXT: today is ${ctx.date}. Chapter ${ctx.chapter}${ctx.chapterTitle ? " (" + ctx.chapterTitle + ")" : ""}. The photo is ${kinds[ctx.kind] || "a check-in photo"}${ctx.questTitle ? ' for the quest "' + ctx.questTitle + '"' : ""}.${ctx.vineName ? " The vine is called " + ctx.vineName + "." : ""}
RECENT HISTORY (newest first, no images):
${(ctx.history || []).map((h) => "- " + h).join("\n") || "- none yet"}

Judge the photo honestly against the plan above and the current stage. Be specific about what you can see. Do not contradict the plan. Never invent things not visible; use null when you cannot tell.

Reply with STRICT JSON only, no prose, no code fences, exactly this shape:
{"headline": str (under 70 chars), "health": 1-10 or null (null before planting), "coverage_pct": 0-100 or null (share of the 12 ft x fence-height target covered by foliage; 0 before planting), "stage": str, "observations": [str], "concerns": [{"issue": str, "severity": "low|med|high", "fix": str}], "next_actions": [str, up to 4], "praise": str, "sun": {"upper_fence_lit": bool, "estimated_summer_hours": number|null} (only for sun audit kinds, else null), "xp_bonus": 0-30, "confidence": "low|med|high"}`;
}

// Strip fences, take the first { to the last }, parse. Returns null when nothing parses.
function parseReview(text) {
  if (typeof text !== "string") return null;
  let t = text.replace(/```[a-z]*\n?/gi, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  let o;
  try { o = JSON.parse(t); } catch { return null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  return normalize(o);
}
function clampNum(v, lo, hi) { if (v === null || v === undefined || v === "") return null; v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; }
function strs(a) { return Array.isArray(a) ? a.filter((s) => typeof s === "string").slice(0, 8) : []; }
function normalize(o) {
  const sun = o.sun && typeof o.sun === "object"
    ? { upper_fence_lit: Boolean(o.sun.upper_fence_lit), estimated_summer_hours: clampNum(o.sun.estimated_summer_hours, 0, 14) }
    : null;
  return {
    headline: String(o.headline || "Reviewed").slice(0, 120),
    health: clampNum(o.health, 1, 10),
    coverage_pct: clampNum(o.coverage_pct, 0, 100),
    stage: String(o.stage || "").slice(0, 80),
    observations: strs(o.observations),
    concerns: Array.isArray(o.concerns) ? o.concerns.filter((c) => c && typeof c === "object").slice(0, 6).map((c) => ({
      issue: String(c.issue || "").slice(0, 160), severity: /^(low|med|high)$/.test(c.severity) ? c.severity : "low", fix: String(c.fix || "").slice(0, 240),
    })) : [],
    next_actions: strs(o.next_actions).slice(0, 4),
    praise: String(o.praise || "").slice(0, 240),
    sun,
    xp_bonus: Math.round(clampNum(o.xp_bonus, 0, 30) || 0),
    confidence: /^(low|med|high)$/.test(o.confidence) ? o.confidence : "low",
  };
}
function plainFallback(text) {
  return {
    headline: "Claude replied in prose", health: null, coverage_pct: null, stage: "", observations: [String(text || "").slice(0, 900)],
    concerns: [], next_actions: [], praise: "", sun: null, xp_bonus: 0, confidence: "low", unparsed: true,
  };
}

const FAKE_REVIEW = {
  headline: "Site looks ready for the trellis posts",
  health: null, coverage_pct: 0, stage: "Pre-planting site",
  observations: ["Upper fence is lit along the whole span.", "String lights still cross the growing area.", "Bed is centred under the fence panel with clear lawn access."],
  concerns: [{ issue: "String lights in the growing area", severity: "low", fix: "Re-route them above or beside the span before the posts go in." }],
  next_actions: ["Mark the three post positions.", "Order posts, wire and turnbuckles.", "Run the drainage test inside the bed."],
  praise: "Clear, well framed photo from the lawn: perfect for comparing week to week.",
  sun: { upper_fence_lit: true, estimated_summer_hours: 7 }, xp_bonus: 12, confidence: "med",
};

// Local stand-in for the Anthropic API when VINE_FAKE_AI=1. Wrapped in fences on
// purpose so the parser path is the same as production.
async function fakeFetch() {
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ content: [{ type: "text", text: "```json\n" + JSON.stringify(FAKE_REVIEW) + "\n```" }] }),
  };
}

// Never throws. Returns {ok:true, feedback, raw} or {ok:false, reason, status?, message?}.
async function review(input, opts) {
  opts = opts || {};
  const doFetch = opts.fetch || (process.env.VINE_FAKE_AI === "1" ? fakeFetch : globalThis.fetch);
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key && doFetch !== fakeFetch) return { ok: false, reason: "no_key" };
    const img = splitDataUrl(input.image);
    if (!img) return { ok: false, reason: "bad_image" };
    const text = `Kind: ${input.kind || "growth"}. Date: ${input.date}.` + (input.note ? ` Kevin's note: ${String(input.note).slice(0, 600)}` : "") + " Review the photo.";
    const body = {
      model: MODEL,
      max_tokens: 900,
      system: systemPrompt(input),
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
        { type: "text", text },
      ] }],
    };
    const res = await doFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": key || "", "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs || 55000),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw;
      try { const j = JSON.parse(raw); msg = (j.error && j.error.message) || raw; } catch { /* keep raw */ }
      return { ok: false, reason: "api_error", status: res.status, message: String(msg).slice(0, 300) };
    }
    let reply = "";
    try {
      const j = JSON.parse(raw);
      reply = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    } catch { return { ok: false, reason: "bad_response", status: res.status, message: raw.slice(0, 200) }; }
    const fb = parseReview(reply) || plainFallback(reply);
    return { ok: true, feedback: fb, raw: reply.slice(0, 4000) };
  } catch (e) {
    return { ok: false, reason: "exception", message: String(e && e.message || e).slice(0, 300) };
  }
}

function splitDataUrl(s) {
  if (typeof s !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(s);
  if (!m) return null;
  return { mediaType: m[1], data: m[2].replace(/\s+/g, "") };
}
function imageOk(s) { const p = splitDataUrl(s); return Boolean(p && MEDIA[p.mediaType] && p.data.length > 100); }

module.exports = { MODEL, ANTHROPIC_URL, ANTHROPIC_VERSION, MAX_BODY, dbEnabled, rpc, listEntries, addEntry, updateEntry, deleteEntry, systemPrompt, parseReview, plainFallback, review, splitDataUrl, imageOk, FAKE_REVIEW, fakeFetch, PLAN };
