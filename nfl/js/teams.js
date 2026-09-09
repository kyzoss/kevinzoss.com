// The 32 franchises, keyed by ESPN abbreviation. `color` is tuned to read on the
// dark ground (a few primaries, like the Bears' navy, vanish on #0B0B0E).
export const TEAMS = {
  ARI: { name: "Cardinals", city: "Arizona",      full: "Arizona Cardinals", color: "#C8375A" },
  ATL: { name: "Falcons",   city: "Atlanta",      full: "Atlanta Falcons", color: "#D2334D" },
  BAL: { name: "Ravens",    city: "Baltimore",    full: "Baltimore Ravens", color: "#8E6CD2" },
  BUF: { name: "Bills",     city: "Buffalo",      full: "Buffalo Bills", color: "#3C7BE3" },
  CAR: { name: "Panthers",  city: "Carolina",     full: "Carolina Panthers", color: "#1FA7E6" },
  CHI: { name: "Bears",     city: "Chicago",      full: "Chicago Bears", color: "#E8521C" },
  CIN: { name: "Bengals",   city: "Cincinnati",   full: "Cincinnati Bengals", color: "#FB4F14" },
  CLE: { name: "Browns",    city: "Cleveland",    full: "Cleveland Browns", color: "#FF3C00" },
  DAL: { name: "Cowboys",   city: "Dallas",       full: "Dallas Cowboys", color: "#4E8FE0" },
  DEN: { name: "Broncos",   city: "Denver",       full: "Denver Broncos", color: "#FB6A14" },
  DET: { name: "Lions",     city: "Detroit",      full: "Detroit Lions", color: "#2C97DC" },
  GB:  { name: "Packers",   city: "Green Bay",    full: "Green Bay Packers", color: "#FFB612" },
  HOU: { name: "Texans",    city: "Houston",      full: "Houston Texans", color: "#D6334A" },
  IND: { name: "Colts",     city: "Indianapolis", full: "Indianapolis Colts", color: "#4A8AE5" },
  JAX: { name: "Jaguars",   city: "Jacksonville", full: "Jacksonville Jaguars", color: "#20A39E" },
  KC:  { name: "Chiefs",    city: "Kansas City",  full: "Kansas City Chiefs", color: "#E31837" },
  LV:  { name: "Raiders",   city: "Las Vegas",    full: "Las Vegas Raiders", color: "#B8BEC2" },
  LAC: { name: "Chargers",  city: "Los Angeles",  full: "Los Angeles Chargers", color: "#2AA4E8" },
  LAR: { name: "Rams",      city: "Los Angeles",  full: "Los Angeles Rams", color: "#3E7FE8" },
  MIA: { name: "Dolphins",  city: "Miami",        full: "Miami Dolphins", color: "#1FB3B9" },
  MIN: { name: "Vikings",   city: "Minnesota",    full: "Minnesota Vikings", color: "#8B5CD6" },
  NE:  { name: "Patriots",  city: "New England",  full: "New England Patriots", color: "#D63A52" },
  NO:  { name: "Saints",    city: "New Orleans",  full: "New Orleans Saints", color: "#D3BC8D" },
  NYG: { name: "Giants",    city: "New York",     full: "New York Giants", color: "#3B6FDB" },
  NYJ: { name: "Jets",      city: "New York",     full: "New York Jets", color: "#2FA96B" },
  PHI: { name: "Eagles",    city: "Philadelphia", full: "Philadelphia Eagles", color: "#2BA39B" },
  PIT: { name: "Steelers",  city: "Pittsburgh",   full: "Pittsburgh Steelers", color: "#FFB612" },
  SF:  { name: "49ers",     city: "San Francisco",full: "San Francisco 49ers", color: "#D93A3A" },
  SEA: { name: "Seahawks",  city: "Seattle",      full: "Seattle Seahawks", color: "#69BE28" },
  TB:  { name: "Buccaneers",city: "Tampa Bay",    full: "Tampa Bay Buccaneers", color: "#E0322F" },
  TEN: { name: "Titans",    city: "Tennessee",    full: "Tennessee Titans", color: "#4B92DB" },
  WSH: { name: "Commanders",city: "Washington",   full: "Washington Commanders", color: "#C94A47" },
};

export const TEAM_LIST = Object.keys(TEAMS).sort();

export function teamLogo(abbr) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${String(abbr).toLowerCase()}.png`;
}

export function teamColor(abbr) {
  return TEAMS[abbr]?.color || "#C9C9CE";
}

export function teamName(abbr) {
  return TEAMS[abbr]?.name || abbr;
}

const BY_FULL = Object.fromEntries(Object.entries(TEAMS).map(([abbr, t]) => [t.full.toLowerCase(), abbr]));
/** Full name ("Kansas City Chiefs") -> abbreviation. Tolerates a few sportsbook spellings. */
export function abbrFromFull(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  if (BY_FULL[n]) return BY_FULL[n];
  if (n.includes("washington")) return "WSH";
  if (n.includes("rams")) return "LAR";
  if (n.includes("chargers")) return "LAC";
  if (n.includes("jaguars")) return "JAX";
  const hit = Object.entries(TEAMS).find(([, t]) => n.endsWith(t.name.toLowerCase()));
  return hit ? hit[0] : null;
}
