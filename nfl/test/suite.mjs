import fs from "node:fs";
globalThis.window = {};
new Function("window", fs.readFileSync("/home/user/kevinzoss.com/nfl/config.js", "utf8"))(globalThis.window);
const cfg = globalThis.window.POOL_CONFIG;
const SC = await import("/home/user/kevinzoss.com/nfl/js/scoring.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.log(`  FAIL ${name}\n    got  ${g}\n    want ${w}`); }
};
const P = cfg.players.map(p => ({ ...p }));
const ids = P.map(p => p.id);
const g = (away, home, spread, as = null, hs = null, kick = "2026-09-13T17:00:00Z") =>
  ({ id: `${away}@${home}`, away, home, spread, awayScore: as, homeScore: hs,
     status: as == null ? "pre" : "post", kickoff: kick });
const blank = () => ({ players: P, weeks: {}, sideBet: { predictions: {}, actual: null }, adjustments: [] });

console.log("\n— grading");
// Straight up: the spread never grades a pick.
eq("home won",           SC.gradePick(g("A","B",-7,20,30), "home"), "win");
eq("away won",           SC.gradePick(g("A","B",-7,30,20), "away"), "win");
eq("picked the loser",   SC.gradePick(g("A","B",-7,30,20), "home"), "loss");
// the old ATS cases, now judged only on the scoreboard
eq("fav won but did not cover: still a win",
                         SC.gradePick(g("A","B",-7,20,25), "home"), "win");
eq("dog lost but covered: still a loss",
                         SC.gradePick(g("A","B",-7,20,25), "away"), "loss");
eq("landed on the number: won it",
                         SC.gradePick(g("A","B",-7,20,27), "home"), "win");
eq("tie is a loss, home", SC.gradePick(g("A","B",0,21,21), "home"), "loss");
eq("tie is a loss, away", SC.gradePick(g("A","B",0,21,21), "away"), "loss");
eq("no line still grades",SC.gradePick(g("A","B",null,20,30),"home"), "win");
eq("not final",          SC.gradePick(g("A","B",-7),        "home"), null);
eq("no pick",            SC.gradePick(g("A","B",-7,20,30),  null),  null);
eq("a win is one point", SC.pointsFor("win"), 1);
eq("a loss is nothing",  SC.pointsFor("loss"), 0);
eq("line text home fav", SC.lineText(g("A","B",-3.5)), "B -3.5");
eq("line text road fav", SC.lineText(g("A","B",3.5)),  "A -3.5");
eq("line text pk",       SC.lineText(g("A","B",0)),    "PK");
eq("su winner",          SC.straightUpWinner(g("A","B",-7,20,30)), "B");
eq("su tie",             SC.straightUpWinner(g("A","B",-7,21,21)), "tie");
eq("money fmt",  [SC.money(38.5), SC.money(-2), SC.money(0), SC.money(16)], ["$38.50","-$2","$0","$16"]);
  eq("side bet pot is a stake each", SC.sideBetPot({ players: P }, cfg), 40);

console.log("— dup pool");
{ // only two dogs clear 4.5, so pad up to one per player, keeping ties
  const st = blank();
  st.weeks[1] = { games: [
      g("CLE","BAL",-20), g("CHI","GB",-10), g("NO","TB",-14),
      g("SF","ARI",-4.5), g("MIA","NYJ",-1), g("DET","GB2",-2),
    ], picks: {}, lms: {}, dupPrefs: {} };
  const d = SC.resolveDups(st, cfg, 1);
  eq("Browns never eligible", d.candidates.some(c => c.team === "CLE"), false);
  eq("padded to four", d.candidates.map(c => c.team), ["NO","CHI","SF","DET"]);
}
{ // ranked-choice draft in standings order: 1 pick, 2 picks, 3, 4
  const st = blank();
  st.weeks[1] = { games: [g("NO","TB",-14), g("CHI","GB",-10), g("LAR","SEA",-6.5), g("SF","ARI",-4.5)],
    picks: {}, lms: {},
    dupPrefs: { az: ["CHI"], kz: ["CHI","SF"], jv: ["CHI","SF","LAR"], hz: ["CHI","NO","SF","LAR"] } };
  const d = SC.resolveDups(st, cfg, 1);
  eq("first choice honoured, rest cascade", d.assigned, { az:"CHI", kz:"SF", jv:"LAR", hz:"NO" });
  eq("only the allowed number of ranks count", d.prefs.az, ["CHI"]);
}
{ // dup scoring: +1.5 / 0
  const st = blank();
  st.weeks[1] = { games: [g("CHI","GB",-10,24,22), g("LAR","SEA",-6.5,10,30)],
    picks: Object.fromEntries(ids.map(id => [id, { "CHI@GB":"home", "LAR@SEA":"home" }])), lms: {},
    dupPrefs: { az: ["CHI"], kz: ["LAR"] } };
  const t = SC.weekTally(st, 1, cfg);
  eq("dup cover = +1.5, plus SEA cover",  t.az.points, 2.5);
  eq("dup miss = 0, plus GB miss",        t.kz.points, 0);
  eq("no dup: GB miss + SEA cover",       t.jv.points, 1);
  eq("dup overrides the stored pick",     t.az.sides["CHI@GB"], "away");
}


