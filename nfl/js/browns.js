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

/**
 * The columns we read out of a box-score block.
 *
 * ESPN gives every statistics block two parallel header arrays: `keys` holds
 * machine names ("passingYards") and `labels` holds what the site prints
 * ("YDS"). This file mapped whichever array it found against the *display*
 * strings -- and since the real feed sends `keys`, every column missed, every
 * Brown scored zero, and the week-1 box score came back empty with nothing to
 * show for it. Both spellings are in the table now and each column is looked up
 * under its key and then under its label, so it does not matter which array the
 * feed sends or which one it happens to fill in.
 *
 * The tables are per block because YDS and TD mean three different things
 * depending on which block they came from.
 */
const COLS = {
  passing: {
    "C/ATT": "completions", "COMPLETIONS/PASSINGATTEMPTS": "completions",
    "YDS": "passYards", "PASSINGYARDS": "passYards",
    "TD": "passTD", "PASSINGTOUCHDOWNS": "passTD",
  },
  rushing: {
    "YDS": "rushYards", "RUSHINGYARDS": "rushYards",
    "TD": "rushTD", "RUSHINGTOUCHDOWNS": "rushTD",
  },
  receiving: {
    "REC": "receptions", "RECEPTIONS": "receptions",
    "YDS": "recYards", "RECEIVINGYARDS": "recYards",
    "TD": "recTD", "RECEIVINGTOUCHDOWNS": "recTD",
  },
  kicking: {
    "FG": "fg", "FIELDGOALSMADE/FIELDGOALATTEMPTS": "fg",
    "XP": "pat", "PAT": "pat", "EXTRAPOINTSMADE/EXTRAPOINTATTEMPTS": "pat",
  },
};
const norm = (s) => String(s ?? "").toUpperCase().trim();

/**
 * Which column table a block uses, or null for a block we do not score.
 * Returns are excluded on purpose: kickReturns carries its own YDS and TD and
 * would otherwise be read as kicking, and the pool's table has no return TD.
 */
export function blockKind(block) {
  const n = norm(block?.name || block?.type || "").toLowerCase();
  if (!n || n.includes("return")) return null;
  if (n.includes("pass")) return "passing";
  if (n.includes("rush")) return "rushing";
  if (n.includes("receiv")) return "receiving";
  if (n.includes("kick") && !n.includes("punt")) return "kicking";
  return null;
}

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
  return (await fetchGameLines(eventId, abbr)).lines;
}

/**
 * The same pull, with what the payload looked like alongside it. A box score
 * that parses to nothing has to be able to say why, or it reads as "nobody
 * scored" forever.
 */
export async function fetchGameLines(eventId, abbr = "CLE") {
  const res = await fetch(`${SITE}/summary?event=${encodeURIComponent(eventId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN boxscore responded ${res.status}`);
  const data = await res.json();
  return { lines: parseBoxscore(data, abbr), shape: describeBoxscore(data, abbr) };
}

/** Split out so the mapping can be tested without the network. */
export function parseBoxscore(data, abbr = "CLE") {
  const lines = {};
  const add = (id, key, value) => {
    if (!id || !key) return;
    // "22/34" and "2/3" are made/attempted pairs; the pool scores what was made.
    const n = Number(String(value).split("/")[0].replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n) || !n) return;
    lines[id] = lines[id] || {};
    lines[id][key] = (lines[id][key] || 0) + n;
  };
  for (const team of data?.boxscore?.players || []) {
    const teamAbbr = norm(team.team?.abbreviation);
    if (abbr && teamAbbr && teamAbbr !== norm(abbr)) continue;
    for (const block of team.statistics || []) {
      const kind = blockKind(block);
      if (!kind) continue;
      const cols = COLS[kind];
      const keys = block.keys || [];
      const labels = block.labels || [];
      for (const athlete of block.athletes || []) {
        const id = String(athlete.athlete?.id ?? athlete.athlete?.uid ?? "");
        (athlete.stats || []).forEach((raw, i) => {
          const key = cols[norm(keys[i])] || cols[norm(labels[i])];
          if (key) add(id, key, raw);
        });
      }
    }
  }
  return lines;
}

/**
 * What the feed actually sent, in one line. When a final game parses to nothing
 * this is the difference between "ESPN changed shape, here is how" and a blank
 * table that says nothing -- which is what week 1 gave us.
 */
export function describeBoxscore(data, abbr = "CLE") {
  const teams = data?.boxscore?.players || [];
  if (!teams.length) return "no boxscore.players in the payload";
  const mine = teams.find((t) => norm(t.team?.abbreviation) === norm(abbr));
  if (!mine) return `no ${abbr} block (teams: ${teams.map((t) => t.team?.abbreviation || "?").join(", ")})`;
  const blocks = (mine.statistics || []).map((b) => {
    const cols = (b.keys || b.labels || []).slice(0, 6).join(",");
    return `${b.name || b.type || "?"}[${(b.athletes || []).length}]{${cols}}`;
  });
  return blocks.length ? blocks.join(" ") : `${abbr} block has no statistics`;
}

/** The Browns' game in a given week, or null. Used for the weekly lock. */
export function brownsGame(state, week, abbr = "CLE") {
  return (state.weeks?.[week]?.games || []).find((g) => g.home === abbr || g.away === abbr) || null;
}
