// Tests the box-score MAPPING, not ESPN.
//
// The first version of this file put DISPLAY labels ("YDS", "TD") in the `keys`
// array, because that is what the parser expected. The real feed puts machine
// names there ("passingYards") and the display labels in `labels` -- so every
// column missed, every Brown scored zero, and this suite passed anyway. A
// fixture built from the same assumption as the code tests nothing.
//
// So the same game is now run through THREE payloads: keys only (what ESPN
// actually sends), labels only, and both. All three must give identical lines.
import { parseBoxscore, describeBoxscore, blockKind, brownsGame, fetchRoster, rosterCensus, missingPositions } from '../js/browns.js';
let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${a}\n    want ${b}`); } };

// One game, described three ways. `hdr` decides which header arrays the blocks
// carry: the machine keys ESPN really sends, the display labels the site shows,
// or both together.
const KEYS = {
  passing:   ["completions/passingAttempts","passingYards","yardsPerPassAttempt","passingTouchdowns","interceptions"],
  rushing:   ["rushingAttempts","rushingYards","yardsPerRushAttempt","rushingTouchdowns","longRushing"],
  receiving: ["receptions","receivingYards","yardsPerReception","receivingTouchdowns","longReception"],
  kicking:   ["fieldGoalsMade/fieldGoalAttempts","fieldGoalPct","longFieldGoalMade","extraPointsMade/extraPointAttempts","totalKickingPoints"],
};
const LABELS = {
  passing:   ["C/ATT","YDS","AVG","TD","INT"],
  rushing:   ["CAR","YDS","AVG","TD","LONG"],
  receiving: ["REC","YDS","AVG","TD","LONG"],
  kicking:   ["FG","PCT","LONG","XP","PTS"],
};
const STATS = {
  passing:   [{ id: "1", stats: ["22/34","249","7.3","2","1"] }],
  rushing:   [{ id: "2", stats: ["18","87","4.8","1","24"] }, { id: "1", stats: ["3","12","4.0","0","8"] }],
  receiving: [{ id: "3", stats: ["7","104","14.9","1","31"] }],
  kicking:   [{ id: "4", stats: ["2/3","66.7","48","3/3","12"] }],
};
const head = (kind, hdr) => hdr === "keys" ? { keys: KEYS[kind] }
  : hdr === "labels" ? { labels: LABELS[kind] } : { keys: KEYS[kind], labels: LABELS[kind] };
const build = (hdr) => ({ boxscore: { players: [
  { team: { abbreviation: "CLE" }, statistics: Object.keys(STATS).map((kind) => ({
      name: kind, ...head(kind, hdr),
      athletes: STATS[kind].map((a) => ({ athlete: { id: a.id }, stats: a.stats })) })) },
  { team: { abbreviation: "JAX" }, statistics: [
    { name: "rushing", ...head("rushing", hdr), athletes: [
      { athlete: { id: "99" }, stats: ["20","150","7.5","2","44"] } ] } ] },
] } });

const WANT = {
  "1": { completions: 22, passYards: 249, passTD: 2, rushYards: 12 },
  "2": { rushYards: 87, rushTD: 1 },
  "3": { receptions: 7, recYards: 104, recTD: 1 },
  "4": { fg: 2, pat: 3 },
};
for (const hdr of ["keys", "labels", "both"]) {
  const l = parseBoxscore(build(hdr), "CLE");
  eq(`${hdr}: the QB's passing line`,      l["1"], WANT["1"]);
  eq(`${hdr}: the RB's rushing line`,      l["2"], WANT["2"]);
  eq(`${hdr}: the WR's receiving line`,    l["3"], WANT["3"]);
  eq(`${hdr}: the kicker, made not attempted`, l["4"], WANT["4"]);
  eq(`${hdr}: the other team is excluded`, l["99"], undefined);
  eq(`${hdr}: per-attempt averages are not yards`, l["1"].passYards, 249);
}
const payload = build("both");
const lines = parseBoxscore(payload, "CLE");
eq("a zero is not recorded",     "0" in (lines["1"] || {}), false);
eq("nothing in, nothing out",    parseBoxscore({}, "CLE"), {});
eq("a shape we do not know",     parseBoxscore({ boxscore: { players: [{ team: {}, statistics: [{}] }] } }), {});