console.log("— dup draft order rotates weekly");
{
  const st = blank();
  eq("week 1 uses the configured base", SC.dupOrder(st, cfg, 1), ["az","kz","jv","hz"]);
  eq("week 2: first picker drops to last", SC.dupOrder(st, cfg, 2), ["kz","jv","hz","az"]);
  eq("week 3", SC.dupOrder(st, cfg, 3), ["jv","hz","az","kz"]);
  eq("week 4", SC.dupOrder(st, cfg, 4), ["hz","az","kz","jv"]);
  eq("week 5 comes back around", SC.dupOrder(st, cfg, 5), ["az","kz","jv","hz"]);
  eq("week 18 lands where it should", SC.dupOrder(st, cfg, 18), ["kz","jv","hz","az"]);
  // everyone picks first the same number of times over 16 weeks
  const firsts = {};
  for (let w = 1; w <= 16; w++) { const f = SC.dupOrder(st, cfg, w)[0]; firsts[f] = (firsts[f] || 0) + 1; }
  eq("first pick shared evenly", firsts, { az:4, kz:4, jv:4, hz:4 });
  // the rotation is the whole rule now -- nothing overrides a week
  st.weeks[3] = { games: [], picks: {}, lms: {}, dupPrefs: {}, dupOrder: ["hz","jv","kz","az"] };
  eq("stale override ignored", SC.dupOrder(st, cfg, 3), ["jv","hz","az","kz"]);
  // results must not feed back into the order
  const st2 = blank();
  st2.weeks[1] = { games: [g("A","B",-7,20,30)], picks: { hz: {"A@B":"home"} }, lms: {}, dupPrefs: {} };
  eq("standings do not change the order", SC.dupOrder(st2, cfg, 2), ["kz","jv","hz","az"]);
  // and the rotating order actually drives who gets which dup
  const st3 = blank();
  const dogs = [g("NO","TB",-14), g("CHI","GB",-10), g("LAR","SEA",-6.5), g("SF","ARI",-4.5)];
  const wantAll = { az:["NO"], kz:["NO","CHI"], jv:["NO","CHI","LAR"], hz:["NO","CHI","LAR","SF"] };
  st3.weeks[1] = { games: dogs, picks: {}, lms: {}, dupPrefs: wantAll };
  eq("wk1: az picks first, gets NO", SC.resolveDups(st3, cfg, 1).assigned.az, "NO");
  st3.weeks[2] = { games: dogs, picks: {}, lms: {}, dupPrefs: wantAll };
  const d2 = SC.resolveDups(st3, cfg, 2);
  eq("wk2: kz picks first, gets NO", d2.assigned.kz, "NO");
  eq("wk2: az now picks last",       d2.order.at(-1), "az");
}


console.log("- the dup draft closes with the picks, not at the first kickoff");
{
  const st = blank();
  // a Thursday dog and a Sunday dog, both eligible
  const thu = g("ARI", "LAC", -9.5, null, null, "2026-09-11T00:15:00Z");
  const sun = g("NO", "TB", -7, null, null, "2026-09-13T17:00:00Z");
  st.weeks[1] = { games: [thu, sun], picks: {}, lms: {}, dupPrefs: { az: ["ARI"] } };
  const d = SC.resolveDups(st, cfg, 1);
  eq("draft closes at the pick cutoff", d.lockAt, SC.pickCutoffAt(1, cfg));
  eq("not at the first kickoff", d.lockAt === Date.parse("2026-09-11T00:15:00Z"), false);
  // Friday: the draft is open, but the Thursday dog is beyond ranking
  const fri = Date.parse("2026-09-11T18:00:00Z");
  eq("draft still open on Friday", fri < d.lockAt, true);
  eq("a dog that already kicked off cannot be ranked", SC.pickLocked(thu, 1, cfg, fri), true);
  eq("a dog still to play can be", SC.pickLocked(sun, 1, cfg, fri), false);
  // Sunday 10:01: everything shut
  const after = SC.pickCutoffAt(1, cfg) + 60000;
  eq("draft shut after the cutoff", after >= d.lockAt, true);
  eq("and so is the Sunday dog", SC.pickLocked(sun, 1, cfg, after), true);
}

