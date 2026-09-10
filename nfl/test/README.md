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
                    own entries, never narrow anyone else's -- picks, LMS, dup
                    rankings and brown-of-week picks alike
    browns-feed     the ESPN box-score mapping. NOTE: the payload it tests is
                    hand-built to ESPN's documented shape, because the sandbox
                    this was written in cannot reach espn.com. If the real shape
                    differs these still pass, so verify one real game's numbers
                    before trusting an automatic brown-of-week score.

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
    brown           brown of the week end to end: the section on the week
                    view, the scores and payout, the depth-chart picker, a
                    player spent in the round greyed out, and the history and
                    money on the Browns page
    selfupdate      an app left sitting open notices a new build and reloads
                    itself, and never does it while a modal is open. Nobody in
                    the pool should ever be told to hard-refresh
    converge        three devices and one board, reproducing the failure where
                    the website showed every pick, one phone was missing Jim's
                    and Andrew's own picks were gone. Asserts all three agree
                    with the board -- against a server that returns its merge
                    AND one that does not -- and that a deliberate unpick still
                    sticks
    brown-live      while the Browns play, brown-of-week points move on their
                    own -- and a poll that changed nothing saves nothing, since
                    every open phone polls once a minute
    restore-dups    Restore fills a dup ranking that was wiped off the board
                    and leaves alone one somebody already has
    dupranks        every dup the draft has handed over reads as the team,
                    marked D and in its own colour
    recover         recoverPicksFromLog rebuilds a narrowed board from the log

Chromium comes from `/opt/pw-browsers/chromium`; the tests fake every external
host, so the suite is offline and touches nobody's real board.
