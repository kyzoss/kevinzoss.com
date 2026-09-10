// espn.js / odds.js parse correctly, including the road-favourite case that used
// to come through backwards.
globalThis.window = {};
const espnSrc = await import("/home/user/kevinzoss.com/nfl/js/espn.js");
const { abbrFromFull } = await import("/home/user/kevinzoss.com/nfl/js/teams.js");
let pass = 0, fail = 0;
const eq = (n, got, want) => { JSON.stringify(got) === JSON.stringify(want) ? pass++
  : (fail++, console.log(`  FAIL ${n}\n    got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`)); };

// espn.js does not export parseSpread, so exercise it through a fake payload
const evt = (homeAbbr, awayAbbr, odds, state = "pre") => ({
  id: "1", date: "2026-09-13T17:00:00Z",
  competitions: [{ date: "2026-09-13T17:00:00Z", odds: odds ? [odds] : undefined,
    competitors: [
      { homeAway: "home", team: { abbreviation: homeAbbr }, score: "0", records: [{ summary: "0-0" }] },
      { homeAway: "away", team: { abbreviation: awayAbbr }, score: "0", records: [{ summary: "0-0" }] },
    ] }],
  status: { type: { state, completed: state === "post" } },
});
const spreadOf = async (homeAbbr, awayAbbr, odds) => {
  // reach the module's normaliser via fetchWeek with a stubbed fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ events: [evt(homeAbbr, awayAbbr, odds)] }) });
  const [g] = await espnSrc.fetchWeek(2026, 1);
  return g.spread;
};
console.log("— espn spreads");
eq("home favourite from details", await spreadOf("KC","LV",{ details:"KC -3.5", spread:-3.5 }), -3.5);
eq("ROAD favourite from details", await spreadOf("LV","KC",{ details:"KC -3.5", spread:-3.5 }), 3.5);
eq("pick'em",                     await spreadOf("KC","LV",{ details:"EVEN", spread:0 }), 0);
eq("no details, home flagged",    await spreadOf("KC","LV",{ spread:-6, homeTeamOdds:{favorite:true} }), -6);
eq("no details, away flagged",    await spreadOf("KC","LV",{ spread:-6, awayTeamOdds:{favorite:true} }), 6);
eq("favourite unknown -> no line",await spreadOf("KC","LV",{ spread:-6 }), null);
eq("no odds at all",              await spreadOf("KC","LV", null), null);
eq("abbr remap WAS->WSH",         await spreadOf("WAS","LA",{ details:"WAS -3", spread:-3 }), -3);

console.log("— team name resolution");
eq("full name",      abbrFromFull("Kansas City Chiefs"), "KC");
eq("commanders",     abbrFromFull("Washington Commanders"), "WSH");
eq("rams vs chargers", [abbrFromFull("Los Angeles Rams"), abbrFromFull("Los Angeles Chargers")], ["LAR","LAC"]);
eq("giants vs jets", [abbrFromFull("New York Giants"), abbrFromFull("New York Jets")], ["NYG","NYJ"]);
eq("49ers",          abbrFromFull("San Francisco 49ers"), "SF");
eq("unknown",        abbrFromFull("Toronto Huskies"), null);
eq("all 32 resolve", (() => {
  const names = ["Arizona Cardinals","Atlanta Falcons","Baltimore Ravens","Buffalo Bills","Carolina Panthers",
    "Chicago Bears","Cincinnati Bengals","Cleveland Browns","Dallas Cowboys","Denver Broncos","Detroit Lions",
    "Green Bay Packers","Houston Texans","Indianapolis Colts","Jacksonville Jaguars","Kansas City Chiefs",
    "Las Vegas Raiders","Los Angeles Chargers","Los Angeles Rams","Miami Dolphins","Minnesota Vikings",
    "New England Patriots","New Orleans Saints","New York Giants","New York Jets","Philadelphia Eagles",
    "Pittsburgh Steelers","San Francisco 49ers","Seattle Seahawks","Tampa Bay Buccaneers","Tennessee Titans",
    "Washington Commanders"];
  const got = names.map(abbrFromFull);
  return got.filter(Boolean).length === 32 && new Set(got).size === 32;
})(), true);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