console.log("- a drafted dog cannot fall out of the pool when the lines move");
{
  // Howard drafted SF at +3.5, in only because the pool was padded to four.
  // Another game's line then reached 4.5, no padding was needed, and SF left
  // the pool -- moving his dup to his next choice AFTER SF had played and won.
  const dogs = (extra) => [g("ARI","LAC",-9.5), g("NO","TB",-7), g("WSH","PHI",-5.5),
    g("SF","LAR",-3.5, 24, 17), g("TB","CIN",-3.5), g("IND","MIA",-3.5),
    ...(extra ? [g("DAL","NYG",-6)] : [])];
  const prefs = { az:["TB"], kz:["IND"], jv:["ARI"], hz:["SF","WSH","NO","ARI"] };
  const st = (games) => { const b = blank(); b.weeks[1] = { games, picks:{}, lms:{}, dupPrefs: prefs }; return b; };

  eq("padding put SF in the pool when he drafted",
     SC.dupCandidates(dogs(false), cfg, 4).some((d) => d.team === "SF"), true);
  eq("a fourth qualifying dog removes the need to pad",
     SC.dupCandidates(dogs(true), cfg, 4).some((d) => d.team === "SF"), false);
  eq("but a ranked dog is kept anyway",
     SC.dupCandidates(dogs(true), cfg, 4, new Set(["SF"])).some((d) => d.team === "SF"), true);

  eq("so the dup does not move when the lines do", SC.resolveDups(st(dogs(true)), cfg, 1).assigned.hz, "SF");
  eq("and it was his before too",                  SC.resolveDups(st(dogs(false)), cfg, 1).assigned.hz, "SF");
  const t = SC.weekTally(st(dogs(true)), 1, cfg);
  eq("SF won, so it grades as a dup win", t.hz.dupGrade, "win");
  eq("worth 1.5, not 1",                  t.hz.points, cfg.dup.win);
}

console.log("- a dup is locked in the moment the draft hands it over");
{
  const st = blank();
  const dogs = [g("NO","TB",-14), g("CHI","GB",-10), g("LAR","SEA",-6.5), g("SF","ARI",-4.5)];
  // Jim has ranked nothing, so the old rule left Howard's dup "provisional"
  // and unmarked -- one person not getting round to it made the whole table
  // look unsettled.
  st.weeks[1] = { games: dogs, picks: {}, lms: {},
    dupPrefs: { az: ["NO"], kz: ["CHI"], jv: [], hz: ["LAR","SF","CHI","NO"] } };
  const d = SC.resolveDups(st, cfg, 1);
  eq("everyone who got one holds it", d.assigned, { az:"NO", kz:"CHI", hz:"LAR" });
  eq("and every one of them is locked in",
     Object.keys(d.assigned).map((pid) => d.secured[d.assigned[pid]]), [true, true, true]);
  eq("nothing unassigned is marked", d.secured["SF"], undefined);
  // it can still move if somebody above ranks that dog later: the draft working
  st.weeks[1].dupPrefs.jv = ["LAR"];
  const d2 = SC.resolveDups(st, cfg, 1);
  eq("a later ranking above you takes it", d2.assigned.jv, "LAR");
  eq("and you fall to your next choice", d2.assigned.hz, "SF");
  eq("both still read as locked in", [d2.secured["LAR"], d2.secured["SF"]], [true, true]);
}

console.log("- dups are exclusive: nobody else may take a drafted dog");
{
  const st = blank();
  const dogs = [g("NO","TB",-14,3,30), g("CHI","GB",-10,24,22), g("LAR","SEA",-6.5,10,30), g("SF","ARI",-4.5,20,24)];
  st.weeks[1] = { games: dogs, picks: {}, lms: {},
    dupPrefs: { az:["NO"], kz:["NO","CHI"], jv:["NO","CHI","LAR"], hz:["NO","CHI","LAR","SF"] } };
  const d = SC.resolveDups(st, cfg, 1);
  eq("draft cascades", d.assigned, { az:"NO", kz:"CHI", jv:"LAR", hz:"SF" });
  eq("reverse map built", d.byOwner, { NO:"az", CHI:"kz", LAR:"jv", SF:"hz" });

  const t = SC.weekTally(st, 1, cfg);
  // kz owns CHI; the other three dogs belong to someone else, so he is on their favourites
  eq("own dup is the dog",        [t.kz.sides["CHI@GB"], t.kz.sources["CHI@GB"]], ["away","dup"]);
  eq("someone else's dup locks",  [t.kz.sides["NO@TB"],  t.kz.sources["NO@TB"]],  ["home","locked"]);
  eq("every dupped game is set",  Object.keys(t.kz.sides).length, 4);
  eq("all four sources",          dogs.map((x) => t.kz.sources[x.id]), ["locked","dup","locked","locked"]);
  // and the owner of each dog is alone on it
  eq("only az has NO",  [t.az.sides["NO@TB"], t.kz.sides["NO@TB"], t.jv.sides["NO@TB"], t.hz.sides["NO@TB"]],
                        ["away","home","home","home"]);
  eq("only hz has SF",  [t.hz.sides["SF@ARI"], t.az.sides["SF@ARI"]], ["away","home"]);
  // straight up: TB won, CHI won as his dup, SEA won, and ARI won outright even
  // though it failed to cover as a 4.5 favourite -- the spread does not grade.
  eq("kz points", t.kz.points, 1 + 1.5 + 1 + 1);
}
{
  // a stored pick on somebody else's dup is overridden -- that team is off limits
  const st = blank();
  st.weeks[1] = { games: [g("NO","TB",-14,3,30), g("MIA","BUF",-3,20,30)], picks: { kz: { "NO@TB": "away", "MIA@BUF": "away" } },
    lms: {}, dupPrefs: { az:["NO"], kz:["NO"] } };
  const t = SC.weekTally(st, 1, cfg);
  eq("cannot keep a dog that was drafted", [t.kz.sides["NO@TB"], t.kz.sources["NO@TB"]], ["home","locked"]);
  eq("a pick on any other game stands",    [t.kz.sides["MIA@BUF"], t.kz.sources["MIA@BUF"]], ["away","pick"]);
}
{
  // a ranked dog nobody drafted still defaults to the favourite, and is overridable
  const st = blank();
  const games = [g("NO","TB",-14,3,30), g("CHI","GB",-10,24,22)];
  st.weeks[1] = { games, picks: {}, lms: {}, dupPrefs: { kz:["CHI"] } };   // kz picks first, gets CHI
  let t = SC.weekTally(st, 1, cfg);
  eq("kz got CHI", t.kz.dup, "CHI");
  eq("NO is undrafted, so nobody is locked", t.az.sides["NO@TB"], undefined);
  // now kz ranks NO too but az above him takes it
  st.weeks[1].dupPrefs = { az:["NO"], kz:["NO","CHI"] };
  t = SC.weekTally(st, 1, cfg);
  eq("kz falls to CHI", t.kz.dup, "CHI");
  eq("and is locked off NO", t.kz.sources["NO@TB"], "locked");
}

