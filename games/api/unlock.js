// POST {code}  -> checks the passcode, sets the session cookie.
// GET          -> {ok: bool}, so the gate page can skip the form when already in.
// DELETE       -> signs out.
const { checkPasscode, issueCookie, clearCookie, isAuthed } = require("../lib/auth");
const { track, visitorOf, newVisitorCookie } = require("../lib/track");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!process.env.GAMES_PASSCODE) {
    return res.status(500).json({ ok: false, error: "GAMES_PASSCODE is not set" });
  }
  if (req.method === "GET") return res.status(200).json({ ok: isAuthed(req) });
  if (req.method === "DELETE") {
    await track("lock", req);
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ ok: false });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  if (!checkPasscode(readBody(req).code)) {
    await sleep(700); // slows guessing from a single connection
    await track("unlock_fail", req);
    return res.status(401).json({ ok: false, error: "Wrong passcode" });
  }
  // Remember the visitor with a random id (no personal data) so "unique visitors" can be counted.
  const known = visitorOf(req);
  const fresh = known ? null : newVisitorCookie();
  res.setHeader("Set-Cookie", fresh ? [issueCookie(), fresh.header] : issueCookie());
  await track("unlock_ok", req, { visitor: known || fresh.id });
  return res.status(200).json({ ok: true });
};
