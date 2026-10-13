// Yahtzee game logic. Pure: no DOM, no clock, no Math.random.
// Works as a <script> (attaches window.YahtzeeLogic) and via require() in node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YahtzeeLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CATS = [
    { id: "ones", name: "Ones", short: "Ones", upper: true, face: 1 },
    { id: "twos", name: "Twos", short: "Twos", upper: true, face: 2 },
    { id: "threes", name: "Threes", short: "Threes", upper: true, face: 3 },
    { id: "fours", name: "Fours", short: "Fours", upper: true, face: 4 },
    { id: "fives", name: "Fives", short: "Fives", upper: true, face: 5 },
    { id: "sixes", name: "Sixes", short: "Sixes", upper: true, face: 6 },
    { id: "threeKind", name: "Three of a Kind", short: "3 of a Kind", upper: false },
    { id: "fourKind", name: "Four of a Kind", short: "4 of a Kind", upper: false },
    { id: "fullHouse", name: "Full House", short: "Full House", upper: false },
    { id: "smStraight", name: "Small Straight", short: "Sm Straight", upper: false },
    { id: "lgStraight", name: "Large Straight", short: "Lg Straight", upper: false },
    { id: "yahtzee", name: "Yahtzee", short: "Yahtzee", upper: false },
    { id: "chance", name: "Chance", short: "Chance", upper: false }
  ];
  var N_CATS = 13, YAHTZEE = 11, ROUNDS = 13;
  var UPPER_BONUS_AT = 63, UPPER_BONUS = 35, YAHTZEE_BONUS = 100;

  // ---------------------------------------------------------------- RNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Same stream as mulberry32, but the state lives in the game object so a
  // saved game continues exactly where it left off.
  function nextRand(g) {
    g.rngState = (g.rngState + 0x6d2b79f5) | 0;
    var a = g.rngState;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- scoring
  function countsOf(dice) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < dice.length; i++) c[dice[i]]++;
    return c;
  }
  function sumOf(dice) {
    var s = 0;
    for (var i = 0; i < dice.length; i++) s += dice[i];
    return s;
  }
  function isYahtzee(dice) {
    if (!dice || dice.length !== 5 || !dice[0]) return false;
    for (var i = 1; i < 5; i++) if (dice[i] !== dice[0]) return false;
    return true;
  }
  function hasRun(c, a, len) {
    for (var v = a; v < a + len; v++) if (!c[v]) return false;
    return true;
  }
  // Base score of a category for five dice, ignoring the Joker rule.
  function scoreCategory(cat, dice) {
    var c = countsOf(dice), max = 0, i;
    for (i = 1; i <= 6; i++) if (c[i] > max) max = c[i];
    if (cat < 6) return (cat + 1) * c[cat + 1];
    switch (cat) {
      case 6: return max >= 3 ? sumOf(dice) : 0;
      case 7: return max >= 4 ? sumOf(dice) : 0;
      case 8: {
        var has3 = false, has2 = false;
        for (i = 1; i <= 6; i++) { if (c[i] === 3) has3 = true; if (c[i] === 2) has2 = true; }
        return has3 && has2 ? 25 : 0;
      }
      case 9: return hasRun(c, 1, 4) || hasRun(c, 2, 4) || hasRun(c, 3, 4) ? 30 : 0;
      case 10: return hasRun(c, 1, 5) || hasRun(c, 2, 5) ? 40 : 0;
      case 11: return max === 5 ? 50 : 0;
      case 12: return sumOf(dice);
    }
    throw new Error("bad category " + cat);
  }

  // Does the Joker rule apply to these dice for this player?
  function jokerApplies(player, dice) {
    return isYahtzee(dice) && player.scores[YAHTZEE] !== null;
  }
  // Score a category for a player, honoring the Joker rule (full 25/30/40).
  function scoreFor(player, dice, cat) {
    if (jokerApplies(player, dice)) {
      if (cat === 8) return 25;
      if (cat === 9) return 30;
      if (cat === 10) return 40;
    }
    return scoreCategory(cat, dice);
  }
  // Categories the player may choose with these dice (forced Joker included).
  function legalCategories(player, dice) {
    var open = [], i;
    for (i = 0; i < N_CATS; i++) if (player.scores[i] === null) open.push(i);
    if (!jokerApplies(player, dice)) return open;
    var up = dice[0] - 1;
    if (player.scores[up] === null) return [up];
    var lower = open.filter(function (k) { return k >= 6; });
    if (lower.length) return lower;
    return open;
  }

  function upperSum(player) {
    var s = 0;
    for (var i = 0; i < 6; i++) s += player.scores[i] || 0;
    return s;
  }
  function totals(player) {
    var upper = upperSum(player), lower = 0, i;
    for (i = 6; i < N_CATS; i++) lower += player.scores[i] || 0;
    var bonus = upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0;
    var yb = (player.bonus || 0) * YAHTZEE_BONUS;
    return { upper: upper, upperBonus: bonus, lower: lower, yahtzeeBonus: yb, total: upper + bonus + lower + yb };
  }

  // ---------------------------------------------------------------- game
  function newPlayer(name, type) {
    var s = [];
    for (var i = 0; i < N_CATS; i++) s.push(null);
    return { name: name, type: type || "human", scores: s, bonus: 0 };
  }
  // players: [{name, type: "human"|"bot"}]
  function newGame(seed, players) {
    seed = seed | 0;
    return {
      v: 1, seed: seed, rngState: seed,
      players: players.map(function (p) { return newPlayer(p.name, p.type); }),
      current: 0, round: 1, rollsLeft: 3,
      dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false],
      over: false
    };
  }
  function rolled(g) { return g.rollsLeft < 3; }
  function roll(g) {
    if (g.over) throw new Error("game over");
    if (g.rollsLeft <= 0) throw new Error("no rolls left");
    var first = g.rollsLeft === 3;
    for (var i = 0; i < 5; i++) {
      if (first || !g.held[i]) g.dice[i] = 1 + Math.floor(nextRand(g) * 6);
    }
    g.rollsLeft--;
    return g.dice.slice();
  }
  function canHold(g) { return !g.over && g.rollsLeft > 0 && g.rollsLeft < 3; }
  function toggleHold(g, i) {
    if (!canHold(g)) return false;
    g.held[i] = !g.held[i];
    return true;
  }
  function setHolds(g, mask) {
    if (!canHold(g)) return false;
    for (var i = 0; i < 5; i++) g.held[i] = !!mask[i];
    return true;
  }
  function legal(g) {
    if (g.over || !rolled(g)) return [];
    return legalCategories(g.players[g.current], g.dice);
  }
  // Potential score per category index: a number if legal now, otherwise null.
  function potentials(g) {
    var out = [], i;
    for (i = 0; i < N_CATS; i++) out.push(null);
    var p = g.players[g.current];
    legal(g).forEach(function (k) { out[k] = scoreFor(p, g.dice, k); });
    return out;
  }
  function score(g, cat) {
    if (g.over) throw new Error("game over");
    if (!rolled(g)) throw new Error("roll first");
    if (legal(g).indexOf(cat) < 0) throw new Error("illegal category " + cat);
    var p = g.players[g.current];
    var pts = scoreFor(p, g.dice, cat);
    var gotBonus = isYahtzee(g.dice) && p.scores[YAHTZEE] === 50;
    var joker = jokerApplies(p, g.dice);
    if (gotBonus) p.bonus = (p.bonus || 0) + 1;
    p.scores[cat] = pts;
    var ev = { player: g.current, cat: cat, points: pts, yahtzeeBonus: gotBonus, joker: joker, dice: g.dice.slice() };
    g.current++;
    if (g.current >= g.players.length) { g.current = 0; g.round++; }
    if (g.round > ROUNDS) { g.over = true; g.round = ROUNDS; }
    g.rollsLeft = 3;
    g.dice = [0, 0, 0, 0, 0];
    g.held = [false, false, false, false, false];
    return ev;
  }
  function standings(g) {
    return g.players.map(function (p, i) { return { index: i, name: p.name, total: totals(p).total }; })
      .sort(function (a, b) { return b.total - a.total || a.index - b.index; });
  }
  function winners(g) {
    var s = standings(g);
    return s.filter(function (x) { return x.total === s[0].total; }).map(function (x) { return x.index; });
  }
  // Basic structural check for loading a saved game.
  function validGame(g) {
    try {
      if (!g || g.v !== 1 || !Array.isArray(g.players) || g.players.length < 1 || g.players.length > 4) return false;
      if (!Array.isArray(g.dice) || g.dice.length !== 5 || !Array.isArray(g.held) || g.held.length !== 5) return false;
      if (typeof g.rngState !== "number" || g.round < 1 || g.round > ROUNDS) return false;
      if (g.current < 0 || g.current >= g.players.length || g.rollsLeft < 0 || g.rollsLeft > 3) return false;
      return g.players.every(function (p) {
        return Array.isArray(p.scores) && p.scores.length === N_CATS &&
          p.scores.every(function (s) { return s === null || (typeof s === "number" && s >= 0); });
      });
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- bot
  // Expected-value strategy. A category's value for a final set of dice is
  //   points - typical points of that box (opportunity cost)
  //   + 35 * change in the chance of making the upper bonus
  //   + 100 if it is a bonus Yahtzee.
  // Within a turn we solve the two reroll stages exactly: for every one of the
  // 252 dice multisets and every distinct hold (up to 32), average over all
  // 6^k outcomes of the rerolled dice. Tables are built once and shared.
  var BASE = [2.11, 5.28, 8.57, 12.16, 15.69, 19.19, 21.66, 13.10, 22.59, 29.46, 32.71, 16.87, 22.01];
  var SIZE = 46656; // 6^6: dice multiset key = sum of 6^(face-1) per die... see keyOf

  var POW = [1, 6, 36, 216, 1296, 7776];
  var tables = null;
  function buildTables() {
    if (tables) return tables;
    var fact = [1, 1, 2, 6, 24, 120];
    var out = [], k;
    for (k = 0; k <= 5; k++) out.push({ keys: [], probs: [], counts: [] });
    // enumerate count vectors of k dice over 6 faces
    function enumerate(k, cb) {
      var c = [0, 0, 0, 0, 0, 0];
      (function rec(face, left) {
        if (face === 5) { c[5] = left; cb(c.slice()); return; }
        for (var n = 0; n <= left; n++) { c[face] = n; rec(face + 1, left - n); }
      })(0, k);
    }
    for (k = 0; k <= 5; k++) {
      enumerate(k, function (c) {
        var key = 0, perm = fact[k];
        for (var f = 0; f < 6; f++) { key += c[f] * POW[f]; perm /= fact[c[f]]; }
        out[k].keys.push(key);
        out[k].probs.push(perm / Math.pow(6, k));
        out[k].counts.push(c);
      });
      out[k].keys = Int32Array.from(out[k].keys);
      out[k].probs = Float64Array.from(out[k].probs);
    }
    var ms = [];
    out[5].counts.forEach(function (c, idx) {
      var dice = [];
      for (var f = 0; f < 6; f++) for (var n = 0; n < c[f]; n++) dice.push(f + 1);
      var holds = [];
      (function rec(face, h, kept) {
        if (face === 6) {
          var hk = 0;
          for (var f2 = 0; f2 < 6; f2++) hk += h[f2] * POW[f2];
          holds.push({ counts: h.slice(), key: hk, k: 5 - kept });
          return;
        }
        for (var n2 = 0; n2 <= c[face]; n2++) { h[face] = n2; rec(face + 1, h, kept + n2); }
      })(0, [0, 0, 0, 0, 0, 0], 0);
      ms.push({ key: out[5].keys[idx], dice: dice, counts: c, holds: holds });
    });
    var byKey = new Map();
    ms.forEach(function (m) { byKey.set(m.key, m); });
    tables = { out: out, ms: ms, byKey: byKey };
    return tables;
  }
  function keyOfDice(dice) {
    var key = 0;
    for (var i = 0; i < dice.length; i++) key += POW[dice[i] - 1];
    return key;
  }

  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function bonusProb(U, openFaces) {
    if (U >= UPPER_BONUS_AT) return 1;
    if (!openFaces.length) return 0;
    var mean = U, v2 = 0;
    openFaces.forEach(function (f) { mean += BASE[f - 1]; v2 += Math.pow(0.8 * f, 2); });
    var sd = Math.sqrt(v2);
    return 0.5 * (1 + erf((mean - 61 - 0.0) / (sd * Math.SQRT2)));
  }

  function makePlanner(player) {
    var T = buildTables();
    var openUpper = [];
    for (var i = 0; i < 6; i++) if (player.scores[i] === null) openUpper.push(i + 1);
    var U = upperSum(player);
    var yBonusLive = player.scores[YAHTZEE] === 50;
    var pBefore = bonusProb(U, openUpper);
    // cache of P(bonus) after scoring upper box f with s
    var afterCache = {};
    function pAfter(f, s) {
      var k = f * 100 + s;
      if (afterCache[k] === undefined) {
        afterCache[k] = bonusProb(U + s, openUpper.filter(function (x) { return x !== f; }));
      }
      return afterCache[k];
    }
    function catValue(dice, cat) {
      var s = scoreFor(player, dice, cat);
      var v = s - BASE[cat];
      if (cat < 6 && U < UPPER_BONUS_AT) v += UPPER_BONUS * (pAfter(cat + 1, s) - pBefore);
      return v;
    }
    var F0 = new Float64Array(SIZE), best0 = new Int8Array(SIZE);
    T.ms.forEach(function (m) {
      var cats = legalCategories(player, m.dice), bv = -Infinity, bc = -1;
      for (var j = 0; j < cats.length; j++) {
        var v = catValue(m.dice, cats[j]);
        if (v > bv + 1e-9) { bv = v; bc = cats[j]; }
      }
      if (yBonusLive && isYahtzee(m.dice)) bv += YAHTZEE_BONUS;
      F0[m.key] = bv; best0[m.key] = bc;
    });
    var F1 = null;
    function expect(hold, F) {
      if (hold.k === 0) return F0[hold.key];
      var o = T.out[hold.k], e = 0;
      for (var j = 0; j < o.keys.length; j++) e += o.probs[j] * F[hold.key + o.keys[j]];
      return e;
    }
    function ensureF1() {
      if (F1) return;
      F1 = new Float64Array(SIZE);
      T.ms.forEach(function (m) {
        var b = F0[m.key];
        for (var h = 0; h < m.holds.length; h++) {
          var hd = m.holds[h];
          if (hd.k === 0) continue;
          var e = expect(hd, F0);
          if (e > b) b = e;
        }
        F1[m.key] = b;
      });
    }
    return {
      // Best category for final dice.
      category: function (dice) { return best0[keyOfDice(dice)]; },
      // Decision with rollsLeft (1 or 2) rolls remaining. Returns
      // {stop:true} or {stop:false, mask:[bool x5], ev}.
      decide: function (dice, rollsLeft) {
        var m = T.byKey.get(keyOfDice(dice));
        var F = rollsLeft >= 2 ? (ensureF1(), F1) : F0;
        var bestH = null, bv = F0[m.key]; // stopping now
        for (var h = 0; h < m.holds.length; h++) {
          var hd = m.holds[h];
          if (hd.k === 0) continue;
          var e = expect(hd, F);
          if (e > bv + 1e-9) { bv = e; bestH = hd; }
        }
        if (!bestH) return { stop: true, ev: bv };
        var left = bestH.counts.slice(), mask = [];
        for (var i = 0; i < 5; i++) {
          var f = dice[i] - 1;
          if (left[f] > 0) { left[f]--; mask.push(true); } else mask.push(false);
        }
        return { stop: false, mask: mask, ev: bv };
      }
    };
  }

  // Next action for the current (bot) player.
  // {action:"roll", mask?} or {action:"score", cat}
  function botAction(g, planner) {
    if (g.rollsLeft === 3) return { action: "roll", mask: null };
    if (g.rollsLeft === 0) return { action: "score", cat: planner.category(g.dice) };
    var d = planner.decide(g.dice, g.rollsLeft);
    if (d.stop) return { action: "score", cat: planner.category(g.dice) };
    return { action: "roll", mask: d.mask };
  }
  function heldValues(g) {
    return g.dice.filter(function (_, i) { return g.held[i]; }).sort();
  }
  // Play the whole current turn. Returns a record of what happened.
  function botPlayTurn(g) {
    var planner = makePlanner(g.players[g.current]);
    var rec = { player: g.current, holds: [], rolls: 0 };
    for (var guard = 0; guard < 10; guard++) {
      var a = botAction(g, planner);
      if (a.action === "roll") {
        if (a.mask) { setHolds(g, a.mask); rec.holds.push(heldValues(g)); }
        roll(g); rec.rolls++;
      } else {
        rec.dice = g.dice.slice();
        var ev = score(g, a.cat);
        rec.cat = ev.cat; rec.points = ev.points; rec.yahtzeeBonus = ev.yahtzeeBonus; rec.joker = ev.joker;
        return rec;
      }
    }
    throw new Error("bot turn did not finish");
  }
  function playBotGame(seed, nPlayers) {
    var ps = [];
    for (var i = 0; i < (nPlayers || 1); i++) ps.push({ name: "Bot " + (i + 1), type: "bot" });
    var g = newGame(seed, ps);
    while (!g.over) botPlayTurn(g);
    return g;
  }

  return {
    CATS: CATS, N_CATS: N_CATS, ROUNDS: ROUNDS, YAHTZEE: YAHTZEE,
    mulberry32: mulberry32, scoreCategory: scoreCategory, scoreFor: scoreFor,
    isYahtzee: isYahtzee, jokerApplies: jokerApplies, legalCategories: legalCategories,
    totals: totals, newPlayer: newPlayer, newGame: newGame, roll: roll, canHold: canHold,
    toggleHold: toggleHold, setHolds: setHolds, legal: legal, potentials: potentials, score: score,
    standings: standings, winners: winners, validGame: validGame, rolled: rolled,
    makePlanner: makePlanner, botAction: botAction, botPlayTurn: botPlayTurn, playBotGame: playBotGame,
    heldValues: heldValues
  };
});