console.log("— weekly pot");
{
  const st = blank();
  const wk = (n, gs, picks) => { st.weeks[n] = { games: gs, picks, lms: {}, dupPrefs: {} }; };
  wk(1, [g("A","B",-7,20,30)], { az: {"A@B":"home"}, kz: {"A@B":"away"}, jv: {}, hz: {} });
  let led = SC.ledger(st, cfg);
  eq("outright winner takes the pot", led.weekly.rows[1].payouts, { az: 4 });
  wk(2, [g("C","D",-7,20,30)], { az: {"C@D":"home"}, kz: {"C@D":"home"}, jv: {}, hz: {} });
  led = SC.ledger(st, cfg);
  eq("tie rolls, nobody paid", led.weekly.rows[2].payouts, {});
  eq("tie flagged as rolled",  led.weekly.rows[2].rolled, true);
  wk(3, [g("E","F",-7,20,30)], { az: {"E@F":"home"}, kz: {}, jv: {}, hz: {} });
  led = SC.ledger(st, cfg);
  eq("rollover lands next settled week", led.weekly.rows[3].payouts, { az: 8 });
}
{ // the bug that hid every later week: an unloaded week must not stop the ledger
  const st = blank();
  st.weeks[1] = { games: [g("A","B",-7,20,30)], picks: { az: {"A@B":"home"} }, lms: {}, dupPrefs: {} };
  st.weeks[3] = { games: [g("C","D",-7,20,30)], picks: { kz: {"C@D":"home"} }, lms: {}, dupPrefs: {} };
  const led = SC.ledger(st, cfg);
  eq("week 1 settles",                led.weekly.rows[1].payouts, { az: 4 });
  eq("week 2 unloaded: nothing",      led.weekly.rows[2] && led.weekly.rows[2].payouts, {});
  eq("week 2 not marked in play",     led.weekly.rows[2].inPlay, false);
  eq("week 3 still settles",          led.weekly.rows[3].payouts, { kz: 4 });
  eq("unloaded week does not roll",   led.weekly.rows[3].carry, 0);
}

console.log("— last man standing");
{
  const st = blank();
  const wk = (n, gs, lms) => { st.weeks[n] = { games: gs, picks: {}, lms, dupPrefs: {} }; };
  // week 1: NO and CLE lose (safe); SEA and MIA win (busted)
  wk(1, [g("NO","TB",-14,3,30), g("CLE","BAL",-20,10,35), g("LAR","SEA",-6.5,10,30), g("MIA","NYJ",-1,20,17)],
     { az:"NO", kz:"CLE", jv:"SEA", hz:"MIA" });
  let led = SC.ledger(st, cfg);
  eq("pick a loser correctly = safe", led.lms.rows[1].results, { az:"safe", kz:"safe", jv:"busted", hz:"busted" });
  eq("nobody paid mid-round",         led.lms.rows[1].payouts, {});
  wk(2, [g("KC","DEN",3,30,20), g("NYG","DAL",-7,10,27)], { az:"KC", kz:"NYG", jv:"DAL", hz:"KC" });
  led = SC.ledger(st, cfg);
  eq("your team won, you're out",     led.lms.rows[2].results.az, "busted");
  eq("already eliminated stays out",  led.lms.rows[2].results.jv, "out");
  wk(3, [g("TEN","HOU",-6,10,20)], { kz:"TEN" });
  wk(4, [g("LV","LAC",-6,10,20)], { kz:"LV" });
  led = SC.ledger(st, cfg);
  eq("sole survivor takes the block", led.lms.rows[4].payouts, { kz: 16 });
  eq("round resets after week 4",     led.lms.rows[4].round, 1);
  eq("field re-enters for round 2",   led.lms.alive.sort(), [...ids].sort());
  // week 5 starts round 2 with a fresh $4
  wk(5, [g("X","Y",-3,10,20)], {});
  led = SC.ledger(st, cfg);
  eq("new round, fresh pot",  led.lms.rows[5].pot, 4);
  eq("new round number",      led.lms.rows[5].round, 2);
  eq("no pick = eliminated",  led.lms.rows[5].results.kz, "nopick");
  eq("all-forfeit week rolls instead of splitting", led.lms.rows[5].payouts, {});
  eq("and is flagged rolled", led.lms.rows[5].rolled, true);
}


