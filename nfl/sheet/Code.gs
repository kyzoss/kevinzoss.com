/**
 * Pick'em — shared board on a Google Sheet.
 *
 * Free, needs nothing but the Google account you already have, and the Sheet
 * itself becomes a readable backup of the pool.
 *
 * Three tabs, all created automatically:
 *   state   the machine record: one row per season holding the JSON document
 *   picks   a readable grid, rebuilt on every save (the old spreadsheet, basically)
 *   log     an append-only history, so a bad save can always be recovered
 *
 * Setup lives in nfl/README.md. Short version:
 *
 *   First time only: Extensions -> Apps Script, paste this in, save, then
 *   Deploy -> New deployment -> Web app, execute as *me*, access *anyone*, and
 *   put the /exec URL it gives you into nfl/config.js.
 *
 *   Updating an existing install: paste the new code in, save, then
 *   Deploy -> Manage deployments -> pencil (Edit) -> Version: New version ->
 *   Deploy. That keeps the same /exec URL, so config.js needs no change and
 *   every phone stays connected. Do NOT use New deployment for an update -- it
 *   mints a fresh /exec URL, leaves the old code serving the app, and breaks
 *   sync until config.js is changed.
 *
 * Setup -> Test the connection reports SCRIPT_VERSION, so you can tell whether
 * the deployment is actually running this file.
 *
 * The URL is the only credential. Anyone holding it can read and write the
 * pool, which is the same trust model as a shared spreadsheet link.
 */

// Bumped whenever the behaviour of this file changes -- not for comment edits,
// which would only send everyone off to redeploy for nothing. Reported back by
// doGet and doPost, so the app can tell you whether the deployment you are
// talking to is actually the current one.
var SCRIPT_VERSION = 'straight-up-1';

var STATE_SHEET = 'state';
var PICKS_SHEET = 'picks';
var LOG_SHEET = 'log';
var MAX_LOG_ROWS = 400;

function doGet(e) {
  try {
    var season = String((e && e.parameter && e.parameter.season) || '');
    var row = findSeasonRow_(season);
    if (!row) return json_({ state: null, version: SCRIPT_VERSION });
    return json_({ state: JSON.parse(row.json), updatedAt: Number(row.updatedAt) || 0, version: SCRIPT_VERSION });
  } catch (err) {
    return json_({ error: String(err && err.message || err), version: SCRIPT_VERSION });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Two phones saving at once would otherwise interleave reads and writes.
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var season = String(body.season || '');
    var state = body.state;
    if (!season || !state) throw new Error('season and state are required');

    var incoming = Number(body.updatedAt || state.updatedAt || 0);
    var existing = findSeasonRow_(season);
    if (existing && Number(existing.updatedAt) > incoming) {
      // Someone else saved more recently. Hand back their copy instead of
      // clobbering it; the client will take whichever is newer.
      return json_({ state: JSON.parse(existing.json), updatedAt: Number(existing.updatedAt), stale: true });
    }

    // Merge rather than replace. A phone with empty storage that pulls the
    // slate has a newer timestamp but no picks, and a straight replace lets it
    // wipe everyone -- which is exactly what happened once. A player only ever
    // edits their own entries, so keeping the stored entry for any player the
    // incoming document does not mention is always safe, while a real unpick
    // still arrives inside that player's own map and is honoured.
    var merged = existing ? mergeState_(JSON.parse(existing.json), state) : state;
    writeState_(season, merged, incoming);
    writePicks_(merged);
    appendLog_(season, merged, incoming);
    return json_({ ok: true, updatedAt: incoming, merged: Boolean(existing), version: SCRIPT_VERSION });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

// ---- merging ---------------------------------------------------------------

/** Keep the stored value for any key the incoming object does not mention. */
function mergeByPlayer_(stored, incoming) {
  var out = {};
  var k;
  for (k in (stored || {})) out[k] = stored[k];
  for (k in (incoming || {})) out[k] = incoming[k];
  return out;
}

function mergeState_(stored, incoming) {
  var out = {};
  var k;
  for (k in stored) out[k] = stored[k];
  for (k in incoming) out[k] = incoming[k];

  out.weeks = {};
  var weeks = {};
  for (k in (stored.weeks || {})) weeks[k] = true;
  for (k in (incoming.weeks || {})) weeks[k] = true;
  for (var wk in weeks) {
    var a = (stored.weeks || {})[wk] || {};
    var b = (incoming.weeks || {})[wk] || {};
    var w = {};
    for (k in a) w[k] = a[k];
    for (k in b) w[k] = b[k];
    // the slate: whoever has more games has pulled more recently
    var ga = a.games || [], gb = b.games || [];
    w.games = gb.length >= ga.length ? gb : ga;
    w.picks = mergeByPlayer_(a.picks, b.picks);
    w.lms = mergeByPlayer_(a.lms, b.lms);
    w.dupPrefs = mergeByPlayer_(a.dupPrefs, b.dupPrefs);
    out.weeks[wk] = w;
  }

  // Values that belong to the table rather than to a player -- the Browns'
  // actual record, the adjustments -- cannot be merged key by key, and a blank
  // document's nulls are indistinguishable from a deliberate clear. So they are
  // only honoured from a document that carries some player data, which a device
  // with empty storage never does.
  var sa = stored.sideBet || {}, sb = incoming.sideBet || {};
  var live = hasPlayerData_(incoming);
  out.sideBet = {
    predictions: mergeByPlayer_(sa.predictions, sb.predictions),
    actual: live ? (sb.actual !== undefined ? sb.actual : sa.actual) : sa.actual,
  };
  out.adjustments = live ? (incoming.adjustments || []) : (stored.adjustments || []);
  return out;
}

/** Does this document contain anything a player actually entered? */
function hasPlayerData_(doc) {
  var weeks = (doc && doc.weeks) || {};
  for (var wk in weeks) {
    var w = weeks[wk] || {};
    var pid;
    for (pid in (w.picks || {})) if (w.picks[pid] && Object.keys(w.picks[pid]).length) return true;
    for (pid in (w.lms || {})) if (w.lms[pid]) return true;
    for (pid in (w.dupPrefs || {})) if ((w.dupPrefs[pid] || []).length) return true;
  }
  var preds = ((doc && doc.sideBet) || {}).predictions || {};
  for (var p in preds) if (preds[p]) return true;
  return false;
}

// ---- storage ---------------------------------------------------------------

function findSeasonRow_(season) {
  var sh = sheet_(STATE_SHEET, ['season', 'updatedAt', 'savedAtLocal', 'json']);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === season && values[i][3]) {
      return { rowIndex: i + 1, updatedAt: values[i][1], json: values[i][3] };
    }
  }
  return null;
}

