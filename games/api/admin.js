// GET            -> {ok}  (is this browser signed in as admin?)
// GET ?data=1&days=N -> usage summary JSON (admin cookie required)
// POST {code}    -> admin sign-in
// DELETE         -> admin sign-out
const { checkAdminPasscode, issueAdminCookie, clearAdminCookie, isAdmin } = require("../lib/admin");
const { track, summary } = require("../lib/track");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const body = (req) => (req.body && typeof req.body === "object" ? req.body : (() => { try { return JSON.parse(req.body || "{}"); } catch { return {}; } })());

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!process.env.ADMIN_PASSCODE) return res.status(500).json({ ok: false, error: "ADMIN_PASSCODE is not set" });

  if (req.method === "GET") {
    const admin = isAdmin(req);
    const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
    if (!q.data) return res.status(200).json({ ok: admin });
    if (!admin) return res.status(401).json({ ok: false });
    const days = Math.max(1, Math.min(180, parseInt(q.days, 10) || 14));
    try { return res.status(200).json({ ok: true, ...(await summary(days)) }); }
    catch (e) { return res.status(502).json({ ok: false, error: String(e.message || e) }); }
  }
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearAdminCookie());
    return res.status(200).json({ ok: false });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  if (!checkAdminPasscode(body(req).code)) {
    await sleep(900);
    await track("admin_fail", req, { visitor: "" });
    return res.status(401).json({ ok: false, error: "Wrong passcode" });
  }
  res.setHeader("Set-Cookie", issueAdminCookie());
  await track("admin_ok", req, { visitor: "" });
  return res.status(200).json({ ok: true });
};
