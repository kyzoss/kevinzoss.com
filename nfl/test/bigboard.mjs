// The week 9 outage. A Google Sheets cell holds at most 50,000 characters, the
// season's document grows ~5,200 a week, and from week 9 on every save threw --
// so nobody's week 9 picks ever reached the board. This runs the real Code.gs
// against a fake spreadsheet that enforces that limit (and that turns a string
// which looks like a number or a formula into one, as Sheets does), saves a
// full 18-week season through doPost, and reads it back through doGet and the
// log recovery.
import fs from 'node:fs';

const src = fs.readFileSync('/home/user/kevinzoss.com/nfl/sheet/Code.gs', 'utf8');
const CELL_MAX = 50000;

// ---- a fake spreadsheet, just enough of it -----------------------------------
function coerce(v) {
  // What Sheets does to a string written with setValues/appendRow.
  if (typeof v !== 'string') return v;
  if (v.length > CELL_MAX) throw new Error(`Your input contains more than the maximum of ${CELL_MAX} characters in a single cell.`);
  if (/^[=+]/.test(v)) return '#ERROR!';                 // read as a formula
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);        // read as a number
  return v;
}
function makeSheet() {
  const rows = [];
  const sh = {
    rows,
    appendRow(r) { rows.push(r.map(coerce)); },
    getLastRow() { return rows.length; },
    getLastColumn() { return rows.reduce((m, r) => Math.max(m, r.length), 0); },
    getDataRange() {
      const w = sh.getLastColumn();
      return { getValues: () => rows.map((r) => Array.from({ length: w }, (_, i) => (r[i] ?? ''))) };
    },
    getRange(row, col, nr, nc) {
      return {
        setValues(vals) {
          for (let i = 0; i < nr; i++) {
            const r = rows[row - 1 + i] || (rows[row - 1 + i] = []);
            for (let j = 0; j < nc; j++) r[col - 1 + j] = coerce(vals[i][j]);
          }
        },
        setFontWeight() {},
      };
    },
    deleteRows(start, n) { rows.splice(start - 1, n); },
    clear() { rows.length = 0; },
    setFrozenRows() {}, autoResizeColumn() {},
  };
  return sh;
}
const sheets = {};
const logs = [];
const env = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet()),
  }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Logger: { log: (...a) => logs.push(a) },
};
const box = {};
new Function(...Object.keys(env), 'globalThis',
  src + '\nglobalThis.doGet = doGet; globalThis.doPost = doPost; globalThis.recover = recoverPicksFromLog; globalThis.v = SCRIPT_VERSION;')(
  ...Object.values(env), box);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name} ${extra}`); } };
console.log('script version:', box.v);

// ---- a realistic season ---------------------------------------------------------
const TEAMS = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC',
               'LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WSH'];
const PIDS = ['az', 'kz', 'jv', 'hz'];
function week(n) {
  const games = [];
  for (let i = 0; i < (n <= 4 ? 16 : 14); i++) {
    const away = TEAMS[(i * 2 + n) % 32], home = TEAMS[(i * 2 + 1 + n) % 32];
    games.push({ id: `${away}@${home}`, spread: -3.5, manualSpread: false, espnId: String(401873000 + n * 100 + i),
      kickoff: '2026-10-30T00:15Z', home, away, status: 'post', homeScore: 27, awayScore: 19, clock: 'Final',
      homeRecord: '5-3', awayRecord: '3-4', broadcast: 'Prime Video', book: 'DraftKings' });
  }
  const picks = {};
  for (const p of PIDS) picks[p] = Object.fromEntries(games.map((g, i) => [g.id, i % 2 ? 'home' : 'away']));
  const brownStats = {};
  for (let i = 0; i < 8; i++) brownStats[`p${i}`] = { rushYds: 41, recYds: 12, td: 1, pts: 10.1 };
  return { games, picks, lms: { az: 'KC', kz: 'BUF', jv: 'DET', hz: 'PHI' }, dupPrefs: { az: ['NYJ', 'TEN'] },
           brown: { az: 'p1', kz: 'p2', jv: 'p3', hz: 'p4' }, brownStats, lastLinesPull: 1793318968586 };
}
function season(nWeeks, at) {
  const weeks = {};
  for (let n = 1; n <= nWeeks; n++) weeks[n] = week(n);
  return { v: 1, season: 2026, players: PIDS.map((id) => ({ id, name: id })), weeks,
           sideBet: { predictions: { az: { w: 6, l: 11 } }, actual: null }, adjustments: [], pins: {},
           brownsRoster: Array.from({ length: 45 }, (_, i) => ({ id: String(4000000 + i), name: `Player ${i}`, pos: 'WR' })),
           updatedAt: at };
}
const post = (doc, actor) => JSON.parse(box.doPost({ postData: { contents: JSON.stringify({ season: '2026', updatedAt: doc.updatedAt, actor, state: doc }) } }).body);
const get = () => JSON.parse(box.doGet({ parameter: { season: '2026' } }).body);

// a board saved before the change: one cell, bare JSON, just under the limit
const eight = season(8, 1000);
const legacy = JSON.stringify(eight);
ok('fixture: an 8-week season fits one cell', legacy.length < CELL_MAX, `(${legacy.length})`);
sheets.state = makeSheet();
sheets.state.appendRow(['season', 'updatedAt', 'savedAtLocal', 'json']);
sheets.state.appendRow(['2026', 1000, 'then', legacy]);
ok('a board stored the old way still reads', get().state?.weeks?.[8]?.games?.length === 14);

// week 9: this is the save that used to throw
const nine = season(9, 2000);
ok('fixture: a 9-week season does NOT fit one cell', JSON.stringify(nine).length > CELL_MAX, `(${JSON.stringify(nine).length})`);
const r9 = post(nine, 'kz');
ok('the week 9 save succeeds', r9.ok === true && !r9.error, JSON.stringify(r9).slice(0, 200));
const back9 = get();
ok('and week 9 picks are on the board', Object.keys(back9.state?.weeks?.[9]?.picks?.kz || {}).length === 14);
ok('the board reads back byte for byte', JSON.stringify(back9.state) === JSON.stringify(r9.state));
ok('every stored piece fits a cell', sheets.state.rows.every((r) => r.every((c) => String(c).length <= CELL_MAX)));

// the whole season, and playoffs on top
const full = season(22, 3000);
const rf = post(full, 'az');
ok('a full season saves', rf.ok === true, JSON.stringify(rf).slice(0, 200));
ok('a full season reads back whole', JSON.stringify(get().state.weeks) === JSON.stringify(rf.state.weeks));

// a shorter save after a longer one must not pick up the longer one's tail
const wipe = JSON.parse(JSON.stringify(rf.state));
for (const w of Object.values(wipe.weeks)) { w.brownStats = {}; }   // a save that is much shorter...
wipe.brownsRoster = [];
for (let n = 10; n <= 22; n++) delete wipe.weeks[n];
wipe.updatedAt = 4000;
const rs = post(wipe, 'kz');
ok('a shorter save after a longer one still parses', rs.ok === true && get().state.updatedAt === 4000, JSON.stringify(get()).slice(0, 200));
ok('...and the merge kept what the shorter one lacked', Object.keys(get().state.weeks).length === 22);

// a stale save is still refused, with the board handed back whole
const stale = post(season(9, 10), 'hz');
ok('a stale save is refused with the full board', stale.stale === true && Object.keys(stale.state.weeks).length === 22);

// JSON slices that Sheets would mangle: a piece starting with "=" or looking like a number
const nasty = JSON.parse(JSON.stringify(get().state));
nasty.updatedAt = 5000;
nasty.note = '='.repeat(10) + '1'.repeat(90000);   // forces pieces that start "=" and pieces that are all digits
const rn = post(nasty, 'kz');
ok('pieces Sheets would read as a formula or a number survive', rn.ok === true && get().state.note === nasty.note);

// the log is chunked too, and recovery reads it back
ok('the log stored every save', sheets.log.rows.length - 1 >= 4);
ok('every log piece fits a cell', sheets.log.rows.every((r) => r.every((c) => String(c).length <= CELL_MAX)));
box.recover();
const said = logs.map((a) => a.slice(1).join(' ')).join(' | ');
ok('recovery parses the chunked log', /week 22: /.test(said), said.slice(0, 300));
ok('recovery prints whole numbers, not 0.0', !/\b0\.0\b/.test(said), said.slice(0, 200));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
