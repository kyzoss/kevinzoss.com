// Pool configuration. Edit this file, commit, done.
// NOTE: everything here ships to the browser. The Odds API key and the Supabase
// anon key are both client-side keys by design, but anyone who reads this file
// can use them, so keep the repo private or rotate the odds key if it gets abused.
window.POOL_CONFIG = {
  poolName: "The Pool",
  season: 2026,
  // The Tuesday before Week 1's Thursday kickoff. Used to pick the default week.
  week1Tuesday: "2026-09-08",
  weeks: 18,

  // The four regulars. `id` is the column key that used to live in the sheet.
  players: [
    { id: "az", name: "Andrew", short: "AZ", color: "#4CC9F0" },
    { id: "kz", name: "Kevin",  short: "KZ", color: "#FF9F1C" },
    { id: "jv", name: "Jim",    short: "JV", color: "#B388FF" },
    { id: "hz", name: "Howard", short: "HZ", color: "#A3E635" },
  ],
  // Who gets the commissioner tools (pull lines, edit spreads/scores, draft order, adjustments).
  commissioner: "kz",

  // Scoring. A straight pick is 1 for a cover, 0.5 for a push.
  dup: {
    minSpread: 4.5,     // underdogs getting at least this many points are dup-eligible
    exclude: ["CLE"],   // the Browns can never be a dup
    win: 2,             // your dup covers
    loss: -1,           // your dup gets covered on
  },

  // Money. Pots are per week, split evenly across players for the buy-in.
  weeklyPot: 4,      // best ATS score of the week takes it; ties roll it over
  lmsPot: 4,         // last man standing (pick a team to LOSE); pot grows each week of a round
  lmsRoundWeeks: 4,  // rounds are fixed 4-week blocks; survivors split the pot at the end of each
  sideBet: { team: "CLE", label: "Browns Record", pot: 10 },

  // Lines come from The Odds API (the-odds-api.com). Schedule and scores come from ESPN.
  oddsApiKey: "155e00cf4d5fdc04569fc597c57a8e48",
  oddsBooks: ["draftkings", "fanduel", "betmgm", "caesars", "bovada"], // first one with a line wins

  // Optional shared backend so all four phones see the same board.
  // Leave blank to run on this device only (commissioner enters picks, like the sheet).
  supabase: {
    url: "",
    anonKey: "",
  },
};
