// Dominoes rules engine, computer players and table layout. Pure logic: no DOM,
// no clock reads, all randomness from a seeded mulberry32 whose state lives in
// the game state, so a state is plain JSON and the same seed always deals the
// same tiles.
//
// Double-six set (28 tiles). Two modes:
//   "fives"  All Fives (Muggins): spinner, score when the open ends sum to a
//            multiple of five, hand winner scores the others' pips rounded to 5.
//   "block"  Block / Draw: no spinner, no scoring during the hand, hand winner
//            scores the others' pips exactly.
// Tiles are two element arrays [a, b]. In a hand they are normalised a <= b.
// A move is { tile, end, placed } where end is "S" (first tile), "L", "R"
// (ends of the main line), "U" or "D" (spinner arms) and placed is the tile
// oriented [inner, outer]: inner touches the line, outer becomes the new end.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DominoesLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AI_NAMES = ["Marisol", "Teodoro", "Beatrix"];
  var ENDS = ["L", "R", "U", "D"];
  var TILES = [];
  for (var ta = 0; ta <= 6; ta++) for (var tb = ta; tb <= 6; tb++) TILES.push([ta, tb]);

  // ---------------------------------------------------------------- basics

  function key(t) { return Math.min(t[0], t[1]) + "-" + Math.max(t[0], t[1]); }
  function sameTile(a, b) { return key(a) === key(b); }
  function isDouble(t) { return t[0] === t[1]; }
  function pips(t) { return t[0] + t[1]; }
  function pipCount(hand) { var s = 0; for (var i = 0; i < hand.length; i++) s += pips(hand[i]); return s; }
  function roundTo5(n) { return Math.round(n / 5) * 5; }
  function sortHand(hand) {
    hand.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return hand;
  }
  function has(hand, t) {
    for (var i = 0; i < hand.length; i++) if (sameTile(hand[i], t)) return i;
    return -1;
  }

  // ---------------------------------------------------------------- rng

  function nextRand(st) {
    var a = (st.rng + 0x6d2b79f5) | 0;
    st.rng = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(nextRand(st) * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------------------------------------------------------------- board

  function emptyBoard() { return { seq: [], main: [], up: [], down: [], spinner: -1, spinnerVal: -1 }; }
  function cloneBoard(b) {
    return {
      seq: b.seq.slice(), main: b.main.map(function (t) { return t.slice(); }),
      up: b.up.map(function (t) { return t.slice(); }), down: b.down.map(function (t) { return t.slice(); }),
      spinner: b.spinner, spinnerVal: b.spinnerVal
    };
  }
  function armsOpen(b) { return b.spinner > 0 && b.spinner < b.main.length - 1; }

  // Open ends of the line: where the next tile may go and which pip it must match.
  function openEnds(b, mode) {
    var m = b.main, out = [];
    if (!m.length) return out;
    if (m.length === 1) {
      out.push({ end: "L", value: m[0][0] });
      out.push({ end: "R", value: m[0][1] });
      return out;
    }
    out.push({ end: "L", value: m[0][0] });
    out.push({ end: "R", value: m[m.length - 1][1] });
    if (mode === "fives" && armsOpen(b)) {
      out.push({ end: "U", value: b.up.length ? b.up[b.up.length - 1][1] : b.spinnerVal });
      out.push({ end: "D", value: b.down.length ? b.down[b.down.length - 1][1] : b.spinnerVal });
    }
    return out;
  }

  // Sum of the open ends for All Fives scoring. A double at an end counts both
  // halves. The spinner counts as a double end until both its sides are played;
  // after that only arms that hold tiles count.
  function endsSum(b) {
    var m = b.main;
    if (!m.length) return 0;
    if (m.length === 1) return isDouble(m[0]) ? 2 * m[0][0] : m[0][0] + m[0][1];
    var endVal = function (t, outer) { return isDouble(t) ? 2 * t[0] : t[outer]; };
    var s = endVal(m[0], 0) + endVal(m[m.length - 1], 1);
    if (b.up.length) s += endVal(b.up[b.up.length - 1], 1);
    if (b.down.length) s += endVal(b.down[b.down.length - 1], 1);
    return s;
  }
  function fivesPoints(b) { var s = endsSum(b); return s > 0 && s % 5 === 0 ? s : 0; }

  function applyToBoard(b, move, mode) {
    var p = move.placed, dbl = p[0] === p[1];
    var idx = -1;
    if (move.end === "S") { b.main = [p.slice()]; idx = 0; }
    else if (move.end === "L") { b.main.unshift([p[1], p[0]]); if (b.spinner >= 0) b.spinner++; idx = 0; }
    else if (move.end === "R") { b.main.push(p.slice()); idx = b.main.length - 1; }
    else if (move.end === "U") b.up.push(p.slice());
    else if (move.end === "D") b.down.push(p.slice());
    if (mode === "fives" && dbl && b.spinner < 0 && idx >= 0) { b.spinner = idx; b.spinnerVal = p[0]; }
  }

  function movesFor(hand, b, mode) {
    var out = [], i, j;
    if (!b.main.length) {
      for (i = 0; i < hand.length; i++) out.push({ tile: hand[i].slice(), end: "S", placed: [hand[i][0], hand[i][1]] });
      return out;
    }
    var ends = openEnds(b, mode);
    for (i = 0; i < hand.length; i++) {
      var t = hand[i];
      for (j = 0; j < ends.length; j++) {
        var e = ends[j];
        if (t[0] === e.value) out.push({ tile: t.slice(), end: e.end, placed: [t[0], t[1]] });
        else if (t[1] === e.value) out.push({ tile: t.slice(), end: e.end, placed: [t[1], t[0]] });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- game

  // opts: { players: 2..4, mode: "fives"|"block", target, seed, humans: array|"all"|"one", names }
  function newGame(opts) {
    opts = opts || {};
    var n = Math.min(4, Math.max(2, opts.players | 0 || 2));
    var mode = opts.mode === "block" ? "block" : "fives";
    var target = opts.target | 0 || (mode === "fives" ? 150 : 100);
    var humans = [], i;
    for (i = 0; i < n; i++) {
      if (Array.isArray(opts.humans)) humans.push(!!opts.humans[i]);
      else if (opts.humans === "all") humans.push(true);
      else humans.push(i === 0);
    }
    var hc = humans.filter(Boolean).length, names = [], ai = 0, hn = 0;
    for (i = 0; i < n; i++) {
      if (opts.names && opts.names[i]) names.push(String(opts.names[i]).slice(0, 14));
      else if (humans[i]) { hn++; names.push(hc === 1 ? "You" : "Player " + hn); }
      else names.push(AI_NAMES[ai++ % AI_NAMES.length]);
    }
    var st = {
      v: 1, seed: opts.seed | 0, rng: opts.seed | 0, mode: mode, target: target, n: n,
      humans: humans, names: names, scores: [], round: 0, phase: "play",
      starter: -1, nextStarter: -1, turn: 0, hands: [], boneyard: [], board: emptyBoard(),
      passed: [], passes: [], consecPasses: 0, lastAction: null, roundResult: null,
      winner: -1, handoff: false, lastHuman: -1
    };
    for (i = 0; i < n; i++) st.scores.push(0);
    deal(st);
    return st;
  }

  function humanCount(st) { return st.humans.filter(Boolean).length; }

  function deal(st) {
    st.round++;
    var deck = shuffle(st, TILES.map(function (t) { return t.slice(); }));
    var per = st.n === 2 ? 7 : 5, i;
    st.hands = [];
    for (i = 0; i < st.n; i++) st.hands.push(sortHand(deck.slice(i * per, (i + 1) * per)));
    st.boneyard = deck.slice(st.n * per);
    st.board = emptyBoard();
    st.passed = []; for (i = 0; i < st.n; i++) st.passed.push({});
    st.passes = []; st.consecPasses = 0; st.lastAction = null; st.roundResult = null;
    if (st.round === 1) st.starter = firstLeader(st);
    else st.starter = st.nextStarter >= 0 ? st.nextStarter : (st.starter + 1) % st.n;
    st.turn = st.starter;
    st.phase = "play";
    st.lastHuman = -1;
    st.handoff = humanCount(st) >= 2 && st.humans[st.turn];
  }

  // Round one: the holder of the highest double leads; with no doubles out, the heaviest tile.
  function firstLeader(st) {
    var best = -1, seat = 0, i, j;
    for (i = 0; i < st.n; i++) for (j = 0; j < st.hands[i].length; j++) {
      var t = st.hands[i][j];
      if (isDouble(t) && t[0] > best) { best = t[0]; seat = i; }
    }
    if (best >= 0) return seat;
    best = -1;
    for (i = 0; i < st.n; i++) for (j = 0; j < st.hands[i].length; j++) {
      if (pips(st.hands[i][j]) > best) { best = pips(st.hands[i][j]); seat = i; }
    }
    return seat;
  }

  function legalMoves(st, seat) {
    if (seat === undefined) seat = st.turn;
    if (st.phase !== "play" || seat !== st.turn) return [];
    return movesFor(st.hands[seat], st.board, st.mode);
  }
  function canDraw(st) { return st.phase === "play" && st.boneyard.length > 2 && legalMoves(st).length === 0; }
  function canPass(st) { return st.phase === "play" && st.boneyard.length <= 2 && legalMoves(st).length === 0; }

  function findLegal(st, move) {
    var ms = legalMoves(st);
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.end === move.end && sameTile(m.tile, move.tile)) return m;
    }
    return null;
  }

  function advance(st) {
    st.turn = (st.turn + 1) % st.n;
    st.handoff = humanCount(st) >= 2 && st.humans[st.turn] && st.turn !== st.lastHuman;
  }
  // Pass and play: the next human has taken the phone and may see their tiles.
  function confirmHandoff(st) { st.handoff = false; st.lastHuman = st.turn; }

  function play(st, move) {
    var m = findLegal(st, move);
    if (!m) return false;
    var seat = st.turn, hand = st.hands[seat];
    hand.splice(has(hand, m.tile), 1);
    st.board.seq.push({ tile: m.tile.slice(), end: m.end, placed: m.placed.slice(), seat: seat });
    applyToBoard(st.board, m, st.mode);
    var pts = st.mode === "fives" ? fivesPoints(st.board) : 0;
    if (pts) st.scores[seat] += pts;
    st.consecPasses = 0;
    st.lastAction = { seat: seat, type: "play", move: { tile: m.tile.slice(), end: m.end, placed: m.placed.slice() }, points: pts };
    if (!hand.length) endRound(st, "domino", seat);
    else advance(st);
    return true;
  }

  function draw(st) {
    if (!canDraw(st)) return false;
    var t = st.boneyard.pop();
    st.hands[st.turn].push(t);
    sortHand(st.hands[st.turn]);
    st.lastAction = { seat: st.turn, type: "draw", tile: t.slice() };
    return true;
  }

  function pass(st) {
    if (!canPass(st)) return false;
    var seat = st.turn, ends = openEnds(st.board, st.mode), vals = [];
    for (var i = 0; i < ends.length; i++) { st.passed[seat][ends[i].value] = true; if (vals.indexOf(ends[i].value) < 0) vals.push(ends[i].value); }
    st.passes.push({ seat: seat, ends: vals });
    st.consecPasses++;
    st.lastAction = { seat: seat, type: "pass", ends: vals };
    if (st.consecPasses >= st.n) endRound(st, "blocked", -1);
    else advance(st);
    return true;
  }

  function isBlocked(st) {
    if (st.boneyard.length > 2) return false;
    for (var i = 0; i < st.n; i++) if (movesFor(st.hands[i], st.board, st.mode).length) return false;
    return true;
  }

  function endRound(st, kind, winner) {
    var counts = st.hands.map(pipCount), i;
    if (kind === "blocked") {
      var low = Math.min.apply(null, counts), ties = 0;
      for (i = 0; i < st.n; i++) if (counts[i] === low) { ties++; winner = i; }
      if (ties > 1) winner = -1;
    }
    var raw = 0;
    if (winner >= 0) for (i = 0; i < st.n; i++) if (i !== winner) raw += counts[i];
    var points = winner < 0 ? 0 : (st.mode === "fives" ? roundTo5(raw) : raw);
    if (winner >= 0) st.scores[winner] += points;
    st.roundResult = {
      kind: kind, winner: winner, pips: counts, raw: raw, points: points,
      hands: st.hands.map(function (h) { return h.map(function (t) { return t.slice(); }); }),
      scores: st.scores.slice(), round: st.round, final: false
    };
    st.nextStarter = winner >= 0 ? winner : (st.starter + 1) % st.n;
    st.phase = "roundover";
    st.handoff = false;
    var top = -1, topSeat = -1, tie = false;
    for (i = 0; i < st.n; i++) {
      if (st.scores[i] > top) { top = st.scores[i]; topSeat = i; tie = false; }
      else if (st.scores[i] === top) tie = true;
    }
    if (top >= st.target && !tie) { st.winner = topSeat; st.roundResult.final = true; }
  }

  function nextRound(st) {
    if (st.phase !== "roundover") return false;
    if (st.winner >= 0) { st.phase = "gameover"; return true; }
    deal(st);
    return true;
  }

  // ---------------------------------------------------------------- AI

  // Everything the computer is allowed to look at: its own hand, the table,
  // the public pass history, tile counts and the size of the boneyard.
  function aiView(st, seat) {
    return {
      seat: seat, n: st.n, mode: st.mode, hand: st.hands[seat].map(function (t) { return t.slice(); }),
      board: cloneBoard(st.board), passed: st.passed.map(function (p) { var o = {}; for (var k in p) o[k] = true; return o; }),
      boneyard: st.boneyard.length, counts: st.hands.map(function (h) { return h.length; }), scores: st.scores.slice(), target: st.target
    };
  }

  function evalMove(v, m) {
    var b = cloneBoard(v.board);
    applyToBoard(b, m, v.mode);
    var fives = v.mode === "fives";
    var s = 0, pts = fives ? fivesPoints(b) : 0;
    s += pts * 2;
    s += pips(m.tile) * (fives ? 0.3 : 0.7);
    if (isDouble(m.tile)) s += 1.6;
    var rest = [];
    for (var i = 0; i < v.hand.length; i++) if (!sameTile(v.hand[i], m.tile)) rest.push(v.hand[i]);
    var ends = openEnds(b, v.mode), vals = {}, ev = [];
    for (i = 0; i < ends.length; i++) { if (!vals[ends[i].value]) ev.push(ends[i].value); vals[ends[i].value] = true; }
    // keep a follow up for myself
    var playable = 0, suits = {}, suitN = 0;
    for (i = 0; i < rest.length; i++) {
      var t = rest[i];
      if (vals[t[0]] || vals[t[1]]) playable++;
      if (!suits[t[0]]) { suits[t[0]] = true; suitN++; }
      if (!suits[t[1]]) { suits[t[1]] = true; suitN++; }
    }
    if (rest.length) { s += Math.min(playable, 3) * 0.9; s += suitN * 0.25; }
    // block the next player when the pass history says they lack a suit
    var next = (v.seat + 1) % v.n, np = v.passed[next], blocked = 0;
    for (i = 0; i < ev.length; i++) if (np[ev[i]]) blocked++;
    if (ev.length && blocked === ev.length) s += 6;
    else s += blocked * 1.5;
    // in fives, avoid handing out an easy five when it costs me nothing
    if (fives && !pts) {
      var sum = endsSum(b), r = sum % 5;
      if (r === 0 && sum === 0) s += 0;
      else if (r === 0 || r === 5) s -= 0;
      // ends whose change by one tile reaches a multiple of five are risky; cheap estimate
      var risky = 0;
      for (i = 0; i < ev.length; i++) for (var d = 0; d <= 6; d++) { if ((sum - ev[i] + d) % 5 === 0 && sum - ev[i] + d > 0) { risky++; break; } }
      s -= risky * 0.35;
    }
    // the last tile wins the hand outright
    if (!rest.length) s += 50;
    return s;
  }

  // Decide for the seat whose turn it is. Returns {type:"play", move} | {type:"draw"} | {type:"pass"}.
  function aiChoose(v) {
    var ms = movesFor(v.hand, v.board, v.mode);
    if (!ms.length) return v.boneyard > 2 ? { type: "draw" } : { type: "pass" };
    var best = null, bestS = -Infinity;
    for (var i = 0; i < ms.length; i++) {
      var s = evalMove(v, ms[i]);
      if (s > bestS) { bestS = s; best = ms[i]; }
    }
    return { type: "play", move: best, score: bestS };
  }
  function aiMove(st) {
    if (st.phase !== "play") return null;
    return aiChoose(aiView(st, st.turn));
  }
  // Apply whatever the computer chose. Returns the action taken.
  function aiStep(st) {
    var a = aiMove(st);
    if (!a) return null;
    if (a.type === "play") play(st, a.move);
    else if (a.type === "draw") draw(st);
    else pass(st);
    return a;
  }

  // ---------------------------------------------------------------- layout

  // Lays the played line out on a half-cell grid (a tile is 2 by 4 cells) with
  // the spinner (or the first tile when there is no spinner) at the origin.
  // Each arm owns a quadrant and snakes through it the way a hand snakes round
  // a real table: out to the edge, a one tile connector, back toward the
  // middle, connector, out again. Left arm climbs, right arm descends, the
  // spinner's up arm drifts right and its down arm drifts left.
  // Returns { tiles, heads, bbox } in cell units; heads are the open ends.
  var SHIFT = { L: { dx: 0, dy: -1 }, R: { dx: 0, dy: 1 }, U: { dx: 1, dy: 0 }, D: { dx: -1, dy: 0 } };
  // o.bx / o.by: half width and half height of the table in cells before arms turn (14 by 12 by default).
  function layoutBoard(st, o) {
    var BX = (o && o.bx) || 14, BY = (o && o.by) || 12;
    var b = st.board, main = b.main, occ = {}, tiles = [], arms = {}, i;
    var empty = { tiles: [], heads: [], bbox: { x0: -2, y0: -2, x1: 2, y1: 2 } };
    if (!main.length) return empty;
    var seats = {};
    for (i = 0; i < b.seq.length; i++) seats[key(b.seq[i].tile)] = b.seq[i].seat;
    var mark = function (cells) { for (var k = 0; k < cells.length; k++) occ[cells[k]] = true; };
    var cellsOf = function (cx, cy, w, h) {
      var out = [];
      for (var x = cx - w / 2; x < cx + w / 2; x++) for (var y = cy - h / 2; y < cy + h / 2; y++) out.push([x, y]);
      return out;
    };
    var unoccupied = function (cells) { for (var k = 0; k < cells.length; k++) if (occ[cells[k][0] + "," + cells[k][1]]) return false; return true; };
    var inRegion = function (name, cells, m) {
      m = m || 0;
      for (var k = 0; k < cells.length; k++) {
        var x = cells[k][0], y = cells[k][1];
        if (name === "L" && x > -2 - m) return false;
        if (name === "R" && x < 1 + m) return false;
        if (name === "U" && y > -2 - m) return false;
        if (name === "D" && y < 1 + m) return false;
      }
      return true;
    };
    var violation = function (name, cells) {
      var v = 0;
      for (var k = 0; k < cells.length; k++) {
        var x = cells[k][0], y = cells[k][1];
        if (name === "L") v = Math.max(v, x + 2); else if (name === "R") v = Math.max(v, 1 - x);
        else if (name === "U") v = Math.max(v, y + 2); else v = Math.max(v, 1 - y);
      }
      return v;
    };
    var inTable = function (name, cells) {
      for (var k = 0; k < cells.length; k++) {
        var x = cells[k][0], y = cells[k][1];
        if (name === "L" && x < -BX) return false;
        if (name === "R" && x >= BX) return false;
        if (name === "U" && y < -BY) return false;
        if (name === "D" && y >= BY) return false;
      }
      return true;
    };
    var addTile = function (rec) {
      rec.idx = tiles.length; rec.key = key([rec.v1, rec.v2]); rec.seat = seats[rec.key];
      tiles.push(rec); mark(rec.cells.map(function (c) { return c[0] + "," + c[1]; }));
      return rec;
    };
    var armInit = function (name, x, y, dx, dy) { arms[name] = { name: name, x: x, y: y, dx: dx, dy: dy, leg: "out", out: { dx: dx, dy: dy }, prev: null, lastDbl: adbl }; };

    // anchor tile at the origin
    var rootIdx = 0;
    for (i = 0; i < b.seq.length; i++) if (b.seq[i].end === "L") rootIdx++;
    var ai = b.spinner >= 0 ? b.spinner : rootIdx, anchor = main[ai], adbl = isDouble(anchor);
    if (adbl) {
      addTile({ cx: 0, cy: 0, horiz: false, v1: anchor[0], v2: anchor[1], dbl: true, cells: cellsOf(0, 0, 2, 4), arm: "S", spinner: b.spinner === ai });
      armInit("L", -1, 0, -1, 0); armInit("R", 1, 0, 1, 0); armInit("U", 0, -2, 0, -1); armInit("D", 0, 2, 0, 1);
    } else {
      addTile({ cx: 0, cy: 0, horiz: true, v1: anchor[0], v2: anchor[1], dbl: false, cells: cellsOf(0, 0, 4, 2), arm: "S", spinner: false });
      armInit("L", -2, 0, -1, 0); armInit("R", 2, 0, 1, 0);
    }

    // Geometry of the next tile from arm head a travelling in direction d.
    function candidate(a, d, dbl, variant) {
      var dx = d.dx, dy = d.dy, turn = !(dx === a.dx && dy === a.dy), cx, cy;
      var along = dbl ? 1 : 2; // half length along the direction of travel
      if (turn && dbl && !variant) {
        // a turning double lies alongside the end of the previous tile
        var side = a.lastDbl ? 3 : 2;
        cx = a.x - a.dx + dx * side; cy = a.y - a.dy + dy * side;
      } else if (turn && dbl) {
        // or hangs off its end
        cx = a.x + a.dx * 2 + dx; cy = a.y + a.dy * 2 + dy;
      } else if (turn) { cx = a.x + a.dx + dx * along; cy = a.y + a.dy + dy * along; }
      else { cx = a.x + dx * along; cy = a.y + dy * along; }
      var horiz = dbl ? dx === 0 : dy === 0;
      var w = horiz ? 4 : 2, ht = horiz ? 2 : 4;
      return {
        cx: cx, cy: cy, hx: cx + dx * along, hy: cy + dy * along, dx: dx, dy: dy, horiz: horiz, turn: turn, cells: cellsOf(cx, cy, w, ht),
        // v1 is the left (horizontal) or top (vertical) half
        v1: function (p) { return dbl ? p[0] : ((dx > 0 || dy > 0) ? p[0] : p[1]); },
        v2: function (p) { return dbl ? p[1] : ((dx > 0 || dy > 0) ? p[1] : p[0]); }
      };
    }
    // Pick where the next tile on arm a goes. Returns {cand, leg, prev} without committing.
    function nextSpot(a, dbl) {
      var name = a.name, shift = SHIFT[name], straight = { dx: a.dx, dy: a.dy }, c, res = null, k;
      var fits = function (cc, table, margin) { return unoccupied(cc.cells) && inRegion(name, cc.cells, margin || 0) && (!table || inTable(name, cc.cells)); };
      // a turning double has two footprints to try
      var turnTo = function (d, margin) {
        for (var v = 0; v < (dbl ? 2 : 1); v++) { var cc = candidate(a, d, dbl, v); if (fits(cc, false, margin)) return cc; }
        return null;
      };
      if (a.leg === "conn") {
        var backDir = { dx: -a.prev.dx, dy: -a.prev.dy };
        var nextLeg = (a.prev.dx === a.out.dx && a.prev.dy === a.out.dy) ? "in" : "out";
        c = turnTo(backDir, nextLeg === "in" ? 2 : 0);
        if (c) res = { cand: c, leg: nextLeg, prev: a.prev };
        if (!res) { c = candidate(a, straight, dbl); if (fits(c, false, 0)) res = { cand: c, leg: "conn", prev: a.prev }; }
      } else {
        c = candidate(a, straight, dbl);
        // one step lookahead: does the arm still have an exit after this tile?
        var roomAfter = function (cc) {
          var a2 = { name: name, x: cc.hx, y: cc.hy, dx: cc.dx, dy: cc.dy, lastDbl: dbl, leg: a.leg, out: a.out };
          var s2 = candidate(a2, straight, false);
          if (fits(s2, a.leg === "out", a.leg === "in" ? 2 : 0)) return true;
          return fits(candidate(a2, shift, false), false, 0);
        };
        // inbound legs stop two cells early so the connector has room
        if (fits(c, a.leg === "out", a.leg === "in" ? 2 : 0)) {
          if (roomAfter(c)) res = { cand: c, leg: a.leg, prev: a.prev };
          else {
            var early = turnTo(shift, 0) || turnTo({ dx: -shift.dx, dy: -shift.dy }, 0);
            res = early ? { cand: early, leg: "conn", prev: straight } : { cand: c, leg: a.leg, prev: a.prev };
          }
        }
        // a double is short: on the way out let it poke past the edge rather than turn
        else if (dbl && a.leg === "out" && unoccupied(c.cells) && inRegion(name, c.cells, 0)) res = { cand: c, leg: a.leg, prev: a.prev };
        if (!res) { c = turnTo(shift, 0); if (c) res = { cand: c, leg: "conn", prev: straight }; }
        if (!res) { c = turnTo({ dx: -shift.dx, dy: -shift.dy }, 0); if (c) res = { cand: c, leg: "conn", prev: straight }; }
      }
      if (!res) {
        // last resort: the free spot that strays least from the arm's quadrant, then straight regardless
        var all = [shift, { dx: -shift.dx, dy: -shift.dy }, straight], bestV = Infinity;
        for (k = 0; k < all.length; k++) {
          for (var v = 0; v < (dbl && k < 2 ? 2 : 1); v++) {
            c = candidate(a, all[k], dbl, v);
            if (!unoccupied(c.cells)) continue;
            var viol = violation(name, c.cells);
            if (viol < bestV) { bestV = viol; res = { cand: c, leg: k === 2 ? a.leg : "conn", prev: k === 2 ? a.prev : straight }; }
          }
        }
        if (!res) res = { cand: candidate(a, straight, dbl), leg: a.leg, prev: a.prev };
      }
      return res;
    }
    var grow = function (name, placed) {
      var a = arms[name], dbl = placed[0] === placed[1], n = nextSpot(a, dbl), c = n.cand;
      addTile({ cx: c.cx, cy: c.cy, horiz: c.horiz, v1: c.v1(placed), v2: c.v2(placed), dbl: dbl, cells: c.cells, arm: name, turn: c.turn, spinner: false });
      a.x = c.hx; a.y = c.hy; a.dx = c.dx; a.dy = c.dy; a.leg = n.leg; a.prev = n.prev; a.lastDbl = dbl;
    };
    for (i = ai - 1; i >= 0; i--) grow("L", [main[i][1], main[i][0]]);
    for (i = ai + 1; i < main.length; i++) grow("R", main[i]);
    for (i = 0; i < b.up.length; i++) grow("U", b.up[i]);
    for (i = 0; i < b.down.length; i++) grow("D", b.down[i]);

    // where the next tile would go, for tap targets
    var ends = openEnds(b, st.mode), hs = [];
    for (i = 0; i < ends.length; i++) {
      var e = ends[i], a = arms[e.end];
      if (!a) continue;
      var c = nextSpot(a, false).cand;
      hs.push({ end: e.end, value: e.value, x: a.x, y: a.y, dx: a.dx, dy: a.dy, cx: c.cx, cy: c.cy, horiz: c.horiz, turn: c.turn, tdx: c.dx, tdy: c.dy });
    }
    var bb = { x0: -2, y0: -2, x1: 2, y1: 2 };
    var bump = function (cx, cy, horiz) {
      var w = horiz ? 4 : 2, hgt = horiz ? 2 : 4;
      bb.x0 = Math.min(bb.x0, cx - w / 2); bb.x1 = Math.max(bb.x1, cx + w / 2);
      bb.y0 = Math.min(bb.y0, cy - hgt / 2); bb.y1 = Math.max(bb.y1, cy + hgt / 2);
    };
    for (i = 0; i < tiles.length; i++) bump(tiles[i].cx, tiles[i].cy, tiles[i].horiz);
    for (i = 0; i < hs.length; i++) bump(hs[i].cx, hs[i].cy, hs[i].horiz);
    for (i = 0; i < tiles.length; i++) tiles[i].cells = tiles[i].cells.map(function (c) { return c[0] + "," + c[1]; });
    return { tiles: tiles, heads: hs, bbox: bb };
  }

  // ---------------------------------------------------------------- export

  return {
    TILES: TILES, AI_NAMES: AI_NAMES, ENDS: ENDS,
    key: key, sameTile: sameTile, isDouble: isDouble, pips: pips, pipCount: pipCount, roundTo5: roundTo5, sortHand: sortHand,
    newGame: newGame, deal: deal, legalMoves: legalMoves, play: play, draw: draw, pass: pass, canDraw: canDraw, canPass: canPass,
    openEnds: function (st) { return openEnds(st.board, st.mode); }, endsSum: function (st) { return endsSum(st.board); },
    fivesPoints: function (st) { return fivesPoints(st.board); }, isBlocked: isBlocked, nextRound: nextRound,
    confirmHandoff: confirmHandoff, humanCount: humanCount, pipCounts: function (st) { return st.hands.map(pipCount); },
    aiView: aiView, aiChoose: aiChoose, aiMove: aiMove, aiStep: aiStep, evalMove: evalMove,
    layoutBoard: layoutBoard, applyToBoard: applyToBoard, cloneBoard: cloneBoard, emptyBoard: emptyBoard
  };
});
