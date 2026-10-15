// Admin gate, separate from the games passcode.
// ADMIN_PASSCODE required. The cookie key is derived from it, so changing it signs
// the admin out everywhere. The cookie is Strict and lasts 12 hours.
const crypto = require("node:crypto");
const { cookieValue } = require("./track");

const COOKIE = "kz_admin";
const TTL_SECONDS = 60 * 60 * 12;

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const key = () => (process.env.ADMIN_PASSCODE ? sha("admin-session:" + process.env.ADMIN_PASSCODE) : null);
const mac = (exp, k) => crypto.createHmac("sha256", k).update(String(exp)).digest("hex");

function checkAdminPasscode(input) {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass || typeof input !== "string" || input.length > 200) return false;
  return crypto.timingSafeEqual(sha(input.trim()), sha(pass.trim()));
}

function issueAdminCookie(now = Date.now()) {
  const k = key();
  if (!k) return null;
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return `${COOKIE}=${exp}.${mac(exp, k)}; Max-Age=${TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

const clearAdminCookie = () => `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;

function isAdmin(req, now = Date.now()) {
  const k = key();
  if (!k) return false;
  const [exp, sig] = cookieValue(req, COOKIE).split(".");
  if (!/^\d+$/.test(exp || "") || !/^[0-9a-f]{64}$/.test(sig || "")) return false;
  if (Number(exp) < Math.floor(now / 1000)) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(mac(exp, k), "hex"));
}

module.exports = { checkAdminPasscode, issueAdminCookie, clearAdminCookie, isAdmin, COOKIE };