function writeState_(season, state, updatedAt) {
  var sh = sheet_(STATE_SHEET, ['season', 'updatedAt', 'savedAtLocal', 'json']);
  var payload = [season, updatedAt, new Date(), JSON.stringify(state)];
  var existing = findSeasonRow_(season);
  if (existing) sh.getRange(existing.rowIndex, 1, 1, payload.length).setValues([payload]);
  else sh.appendRow(payload);
}

function appendLog_(season, state, updatedAt) {
  var sh = sheet_(LOG_SHEET, ['savedAtLocal', 'season', 'updatedAt', 'json']);
  sh.appendRow([new Date(), season, updatedAt, JSON.stringify(state)]);
  var extra = sh.getLastRow() - 1 - MAX_LOG_ROWS;
  if (extra > 0) sh.deleteRows(2, extra);
}

// ---- the readable grid -----------------------------------------------------

function writePicks_(state) {
  var sh = sheet_(PICKS_SHEET, []);
  sh.clear();

  var players = state.players || [];
  var header = ['Week', 'Kickoff', 'Away', 'Home', 'Line'];
  for (var p = 0; p < players.length; p++) header.push(players[p].name || players[p].id);
  header.push('Score', 'Result');
  var rows = [header];

  var weeks = Object.keys(state.weeks || {}).map(Number).sort(function (a, b) { return a - b; });
  for (var w = 0; w < weeks.length; w++) {
    var week = state.weeks[weeks[w]] || {};
    var games = week.games || [];
    for (var g = 0; g < games.length; g++) {
      var game = games[g];
      var row = [
        weeks[w],
        game.kickoff ? new Date(game.kickoff) : '',
        game.away,
        game.home,
        lineText_(game),
      ];
      for (var i = 0; i < players.length; i++) {
        var pid = players[i].id;
        var dup = dupFor_(state, weeks[w], pid);
        var side = (week.picks && week.picks[pid] && week.picks[pid][game.id]) || '';
        if (dup && (game.home === dup || game.away === dup)) {
          side = game.home === dup ? 'home' : 'away';
          row.push((side === 'home' ? game.home : game.away) + ' (dup)');
        } else {
          row.push(side ? (side === 'home' ? game.home : game.away) : '');
        }
      }
      var final = game.status === 'post' && game.homeScore != null && game.awayScore != null;
      row.push(final ? game.awayScore + '-' + game.homeScore : (game.status === 'in' ? 'live' : ''));
      row.push(final ? wonBy_(game) : '');
      rows.push(row);
    }
    // one blank row between weeks, so the grid stays skimmable
    if (games.length) rows.push(new Array(header.length).fill(''));
  }

  // The LMS pick is per player per week, not per game, so it gets its own block.
  rows.push(new Array(header.length).fill(''));
  var lmsHeader = ['Week', 'Last man standing'];
  for (var q = 0; q < players.length; q++) lmsHeader.push(players[q].name || players[q].id);
  rows.push(padTo_(lmsHeader, header.length));
  for (var x = 0; x < weeks.length; x++) {
    var lms = (state.weeks[weeks[x]] || {}).lms || {};
    var lmsRow = [weeks[x], ''];
    for (var y = 0; y < players.length; y++) lmsRow.push(lms[players[y].id] || '');
    rows.push(padTo_(lmsRow, header.length));
  }

  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  for (var c = 1; c <= header.length; c++) sh.autoResizeColumn(c);
}

function padTo_(row, len) {
  while (row.length < len) row.push('');
  return row.slice(0, len);
}

function lineText_(game) {
  if (game.spread == null) return '';
  if (game.spread === 0) return 'PK';
  var fav = game.spread < 0 ? game.home : game.away;
  return fav + ' -' + Math.abs(game.spread);
}

/** Straight up: who won. The spread is not part of grading. A tie is nobody. */
function wonBy_(game) {
  if (game.homeScore == null || game.awayScore == null) return '';
  if (game.homeScore === game.awayScore) return 'tie';
  return game.homeScore > game.awayScore ? game.home : game.away;
}

/** Mirrors the app's ranked-choice dup draft closely enough for the grid. */
function dupFor_(state, week, pid) {
  var wk = state.weeks[week] || {};
  var prefs = wk.dupPrefs || {};
  var order = wk.dupOrder || (state.players || []).map(function (p) { return p.id; });
  var taken = {};
  for (var i = 0; i < order.length; i++) {
    var list = prefs[order[i]] || [];
    for (var j = 0; j <= i && j < list.length; j++) {
      if (!taken[list[j]]) { taken[list[j]] = order[i]; break; }
    }
  }
  for (var team in taken) if (taken[team] === pid) return team;
  return null;
}

// ---- helpers ---------------------------------------------------------------

function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header && header.length) {
      sh.appendRow(header);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
