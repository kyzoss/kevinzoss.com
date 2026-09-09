# Pick'em

The pool that used to live in a spreadsheet: four players, eighteen weeks, picks
against the spread, dups, a weekly pot, last man standing and the Browns bet.

Static app, no build step. Open `index.html` over any web server and it runs.

## Where it lives

- **Now:** it deploys with the rest of kevinzoss.com, so it is live at
  `https://kevinzoss.com/nfl/` as soon as this folder is on `main`.
- **nfl.kevinzoss.com:** finance and ops are each their own repo on Vercel behind
  Cloudflare. This one rides in the kevinzoss.com repo, so point Vercel at the
  folder instead of a repo:

  1. Vercel → Add New Project → import `kyzoss/kevinzoss.com`.
  2. Root Directory: `nfl`. Framework preset: Other. Leave build and output empty
     (it is static; `nfl/vercel.json` adds the noindex header).
  3. Project → Domains → add `nfl.kevinzoss.com`.
  4. Cloudflare DNS: CNAME `nfl` → `cname.vercel-dns.com`, proxy off (grey cloud)
     so Vercel can issue the certificate. Live in a minute or two.

  Every push to `main` redeploys both the Pages site and the Vercel project.

  Everything in the app uses relative paths, so it works at the root of a domain
  or under `/nfl/` without changes.

## Setup

Everything is in `config.js`: players, commissioner, pots, scoring, season dates,
API keys.

- **Schedule and scores** come from ESPN's public scoreboard feed. Free, no key.
  The same CDN serves all 32 team logos and the Browns mark used as the app icon.
- **Lines** come from The Odds API using `oddsApiKey`. The free tier is 500
  requests a month; the app pulls once when a week opens and only again when the
  commissioner asks, so a season costs a few dozen calls. The key ships to the
  browser, so treat this repo as private or rotate the key if it gets abused.
- **Shared board (recommended).** Without one, the app stores everything on the
  single device that opened it, exactly like the sheet: the commissioner enters
  everyone's picks. Two ways to put all four phones on one board, both free.
  `config.js` checks the Sheet first if both are filled in.

  **A Google Sheet — free, no new service, and it backs itself up.**
  1. Make a new Google Sheet.
  2. Extensions → Apps Script. Delete the placeholder, paste in `sheet/Code.gs`,
     save.
  3. Deploy → New deployment → Web app. *Execute as* **Me**, *Who has access*
     **Anyone**. Copy the `/exec` URL it gives you.
  4. Put that URL in the `sheet.url` field of `config.js`, commit, push. **Done —
     the pool is on the Sheet at `1XQhl30t…EJhtA`.** Setup → *Test the
     connection* reads the board and reports what it found, which is the quickest
     way to tell a deploy problem from a config one.

  The script creates three tabs on first save: `state` holds the JSON the app
  reads, `picks` is a readable grid rebuilt on every save — the old spreadsheet,
  basically — and `log` keeps the last 400 saves so a bad one can be undone by
  hand. Phones look for each other's picks every 15 seconds while the app is
  open, so a pick shows up on the others within a few seconds rather than
  instantly. Simultaneous saves are resolved by the script under a lock: the
  newer one wins and the other phone adopts it.

  The `/exec` URL is the only credential — anyone with it can read and write the
  pool. That is the same trust model as sharing the spreadsheet link.

  **Supabase — instant instead of every-15-seconds.**
  1. Create a free project at supabase.com.
  2. Run `supabase/schema.sql` in the SQL editor.
  3. Copy *Project URL* and *anon public key* (Settings → API) into the
     `supabase` block of `config.js`.

  Realtime, so picks appear in under a second. Worth knowing: the free tier
  allows two projects and pauses one after a week with no traffic, which for a
  weekly app means it can be asleep when you open it.

## How it plays

