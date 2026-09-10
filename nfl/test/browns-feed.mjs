// Tests the box-score MAPPING, not ESPN. The payload below is hand-built to
// ESPN's documented summary shape; if the real one differs the mapping will be
// wrong in production and these will still pass, which is exactly why the app
// also lets the commissioner enter a line by hand. Verify against one real
// game before trusting the automatic score.
import { parseBoxscore, brownsGame } from '../js/browns.js';
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

const st = { weeks: { 1: { games: [
  { id: "NE@SEA", home: "SEA", away: "NE" }, { id: "CLE@JAX", home: "JAX", away: "CLE", espnId: "401" } ] } } };
eq("finds the Browns' game",  brownsGame(st, 1)?.id, "CLE@JAX");
eq("no game that week",       brownsGame(st, 2), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
