// Usage tracking. Stores anonymous events in Supabase through two SECURITY DEFINER
// functions (kz_log, kz_usage_summary); the table itself cannot be read or written
// directly. Both functions refuse any call without the server token, so the public
// anon key alone cannot read the stats or write events. What is kept: event type, game, a random visitor id, device class and
// country. No names, no IP addresses, no passcodes.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, KZ_DB_TOKEN: set in Vercel. If any is missing,
// tracking does nothing and the site works as before.
const crypto = require("node:crypto");

const VISITOR_COOKIE = "kz_v";

function enabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.KZ_DB_TOKEN);
}

function deviceOf(ua) {
  ua = String(ua || "");
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "phone";
  return "desktop";
}

function cookieValue(req, name) {
  const part = String(req.headers.cookie || "").split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return part ? part.slice(name.length + 1) : "";
}

function visitorOf(req) {
  const v = cookieValue(req, VISITOR_COOKIE);
  return /^[0-9a-f]{16}$/.test(v) ? v : "";
}

function newVisitorCookie() {
  const id = crypto.randomBytes(8).toString("hex");
  return { id, header: `${VISITOR_COOKIE}=${id}; Max-Age=${60 * 60 * 24 * 365}; Path=/; HttpOnly; Secure; SameSite=Lax` };
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
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Never throws and never holds a request for long: tracking must not break a game.
async function track(event, req, { game = null, visitor } = {}) {
  if (!enabled()) return;
  try {
    await rpc("kz_log", {
      p_event: event,
      p_game: game,
      p_visitor: visitor !== undefined ? visitor || null : visitorOf(req) || null,
      p_device: deviceOf(req.headers["user-agent"]),
      p_country: req.headers["x-vercel-ip-country"] || null,
    }, 1500);
  } catch { /* swallow */ }
}

async function summary(days) {
  if (!enabled()) throw new Error("Tracking is not configured (SUPABASE_URL / SUPABASE_ANON_KEY / KZ_DB_TOKEN)");
  return rpc("kz_usage_summary", { p_days: days }, 8000);
}

module.exports = { track, summary, enabled, deviceOf, visitorOf, newVisitorCookie, cookieValue, VISITOR_COOKIE };
