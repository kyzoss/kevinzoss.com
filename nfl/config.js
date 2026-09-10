// Pool configuration. Edit this file, commit, done.
// NOTE: everything here ships to the browser. The Odds API key and the Supabase
// anon key are both client-side keys by design, but anyone who reads this file
// can use them, so keep the repo private or rotate the odds key if it gets abused.
window.POOL_CONFIG = {
  poolName: "The Pool",
  season: 2026,
  // The Tuesday before Week 1's Thursday kickoff. Sets the default week, and
  // the day each week's lines freeze.
  week1Tuesday: "2026-09-08",
  weeks: 18,
  // How often an app that is left open re-checks for a new build, in minutes.
  // Nobody in this pool should ever have to hard-refresh; the app updates
  // itself on resume and on this timer.
  buildCheckMinutes: 10,

  // The pool's clock. Every deadline below is this zone's wall clock, so a phone
  // in another timezone still locks at the same instant as everyone else.
  timeZone: "America/Los_Angeles",
  // Lines auto-lock at this hour on that week's Tuesday. Pull the fresh numbers
  // Tuesday morning; from noon everyone plays the same line.
  lineLockHour: 12,
  // One deadline for picks and changes: 10:00 Pacific on that week's Sunday,
  // which is five days after the week's Tuesday. A game that kicks off before
  // then (Thursday, Saturday) locks at its own kickoff instead -- whichever
  // comes first.
  pickCutoff: { daysAfterTuesday: 5, hour: 10 },

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

  // Scoring. Picks are straight up -- a win is 1 point, and a tie counts as a
  // loss, so nothing pays a half. The spread is pulled only to decide which
  // dogs are dup-eligible; it never grades a pick.
  dup: {
    minSpread: 4.5,     // underdogs getting at least this many points are dup-eligible
    exclude: ["CLE"],   // the Browns can never be a dup
    win: 1.5,           // your dup wins outright
    loss: 0,            // your dup loses (a tie counts here too)
  },

  // Money.
  weeklyPot: 4,      // best ATS score of the week takes it; ties roll it over
  // Last man standing: everyone puts in this much EVERY week, in or out. Getting
  // knocked out stops you winning, it does not stop you paying -- that dead money
  // is what the survivors are playing for.
  lmsPerPlayer: 1,
  lmsRoundWeeks: 4,  // rounds are fixed 4-week blocks; survivors split the pot at the end of each
  // Everyone puts in this much on the Browns' final record; one guess each.
  // One guess each. Losses are worked out as gamesInSeason - wins, so nobody can
  // enter a record that does not add up.
  sideBet: { team: "CLE", label: "Browns Record", perPlayer: 10, gamesInSeason: 17 },

  // Brown of the week. Pick one Cleveland player each week and score their game.
  // Rounds work like LMS: fixed 4-week blocks, and a player you have used is
  // spent for the rest of that block. The pot pays every week, and ties split
  // it. Locks when the Browns kick off.
  brownOfWeek: {
    perPlayer: 1,        // each player puts in this much, every week
    roundWeeks: 4,       // how long a player stays spent
    positions: ["QB", "RB", "WR", "TE", "K"],
    // The scoring table. `per` divides the stat and floors it; `each` multiplies.
    scoring: {
      passYards: { per: 100, points: 1 },
      completions: { each: 1 },
      passTD: { each: 2 },
      pass2pt: { each: 2 },
      rushYards: { per: 5, points: 1 },
      rushTD: { each: 6 },
      rush2pt: { each: 2 },
      recYards: { per: 10, points: 1 },
      receptions: { each: 3 },
      recTD: { each: 6 },
      rec2pt: { each: 2 },
      pat: { each: 2 },
      fg: { each: 6 },
    },
  },

  // Lines come from The Odds API (the-odds-api.com). Schedule and scores come from ESPN.
  oddsApiKey: "155e00cf4d5fdc04569fc597c57a8e48",
  oddsBooks: ["draftkings", "fanduel", "betmgm", "caesars", "bovada"], // first one with a line wins

  // Optional shared board, so all four phones see the same picks.
  // Leave both blank to run on this device only (commissioner enters everyone's
  // picks, the way the spreadsheet worked). Setup for either is in README.md.

  // Free, and the Sheet doubles as a readable backup. Paste the Apps Script
  // web-app /exec URL here. Checked first if both are filled in.
  sheet: {
    url: "https://script.google.com/macros/s/AKfycbwg970ZaNogp-jFdjKnv9EfNKwQY2cILkZMZBq6qSiPLNIBjovYBtFAgQ_7XMU9z4J3/exec",
    pollSeconds: 15,   // how often to look for the others' picks
  },

  // Realtime, but the free tier allows two projects and pauses one after a
  // week idle.
  supabase: {
    url: "",
    anonKey: "",
  },
};
