# The QA gate

One command, everything: `bash nfl/test/qa.sh`. Green means safe to hand to the
pool. It exits non-zero on any failure, so it can gate a push.

    ── static
    audit.py        every reference the browser follows carries the CURRENT
                    build stamp, the hash covers index.html and the manifest,
                    cache headers exist wherever Vercel might read them, and
                    nothing resolves to a host that is down. This is the check
                    that answers "could a phone be running old code".
    parse           every module, plus sheet/Code.gs, and every JSON file

    ── logic (pure, no browser)
    suite           scoring: grading, dups, the weekly pot, LMS rounds, the
                    side bet, the money ledger, the Sunday cutoff across DST
    feeds           the ESPN and odds parsers, including the spread-sign trap
    sync-test       store behaviour: the read-before-write guard, merges,
                    game-id migration
    owned           the Apps Script merge: a save may only replace the saver's
                    own entries, never narrow anyone else's

    ── rendering (real Chromium)
    smoke           every tab, both layouts, as a player who has an LMS pick
                    and one who does not, on a board where nothing is empty.
                    Written after a ReferenceError reached production through a
                    branch no fixture exercised.
    platforms       a pick made on desktop reaching mobile and the Home Screen
                    app through one shared board
    cutoff          picks close 10:00 Pacific Sunday, identically for a phone
                    set to Los Angeles and one set to New York, and a game that
                    kicks off earlier locks at its own kickoff
    resume          the app reloads itself for a new build and only for a new
                    build
    redirect        it moves origins only after proving the other host serves
                    this exact build; stale or 404 means stay put
    coldstart       a brand-new storage partition -- the Home Screen case --
                    fills itself from the shared board, and says plainly that it
                    cannot reach it rather than looking like an empty week
    dupranks        a dup shows as its rank in that player's own column
    recover         recoverPicksFromLog rebuilds a narrowed board from the log

Chromium comes from `/opt/pw-browsers/chromium`; the tests fake every external
host, so the suite is offline and touches nobody's real board.
