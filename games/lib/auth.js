// Passcode gate. No dependencies; node built-ins only.
//
// GAMES_PASSCODE  required. The passcode itself, set in Vercel, never in the repo.
// GAMES_SECRET    optional extra salt for the session cookie signature.
//
// The cookie is "<expiry>.<hmac>". The HMAC key is derived from the passcode, so
// changing the passcode signs everyone out.
const crypto = require("node:crypto");

const COOKIE = "kz_games";
const TTL_SECONDS = 60 * 60 * 24 * 30;

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

function key() {
  const pass = process.env.GAMES_PASSCODE;
  if (!pass) return null;
  return sha("games-session:" + (process.env.GAMES_SECRET || "") + ":" + pass);
}

function checkPasscode(input) {
  const pass = process.env.GAMES_PASSCODE;
  if (!pass || typeof input !== "string" || input.length > 200) return false;
  // Compare fixed-length digests so length and content do not leak through timing.
  return crypto.timingSafeEqual(sha(input.trim()), sha(pass.trim()));
}

function mac(exp, k) {
  return crypto.createHmac("sha256", k).update(String(exp)).digest("hex");
}

function issueCookie(now = Date.now()) {
  const k = key();
  if (!k) return null;
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  const value = exp + "." + mac(exp, k);
  return `${COOKIE}=${value}; Max-Age=${TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie() {
  return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function isAuthed(req, now = Date.now()) {
  const k = key();
  if (!k) return false;
  const raw = String(req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!/^\d+$/.test(exp || "") || !/^[0-9a-f]{64}$/.test(sig || "")) return false;
  if (Number(exp) < Math.floor(now / 1000)) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(mac(exp, k), "hex"));
}

module.exports = { checkPasscode, issueCookie, clearCookie, isAuthed, COOKIE };