console.log("— LMS stake is charged even when you're out");
{
  const st = blank();
  const wk = (n, gs, lms) => { st.weeks[n] = { games: gs, picks: {}, lms, dupPrefs: {} }; };
  eq("weekly LMS pot = $1 x players", SC.lmsWeekly(st, cfg), 4);
  // week 1 knocks out three of the four; only az survives
  wk(1, [g("NO","TB",-14,3,30), g("LAR","SEA",-6.5,10,30)],
     { az:"NO", kz:"SEA", jv:"SEA", hz:"SEA" });
  let led = SC.ledger(st, cfg);
  eq("three busted, one safe", led.lms.rows[1].results, { az:"safe", kz:"busted", jv:"busted", hz:"busted" });
  eq("pot after one week", led.lms.rows[1].pot, 4);
  // weeks 2 and 3: only az is alive, but the pot must still take $4 a week
  wk(2, [g("A","B",-3,10,20)], { az:"A" });
  wk(3, [g("C","D",-3,10,20)], { az:"C" });
  led = SC.ledger(st, cfg);
  eq("dead players keep paying (wk2)", led.lms.rows[2].pot, 8);
  eq("dead players keep paying (wk3)", led.lms.rows[3].pot, 12);
  eq("the eliminated are still out",   led.lms.rows[3].results.kz, "out");
  // week 4 closes the block: the lone survivor takes all four weeks of stakes
  wk(4, [g("E","F",-3,10,20)], { az:"E" });
  led = SC.ledger(st, cfg);
  eq("survivor takes 4 weeks x 4 players", led.lms.rows[4].payouts, { az: 16 });
  eq("survivor's LMS winnings",           led.totals.az.lmsWon, 16);
  // and the losers are down their four weeks of stakes even though they were out
  eq("eliminated player still down 4 wks", led.totals.kz.lmsWon, 0);
}
{ // a full 18-week season: every player is charged all 18 weeks regardless
  const st = blank();
  const led = SC.ledger(st, cfg);
  // Named one game at a time, because subtracting "everything else" from the
  // buy-in silently absorbed a new game the first time one was added.
  const stake = { weekly: 4 / 4 * 18, lms: 1 * 18, brown: 1 * 18, record: 10 };
  eq("weekly share",     stake.weekly, 18);
  eq("LMS share",        stake.lms, 18);
  eq("brown-of-week share", stake.brown, 18);
  eq("Browns-record share", stake.record, 10);
  eq("per-player buy-in is those four", led.totals.az.buyIn,
     stake.weekly + stake.lms + stake.brown + stake.record);
  eq("per-player buy-in", led.totals.az.buyIn, 64);
  eq("season pot",        led.seasonBuyIn, 256);
  eq("season pot is four players' worth", led.seasonBuyIn, 64 * 4);
}


