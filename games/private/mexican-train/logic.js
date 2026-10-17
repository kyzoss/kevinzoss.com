// Mexican Train rules engine and computer players. Pure logic: no DOM, no
// clock reads, all randomness from a seeded mulberry32 whose state lives inside
// the game state, so a state is plain JSON and the same seed always deals the
// same tiles.
//
// Tiles are [a, b] pairs with a <= b in hands and the boneyard. Tiles on a
// train are stored oriented: [nearPip, farPip], where nearPip touches the
// previous tile (or the engine) and farPip is the open end.
// Trains 0..players-1 are the personal trains, train index `players` is the
// shared Mexican train.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MexicanTrainLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_PIP = 12;
  var HAND_SIZES = { 2: 15, 3: 15, 4: 15, 5: 12, 6: 12, 7: 10, 8: 10 };
  var AI_NAMES = ["Mabel", "Otis", "Ruth", "Hank", "Pearl", "Cyrus", "Ida"];
  var RUN_BUDGET = 60000;

  // ---------------------------------------------------------------- tiles

  function allTiles() {
    var t = [];
    for (var a = 0; a <= MAX_PIP; a++) for (var b = a; b <= MAX_PIP; b++) t.push([a, b]);
    return t;
  }
  function tileKey(t) { return Math.min(t[0], t[1]) + "-" + Math.max(t[0], t[1]); }
  function sameTile(a, b) { return tileKey(a) === tileKey(b); }
  function isDouble(t) { return t[0] === t[1]; }
  function pips(t) { return t[0] + t[1]; }
  function tileValue(t, doubleBlank) { return t[0] === 0 && t[1] === 0 ? doubleBlank : pips(t); }
  function handValue(hand, doubleBlank) {
    var s = 0;
    for (var i = 0; i < hand.length; i++) s += tileValue(hand[i], doubleBlank);
    return s;
  }
  function hasPip(t, p) { return t[0] === p || t[1] === p; }
  function otherPip(t, p) { return t[0] === p ? t[1] : t[0]; }
  function indexOfTile(hand, t) {
    for (var i = 0; i < hand.length; i++) if (sameTile(hand[i], t)) return i;
    return -1;
  }
  // Sort by high number then by the other number; or by pip total descending.
  function sortHand(hand, mode) {
    return hand.slice().sort(function (a, b) {
      if (mode === "pips") return pips(b) - pips(a) || b[1] - a[1];
      return b[1] - a[1] || b[0] - a[0];
    });
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
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ---------------------------------------------------------------- setup

  function engineFor(round) { return MAX_PIP - (round - 1); }
  function handSize(players) { return HAND_SIZES[players]; }

  // opts: { players: 2..8, rounds: 13|7|4, seed, humans: [bool], doubleBlank: 50|0, names: [] }
  function newGame(opts) {
    opts = opts || {};
    var players = Math.max(2, Math.min(8, opts.players | 0 || 4));
    var rounds = opts.rounds === 7 || opts.rounds === 4 ? opts.rounds : 13;
    var humans = [], names = [];
    var ai = 0;
    for (var i = 0; i < players; i++) {
      var h = opts.humans ? !!opts.humans[i] : i === 0;
      humans.push(h);
      var nm = opts.names && opts.names[i] ? String(opts.names[i]).slice(0, 14) : null;
      if (!nm) nm = h ? (i === 0 && !allHuman(opts.humans, players) ? "You" : "Player " + (i + 1)) : AI_NAMES[ai++ % AI_NAMES.length];
      names.push(nm);
    }
    var st = {
      seed: opts.seed | 0,
      rng: opts.seed | 0,
      players: players,
      rounds: rounds,
      humans: humans,
      names: names,
      doubleBlank: opts.doubleBlank === 0 ? 0 : 50,
      round: 0,
      engine: MAX_PIP,
      phase: "play",
      hands: [],
      boneyard: [],
      trains: [],
      turn: 0,
      starter: 0,
      firstTurn: [],
      pending: null,
      played: false,
      drew: false,
      stall: 0,
      scores: [],
      totals: [],
      lastRound: null,
      log: []
    };
    for (i = 0; i < players; i++) st.totals.push(0);
    deal(st);
    return st;
  }
  function allHuman(humans, n) {
    if (!humans) return false;
    for (var i = 0; i < n; i++) if (!humans[i]) return false;
    return true;
  }

  function deal(st) {
    st.round += 1;
    st.engine = engineFor(st.round);
    var tiles = allTiles().filter(function (t) { return !(t[0] === st.engine && t[1] === st.engine); });
    shuffle(st, tiles);
    var n = handSize(st.players);
    st.hands = [];
    for (var i = 0; i < st.players; i++) st.hands.push(tiles.splice(0, n));
    st.boneyard = tiles;
    st.trains = [];
    for (i = 0; i <= st.players; i++) st.trains.push({ tiles: [], end: st.engine, open: i === st.players, mex: i === st.players });
    st.starter = (st.round - 1) % st.players;
    st.turn = st.starter;
    st.firstTurn = [];
    for (i = 0; i < st.players; i++) st.firstTurn.push(true);
    st.pending = null;
    st.played = false;
    st.drew = false;
    st.stall = 0;
    st.phase = "play";
    st.log = [];
    st.lastRound = null;
  }

  // ---------------------------------------------------------------- queries

  function trainAllowed(st, seat, idx) {
    if (st.pending) return st.pending.train === idx;
    if (idx === seat) return true;
    if (st.firstTurn[seat]) return false;
    var tr = st.trains[idx];
    return !!(tr && (tr.mex || tr.open));
  }

  // Every legal {tile, train} for `seat` (only the player to move has any).
  function legalMoves(st, seat) {
    if (seat === undefined) seat = st.turn;
    var out = [];
    if (st.phase !== "play" || seat !== st.turn) return out;
    var hand = st.hands[seat];
    for (var ti = 0; ti < st.trains.length; ti++) {
      if (!trainAllowed(st, seat, ti)) continue;
      var end = st.trains[ti].end;
      for (var h = 0; h < hand.length; h++) if (hasPip(hand[h], end)) out.push({ tile: hand[h].slice(), train: ti });
    }
    return out;
  }
  function hasMoves(st) { return legalMoves(st, st.turn).length > 0; }
  function canDraw(st) {
    return st.phase === "play" && !st.drew && st.boneyard.length > 0 && !hasMoves(st) && (!st.played || !!st.pending);
  }
  function canPass(st) {
    if (st.phase !== "play") return false;
    if (hasMoves(st)) return !!(st.firstTurn[st.turn] && st.played && !st.pending);
    if (st.drew || st.boneyard.length === 0) return true;
    return st.played && !st.pending;
  }
  // Whether the current player may still lay tiles freely on their own train.
  function inFirstTurn(st) { return st.phase === "play" && !!st.firstTurn[st.turn]; }

  // ---------------------------------------------------------------- actions

  function advanceTurn(st) {
    st.firstTurn[st.turn] = false;
    st.turn = (st.turn + 1) % st.players;
    st.played = false;
    st.drew = false;
  }

  // move: { tile: [a,b], train: idx }. Returns true when applied.
  function play(st, move) {
    if (!move || st.phase !== "play") return false;
    var seat = st.turn;
    var ms = legalMoves(st, seat);
    var ok = false;
    for (var i = 0; i < ms.length; i++) if (ms[i].train === move.train && sameTile(ms[i].tile, move.tile)) { ok = true; break; }
    if (!ok) return false;
    var hand = st.hands[seat];
    var hi = indexOfTile(hand, move.tile);
    var tile = hand.splice(hi, 1)[0];
    var tr = st.trains[move.train];
    var near = tr.end, far = otherPip(tile, near);
    tr.tiles.push([near, far]);
    tr.end = far;
    if (move.train === seat) tr.open = false;
    st.played = true;
    st.stall = 0;
    if (st.pending && st.pending.train === move.train) st.pending = null;
    if (isDouble(tile)) st.pending = { train: move.train, pip: tile[0] };
    st.log.push({ seat: seat, tile: tileKey(tile), train: move.train });
    if (hand.length === 0) { st.pending = null; endRound(st, "out", seat); return true; }
    if (!st.pending && !st.firstTurn[seat]) advanceTurn(st);
    return true;
  }

  // Draw one tile from the boneyard. Returns the tile or null.
  function draw(st) {
    if (!canDraw(st)) return null;
    var t = st.boneyard.pop();
    st.hands[st.turn].push(t);
    st.drew = true;
    st.log.push({ seat: st.turn, draw: true });
    return t;
  }

  // End the turn. Opens the player's train when nothing was played (or a
  // double they laid is still unsatisfied). Returns true when applied.
  function pass(st) {
    if (!canPass(st)) return false;
    var seat = st.turn;
    var opened = false;
    if (!st.played || st.pending) { st.trains[seat].open = true; opened = true; }
    if (!st.played) st.stall += 1;
    st.log.push({ seat: seat, pass: true, opened: opened });
    advanceTurn(st);
    if (st.boneyard.length === 0 && st.stall >= st.players) endRound(st, "blocked", -1);
    return true;
  }

  function endRound(st, reason, winner) {
    var round = [];
    for (var i = 0; i < st.players; i++) {
      var v = handValue(st.hands[i], st.doubleBlank);
      round.push(v);
      st.totals[i] += v;
    }
    st.scores.push(round);
    st.lastRound = { reason: reason, winner: winner, scores: round, round: st.round, engine: st.engine };
    st.phase = st.round >= st.rounds ? "gameOver" : "roundOver";
    if (st.phase === "gameOver") st.standings = standings(st);
  }

  function nextRound(st) {
    if (st.phase !== "roundOver") return false;
    deal(st);
    return true;
  }

  function standings(st) {
    var rows = [];
    for (var i = 0; i < st.players; i++) rows.push({ seat: i, name: st.names[i], total: st.totals[i] });
    rows.sort(function (a, b) { return a.total - b.total || a.seat - b.seat; });
    var rank = 0;
    for (i = 0; i < rows.length; i++) { if (i === 0 || rows[i].total !== rows[i - 1].total) rank = i + 1; rows[i].rank = rank; }
    return rows;
  }

  // ---------------------------------------------------------------- runs

  // Longest continuous run of tiles from `hand` starting at pip `engine`.
  // Ties prefer a run that does not end on a double, then more pips shed.
  // Returns oriented tiles [near, far]. Bounded by a node budget.
  function bestRun(hand, engine) {
    var n = hand.length;
    var used = [];
    for (var i = 0; i < n; i++) used.push(false);
    var best = [], bestScore = -1, budget = RUN_BUDGET;
    var cur = [];
    function score(run) {
      var p = 0;
      for (var k = 0; k < run.length; k++) p += run[k][0] + run[k][1];
      var endsDouble = run.length && run[run.length - 1][0] === run[run.length - 1][1] && run.length < n;
      return run.length * 10000 + (endsDouble ? 0 : 1000) + p;
    }
    function dfs(end) {
      if (budget-- <= 0) return;
      var s = score(cur);
      if (s > bestScore) { bestScore = s; best = cur.slice(); }
      if (cur.length + (n - cur.length) < best.length) return;
      for (var k = 0; k < n; k++) {
        if (used[k] || !hasPip(hand[k], end)) continue;
        used[k] = true;
        var far = otherPip(hand[k], end);
        cur.push([end, far]);
        dfs(far);
        cur.pop();
        used[k] = false;
        if (budget <= 0) return;
      }
    }
    dfs(engine);
    return best;
  }

  // ---------------------------------------------------------------- AI

  // Returns {type:"play", move} | {type:"draw"} | {type:"pass"}; always legal.
  function aiMove(st) {
    if (st.phase !== "play") return null;
    var seat = st.turn;
    var hand = st.hands[seat];
    var ms = legalMoves(st, seat);
    if (ms.length === 0) {
      if (canDraw(st)) return { type: "draw" };
      return { type: "pass" };
    }
    if (st.firstTurn[seat] && !st.pending) {
      var run = bestRun(hand, st.trains[seat].end);
      if (run.length) {
        // Do not finish the run on a double we cannot satisfy (unless it empties the hand).
        var last = run[run.length - 1];
        if (run.length > 1 && last[0] === last[1] && run.length < hand.length) run = run.slice(0, run.length - 1);
        return { type: "play", move: { tile: [Math.min(run[0][0], run[0][1]), Math.max(run[0][0], run[0][1])], train: seat } };
      }
      if (st.played && canPass(st)) return { type: "pass" };
    }
    var ownEnd = st.trains[seat].end;
    var ownBlocked = true;
    for (var i = 0; i < hand.length; i++) if (hasPip(hand[i], ownEnd)) { ownBlocked = false; break; }
    var bestM = null, bestS = -Infinity;
    for (i = 0; i < ms.length; i++) {
      var m = ms[i], t = m.tile, tr = st.trains[m.train];
      var s = pips(t);
      var rest = hand.filter(function (h) { return !sameTile(h, t); });
      var newEnd = otherPip(t, tr.end);
      if (rest.length === 0) s += 1000;
      if (isDouble(t) && rest.length) {
        var sat = rest.some(function (h) { return hasPip(h, t[0]); });
        s += sat ? 9 : -30;
      }
      var follow = 0;
      for (var k = 0; k < rest.length; k++) if (hasPip(rest[k], newEnd)) follow++;
      if (m.train === seat) {
        s += 2 + follow * 1.5;
        if (tr.open) s += 7;
      } else if (tr.mex) {
        s += follow * 0.5;
      } else {
        s -= 3;
        if (ownBlocked) s += 1.5;
        s += follow * 0.25;
      }
      if (st.pending && m.train === st.pending.train) s += 1;
      if (s > bestS) { bestS = s; bestM = m; }
    }
    return { type: "play", move: bestM };
  }

  function applyAction(st, act) {
    if (!act) return false;
    if (act.type === "play") return play(st, act.move);
    if (act.type === "draw") return draw(st) !== null;
    if (act.type === "pass") return pass(st);
    return false;
  }

  return {
    MAX_PIP: MAX_PIP,
    HAND_SIZES: HAND_SIZES,
    AI_NAMES: AI_NAMES,
    allTiles: allTiles,
    tileKey: tileKey,
    sameTile: sameTile,
    isDouble: isDouble,
    pips: pips,
    tileValue: tileValue,
    handValue: handValue,
    sortHand: sortHand,
    engineFor: engineFor,
    handSize: handSize,
    newGame: newGame,
    legalMoves: legalMoves,
    hasMoves: hasMoves,
    canDraw: canDraw,
    canPass: canPass,
    inFirstTurn: inFirstTurn,
    play: play,
    draw: draw,
    pass: pass,
    nextRound: nextRound,
    standings: standings,
    bestRun: bestRun,
    aiMove: aiMove,
    applyAction: applyAction
  };
});
