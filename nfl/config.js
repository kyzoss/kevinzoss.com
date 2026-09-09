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

  // Who drafts dups first in week 1. After that the order rotates a seat a week:
  // first picker drops to last, everyone else moves up.
  dupOrderBase: ["az", "kz", "jv", "hz"],

  // Scoring. A straight pick is 1 for a cover, 0.5 for a push.
  dup: {
    minSpread: 4.5,     // underdogs getting at least this many points are dup-eligible
    exclude: ["CLE"],   // the Browns can never be a dup
    win: 1.5,           // your dup covers
    loss: 0,            // your dup gets covered on
  },

  // Money.
  weeklyPot: 4,      // best ATS score of the week takes it; ties roll it over
  // Last man standing: everyone puts in this much EVERY week, in or out. Getting
  // knocked out stops you winning, it does not stop you paying -- that dead money
  // is what the survivors are playing for.
  lmsPerPlayer: 1,
  lmsRoundWeeks: 4,  // rounds are fixed 4-week blocks; survivors split the pot at the end of each
  sideBet: { team: "CLE", label: "Browns Record", pot: 10 },

  // Lines come from The Odds API (the-odds-api.com). Schedule and scores come from ESPN.
  oddsApiKey: "155e00cf4d5fdc04569fc597c57a8e48",
  oddsBooks: ["draftkings", "fanduel", "betmgm", "caesars", "bovada"], // first one with a line wins

  // Optional shared board, so all four phones see the same picks.
  // Leave both blank to run on this device only (commissioner enters everyone's
  // picks, the way the spreadsheet worked). Setup for either is in README.md.

  // Free, and the Sheet doubles as a readable backup. Paste the Apps Script
  // web-app /exec URL here. Checked first if both are filled in.
  sheet: {
    url: "",
    pollSeconds: 15,   // how often to look for the others' picks
  },

  // Realtime, but the free tier allows two projects and pauses one after a
  // week idle.
  supabase: {
    url: "",
    anonKey: "",
  },
};