console.log("— LMS: one team per four-week block");
{
  const st = blank();
  const wk = (n, gs, lms) => { st.weeks[n] = { games: gs, picks: {}, lms, dupPrefs: {} }; };
  // az picks NO in week 1 (NO loses -> safe)
  wk(1, [g("NO","TB",-14,3,30), g("CLE","BAL",-20,10,35)], { az:"NO", kz:"CLE", jv:"NO", hz:"CLE" });
  let led = SC.ledger(st, cfg);
  eq("week 1 all safe", led.lms.rows[1].results, { az:"safe", kz:"safe", jv:"safe", hz:"safe" });
  eq("nothing spent entering wk 1", led.lms.rows[1].used.az, []);
  eq("NO is spent for az after wk 1", SC.lmsUsed(st, cfg, 2, "az"), [{ team:"NO", week:1 }]);
  // week 2: az goes back to NO, which is no longer allowed
  wk(2, [g("NO","ATL",-10,7,28), g("CLE","CIN",-9,3,24)], { az:"NO", kz:"CLE", jv:"CLE", hz:"CLE" });
  led = SC.ledger(st, cfg);
  eq("repeat pick is void", led.lms.rows[2].results.az, "reused");
  eq("kz repeat is void too", led.lms.rows[2].results.kz, "reused");
  eq("a fresh team is fine", led.lms.rows[2].results.jv, "safe");   // CLE lost, and jv had used NO
  eq("wk 2 shows what was spent", led.lms.rows[2].used.az, ["NO"]);
  eq("both repeaters eliminated", led.lms.rows[2].eliminated.sort(), ["az","hz","kz"]);
  // the block turns over at week 5, so NO is available again
  wk(3, [g("A","B",-3,10,20)], { jv:"A" });
  wk(4, [g("C","D",-3,10,20)], { jv:"C" });
  eq("wk 4 still remembers the block", SC.lmsUsed(st, cfg, 4, "jv").map((u) => u.team), ["NO","CLE","A"]);
  eq("wk 5 starts clean", SC.lmsUsed(st, cfg, 5, "jv"), []);
  // an unsettled week does not spend the pick
  const st2 = blank();
  st2.weeks[1] = { games: [g("NO","TB",-14)], picks: {}, lms: { az:"NO" }, dupPrefs: {} };
  eq("in-progress week spends nothing", SC.lmsUsed(st2, cfg, 2, "az"), []);
}

console.log("— LMS: a team's own line");
{
  const home = g("NO","TB",-14);          // TB favoured by 14 at home
  eq("home favourite", SC.ownSpread(home, "TB"), -14);
  eq("road underdog",  SC.ownSpread(home, "NO"), 14);
  const road = g("KC","DEN",3);           // KC favoured by 3 on the road
  eq("road favourite", SC.ownSpread(road, "KC"), -3);
  eq("home underdog",  SC.ownSpread(road, "DEN"), 3);
  eq("no line", SC.ownSpread(g("A","B",null), "A"), null);
}

console.log("— lines lock on that week's Tuesday");
{
  const st = blank();
  const tue = (w) => SC.lineLockAt(w, cfg);
  // Deadlines are the pool's wall clock now, not the reader's, so read them in
  // that zone -- this suite runs in UTC and used to agree only by accident.
  const inZone = (ms, opts) => new Intl.DateTimeFormat("en-US", { timeZone: cfg.timeZone, ...opts }).format(new Date(ms));
  const parts = (w) => ({
    month: +inZone(tue(w), { month: "numeric" }),
    day: +inZone(tue(w), { day: "numeric" }),
    hour: +inZone(tue(w), { hour: "numeric", hour12: false }),
    weekday: inZone(tue(w), { weekday: "short" }),
  });
  // End of Wednesday, not noon Tuesday: by Wednesday night every game has a
  // number, and a game still unlined when the lock falls never becomes one.
  eq("week 1 locks the night of the Wednesday after its Tuesday",
     [parts(1).month, parts(1).day, parts(1).hour], [9, 9, 23]);
  eq("every lock is a Wednesday", [1, 2, 9, 18].map((w) => parts(w).weekday), ["Wed", "Wed", "Wed", "Wed"]);
  eq("11pm Pacific whatever the season", [1, 9, 18].map((w) => parts(w).hour), [23, 23, 23]);
  eq("and it is the day after the week's Tuesday",
     (tue(2) - tue(1)) / 86400000, 7);

  // and the new pick deadline: 10:00 Pacific each Sunday, kickoff if sooner
  const cut = (w) => SC.pickCutoffAt(w, cfg);
  const cutIn = (w, o) => new Intl.DateTimeFormat("en-US", { timeZone: cfg.timeZone, ...o }).format(new Date(cut(w)));
  eq("cutoff is Sunday", [1, 9, 18].map((w) => cutIn(w, { weekday: "short" })), ["Sun", "Sun", "Sun"]);
  eq("cutoff is 10:00 Pacific, DST or not",
     [1, 9, 18].map((w) => +cutIn(w, { hour: "numeric", hour12: false })), [10, 10, 10]);
  // Tuesday 00:00 -> Wednesday 23:59 is 47h59m; the cutoff is the Sunday at 10.
  eq("the lock is the Wednesday night", (tue(1) - SC.pickCutoffAt(1, cfg)) / 3600000 < 0, true);
  eq("picks close after the lines do", cut(1) > tue(1), true);
  {
    const snf = g("A", "B", -3, null, null, "2026-09-14T00:20:00Z");
    const thu = g("C", "D", -3, null, null, "2026-09-11T00:15:00Z");
    eq("before the cutoff, a late game is open", SC.pickLocked(snf, 1, cfg, cut(1) - 60000), false);
    eq("at the cutoff, it is shut",              SC.pickLocked(snf, 1, cfg, cut(1)), true);
    eq("a Thursday game shuts at its own kickoff, not the cutoff",
       SC.pickLocked(thu, 1, cfg, Date.parse("2026-09-12T18:00:00Z")), true);
  }
  eq("a week later each time", (tue(2) - tue(1)) / 86400000, 7);
  eq("before noon Tuesday: open", SC.linesLocked(st, 1, cfg, tue(1) - 1000), false);
  eq("from noon Tuesday: locked",  SC.linesLocked(st, 1, cfg, tue(1)), true);
  st.weeks[1] = { games: [], picks: {}, lms: {}, dupPrefs: {}, linesLocked: true };
  eq("commissioner can lock early", SC.linesLocked(st, 1, cfg, tue(1) - 86400000), true);
  st.weeks[1].linesLocked = false;
  eq("and can reopen after", SC.linesLocked(st, 1, cfg, tue(1) + 86400000), false);
}

