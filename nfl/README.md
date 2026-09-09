# Pick'em

The pool that used to live in a spreadsheet: four players, eighteen weeks, picks
against the spread, dups, a weekly pot, last man standing and the Browns bet.

Static app, no build step. Open `index.html` over any web server and it runs.

## Where it lives

- **Now:** it deploys with the rest of kevinzoss.com, so it is live at
  `https://kevinzoss.com/nfl/` as soon as this folder is on `main`.
- **nfl.kevinzoss.com:** GitHub Pages allows one custom domain per repository, and
  this repo's is `kevinzoss.com`. Two ways to give the pool its own subdomain:

  1. **Vercel (5 minutes).** Import this repo, set *Root Directory* to `nfl`,
     framework "Other", no build command. Add `nfl.kevinzoss.com` in the project
     domains and create the CNAME it asks for at your DNS host. Every push to
     `main` redeploys.
  2. **A second GitHub Pages repo.** Create `kyzoss/nfl` and publish this folder to
     it with `git subtree push --prefix nfl nfl main`, add a `CNAME` file containing
     `nfl.kevinzoss.com`, and point a DNS CNAME at `kyzoss.github.io`.

  Everything in the app uses relative paths, so it works at the root of a domain
  or under `/nfl/` without changes.

## Setup

Everything is in `config.js`: players, commissioner, pots, scoring, season dates,
API keys.

- **Schedule and scores** come from ESPN's public scoreboard feed. Free, no key.
- **Lines** come from The Odds API using `oddsApiKey`. The free tier is 500
  requests a month; the app pulls once when a week opens and only again when the
  commissioner asks, so a season costs a few dozen calls. The key ships to the
  browser, so treat this repo as private or rotate the key if it gets abused.
- **Shared board (recommended).** Without it, the app stores everything on the
  one device that opened it, exactly like the sheet: the commissioner enters
  everyone's picks. To let all four phones play on one board:
  1. Create a free project at supabase.com.
  2. Run `supabase/schema.sql` in the SQL editor.
  3. Copy *Project URL* and *anon public key* (Settings → API) into the
     `supabase` block of `config.js`, commit, push.
  Saves sync in under a second. Last write wins; with four people that is plenty.

## How it plays

- **Picks.** Tap a side. A cover is 1 point, a push is ½. Picks lock at kickoff.
  The line freezes for everyone once anyone picks the game, when the
  commissioner locks the week, or at kickoff.
- **Dups.** Underdogs of 4.5+ points (never the Browns), padded to at least one
  per player, go up for a draft in standings order. Position 1 ranks one team,
  position 2 ranks two, and so on; each player gets their highest-ranked team
  still available. Your dup is your pick in that game: +1.5 on a cover, 0 if not.
  The draft locks at the first kickoff among those games. The commissioner can
  override the order for a week.
- **Weekly pot.** $4 a week. Best score takes it; a tie rolls the pot; week 18
  splits.
- **Last man standing.** $4 a week. Name a team to lose. Wins, ties and no-picks
  knock you out for the round. Rounds are fixed four-week blocks; survivors split
  at the end. If everyone busts early, the last ones standing take what accrued
  and the field resets.
- **Browns record.** $10. One guess before Week 1. Closest wins, points scored
  breaks ties. Actual record is computed from finals as weeks load.
- **Money.** Every payout is derived from results. Manual adjustments cover
  anything else. Export/import JSON from Setup for backups.

## Commissioner tools

Whoever is `commissioner` in `config.js` gets: pull lines, lock lines, add/edit
games, edit lines and scores by hand (pinned against future pulls), set the dup
draft order, pick on behalf of others, adjustments, side-bet override, reset.
Identity is honor-system, same as the sheet.

## Files

```
index.html            shell
config.js             everything you'd want to change
css/app.css           the look: modern Tecmo Super Bowl, scarlet and grey
js/app.js             views, actions, data pulls
js/scoring.js         all the math (pure functions)
js/store.js           localStorage + optional Supabase mirror
js/espn.js            schedule/scores feed
js/odds.js            The Odds API client
js/teams.js           32 teams, colours, logos
supabase/schema.sql   one table, two policies, realtime
```
