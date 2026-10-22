# Games (passcode gated)

A small room of one-rule games behind a passcode. Static pages plus two Vercel
functions, no dependencies, no build step.

## How the gate works

- `public/index.html` is the only public page: a passcode form.
- `api/unlock.js` checks the passcode on the server (constant-time compare of
  SHA-256 digests) and sets a signed, `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie good for 30 days. Wrong guesses wait 700 ms before answering.
- The games live in `private/`, which is not in the public output directory.
  `/play/*` is rewritten to `api/g.js`, which serves a file only when the cookie
  verifies, and sends everyone else back to `/`. It blocks `..` paths and dotfiles.
- The passcode is never in the repo. The cookie key is derived from it, so
  changing the passcode signs everyone out.

A passcode in client-side JS is readable by anyone, which is why the check and
the files both sit behind a function.

## Deploy

1. Vercel, Add New Project, import `kyzoss/kevinzoss.com`.
2. Root Directory `games`. Framework preset Other. Leave build and output empty
   (`vercel.json` sets the output directory).
3. Environment variables: `GAMES_PASSCODE` (required), `GAMES_SECRET` (optional
   extra salt for the cookie). For the admin page and usage tracking:
   `ADMIN_PASSCODE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `KZ_DB_TOKEN`. The
   Supabase functions check `KZ_DB_TOKEN` against a SHA-256 stored in
   `private.kz_config`, so the anon key on its own cannot call them. To rotate it,
   set a new value in Vercel and update the hash in that table, then redeploy.
4. Domain: pick one. Note that `games.kevinzoss.com` is already the Mesa family
   games hub (see `pictionary/`). Cloudflare CNAME to `cname.vercel-dns.com`,
   DNS only.

The repo root is excluded from this folder in two places so the private files
cannot leak through the main site: `games` in `_config.yml` (GitHub Pages) and
a redirect of `/games/*` to `/` in the root `vercel.json` (the root Vercel project). Do not add a repo-root `.vercelignore` for this: Vercel applies it to every project cloned from the repo, including this one, and it empties the deploy.

## Run locally

    GAMES_PASSCODE=letmein node dev.js 3000
    node --test test/*.test.js

`dev.js` mimics the Vercel routing and drops the cookie's `Secure` flag so it
works on http://localhost.

## Adding a game

Put a folder in `private/<slug>/` with an `index.html` and use relative URLs, then
add a card to `private/index.html`. The recipe the first game follows:

- One rule you can say in one sentence.
- No external assets, nothing from a CDN, so it works offline.
- Fixed 1/60 s timestep and seeded randomness. No clock reads inside the sim.
- Daily seed from the UTC date, with `?seed=N` to replay an island.
- `?capture` skips the animation loop and exposes `window.render(t)`, which steps
  the real simulation to time `t` with a scripted player and draws one frame, so a
  trailer can be recorded frame by frame.

## Ballast

The platform has a centre of mass. Weights arrive one at a time, you aim and drop,
and the torque of everything on the platform sets its tilt. Past 15 degrees the
rim slides; lose five blocks and it tips. Taller piles tilt more for the same
torque, heavier blocks arrive later, and gusts start at 30 seconds.

Difficulty was tuned against a scripted player, not people. Expect to adjust the
constants at the top of `private/ballast/game.js` after a few real runs.

## Not built yet

Server-verified leaderboard, Sign in with X, a service worker and install
manifest, and a rendered trailer. The capture hook for the trailer is in place.
