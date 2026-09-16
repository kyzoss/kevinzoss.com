// A fixed clock for the browser tests.
//
// currentWeek() is derived from today's date, so a test that seeds week 1 and
// says nothing about the time only passes during the real week 1. Once the
// calendar moved to week 2 the app opened on an empty slate and four suites
// went red at once, none of them because anything was wrong. A test that
// depends on what day it is is not a test.
//
// `pin` also leaves window.__advance(ms) behind, so a test that needs time to
// pass -- a poll that must not re-read inside its throttle -- can move the
// clock instead of sleeping.
//
// DO NOT pin a test that measures real elapsed time. selfupdate waits out the
// build-check timer and resume watches a reopen; freezing Date.now() stops the
// thing they are testing from ever happening, and both went red the moment
// they were pinned "for consistency". They do not assert on a slate, so the
// week they open in does not matter to them.

/** Sunday 9am Pacific of week 1: picks open, nothing kicked off. */
export const WEEK1_MORNING = Date.parse('2026-09-13T16:00:00Z');
/** Sunday afternoon, mid-game. */
export const WEEK1_AFTERNOON = Date.parse('2026-09-13T18:00:00Z');
/** Monday, every game final. */
export const WEEK1_MONDAY = Date.parse('2026-09-14T15:00:00Z');

/** Freeze a Playwright context's clock at `at`. Call before newPage(). */
export async function pin(context, at = WEEK1_MORNING) {
  await context.addInitScript((t) => {
    let skew = 0;
    const R = Date;
    class D extends R {
      constructor(...a) { super(...(a.length ? a : [t + skew])); }
      static now() { return t + skew; }
    }
    window.Date = D;
    window.__advance = (ms) => { skew += ms; };
  }, at);
}
