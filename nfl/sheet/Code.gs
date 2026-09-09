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
 * Setup lives in nfl/README.md. Short version: Extensions -> Apps Script, paste
 * this in, Deploy -> New deployment -> Web app, execute as *me*, access
 * *anyone*, then put the /exec URL into nfl/config.js.
 *
 * The URL is the only credential. Anyone holding it can read and write the
 * pool, which is the same trust model as a shared spreadsheet link.
 */

var STATE_SHEET = 'state';
var PICKS_SHEET = 'picks';
var LOG_SHEET = 'log';
var MAX_LOG_ROWS = 400;

function doGet(e) {
  try {
    var season = String((e && e.parameter && e.parameter.season) || '');
    var row = findSeasonRow_(season);
    if (!row) return json_({ state: null });
    return json_({ state: JSON.parse(row.json), updatedAt: Number(row.updatedAt) || 0 });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
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

    writeState_(season, state, incoming);
    writePicks_(state);
    appendLog_(season, state, incoming);
    return json_({ ok: true, updatedAt: incoming });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
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
      row.push(final ? coveredBy_(game) : '');
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

function coveredBy_(game) {
  if (game.spread == null) return '';
  var margin = game.homeScore - game.awayScore + game.spread;
  if (margin === 0) return 'push';
  return margin > 0 ? game.home : game.away;
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
