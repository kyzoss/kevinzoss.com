/* Stratego rules and computer opponent. Pure logic: no DOM, JSON-serializable state,
 * every random draw comes from a seeded mulberry32 stream kept in the state.
 *
 * Board: 100 cells, index = row * 10 + col, row 0 is the top (Blue's back row),
 * row 9 is the bottom (Red's back row). Side 0 is Red (the human), side 1 is Blue.
 * Rank numbers: 0 Flag, 1 Spy, 2 Scout ... 10 Marshal, 11 Bomb. Higher is stronger.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StrategoLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FLAG = 0, SPY = 1, SCOUT = 2, MINER = 3, MARSHAL = 10, BOMB = 11;
  var RED = 0, BLUE = 1, SIZE = 10;
  var COUNTS = [1, 1, 8, 5, 4, 4, 4, 3, 2, 1, 1, 6];
  var NAMES = ["Flag", "Spy", "Scout", "Miner", "Sergeant", "Lieutenant", "Captain", "Major", "Colonel", "General", "Marshal", "Bomb"];
  var LABELS = ["F", "S", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B"];
  var DRAW_AFTER = 300; // consecutive moves without any attack
  var SHUFFLE_MAX = 3;

  // ---------- geometry ----------
  var LAKE = [];
  (function () {
    for (var i = 0; i < 100; i++) {
      var r = (i / 10) | 0, c = i % 10;
      LAKE.push((r === 4 || r === 5) && (c === 2 || c === 3 || c === 6 || c === 7));
    }
  })();
  function isLake(i) { return LAKE[i]; }
  function rowOf(i) { return (i / 10) | 0; }
  function colOf(i) { return i % 10; }
  function inHome(side, i) { var r = rowOf(i); return side === RED ? r >= 6 : r <= 3; }
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var NB = []; // orthogonal neighbours that are on the board and not lake
  for (var ni = 0; ni < 100; ni++) {
    var lst = [];
    for (var d = 0; d < 4; d++) {
      var rr = rowOf(ni) + DIRS[d][0], cc = colOf(ni) + DIRS[d][1];
      if (rr < 0 || rr > 9 || cc < 0 || cc > 9) continue;
      var j = rr * 10 + cc;
      if (!LAKE[j]) lst.push(j);
    }
    NB.push(lst);
  }
  // Scout rays: for every cell and direction, the list of cells in that line.
  var RAYS = [];
  for (var ri = 0; ri < 100; ri++) {
    var rays = [];
    for (var rd = 0; rd < 4; rd++) {
      var line = [], r2 = rowOf(ri), c2 = colOf(ri);
      for (;;) {
        r2 += DIRS[rd][0]; c2 += DIRS[rd][1];
        if (r2 < 0 || r2 > 9 || c2 < 0 || c2 > 9) break;
        var k = r2 * 10 + c2;
        if (LAKE[k]) break;
        line.push(k);
      }
      rays.push(line);
    }
    RAYS.push(rays);
  }
  // Shortest walking distance ignoring pieces (lakes only).
  var DIST = [];
  (function () {
    for (var s = 0; s < 100; s++) {
      var dist = new Array(100).fill(99);
      if (LAKE[s]) { DIST.push(dist); continue; }
      dist[s] = 0;
      var q = [s];
      for (var h = 0; h < q.length; h++) {
        var u = q[h];
        for (var t = 0; t < NB[u].length; t++) {
          var w = NB[u][t];
          if (dist[w] === 99) { dist[w] = dist[u] + 1; q.push(w); }
        }
      }
      DIST.push(dist);
    }
  })();

  // ---------- seeded random ----------
  function nextRand(s, key) {
    var a = (s[key] + 0x6D2B79F5) | 0;
    s[key] = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rnd(s) { return nextRand(s, "rng"); }
  function rndU(s) { return nextRand(s, "rngU"); }

  // ---------- state ----------
  function mkPiece(s, side, rank) {
    return { id: s.nextId++, o: side, r: rank, mv: false, rev: false, n: 0 };
  }
  function blankState(seed) {
    seed = (seed === undefined ? 1 : seed) | 0;
    return {
      v: 1, seed: seed, rng: seed, rngU: (seed ^ 0x5bd1e995) | 0, nextId: 1,
      board: new Array(100).fill(null),
      turn: RED, phase: "setup", winner: null, reason: "",
      dead: [[], []], last: [null, null], noCombat: 0, ply: 0, log: []
    };
  }
  function newGame(opts) {
    opts = opts || {};
    var s = blankState(opts.seed);
    aiSetup(s, BLUE);
    return s;
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // Build a playing state from [[side, rank, index], ...] (used by tests and tools).
  function fromPieces(list, opts) {
    opts = opts || {};
    var s = blankState(opts.seed);
    for (var i = 0; i < list.length; i++) {
      var p = mkPiece(s, list[i][0], list[i][1]);
      if (list[i][3]) { p.mv = !!list[i][3].mv; p.rev = !!list[i][3].rev; }
      s.board[list[i][2]] = p;
    }
    s.phase = "play";
    s.turn = opts.turn === undefined ? RED : opts.turn;
    return s;
  }

  // ---------- setup ----------
  function trayCounts(s, side) {
    side = side || RED;
    var left = COUNTS.slice();
    for (var i = 0; i < 100; i++) { var p = s.board[i]; if (p && p.o === side) left[p.r]--; }
    return left;
  }
  function placedCount(s, side) {
    var n = 0;
    for (var i = 0; i < 100; i++) if (s.board[i] && s.board[i].o === (side || RED)) n++;
    return n;
  }
  function setupComplete(s) { return placedCount(s, RED) === 40; }
  function placePiece(s, rank, idx) {
    if (s.phase !== "setup" || !inHome(RED, idx) || LAKE[idx]) return false;
    var left = trayCounts(s, RED);
    var old = s.board[idx];
    if (old) left[old.r]++;
    if (!(rank >= 0 && rank <= 11) || left[rank] <= 0) return false;
    s.board[idx] = mkPiece(s, RED, rank);
    return true;
  }
  function removePiece(s, idx) {
    if (s.phase !== "setup" || !s.board[idx] || s.board[idx].o !== RED) return false;
    s.board[idx] = null;
    return true;
  }
  function swapPieces(s, a, b) {
    if (s.phase !== "setup" || !inHome(RED, a) || !inHome(RED, b)) return false;
    var pa = s.board[a], pb = s.board[b];
    if ((pa && pa.o !== RED) || (pb && pb.o !== RED) || (!pa && !pb)) return false;
    s.board[a] = pb; s.board[b] = pa;
    return true;
  }
  function clearSetup(s) {
    if (s.phase !== "setup") return false;
    for (var i = 0; i < 100; i++) if (s.board[i] && s.board[i].o === RED) s.board[i] = null;
    return true;
  }

  function absIdx(side, rr, cc) { return (side === BLUE ? rr : 9 - rr) * 10 + cc; }

  // Generate a 4x10 arrangement in side-relative coordinates (rr 0 is the back row).
  var ROW_PREF = {
    10: [0, 0.5, 2, 4], 9: [0, 0.5, 2.5, 3], 8: [0, 1, 3, 3], 7: [0.2, 1, 3, 2.5],
    6: [0.5, 2, 3, 2.5], 5: [1, 2.5, 3, 2], 4: [1.5, 3, 2.5, 1.5], 2: [0.3, 1.5, 2.5, 3],
    3: [4, 3, 1, 0.3], 1: [0.3, 2.5, 2.5, 0.4]
  };
  function genSetup(kind, rf) {
    var g = [], left = COUNTS.slice(), i, rr, cc;
    for (rr = 0; rr < 4; rr++) g.push(new Array(10).fill(-1));
    function pick(n) { return Math.floor(rf() * n); }
    function free(r, c) { return r >= 0 && r < 4 && c >= 0 && c < 10 && g[r][c] === -1; }
    function put(r, c, rank) { if (free(r, c) && left[rank] > 0) { g[r][c] = rank; left[rank]--; return true; } return false; }
    function pickSlot(wf) {
      var slots = [], tot = 0;
      for (var r = 0; r < 4; r++) for (var c = 0; c < 10; c++) if (g[r][c] === -1) {
        var w = Math.max(0.05, wf(r, c)); slots.push([r, c, w]); tot += w;
      }
      var x = rf() * tot;
      for (var k = 0; k < slots.length; k++) { x -= slots[k][2]; if (x <= 0) return slots[k]; }
      return slots[slots.length - 1];
    }
    var fc = 1 + pick(8), front3 = 0;
    if (kind === "corner") {
      fc = pick(2) ? 9 : 0;
      var inw = fc === 0 ? 1 : -1;
      put(0, fc, FLAG); put(0, fc + inw, BOMB); put(1, fc, BOMB); put(1, fc + inw, BOMB);
    } else if (kind === "decoy") {
      put(0, fc, FLAG); put(0, fc - 1, BOMB); put(0, fc + 1, BOMB);
      var dc, tries = 0;
      do { dc = 1 + pick(8); tries++; } while (Math.abs(dc - fc) < 3 && tries < 50);
      put(0, dc - 1, BOMB); put(0, dc + 1, BOMB); put(1, dc, BOMB);
      put(0, dc, pick(2) ? 4 : 5); // a cheap piece sits where a flag would
    } else if (kind === "open") {
      put(0, fc, FLAG); put(1, fc, BOMB);
      put(0, fc - 1, 3); put(0, fc + 1, pick(2) ? 4 : 3);
    } else if (kind === "aggressive") {
      put(0, fc, FLAG); put(1, fc, BOMB); if (pick(2)) put(0, fc - 1, BOMB); else put(0, fc + 1, BOMB);
    } else if (kind === "defensive") {
      put(0, fc, FLAG); put(0, fc - 1, BOMB); put(0, fc + 1, BOMB); put(1, fc, BOMB);
      put(1, fc - 1, BOMB); put(1, fc + 1, BOMB);
    } else { // classic
      put(0, fc, FLAG); put(0, fc - 1, BOMB); put(0, fc + 1, BOMB); put(1, fc, BOMB);
    }
    // remaining bombs
    var wB = kind === "aggressive" ? [1.5, 2, 1, 0] : [0, 1, 2, 2];
    while (left[BOMB] > 0) {
      var sl = pickSlot(function (r, c) {
        if (r === 3 && front3 >= 2) return 0.01;
        return wB[r];
      });
      if (sl[0] === 3) front3++;
      put(sl[0], sl[1], BOMB);
    }
    // everything else by role preference
    var order = [10, 9, 1, 8, 8, 7, 7, 7, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4];
    var gen = null, scouts = [];
    for (i = 0; i < order.length; i++) {
      var rank = order[i];
      if (left[rank] <= 0) continue;
      var pref = ROW_PREF[rank];
      var sl2 = pickSlot(function (r, c) {
        var w = pref[r];
        if (kind === "aggressive" && rank >= 7 && r === 3) w *= 1.6;
        if (kind === "defensive" && rank >= 7 && r === 2) w *= 1.5;
        if (rank === SPY && gen) {
          var dd = Math.abs(gen[0] - r) + Math.abs(gen[1] - c);
          w = dd === 1 ? 9 : dd === 2 ? 2.5 : 0.3;
        }
        if (rank === SCOUT) {
          for (var q = 0; q < scouts.length; q++) {
            if (scouts[q][0] === r && Math.abs(scouts[q][1] - c) <= 1) w *= 0.3;
            else if (scouts[q][1] === c) w *= 0.6;
          }
        }
        return w;
      });
      put(sl2[0], sl2[1], rank);
      if (rank === 9) gen = [sl2[0], sl2[1]];
      if (rank === SCOUT) scouts.push([sl2[0], sl2[1]]);
    }
    return g;
  }
  function applySetup(s, side, grid) {
    for (var rr = 0; rr < 4; rr++) for (var cc = 0; cc < 10; cc++) {
      s.board[absIdx(side, rr, cc)] = mkPiece(s, side, grid[rr][cc]);
    }
  }
  var AI_KINDS = ["classic", "classic", "decoy", "corner", "open", "defensive", "aggressive"];
  function aiSetup(s, side, kind) {
    for (var i = 0; i < 100; i++) if (s.board[i] && s.board[i].o === side) s.board[i] = null;
    if (!kind) kind = AI_KINDS[Math.floor(rnd(s) * AI_KINDS.length)];
    applySetup(s, side, genSetup(kind, function () { return rnd(s); }));
    return kind;
  }
  // Human helpers: draw from the separate utility stream so the AI is unaffected.
  function presetSetup(s, kind) {
    if (s.phase !== "setup") return false;
    clearSetup(s);
    applySetup(s, RED, genSetup(kind, function () { return rndU(s); }));
    return true;
  }
  function randomSetup(s) {
    var ks = ["classic", "decoy", "corner", "open"];
    return presetSetup(s, ks[Math.floor(rndU(s) * ks.length)]);
  }
  function startGame(s) {
    if (s.phase !== "setup" || !setupComplete(s)) return false;
    s.phase = "play"; s.turn = RED;
    return true;
  }

  // ---------- moves ----------
  function pieceDests(board, i, out) {
    var p = board[i];
    if (!p || p.r === FLAG || p.r === BOMB) return out;
    var k, t, q;
    if (p.r === SCOUT) {
      var rays = RAYS[i];
      for (k = 0; k < 4; k++) {
        var line = rays[k];
        for (t = 0; t < line.length; t++) {
          q = board[line[t]];
          if (!q) out.push(line[t]);
          else { if (q.o !== p.o) out.push(line[t]); break; }
        }
      }
      return out;
    }
    var nb = NB[i];
    for (k = 0; k < nb.length; k++) {
      q = board[nb[k]];
      if (!q || q.o !== p.o) out.push(nb[k]);
    }
    return out;
  }
  function repeatBlocked(s, p, from, to) {
    var l = s.last[p.o];
    return !!(l && l.id === p.id && l.from === to && l.to === from && l.n >= SHUFFLE_MAX);
  }
  function legalMoves(s, side) {
    if (side === undefined) side = s.turn;
    var out = [], tmp = [];
    for (var i = 0; i < 100; i++) {
      var p = s.board[i];
      if (!p || p.o !== side) continue;
      tmp.length = 0;
      pieceDests(s.board, i, tmp);
      for (var k = 0; k < tmp.length; k++) {
        if (repeatBlocked(s, p, i, tmp[k])) continue;
        out.push({ from: i, to: tmp[k] });
      }
    }
    return out;
  }
  function hasMove(s, side) {
    var tmp = [];
    for (var i = 0; i < 100; i++) {
      var p = s.board[i];
      if (!p || p.o !== side) continue;
      tmp.length = 0;
      pieceDests(s.board, i, tmp);
      for (var k = 0; k < tmp.length; k++) if (!repeatBlocked(s, p, i, tmp[k])) return true;
    }
    return false;
  }
  function destinations(s, from) {
    var p = s.board[from];
    if (!p || s.phase !== "play" || p.o !== s.turn) return [];
    var tmp = pieceDests(s.board, from, []), out = [];
    for (var k = 0; k < tmp.length; k++) if (!repeatBlocked(s, p, from, tmp[k])) out.push(tmp[k]);
    return out;
  }

  // Outcome of attacker rank a on defender rank d: "win", "lose", "tie", "defuse", "flag".
  function fight(a, d) {
    if (d === FLAG) return "flag";
    if (d === BOMB) return a === MINER ? "defuse" : "lose";
    if (a === SPY && d === MARSHAL) return "win";
    if (a > d) return "win";
    if (a < d) return "lose";
    return "tie";
  }

  function rawMove(s, from, to) {
    var b = s.board, p = b[from], q = b[to], side = p.o;
    var res = { n: s.ply + 1, side: side, from: from, to: to, att: false };
    var span = Math.abs(rowOf(to) - rowOf(from)) + Math.abs(colOf(to) - colOf(from));
    if (p.r === SCOUT && span > 1) { p.rev = true; res.leap = true; }
    p.mv = true; p.n++;
    var l = s.last[side];
    var cnt = (l && l.id === p.id && l.from === to && l.to === from) ? l.n + 1 : 1;
    s.last[side] = { id: p.id, from: from, to: to, n: cnt };
    if (!q) {
      b[to] = p; b[from] = null; s.noCombat++;
    } else {
      res.att = true; res.ar = p.r; res.dr = q.r;
      p.rev = true; q.rev = true; s.noCombat = 0;
      var out = fight(p.r, q.r);
      res.out = out;
      if (out === "flag") {
        b[to] = p; b[from] = null; s.dead[q.o].push(q.r);
        s.phase = "over"; s.winner = side; s.reason = "flag";
      } else if (out === "win" || out === "defuse") {
        b[to] = p; b[from] = null; s.dead[q.o].push(q.r);
      } else if (out === "lose") {
        b[from] = null; s.dead[side].push(p.r);
      } else {
        b[from] = null; b[to] = null; s.dead[side].push(p.r); s.dead[q.o].push(q.r);
      }
    }
    s.ply++;
    s.log.push(res);
    if (s.phase !== "over") {
      s.turn = 1 - side;
      if (!hasMove(s, s.turn)) { s.phase = "over"; s.winner = side; s.reason = "blocked"; }
      else if (s.noCombat >= DRAW_AFTER) { s.phase = "over"; s.winner = 2; s.reason = "draw"; }
    }
    return res;
  }
  // Validated move for the side to play. Returns the result record or null.
  function move(s, from, to) {
    if (s.phase !== "play") return null;
    var p = s.board[from];
    if (!p || p.o !== s.turn) return null;
    var ds = destinations(s, from);
    if (ds.indexOf(to) < 0) return null;
    return rawMove(s, from, to);
  }

  function resign(s, side) {
    if (s.phase !== "play") return false;
    s.phase = "over"; s.winner = 1 - side; s.reason = "resign";
    return true;
  }

  function countAlive(s, side) {
    var n = 0, m = 0;
    for (var i = 0; i < 100; i++) {
      var p = s.board[i];
      if (p && p.o === side) { n++; if (p.r >= 1 && p.r <= 10) m++; }
    }
    return { total: n, movable: m };
  }

  // What a side is allowed to know: the opponent's unrevealed ranks are hidden (-1).
  function viewFor(s, side) {
    var b = new Array(100);
    for (var i = 0; i < 100; i++) {
      var p = s.board[i];
      if (!p) b[i] = null;
      else if (p.o === side || p.rev) b[i] = { id: p.id, o: p.o, r: p.r, mv: p.mv, rev: p.rev, n: p.n };
      else b[i] = { id: p.id, o: p.o, r: -1, mv: p.mv, rev: false, n: p.n };
    }
    return {
      seed: s.seed, rng: s.rng, board: b, turn: s.turn, phase: s.phase, ply: s.ply,
      dead: [s.dead[0].slice(), s.dead[1].slice()],
      last: [s.last[0] && { id: s.last[0].id, from: s.last[0].from, to: s.last[0].to, n: s.last[0].n },
             s.last[1] && { id: s.last[1].id, from: s.last[1].from, to: s.last[1].to, n: s.last[1].n }],
      noCombat: s.noCombat, side: side
    };
  }

  // ---------- computer opponent ----------
  var VAL = [0, 30, 15, 40, 20, 30, 45, 65, 100, 150, 220, 22];
  var VF_ME = 1500;

  // My expected gain when rank a attacks rank d (both known). vf is the flag's worth.
  function evFight(a, d, vf) {
    if (d === FLAG) return vf;
    if (d === BOMB) return a === MINER ? VAL[BOMB] : -VAL[a];
    if (a === SPY && d === MARSHAL) return VAL[MARSHAL];
    if (a > d) return VAL[d];
    if (a < d) return -VAL[a];
    return VAL[d] - VAL[a];
  }
  function survives(a, d) { var o = fight(a, d); return o === "win" || o === "defuse" || o === "flag"; }

  // Belief about each unrevealed enemy piece, from public information only.
  function buildBelief(v, me) {
    var e = 1 - me, b = v.board, i, r;
    var rem = COUNTS.slice();
    for (i = 0; i < v.dead[e].length; i++) rem[v.dead[e][i]]--;
    var unknown = [], aliveKnownMovable = 0, revBombAt = [];
    for (i = 0; i < 100; i++) {
      var p = b[i];
      if (!p || p.o !== e) continue;
      if (p.rev) { rem[p.r]--; if (p.r >= 1 && p.r <= 10) aliveKnownMovable++; if (p.r === BOMB) revBombAt.push(i); }
      else unknown.push(i);
    }
    for (r = 0; r < 12; r++) if (rem[r] < 0) rem[r] = 0;
    var mvTotal = 0;
    for (r = 1; r <= 10; r++) mvTotal += rem[r];
    var unmoved = [];
    for (i = 0; i < unknown.length; i++) if (!b[unknown[i]].mv) unmoved.push(unknown[i]);
    var backRow = e === RED ? 9 : 0, depthW = [8, 2.2, 0.7, 0.3];
    var fw = {}, fwSum = 0, k, idx;
    for (k = 0; k < unmoved.length; k++) {
      idx = unmoved[k];
      var dep = Math.abs(rowOf(idx) - backRow);
      var w = dep < 4 ? depthW[dep] : 0.15;
      for (var q = 0; q < NB[idx].length; q++) if (revBombAt.indexOf(NB[idx][q]) >= 0) w *= 1.8;
      fw[idx] = w; fwSum += w;
    }
    var P = new Array(100).fill(null);
    var nUn = unmoved.length;
    for (k = 0; k < unknown.length; k++) {
      idx = unknown[k];
      var pr = new Float64Array(12), pm = 1;
      if (!b[idx].mv && nUn > 0) {
        var pf = rem[FLAG] > 0 && fwSum > 0 ? Math.min(0.9, rem[FLAG] * fw[idx] / fwSum) : 0;
        var pb = rem[BOMB] > 0 ? Math.min(0.9 - pf, rem[BOMB] / nUn) : 0;
        if (pb < 0) pb = 0;
        pr[FLAG] = pf; pr[BOMB] = pb; pm = 1 - pf - pb;
      }
      if (mvTotal > 0) for (r = 1; r <= 10; r++) pr[r] = pm * rem[r] / mvTotal;
      P[idx] = pr;
    }
    var movEst = aliveKnownMovable;
    for (k = 0; k < unknown.length; k++) { if (b[unknown[k]].mv) movEst++; }
    movEst += Math.max(0, mvTotal - (movEst - aliveKnownMovable)) ;
    var hunt = Math.max(0, Math.min(1, (14 - movEst) / 10));
    return { P: P, rem: rem, unknown: unknown, hunt: hunt, vf: 120 + 900 * hunt };
  }

  function dangerOf(v, me, bel, flagPos) {
    var b = v.board, e = 1 - me, maxD = 0, sum = 0, i, k, r;
    for (i = 0; i < 100; i++) {
      var p = b[i];
      if (!p || p.o !== me) continue;
      var nb = NB[i], best = 0, a = p.r;
      for (k = 0; k < nb.length; k++) {
        var E = b[nb[k]];
        if (!E || E.o !== e) continue;
        var dn = 0;
        if (E.rev) {
          if (E.r >= 1 && E.r <= 10) {
            var g = evFight(E.r, a, VF_ME);
            dn = p.rev ? (g > 0 ? g : 0) : (g > 0 ? 0.5 * g : 0);
          }
        } else {
          var Pj = bel.P[nb[k]];
          if (Pj) for (r = 1; r <= 10; r++) {
            var pr = Pj[r];
            if (pr < 1e-4) continue;
            var g2 = evFight(r, a, VF_ME);
            if (g2 > 0) dn += pr * (p.rev ? g2 : 0.5 * g2);
          }
        }
        if (dn > best) best = dn;
      }
      if (best > maxD) { sum += maxD; maxD = best; } else sum += best;
    }
    // long scout rays at my flag
    if (flagPos >= 0 && b[flagPos] && b[flagPos].r === FLAG) {
      var rays = RAYS[flagPos], ray = 0;
      for (k = 0; k < 4; k++) {
        var line = rays[k];
        for (var t = 0; t < line.length; t++) {
          var Q = b[line[t]];
          if (!Q) continue;
          if (Q.o === e && t >= 1) {
            if (Q.rev) { if (Q.r === SCOUT) ray += 0.5 * VF_ME; }
            else if (bel.P[line[t]]) ray += bel.P[line[t]][SCOUT] * 0.4 * VF_ME;
          }
          break;
        }
      }
      if (ray > maxD) { sum += maxD; maxD = ray; } else sum += ray;
    }
    return maxD + 0.2 * sum;
  }

  function chooseMove(v) {
    var me = v.turn, e = 1 - me, b = v.board, i, k, r;
    var moves = legalMoves(v, me);
    if (!moves.length) return null;
    if (moves.length === 1) { rnd(v); return moves[0]; }
    var bel = buildBelief(v, me);
    var vf = bel.vf;
    var dir = me === BLUE ? 1 : -1;
    var bluff = rnd(v) < 0.1;
    var restless = Math.min(1, v.noCombat / 120);

    var flagPos = -1, genPos = -1, mine = 0, i2;
    for (i = 0; i < 100; i++) {
      var pc = b[i];
      if (pc && pc.o === me) {
        mine++;
        if (pc.r === FLAG) flagPos = i;
        if (pc.r === 9) genPos = i;
      }
    }
    var enemyIdx = [];
    for (i = 0; i < 100; i++) if (b[i] && b[i].o === e) enemyIdx.push(i);
    // distance to my flag for enemy pieces, treating my bombs as walls
    var fd = null;
    if (flagPos >= 0) {
      fd = new Array(100).fill(99); fd[flagPos] = 0;
      var qq = [flagPos];
      for (var h = 0; h < qq.length; h++) {
        var u = qq[h];
        for (var t = 0; t < NB[u].length; t++) {
          var w = NB[u][t];
          if (fd[w] !== 99) continue;
          if (b[w] && b[w].o === me && b[w].r === BOMB) continue;
          fd[w] = fd[u] + 1; qq.push(w);
        }
      }
    }
    var marshalNearGen = false;
    // evTab[a][enemy index]
    var evTab = {};
    function evAgainst(a, j) {
      var E = b[j];
      if (E.rev) return evFight(a, E.r, vf);
      var Pj = bel.P[j], s = 0;
      if (!Pj) return 0;
      for (var rr = 0; rr < 12; rr++) if (Pj[rr] > 1e-4) s += Pj[rr] * evFight(a, rr, vf);
      return s;
    }
    function tabFor(a) {
      if (evTab[a]) return evTab[a];
      var tb = {};
      for (var q = 0; q < enemyIdx.length; q++) {
        var j = enemyIdx[q], x = evAgainst(a, j);
        if (a === SCOUT && !b[j].rev) x += 14 * (b[j].mv ? 1 : 0.6);
        if (a === SPY) {
          x = 0;
          if (b[j].rev && b[j].r === MARSHAL && genPos >= 0 && DIST[genPos][j] <= 3) x = VAL[MARSHAL] * 0.5;
        }
        tb[j] = x;
      }
      evTab[a] = tb;
      return tb;
    }
    function attraction(a, s) {
      var tb = tabFor(a), best = 0;
      for (var q = 0; q < enemyIdx.length; q++) {
        var j = enemyIdx[q], x = tb[j];
        if (x <= 0) continue;
        x = x / (1 + DIST[s][j]);
        if (x > best) best = x;
      }
      return best;
    }
    function watch() {
      if (!fd) return 0;
      var tot = 0;
      for (var q = 0; q < 100; q++) {
        var E = b[q];
        if (!E || E.o !== e || fd[q] > 3) continue;
        if (E.rev && (E.r === FLAG || E.r === BOMB)) continue;
        tot += 0.06 * vf * (4 - fd[q]) / 3;
      }
      return Math.min(tot, 160);
    }

    var best = null, bestScore = -1e9;
    for (var mi = 0; mi < moves.length; mi++) {
      var mv = moves[mi], p = b[mv.from], t0 = b[mv.to], a = p.r;
      var sc = 0, rowsAdv = (rowOf(mv.to) - rowOf(mv.from)) * dir;
      var dng;
      if (t0) {
        var gain, ps = 0, info = 0;
        if (t0.rev) {
          gain = evFight(a, t0.r, vf); ps = survives(a, t0.r) ? 1 : 0;
        } else {
          var Pj = bel.P[mv.to]; gain = 0;
          for (r = 0; r < 12; r++) if (Pj[r] > 1e-4) { gain += Pj[r] * evFight(a, r, vf); if (survives(a, r)) ps += Pj[r]; }
          info = (a === SCOUT ? 18 : 5) * (t0.mv ? 1 : 0.6);
        }
        sc += gain + info;
        if (!p.rev) sc -= ps * 0.1 * VAL[a] * (a === SPY ? 3 : 1);
        // danger after: weighted over survive / not survive
        var dA = 0, dB = 0;
        var wasRev = p.rev;
        if (ps > 0.001) {
          b[mv.to] = p; b[mv.from] = null; p.rev = true;
          dA = dangerOf(v, me, bel, flagPos);
          b[mv.to] = t0; b[mv.from] = p; p.rev = wasRev;
        }
        if (ps < 0.999) {
          b[mv.from] = null;
          dB = dangerOf(v, me, bel, flagPos);
          b[mv.from] = p;
        }
        dng = ps * dA + (1 - ps) * dB;
        var sav = b[mv.to];
        if (ps > 0.5) { b[mv.to] = p; b[mv.from] = null; p.rev = true; sc -= watch() * 0.3; b[mv.to] = sav; b[mv.from] = p; p.rev = wasRev; }
      } else {
        b[mv.to] = p; b[mv.from] = null;
        dng = dangerOf(v, me, bel, flagPos);
        sc -= watch();
        b[mv.to] = null; b[mv.from] = p;
        var adv = (a === MINER || a === SPY) ? 0.2 : 1;
        sc += 0.7 * rowsAdv * adv;
        if (a >= SCOUT && a <= 10) {
          var wgt = 1.2 * (1 + 2 * restless);
          if (a === MINER && bel.hunt < 0.3) wgt *= 0.3;
          sc += wgt * (attraction(a, mv.to) - attraction(a, mv.from));
        }
        if (p.r === SCOUT && DIST[mv.from][mv.to] > 1 && !p.rev) sc -= 2;
        if (bluff && !p.rev && a >= 4 && a <= 5 && rowsAdv > 0) sc += 6;
        if (a === SPY && genPos >= 0) {
          var d1 = DIST[genPos][mv.to], d0 = DIST[genPos][mv.from];
          if (d1 <= 2) sc += 2.5; else if (d1 > d0) sc -= 3;
        }
        if (flagPos >= 0 && NB[flagPos].indexOf(mv.from) >= 0) sc -= 10;
        var l = v.last[me];
        if (l && l.id === p.id && l.from === mv.to) sc -= 4;
      }
      sc -= dng * (1 - 0.4 * restless);
      sc += rnd(v) * 1.2;
      if (sc > bestScore) { bestScore = sc; best = mv; }
    }
    return best;
  }

  // Pick the computer's move for the side to play. Reads only that side's view.
  function aiMove(s) {
    var v = viewFor(s, s.turn);
    var mv = chooseMove(v);
    s.rng = v.rng;
    return mv;
  }
  function aiPlay(s) {
    if (s.phase !== "play") return null;
    var mv = aiMove(s);
    if (!mv) return null;
    return move(s, mv.from, mv.to);
  }

  return {
    FLAG: FLAG, SPY: SPY, SCOUT: SCOUT, MINER: MINER, MARSHAL: MARSHAL, BOMB: BOMB, RED: RED, BLUE: BLUE,
    COUNTS: COUNTS, NAMES: NAMES, LABELS: LABELS, DRAW_AFTER: DRAW_AFTER, SHUFFLE_MAX: SHUFFLE_MAX,
    isLake: isLake, rowOf: rowOf, colOf: colOf, inHome: inHome, NB: NB,
    newGame: newGame, blankState: blankState, fromPieces: fromPieces, clone: clone,
    trayCounts: trayCounts, placedCount: placedCount, setupComplete: setupComplete,
    placePiece: placePiece, removePiece: removePiece, swapPieces: swapPieces, clearSetup: clearSetup,
    presetSetup: presetSetup, randomSetup: randomSetup, aiSetup: aiSetup, startGame: startGame,
    legalMoves: legalMoves, destinations: destinations, hasMove: hasMove, fight: fight,
    move: move, resign: resign, countAlive: countAlive, viewFor: viewFor,
    aiMove: aiMove, aiPlay: aiPlay, buildBelief: buildBelief, nextRand: rnd
  };
});
