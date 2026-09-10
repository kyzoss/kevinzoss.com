import fs from 'node:fs';
const src = fs.readFileSync('/home/user/kevinzoss.com/nfl/sheet/Code.gs', 'utf8');

// Minimal stand-ins for the Apps Script services, backed by plain arrays.
const sheets = {};
function mkSheet(name) {
  const rows = [];
  return {
    name, rows,
    getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
    appendRow: (r) => rows.push([...r]),
    getRange: (row, col, nr, nc) => ({ setValues: (vals) => { for (let i = 0; i < nr; i++) rows[row - 1 + i] = [...vals[i]]; }, setFontWeight: () => {} }),
    getLastRow: () => rows.length,
    deleteRows: (start, n) => rows.splice(start - 1, n),
    clear: () => rows.splice(0, rows.length),
    setFrozenRows: () => {}, autoResizeColumn: () => {},
  };
}
const logged = [];
const env = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mkSheet(n)),
  }) },
  LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
  // Apps Script's Logger.log does %s substitution; the stub has to as well or
  // the output reads as gibberish and hides what the function actually said.
  Logger: { log: (fmt, ...rest) => logged.push(String(fmt).replace(/%s/g, () => String(rest.shift()))) },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 1 } },
};
const box = {};
new Function('globalThis', 'SpreadsheetApp', 'LockService', 'Logger', 'ContentService',
  src + '\nglobalThis.__recover = recoverPicksFromLog; globalThis.__census = census_; globalThis.__v = SCRIPT_VERSION;'
)(box, env.SpreadsheetApp, env.LockService, env.Logger, env.ContentService);

const board = (picks, lms = {}, prefs = {}, preds = {}) => ({
  v:1, season:2026, players:[{id:'az'},{id:'kz'},{id:'jv'},{id:'hz'}],
  weeks:{1:{games:[{id:'SF@LAR'},{id:'TB@CIN'},{id:'NO@DET'},{id:'NYJ@TEN'},{id:'BAL@IND'},{id:'ATL@PIT'},{id:'NE@SEA'}],
    picks, lms, dupPrefs: prefs}},
  sideBet:{predictions:preds, actual:null}, adjustments:[], updatedAt: 1,
});
const HOWARD6 = { 'SF@LAR':'home','TB@CIN':'home','NO@DET':'home','NYJ@TEN':'away','BAL@IND':'home','ATL@PIT':'away' };

sheets[ 'state' ] = mkSheet('state'); sheets['state'].appendRow(['season','updatedAt','savedAtLocal','json']);
sheets[ 'log' ] = mkSheet('log');     sheets['log'].appendRow(['savedAtLocal','season','updatedAt','json']);

// history: Howard's six, then Kevin/Andrew restored, then the narrowing save
const good = board({ hz: HOWARD6 }, { hz:'CLE' }, { hz:['TB','IND'] }, { kz:{wins:5,losses:12,points:328} });
const withKA = board({ hz: HOWARD6, kz: Object.fromEntries(Object.keys(HOWARD6).map(g=>[g,'home'])), az: { 'TB@CIN':'away' } }, { hz:'CLE', kz:'CLE' });
const narrowed = board({ hz: { 'NE@SEA':'home' }, kz: Object.fromEntries(Object.keys(HOWARD6).map(g=>[g,'home'])), az: { 'TB@CIN':'away' } }, { kz:'CLE' });
for (const [t, doc] of [[1, good], [2, withKA], [3, narrowed]]) sheets['log'].appendRow([new Date(t), '2026', t, JSON.stringify(doc)]);
sheets['state'].appendRow(['2026', 3, new Date(), JSON.stringify(narrowed)]);

console.log('script version   :', box.__v);
console.log('board before     :', box.__census(narrowed));
box.__recover();
const after = JSON.parse(sheets['state'].rows[1][3]);
console.log('board after      :', box.__census(after));
console.log();
for (const l of logged) console.log(' ', l);
console.log();
const hz = after.weeks[1].picks.hz;
const want = { ...HOWARD6, 'NE@SEA':'home' };
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.join() === kb.join() && ka.every(k => a[k] === b[k]); };
console.log("Howard's picks   :", Object.keys(hz).length, 'of', Object.keys(want).length,
            same(hz, want) ? 'all present and correct' : 'MISMATCH ' + JSON.stringify(hz));
console.log("Howard's LMS     :", after.weeks[1].lms.hz, '(want CLE)');
console.log("Howard's dups    :", JSON.stringify(after.weeks[1].dupPrefs.hz), '(want ["TB","IND"])');
console.log("Kevin's untouched:", Object.keys(after.weeks[1].picks.kz).length, 'picks');
console.log("Browns guess back:", JSON.stringify(after.sideBet.predictions.kz));
console.log("actual record    :", JSON.stringify(after.sideBet.actual), '(want null -- must not resurrect)');