console.log("— dup order has no per-week override any more");
{
  const st = blank();
  st.weeks[3] = { games: [], picks: {}, lms: {}, dupPrefs: {}, dupOrder: ["hz","jv","kz","az"] };
  eq("stale override is ignored", SC.dupOrder(st, cfg, 3), ["jv","hz","az","kz"]);
}


console.log("- LMS: a forfeit never shares, and an all-forfeit week rolls over");
{
  const st = blank();
  const wk = (n, gs, lms) => { st.weeks[n] = { games: gs, picks: {}, lms, dupPrefs: {} }; };
  // wk1: az and kz pick teams that WIN (so they bust); jv and hz do not pick at all
  wk(1, [g("KC","DEN",-3,30,20), g("BUF","MIA",-3,27,17)], { az:"KC", kz:"BUF" });
  let led = SC.ledger(st, cfg);
  eq("pickers busted",        [led.lms.rows[1].results.az, led.lms.rows[1].results.kz], ["busted","busted"]);
  eq("non-pickers forfeited", [led.lms.rows[1].results.jv, led.lms.rows[1].results.hz], ["nopick","nopick"]);
  eq("only the pickers split it", led.lms.rows[1].payouts, { az: 2, kz: 2 });
  eq("forfeits got nothing",      [led.lms.rows[1].payouts.jv, led.lms.rows[1].payouts.hz], [undefined, undefined]);

  // wk2: nobody picks at all, so nothing is settled and the pot rolls
  wk(2, [g("A","B",-3,10,20)], {});
  led = SC.ledger(st, cfg);
  eq("all-forfeit week pays nobody", led.lms.rows[2].payouts, {});
  eq("and is flagged as rolled",     led.lms.rows[2].rolled, true);
  eq("nobody is knocked out",        led.lms.rows[2].eliminated, []);
  eq("field is intact",              led.lms.rows[2].aliveEntering.length, 4);

  // wk3: one real pick loses, so that player survives on the carried pot
  wk(3, [g("C","D",-3,10,20)], { jv:"C" });
  led = SC.ledger(st, cfg);
  eq("survivor carries on",    led.lms.rows[3].results.jv, "safe");
  eq("nothing paid mid-block", led.lms.rows[3].payouts, {});
  eq("wk2's rolled pot carried", led.lms.rows[3].pot, 8);   // wk1 paid out, wk2 rolled
  wk(4, [g("E","F",-3,10,20)], { jv:"E" });
  led = SC.ledger(st, cfg);
  eq("survivor takes the carried pot", led.lms.rows[4].payouts, { jv: 12 });
}

console.log("- LMS: an unresolved pick does not spend the team");
{
  const st = blank();
  st.weeks[1] = { games: [g("KC","DEN",-3,20,30)], picks: {}, lms: { az:"CAR", kz:"KC" }, dupPrefs: {} };
  const led = SC.ledger(st, cfg);
  eq("pick that was not playing", led.lms.rows[1].results.az, "nogame");
  eq("so it is not spent",        SC.lmsUsed(st, cfg, 2, "az"), []);
  eq("a resolved pick is spent",  SC.lmsUsed(st, cfg, 2, "kz").map((u) => u.team), ["KC"]);
}

