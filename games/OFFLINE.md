# Making the games playable offline

Scope only. Nothing here is built yet.

## Decision: web app, not an app store app

Uno, Yahtzee and Settlers of Catan are active trademarks, and Catan and Uno also
carry copyrighted rules text and art. Apple and Google reject or later pull apps
that trade on those names, so a Capacitor wrapper and the App Store or Play
route are off the table. The offline plan is an installable web app (PWA): add
to Home Screen from the browser, no store review, no listing, no public name.

The same names are a smaller risk on a passcode-gated, noindexed site that
nobody can find, but it is not zero. If any of this is ever opened up to the
public or to a store, rename the games, rewrite the rules text in original
words, and keep the art original (it already is).

## Why this is cheap

Every game is already static files with no network calls, no CDN and no fonts
loaded from outside. Saved games and tallies live in localStorage. The only
thing standing between a game and offline play is that the files are served by
a function that wants a cookie. A service worker removes that for a device that
has already unlocked.

## Plan

1. **Service worker at `/play/sw.js`.** The `/play/*` rewrite already serves it
   through `api/g.js`, and `/play/` is the scope. On install, fetch a generated
   list of every file under `private/` and put them in a versioned cache. On
   fetch, answer from the cache first and refresh in the background when online.
   Register it from the hub page (`private/index.html`) so it only ever installs
   after a successful unlock.
2. **Manifest and icons in `public/`, not `private/`.** Browsers fetch the
   manifest without cookies, so a manifest behind the gate returns the passcode
   page and the app cannot be installed. Put `manifest.webmanifest` and the
   icons in `public/` with `start_url` `/play/` and `scope` `/play/`. They
   contain nothing secret. Link it from the hub page.
3. **Generated file list and version.** A small script (same idea as
   `nfl/stamp.py`) walks `private/`, writes `sw-files.json` and a cache name
   from a content hash, so a deploy replaces the cache and a stale game cannot
   linger. `version.json` stays `no-store` so the page can say "update ready".
4. **Offline unlock expiry.** Cached files would otherwise open with no
   passcode forever. At unlock, stamp the expiry (30 days, matching the cookie)
   into IndexedDB from the hub page; the worker refuses to serve from the cache
   past that date until the person unlocks again online. Changing the passcode
   cannot reach a device that is offline, so it signs that device out on its next
   online visit, and the worker clears the cache when the gate says no.
5. **Lock the room.** The existing button also deletes the caches and the
   stamp, so a borrowed phone does not keep the games.
6. **Install prompts.** Chrome and Android offer install; iOS needs Share, then
   Add to Home Screen, so the hub shows a one-line hint on iOS. Installed web
   apps on iOS keep their storage; a game left open only in a Safari tab can
   lose localStorage after about a week unused, so the hint also says to
   install.

## Gotchas to test

- Fetch from the worker with `credentials: "same-origin"`, and handle the 302 to
  `/` when the cookie has expired: do not cache redirects as game files.
- Never cache `/api/*`.
- Test with Playwright: unlock, load every game, go offline (`context.setOffline`),
  reload each game and play a move, then confirm expiry and lock both empty the
  cache.
- Keep the cache under a few MB. Everything is code with no media, so it will be
  well under 1 MB.

## Effort

About half a day, plus a Playwright offline check. The work is the worker, the
file-list script, the manifest and icons, and the expiry stamp.

## Not in scope

Native wrappers, store listings, multiplayer or anything needing a server
(leaderboards, shared rooms). Those break offline by definition.
