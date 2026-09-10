// Tests the box-score MAPPING, not ESPN. The payload below is hand-built to
// ESPN's documented summary shape; if the real one differs the mapping will be
// wrong in production and these will still pass, which is exactly why the app
// also lets the commissioner enter a line by hand. Verify against one real
// game before trusting the automatic score.
import { parseBoxscore, brownsGame, fetchRoster, rosterCensus, missingPositions } from '../js/browns.js';
let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) pass++; else { fail++; console.log(`  FAIL ${n}\n    got  ${a}\n    want ${b}`); } };

const payload = { boxscore: { players: [
  { team: { abbreviation: "CLE" }, statistics: [
    { name: "passing", keys: ["C/ATT","YDS","TD","INT"], athletes: [
      { athlete: { id: "1" }, stats: ["22/34","249","2","1"] } ] },
    { name: "rushing", keys: ["CAR","YDS","TD"], athletes: [
      { athlete: { id: "2" }, stats: ["18","87","1"] },
      { athlete: { id: "1" }, stats: ["3","12","0"] } ] },
    { name: "receiving", keys: ["REC","YDS","TD"], athletes: [
      { athlete: { id: "3" }, stats: ["7","104","1"] } ] },
    { name: "kicking", keys: ["FG","PCT","XP","PTS"], athletes: [
      { athlete: { id: "4" }, stats: ["2/3","66.7","3/3","12"] } ] },
  ] },
  { team: { abbreviation: "JAX" }, statistics: [
    { name: "rushing", keys: ["CAR","YDS","TD"], athletes: [
      { athlete: { id: "99" }, stats: ["20","150","2"] } ] } ] },
] } };

const lines = parseBoxscore(payload, "CLE");
eq("the QB's passing line",      lines["1"], { completions: 22, passYards: 249, passTD: 2, rushYards: 12 });
eq("the RB's rushing line",      lines["2"], { rushYards: 87, rushTD: 1 });
eq("the WR's receiving line",    lines["3"], { receptions: 7, recYards: 104, recTD: 1 });
eq("the kicker: made, not attempted", lines["4"], { fg: 2, pat: 3 });
eq("the other team is excluded", lines["99"], undefined);
eq("a zero is not recorded",     "0" in (lines["1"] || {}), false);
eq("nothing in, nothing out",    parseBoxscore({}, "CLE"), {});
eq("a shape we do not know",     parseBoxscore({ boxscore: { players: [{ team: {}, statistics: [{}] }] } }), {});

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