- **Picks.** One row per game, laid out like the sheet: **Fav | Spr | Dog**, then
  every player's pick, then the dup picker. Tap either side to take it. A cover
  is 1 point, a push is ½. Picks lock at kickoff. The line freezes for everyone
  once anyone picks the game, at kickoff, or automatically at noon on that
  week's Tuesday (`lineLockHour`) — pull the fresh numbers Tuesday morning and
  from then on everyone plays the same line. The commissioner can lock earlier
  or reopen a week. The middle column shows the line before kickoff and the score over
  the line after; each player's column shows the team they took, coloured by
  result, with a dot when a dup forced the pick.
- **Dups.** Underdogs of 4.5+ points (never the Browns), padded to at least one
  per player, go up for a draft whose order rotates a seat each week: whoever
  picked first last week drops to last and everyone moves up (week 1 order comes
  from `dupOrderBase`). The rotation runs the whole season; nothing overrides a
  single week. You rank your choices in the Dup column of the slate
  itself — no separate screen. Position 1 ranks one team,
  position 2 ranks two, and so on; each player gets their highest-ranked team
  still available. Your dup is your pick in that game: +1.5 on a cover, 0 if not.
  **If a team you ranked goes to someone above you, that game reconciles to the
  favorite** — ranking a dog as a dup isn't the same as taking it against the
  number, and it stops a game sitting unpicked while you wait on the draft. Tap
  the dog yourself and your own pick stands instead. The draft locks at the first
  kickoff among those games.
- **Weekly pot.** $4 a week. Best score takes it; a tie rolls the pot; week 18
  splits.
- **Last man standing.** The picker lists every team biggest-underdog-first with
  its own line, since the plus numbers are the whole read. **One team per
  four-week block**: once a week settles, that team is spent and shows struck
  through, with a strip at the top of the picker listing what you've already
  used. Picking a spent team is void, same as no pick. $1 from everyone every
  week, **including the weeks you're already out** — that dead money is what the survivors are playing for.
  Name a team to lose; wins, ties and no-picks knock you out for the round.
  Rounds are fixed four-week blocks and survivors split at the end. If every
  live pick busts in the same week, the players who actually picked split the
  pot and the field re-enters — **a forfeit never shares**. If nobody made a
  live pick at all, nothing is settled: the pot rolls into the next week and
  nobody goes out, carrying across a block boundary if it has to.
- **Browns record.** $10. One guess before Week 1. Closest wins, points scored
  breaks ties. Actual record is computed from finals as weeks load.
- **The LMS tracker** on the Standings tab is the season's history: a row per week,
  a column per player. A struck-through pick is the one that knocked them out,
  green is through, and each block's header names every payout it produced. A
  week marked *rolled* settled nothing, so nobody there is struck out. Read a
  column inside a block and you have that player's spent teams.

- **Money.** Every payout is derived from results. Manual adjustments cover
  anything else. Export/import JSON from Setup for backups.

## Commissioner tools

Whoever is `commissioner` in `config.js` gets: lock the lines early or reopen
them, add or remove games, edit lines and scores by hand (pinned against future
pulls), pick on behalf of others, adjustments, side-bet override, and reset.
Identity is honor-system, same as the sheet.

## Design notes

Type follows Oura: their faces (PP Editorial New, Akkurat) are licensed, so this
ships the closest freely-licensable equivalents -- Instrument Serif for display,
Instrument Sans for everything operational -- loaded from Google Fonts.

Game ids are derived from the matchup (`AWAY@HOME`), never generated. That is
what keeps a pick attached to its game across a slate re-pull, a new device and a
sync; an earlier build used random ids and picks could come unstuck from them.

## Files

```
index.html            shell
config.js             everything you'd want to change
css/app.css           the look: scarlet on near-black, Oura-style type
js/app.js             views, actions, data pulls
js/scoring.js         all the math (pure functions)
js/store.js           localStorage + optional Supabase mirror
js/espn.js            schedule/scores feed
js/odds.js            The Odds API client
js/teams.js           32 teams, colours, logos
sheet/Code.gs         Google Sheet backend + the readable backup grid
supabase/schema.sql   one table, two policies, realtime
```