console.log("— brown of the week");
{
  // the table from the pool's own scoring sheet
  eq("QB: 249 yds, 22 comp, 2 TD, 1 two-pointer",
     SC.scoreBrownLine({ passYards: 249, completions: 22, passTD: 2, pass2pt: 1 }, cfg).total, 2 + 22 + 4 + 2);
  eq("RB: 87 yds and a score",   SC.scoreBrownLine({ rushYards: 87, rushTD: 1 }, cfg).total, 17 + 6);
  eq("WR: 104 yds, 7 rec, a TD", SC.scoreBrownLine({ recYards: 104, receptions: 7, recTD: 1 }, cfg).total, 10 + 21 + 6);
  eq("K: 3 PAT and 2 field goals", SC.scoreBrownLine({ pat: 3, fg: 2 }, cfg).total, 6 + 12);
  eq("per-unit stats floor, they do not round", SC.scoreBrownLine({ passYards: 149 }, cfg).total, 1);
  eq("under one unit scores nothing", SC.scoreBrownLine({ rushYards: 4 }, cfg).total, 0);
  eq("a stat the feed omitted is a zero, not a crash", SC.scoreBrownLine({}, cfg).total, 0);
  eq("an unknown stat is ignored", SC.scoreBrownLine({ tackles: 9 }, cfg).total, 0);

  // rounds behave like LMS: four weeks, then everyone is available again
  eq("weeks 1-4 are round 1", [1, 4].map((w) => SC.brownRound(w, cfg).round), [1, 1]);
  eq("week 5 starts round 2", SC.brownRound(5, cfg).round, 2);

  const st = blank();
  st.weeks[1] = { games: [], picks: {}, lms: {}, brown: { kz: "chubb" }, brownStats: { chubb: { rushTD: 1 } } };
  st.weeks[2] = { games: [], picks: {}, lms: {}, brown: { kz: "cooper" }, brownStats: { cooper: { receptions: 2 } } };
  st.weeks[3] = { games: [], picks: {}, lms: {}, brown: { kz: "njoku" } };   // never scored
  eq("a scored week spends the player", SC.brownUsed(st, cfg, 3, "kz").map((u) => u.id), ["chubb", "cooper"]);
  eq("an unscored week does not", SC.brownUsed(st, cfg, 4, "kz").map((u) => u.id), ["chubb", "cooper"]);
  eq("the round reset clears them", SC.brownUsed(st, cfg, 5, "kz").length, 0);

  // the pot pays weekly and a tie splits it -- nothing rolls over
  const t = blank();
  t.weeks[1] = { games: [], picks: {}, lms: {},
    brown: { kz: "chubb", az: "chubb", jv: "cooper", hz: "cooper" },
    brownStats: { chubb: { rushYards: 87, rushTD: 1 }, cooper: { recYards: 50, receptions: 4 } } };
  const bow = SC.brownOfWeek(t, cfg);
  eq("the pot is everyone's dollar", bow.rows[1].pot, cfg.brownOfWeek.perPlayer * 4);
  eq("best score wins", bow.rows[1].best, 23);
  eq("both on the winner split it", bow.rows[1].payouts, { az: 2, kz: 2 });
  const all = blank();
  all.weeks[1] = { games: [], picks: {}, lms: {},
    brown: { kz: "x", az: "x", jv: "x", hz: "x" }, brownStats: { x: { rushTD: 1 } } };
  eq("all four on one man get their dollar back",
     SC.brownOfWeek(all, cfg).rows[1].payouts, { az: 1, kz: 1, jv: 1, hz: 1 });
  const none = blank();
  none.weeks[1] = { games: [], picks: {}, lms: {}, brown: { kz: "x" }, brownStats: {} };
  eq("an unscored week pays nobody", SC.brownOfWeek(none, cfg).rows[1].payouts, {});
  eq("and is not settled", SC.brownOfWeek(none, cfg).rows[1].settled, false);

  // and it reaches the money
  const led = SC.ledger(t, cfg);
  eq("winnings land in the ledger", led.totals.kz.brownWon, 2);
  eq("the stake is in the buy-in",
     led.totals.kz.buyIn, 4 / 4 * cfg.weeks + 1 * cfg.weeks + 1 * cfg.weeks + 10);
}

console.log("— side bet");
{
  const st = blank();
  st.sideBet.predictions = { az:{wins:8,losses:9,points:372}, kz:{wins:9,losses:8,points:384},
                             jv:{wins:10,losses:7,points:418}, hz:{wins:7,losses:10,points:385} };
  st.sideBet.actual = { w: 9, l: 8, t: 0, pf: 390 };
  const bet = SC.sideBet(st, cfg);
  eq("closest record wins", bet.winners, ["kz"]);
  eq("winner takes the whole pot", bet.payouts, { kz: 40 });
  st.sideBet.predictions.hz = { wins: 9, losses: 8, points: 391 }; // tie on wins, closer on points
  const bet2 = SC.sideBet(st, cfg);
  eq("points scored breaks the tie", bet2.winners, ["hz"]);
}
{ // actual record derived from finals as they land
  const st = blank();
  st.weeks[1] = { games: [g("CLE","BAL",-20,10,35)], picks: {}, lms: {}, dupPrefs: {} };
  st.weeks[2] = { games: [g("CIN","CLE",-3,17,24)], picks: {}, lms: {}, dupPrefs: {} };
  eq("Browns record from results", SC.teamActual(st, cfg, "CLE"), { w:1, l:1, t:0, pf:34, played:2 });
}

console.log("— ledger totals");
{
  const st = blank();
  st.weeks[1] = { games: [g("A","B",-7,20,30)], picks: { az:{"A@B":"home"} }, lms: { az:"A" }, dupPrefs: {} };
  st.adjustments = [{ id:"a1", player:"kz", amount:-5, note:"side action" }];
  const led = SC.ledger(st, cfg);
  eq("buy-in per player", led.totals.az.buyIn, 64);
  eq("season pot",        led.seasonBuyIn, 256);
  eq("adjustment counts", led.totals.kz.won, -5);
  eq("net = won - in",    led.totals.az.net, led.totals.az.won - 64);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
