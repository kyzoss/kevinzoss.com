// The Browns roster and the per-player box score, from ESPN's public feeds --
// the same host the scoreboard comes from, so the browser can hit it directly.
//
// IMPORTANT, and the reason everything here is written defensively: these two
// endpoints were coded against ESPN's documented shape without being able to
// call them, because the sandbox this was built in cannot reach espn.com. Every
// field is optional-chained, every number is coerced, and a shape that does not
// match yields an empty result rather than a crash or -- worse -- a wrong score.
// `parseBoxscore` is exported on its own so the mapping can be tested against a
// captured payload, and the commissioner can always enter a line by hand.

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

/**
 * ESPN's position abbreviations, folded onto the five the pool drafts from.
 * The first roster pull came back with no kicker and no tight end, because
 * ESPN labels the kicker PK and the punter P -- an exact-match filter drops
 * both silently, which is the worst way for this to fail.
 */
const POS_FIX = {
  PK: "K",                                              // the kicker: ESPN's own label
  FB: "RB", HB: "RB", TB: "RB",                         // any back is a back for this
  SE: "WR", FL: "WR", LWR: "WR", RWR: "WR", SWR: "WR",  // depth charts split the receivers
  SLOT: "WR", "WR/RB": "WR", "TE/FB": "TE",
};
function normalisePos(raw) {
  const p = String(raw).toUpperCase().trim();
  if (POS_FIX[p]) return POS_FIX[p];
  if (p === "PLACE KICKER" || p === "KICKER") return "K";
  if (p === "TIGHT END") return "TE";
  if (p === "QUARTERBACK") return "QB";
  if (p === "RUNNING BACK") return "RB";
  if (p === "WIDE RECEIVER") return "WR";
  return p;
}

/** Stat labels ESPN uses, mapped to the keys our scoring table knows. */
const PASS = { C_ATT: "completions", YDS: "passYards", TD: "passTD" };
const RUSH = { YDS: "rushYards", TD: "rushTD" };
const RECV = { REC: "receptions", YDS: "recYards", TD: "recTD" };

/**
 * The roster, grouped into the positions the pool drafts from. ESPN returns
 * every player including practice-squad and injured, which is fine: the rule is
 * "any Brown", and a player who does not take the field simply scores nothing.
 */
export async function fetchRoster(abbr = "CLE", positions = ["QB", "RB", "WR", "TE", "K"]) {
  const res = await fetch(`${SITE}/teams/${abbr.toLowerCase()}/roster`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN roster responded ${res.status}`);
  const data = await res.json();
  const want = new Set(positions);
  const out = [];
  // The payload groups athletes ("offense", "defense", "specialTeam"); flatten.
  for (const group of data.athletes || []) {
    for (const a of group.items || group.athletes || []) {
      const pos = normalisePos(a.position?.abbreviation || a.position?.name || "");
      if (!want.has(pos)) continue;
      out.push({
        id: String(a.id ?? a.uid ?? a.displayName),
        name: a.fullName || a.displayName || a.shortName || "Unknown",
        short: a.shortName || a.displayName || "",
        pos,
        number: a.jersey ? String(a.jersey) : "",
        headshot: a.headshot?.href || "",
      });
    }
  }
  // Depth-chart order is not in this payload, so sort by position then number,
  // which reads close enough to a depth chart to choose from.
  const rank = Object.fromEntries(positions.map((p, i) => [p, i]));
  out.sort((a, b) => (rank[a.pos] ?? 9) - (rank[b.pos] ?? 9)
    || (Number(a.number || 999) - Number(b.number || 999))
    || a.name.localeCompare(b.name));
  return out;
}

/** "QB 4 · RB 5 · WR 7 · TE 4 · K 1" -- so a position that came back empty shows. */
export function rosterCensus(roster, positions = ["QB", "RB", "WR", "TE", "K"]) {
  return positions.map((p) => `${p} ${roster.filter((r) => r.pos === p).length}`).join(" · ");
}

/** Positions the pool expects but the roster has none of. */
export function missingPositions(roster, positions = ["QB", "RB", "WR", "TE", "K"]) {
  return positions.filter((p) => !roster.some((r) => r.pos === p));
}

/**
 * Every Browns player's line from one game, keyed by player id, ready to score.
 * `eventId` is the ESPN game id already stored on our games as `espnId`.
 */
export async function fetchGameStats(eventId, abbr = "CLE") {
  const res = await fetch(`${SITE}/summary?event=${encodeURIComponent(eventId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN boxscore responded ${res.status}`);
  return parseBoxscore(await res.json(), abbr);
}

/** Split out so the mapping can be tested without the network. */
export function parseBoxscore(data, abbr = "CLE") {
  const lines = {};
  const add = (id, key, value) => {
    if (!id || !key) return;
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n) || !n) return;
    lines[id] = lines[id] || {};
    lines[id][key] = (lines[id][key] || 0) + n;
  };
  for (const team of data?.boxscore?.players || []) {
    const team_abbr = (team.team?.abbreviation || "").toUpperCase();
    if (abbr && team_abbr && team_abbr !== abbr.toUpperCase()) continue;
    for (const block of team.statistics || []) {
      const kind = (block.name || block.type || "").toLowerCase();
      const keys = block.keys || block.labels || [];
      const map = kind.includes("pass") ? PASS : kind.includes("rush") ? RUSH
        : kind.includes("receiv") ? RECV : kind.includes("kick") ? "kicking" : null;
      if (!map) continue;
      for (const athlete of block.athletes || []) {
        const id = String(athlete.athlete?.id ?? athlete.athlete?.uid ?? "");
        const stats = athlete.stats || [];
        stats.forEach((raw, i) => {
          const label = String(keys[i] ?? "").toUpperCase();
          if (map === "kicking") {
            // ESPN gives kicking as "made/attempted" pairs, e.g. FG "2/3".
            if (label.startsWith("FG")) add(id, "fg", String(raw).split("/")[0]);
            else if (label.startsWith("XP") || label.startsWith("PAT")) add(id, "pat", String(raw).split("/")[0]);
            return;
          }
          if (label === "C/ATT") { add(id, "completions", String(raw).split("/")[0]); return; }
          const key = map[label];
          if (key) add(id, key, raw);
        });
      }
    }
  }
  return lines;
}

/** The Browns' game in a given week, or null. Used for the weekly lock. */
export function brownsGame(state, week, abbr = "CLE") {
  return (state.weeks?.[week]?.games || []).find((g) => g.home === abbr || g.away === abbr) || null;
}