// A kick return carries its own YDS and TD. Read as kicking it would invent
// points; read as receiving it would invent a catch. It is not scored at all.
eq("kick returns are not kicking", blockKind({ name: "kickReturns" }), null);
eq("punt returns either",          blockKind({ name: "puntReturns" }), null);
eq("punting is not kicking",       blockKind({ name: "punting" }), null);
eq("defence is not scored",        blockKind({ name: "defensive" }), null);
eq("passing is",                   blockKind({ name: "passing" }), "passing");
const withReturns = build("keys");
withReturns.boxscore.players[0].statistics.push(
  { name: "kickReturns", keys: ["kickReturns","kickReturnYards","yardsPerKickReturn","longKickReturn","kickReturnTouchdowns"],
    athletes: [{ athlete: { id: "3" }, stats: ["2","55","27.5","31","1"] }] });
eq("a return TD adds nothing", parseBoxscore(withReturns, "CLE")["3"], WANT["3"]);

// When it comes back empty, it has to be able to say what it saw.
eq("the shape names the blocks and their columns",
   describeBoxscore(build("keys"), "CLE").startsWith("passing[1]{completions/passingAttempts,"), true);
eq("a missing team says so", describeBoxscore(build("keys"), "PIT"), "no PIT block (teams: CLE, JAX)");
eq("an empty payload says so", describeBoxscore({}, "CLE"), "no boxscore.players in the payload");

// The first real roster pull came back with no kicker and no tight end, because
// ESPN labels the kicker PK -- and the depth chart splits receivers into LWR /
// RWR / SWR. An exact-match filter drops all of them silently.
{
  const fake = { athletes: [
    { position: "offense", items: [
      { id: "4",  fullName: "Deshaun Watson", position: { abbreviation: "QB" },  jersey: "4" },
      { id: "34", fullName: "Michael Burton", position: { abbreviation: "FB" },  jersey: "34" },
      { id: "44", fullName: "Harold Fannin",  position: { abbreviation: "TE" },  jersey: "44" },
      { id: "12", fullName: "Denzel Boston",  position: { abbreviation: "LWR" }, jersey: "12" },
      { id: "55", fullName: "Spencer Fano",   position: { abbreviation: "LT" },  jersey: "55" } ] },
    { position: "specialTeam", items: [
      { id: "25", fullName: "Andre Szmyt",    position: { abbreviation: "PK" },  jersey: "25" },
      { id: "9",  fullName: "A Punter",       position: { abbreviation: "P" },   jersey: "9" } ] },
    { position: "defense", items: [
      { id: "50", fullName: "A Linebacker",   position: { abbreviation: "LB" },  jersey: "50" } ] },
  ] };
  globalThis.fetch = async () => ({ ok: true, json: async () => fake });
  const r = await fetchRoster("CLE", ["QB", "RB", "WR", "TE", "K"]);
  const posOf = (n) => r.find((x) => x.fullName === n || x.name === n)?.pos;
  eq("PK is the kicker",        posOf("Andre Szmyt"), "K");
  eq("FB counts as a back",     posOf("Michael Burton"), "RB");
  eq("LWR counts as a receiver", posOf("Denzel Boston"), "WR");
  eq("TE comes through",        posOf("Harold Fannin"), "TE");
  eq("the line is not eligible", posOf("Spencer Fano"), undefined);
  eq("nor the punter",          posOf("A Punter"), undefined);
  eq("nor the defence",         posOf("A Linebacker"), undefined);
  eq("every position filled",   missingPositions(r), []);
  eq("the census reads right",  rosterCensus(r), "QB 1 · RB 1 · WR 1 · TE 1 · K 1");
}

const st = { weeks: { 1: { games: [
  { id: "NE@SEA", home: "SEA", away: "NE" }, { id: "CLE@JAX", home: "JAX", away: "CLE", espnId: "401" } ] } } };
eq("finds the Browns' game",  brownsGame(st, 1)?.id, "CLE@JAX");
eq("no game that week",       brownsGame(st, 2), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
