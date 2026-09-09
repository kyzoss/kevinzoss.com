// ESPN's public scoreboard feed. Unofficial, but stable for years and CORS-open,
// so the browser can hit it directly. Everything is normalised into our game shape.
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// ESPN's abbreviations mostly match ours; the few that drift are mapped here.
const ABBR_FIX = { WAS: "WSH", LA: "LAR", JAC: "JAX" };
const fixAbbr = (a) => ABBR_FIX[a] || a;

export async function fetchWeek(season, week) {
  const url = `${BASE}?dates=${season}&seasontype=2&week=${week}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
  const data = await res.json();
  return (data.events || []).map(normaliseEvent).filter(Boolean);
}

function normaliseEvent(ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const status = ev.status || comp.status || {};
  const st = status.type?.state || "pre"; // pre | in | post
  const homeAbbr = fixAbbr(home.team.abbreviation);
  const awayAbbr = fixAbbr(away.team.abbreviation);
  const odds = comp.odds?.[0];
  return {
    espnId: String(ev.id),
    kickoff: comp.date || ev.date,
    home: homeAbbr,
    away: awayAbbr,
    homeRecord: home.records?.[0]?.summary || "",
    awayRecord: away.records?.[0]?.summary || "",
    spread: parseSpread(odds, homeAbbr, awayAbbr),
    status: st,
    completed: Boolean(status.type?.completed),
    homeScore: st === "pre" ? null : toNum(home.score),
    awayScore: st === "pre" ? null : toNum(away.score),
    clock: status.type?.shortDetail || "",
    broadcast: comp.broadcasts?.[0]?.names?.[0] || comp.geoBroadcasts?.[0]?.media?.shortName || "",
  };
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Home-relative spread: negative when the home side is favored.
 *
 * ESPN's numeric `spread` is signed from the favorite's point of view, not the
 * home team's, so reading it directly flips the line whenever the road team is
 * favored. Work out who is actually favored first -- from `details`, which names
 * them, or from the per-team `favorite` flags -- and only then apply the sign.
 */
function parseSpread(odds, home, away) {
  if (!odds) return null;
  const details = String(odds.details || "").trim().toUpperCase();
  if (details === "EVEN" || details === "PK" || details === "PICK") return 0;

  const m = details.match(/^([A-Z]{2,4})\s*([+-]?\d+(?:\.\d+)?)$/);
  if (m) {
    const fav = fixAbbr(m[1]);
    const n = Math.abs(parseFloat(m[2]));
    if (fav === home) return -n;
    if (fav === away) return n;
  }

  const size = typeof odds.spread === "number" ? Math.abs(odds.spread) : null;
  if (size == null) return null;
  if (size === 0) return 0;
  if (odds.homeTeamOdds?.favorite) return -size;
  if (odds.awayTeamOdds?.favorite) return size;
  return null; // favorite unknown -- better no line than a backwards one
}
