// Brain Quest rules engine. Pure logic: no DOM, no clock, no unseeded randomness.
// All randomness comes from a seeded mulberry32 whose state lives inside the
// run state, so a run is plain JSON and the same seed gives the same quiz.
// Question data lives in questions.js (BrainQuestQuestions).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./questions.js"));
  else root.BrainQuestLogic = factory(root.BrainQuestQuestions);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  var CATS = Q.CATS;
  var MATH_CAT = { 5: "count", 8: "math" };
  var AVATARS = ["🦊", "🐸", "🐼", "🦄", "🐯", "🐙", "🦖", "🐨"];
  var EMOJI5 = ["🍎", "🐶", "⭐", "🎈", "🚗", "🐟", "🍪", "🦆", "🌼", "🐞", "🍌", "🦋", "🐸", "🧁", "🐱", "🚀"];

  // ---------------------------------------------------------------- rng
  function rand(st) {
    var a = (st.rng + 0x6d2b79f5) | 0;
    st.rng = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(st, lo, hi) { return lo + Math.floor(rand(st) * (hi - lo + 1)); }
  function pick(st, arr) { return arr[Math.floor(rand(st) * arr.length)]; }
  function shuffle(st, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand(st) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rep(s, n) { var o = ""; for (var i = 0; i < n; i++) o += s; return o; }

  // ---------------------------------------------------------------- distractors
  // Distinct whole numbers near `c`, never equal to it, inside [lo, hi].
  function nearNumbers(st, c, n, lo, hi, extra) {
    var offs, w;
    if (c <= 12) { offs = [1, -1, 2, -2, 3, -3]; w = 4; }
    else if (c < 100) { offs = [1, -1, 2, -2, 10, -10, 5, -5, 3, -3]; w = 12; }
    else { offs = [1, -1, 10, -10, 100, -100, 2, -2, 20, -20, 50, -50]; w = 60; }
    var cand = (extra || []).slice(), seen = {}, i, v;
    seen[c] = true;
    offs.forEach(function (o) { cand.push(c + o); });
    var s = String(c);
    if (s.length >= 2 && s[0] !== s[1]) cand.push(parseInt(s[1] + s[0] + s.slice(2), 10));
    cand = shuffle(st, cand);
    var out = [];
    for (i = 0; i < cand.length && out.length < n; i++) {
      v = cand[i];
      if (typeof v !== "number" || isNaN(v) || v !== Math.floor(v) || v < lo || v > hi || seen[v]) continue;
      if (Math.abs(v - c) > Math.max(c, 100)) continue;
      seen[v] = true; out.push(v);
    }
    var guard = 0;
    while (out.length < n && guard++ < 400) {
      v = guard < 200 ? randInt(st, Math.max(lo, c - w), Math.min(hi, c + w)) : randInt(st, lo, hi);
      if (!seen[v]) { seen[v] = true; out.push(v); }
    }
    return out;
  }
  function numQ(st, text, c, n, lo, hi, cat, fun, extra) {
    var d = nearNumbers(st, c, n, lo, hi, extra).map(String);
    return finish(st, { q: text, a: [String(c)].concat(d), c: 0, cat: cat, fun: fun, gen: true });
  }
  // Shuffle option order and fix c. Mutates and returns.
  function finish(st, item) {
    var idx = [], i;
    for (i = 0; i < item.a.length; i++) idx.push(i);
    idx = shuffle(st, idx);
    var a = idx.map(function (k) { return item.a[k]; });
    item.c = idx.indexOf(item.c);
    item.a = a;
    if (!item.fun) delete item.fun;
    return item;
  }

  // ---------------------------------------------------------------- procedural math
  function gen5(st) {
    var k = randInt(st, 0, 5), a, b, e, n;
    if (k === 0) {
      n = randInt(st, 1, 10); e = pick(st, EMOJI5);
      return numQ(st, "How many " + rep(e, n) + "?", n, 2, 0, 12, "count");
    }
    if (k === 1) {
      a = randInt(st, 1, 9); b = randInt(st, 1, 10 - a);
      return numQ(st, "What is " + a + " plus " + b + "?", a + b, 2, 0, 12, "count");
    }
    if (k === 2) {
      a = randInt(st, 2, 10); b = randInt(st, 1, a);
      return numQ(st, "What is " + a + " take away " + b + "?", a - b, 2, 0, 12, "count");
    }
    if (k === 3) {
      a = randInt(st, 1, 19);
      return numQ(st, "What number comes after " + a + "?", a + 1, 2, 0, 22, "count");
    }
    if (k === 4) {
      a = randInt(st, 2, 20);
      return numQ(st, "What number comes before " + a + "?", a - 1, 2, 0, 22, "count");
    }
    a = randInt(st, 1, 6); b = a + randInt(st, 1, 4); e = pick(st, EMOJI5);
    var big = rep(e, b), small = rep(e, a);
    return finish(st, { q: "Which group has more?", a: [big, small, "They are the same"], c: 0, cat: "count", gen: true });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function timeStr(mins) { var h = Math.floor(mins / 60) % 12; if (h === 0) h = 12; return h + ":" + pad2(mins % 60); }

  function gen8(st) {
    var k = randInt(st, 0, 11), a, b, c, text, i, d, seen;
    if (k === 0) {
      a = randInt(st, 100, 850); b = randInt(st, 100, 999 - a);
      return numQ(st, a + " + " + b + " = ?", a + b, 3, 0, 999, "math");
    }
    if (k === 1) {
      a = randInt(st, 200, 999); b = randInt(st, 11, a - 1);
      return numQ(st, a + " - " + b + " = ?", a - b, 3, 0, 999, "math");
    }
    if (k === 2) {
      a = randInt(st, 2, 12); b = randInt(st, 2, 12);
      return numQ(st, a + " x " + b + " = ?", a * b, 3, 0, 150, "math", null, [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b]);
    }
    if (k === 3) {
      a = randInt(st, 2, 12); b = randInt(st, 2, 12);
      return numQ(st, (a * b) + " divided by " + a + " = ?", b, 3, 1, 20, "math", null, [b + 1, b - 1, a]);
    }
    if (k === 4) {
      a = randInt(st, 2, 12); b = randInt(st, 2, 12);
      return numQ(st, "? x " + a + " = " + (a * b), b, 3, 1, 20, "math");
    }
    if (k === 5) {
      var start = randInt(st, 1, 12) * 60 + pick(st, [0, 15, 30, 45]);
      var step = pick(st, [15, 30, 45, 60, 90]);
      c = (start + step) % 720;
      text = "What time is " + (step === 60 ? "1 hour" : step === 90 ? "1 hour 30 minutes" : step + " minutes") + " after " + timeStr(start) + "?";
      d = []; seen = {}; seen[c] = true;
      var cands = shuffle(st, [c + 15, c - 15, c + 30, c - 30, c + 60, c - 60, c + 45, c - 45]);
      for (i = 0; i < cands.length && d.length < 3; i++) {
        var v = ((cands[i] % 720) + 720) % 720;
        if (!seen[v]) { seen[v] = true; d.push(timeStr(v)); }
      }
      return finish(st, { q: text, a: [timeStr(c)].concat(d), c: 0, cat: "math", gen: true });
    }
    if (k === 6) {
      var qn = randInt(st, 0, 3), dn = randInt(st, 0, 4), nn = randInt(st, 0, 3);
      if (qn + dn + nn === 0) qn = 1;
      c = qn * 25 + dn * 10 + nn * 5;
      var parts = [];
      if (qn) parts.push(qn + (qn === 1 ? " quarter" : " quarters"));
      if (dn) parts.push(dn + (dn === 1 ? " dime" : " dimes"));
      if (nn) parts.push(nn + (nn === 1 ? " nickel" : " nickels"));
      text = "How much is " + parts.join(" + ") + "?";
      d = []; seen = {}; seen[c] = true;
      var mc = shuffle(st, [c + 5, c - 5, c + 10, c - 10, c + 25, c - 25, c + 15, c - 15]);
      for (i = 0; i < mc.length && d.length < 3; i++) if (mc[i] > 0 && !seen[mc[i]]) { seen[mc[i]] = true; d.push(mc[i] + " cents"); }
      return finish(st, { q: text, a: [c + " cents"].concat(d), c: 0, cat: "math", gen: true });
    }
    if (k === 7) {
      var names = ["Maya", "Leo", "Ava", "Noah", "Zoe", "Eli", "Mia", "Kai"];
      var things = ["stickers", "marbles", "crayons", "shells", "cards", "coins"];
      var nm = pick(st, names), th = pick(st, things);
      if (rand(st) < 0.5) {
        a = randInt(st, 20, 90); b = randInt(st, 5, a - 5);
        return numQ(st, nm + " has " + a + " " + th + " and gives " + b + " away. How many are left?", a - b, 3, 0, 120, "math");
      }
      a = randInt(st, 2, 9); b = randInt(st, 3, 12);
      return numQ(st, nm + " has " + a + " boxes with " + b + " " + th + " in each. How many " + th + " in all?", a * b, 3, 0, 120, "math");
    }
    if (k === 8) {
      a = randInt(st, 11, 450);
      return numQ(st, "What is double " + a + "?", a * 2, 3, 0, 999, "math");
    }
    if (k === 9) {
      a = randInt(st, 6, 250) * 2;
      return numQ(st, "What is half of " + a + "?", a / 2, 3, 0, 999, "math");
    }
    if (k === 10) {
      if (rand(st) < 0.5) {
        a = randInt(st, 11, 989); while (a % 10 === 5) a++;
        c = Math.round(a / 10) * 10;
        return numQ(st, "Round " + a + " to the nearest ten.", c, 3, 0, 1000, "math");
      }
      a = randInt(st, 101, 949); while (a % 100 === 50) a++;
      c = Math.round(a / 100) * 100;
      d = []; seen = {}; seen[c] = true;
      var rc = shuffle(st, [c + 100, c - 100, Math.round(a / 10) * 10, a]);
      for (i = 0; i < rc.length && d.length < 3; i++) if (rc[i] >= 0 && !seen[rc[i]]) { seen[rc[i]] = true; d.push(String(rc[i])); }
      return finish(st, { q: "Round " + a + " to the nearest hundred.", a: [String(c)].concat(d), c: 0, cat: "math", gen: true });
    }
    a = randInt(st, 2, 12); b = randInt(st, 2, 12);
    if (rand(st) < 0.5) return numQ(st, "A rectangle is " + a + " cm long and " + b + " cm wide. What is its perimeter?", 2 * (a + b), 3, 1, 60, "math");
    return numQ(st, "A rectangle is " + a + " units long and " + b + " units wide. What is its area in square units?", a * b, 3, 1, 150, "math");
  }

  function genMath(level, st) {
    var item = level === 8 ? gen8(st) : gen5(st);
    return item;
  }

  // ---------------------------------------------------------------- bank helpers
  function qid(level, idx) { return level + ":" + idx; }
  function bank(level) { return Q.BANK[level] || []; }
  function bankIndexes(level, cat) {
    var out = [], b = bank(level);
    for (var i = 0; i < b.length; i++) if (!cat || b[i].cat === cat) out.push(i);
    return out;
  }
  function counts(level) {
    var out = { total: 0 };
    bank(level).forEach(function (x) { out.total++; out[x.cat] = (out[x.cat] || 0) + 1; });
    return out;
  }
  function fromBank(st, level, idx) {
    var src = bank(level)[idx];
    return finish(st, { id: qid(level, idx), q: src.q, a: src.a.slice(), c: src.c, cat: src.cat, fun: src.fun });
  }

  // ---------------------------------------------------------------- runs
  // opts: { level: 5|8, mode: "quiz"|"two"|"practice", count: 10|20, seed, seen: [ids], category, players: [{name, emoji}] }
  function newRun(opts) {
    opts = opts || {};
    var level = opts.level === 8 ? 8 : 5;
    var mode = opts.mode === "two" ? "two" : opts.mode === "practice" ? "practice" : "quiz";
    var cat = opts.category && CATS[level][opts.category] ? opts.category : null;
    var count = mode === "practice" ? 0 : (opts.count === 20 ? 20 : 10);
    var seed = (opts.seed === undefined || opts.seed === null) ? 1 : (opts.seed | 0);
    var seenList = Array.isArray(opts.seen) ? opts.seen : [];
    var st = {
      v: 1, level: level, mode: mode, cat: cat, count: count, seed: seed, rng: seed,
      i: 0, qs: [], picked: null, done: false,
      score: 0, streak: 0, best: 0, history: [],
      players: null, pool: [], seenReset: false, genN: 0
    };
    if (mode === "two") {
      var ps = Array.isArray(opts.players) ? opts.players : [];
      st.players = [0, 1].map(function (k) {
        var p = ps[k] || {};
        return { name: String(p.name || ("Player " + (k + 1))).slice(0, 16), emoji: AVATARS.indexOf(p.emoji) >= 0 ? p.emoji : AVATARS[k], score: 0, streak: 0 };
      });
    }
    // Pool: unseen questions first (shuffled), then the seen ones (shuffled),
    // so nothing repeats until the whole category has been used.
    var seenMap = {};
    seenList.forEach(function (id) { seenMap[id] = true; });
    var all = bankIndexes(level, cat), fresh = [], old = [];
    all.forEach(function (i) { (seenMap[qid(level, i)] ? old : fresh).push(i); });
    var needAuthored = count ? count - genCount(st, count) : 0;
    if (fresh.length < needAuthored) st.seenReset = true;
    st.pool = shuffle(st, fresh).concat(shuffle(st, old));
    if (mode === "practice") extend(st, 10); else extend(st, count);
    return st;
  }
  // How many of `n` questions should be procedural math.
  function genCount(st, n) {
    var m = MATH_CAT[st.level];
    if (st.cat && st.cat !== m) return 0;
    if (st.cat === m) return Math.round(n / 2);
    return Math.round(n / 5);
  }
  function extend(st, n) {
    var g = genCount(st, n), slots = [], i;
    for (i = 0; i < n; i++) slots.push(i < g);
    slots = shuffle(st, slots);
    for (i = 0; i < n; i++) {
      if (slots[i]) {
        var item = genMath(st.level, st);
        item.id = "g" + st.level + ":" + (st.genN++);
        st.qs.push(item);
      } else {
        if (!st.pool.length) st.pool = shuffle(st, bankIndexes(st.level, st.cat));
        st.qs.push(fromBank(st, st.level, st.pool.shift()));
      }
    }
  }

  function current(st) { return st.qs[st.i] || null; }
  function turnOf(st, i) { return st.mode === "two" ? (i === undefined ? st.i : i) % 2 : 0; }
  function total(st) { return st.mode === "practice" ? st.i : st.count; }

  function answer(st, idx) {
    var cq = current(st);
    if (!cq || st.done || st.picked !== null) return null;
    if (typeof idx !== "number" || idx < 0 || idx >= cq.a.length) return null;
    var ok = idx === cq.c;
    st.picked = idx;
    st.history.push(ok);
    var who = st.mode === "two" ? st.players[turnOf(st)] : st;
    if (ok) { who.score++; who.streak++; if (who.streak > (who.best || 0)) who.best = who.streak; }
    else who.streak = 0;
    if (st.mode === "two") { st.score = st.players[0].score + st.players[1].score; }
    return { correct: ok, correctIdx: cq.c, fun: cq.fun || null, picked: idx };
  }

  function next(st) {
    if (st.done || st.picked === null) return false;
    st.i++;
    st.picked = null;
    if (st.mode !== "practice" && st.i >= st.count) { st.done = true; return true; }
    if (st.mode === "practice" && st.i >= st.qs.length - 2) extend(st, 10);
    return true;
  }
  function finishPractice(st) { st.done = true; st.count = st.i; return st; }

  function stars(st) {
    var n = st.history.length;
    if (!n) return 0;
    var pct = st.score / n;
    return pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
  }
  function winner(st) {
    if (st.mode !== "two") return -1;
    var a = st.players[0].score, b = st.players[1].score;
    return a === b ? -1 : a > b ? 0 : 1;
  }
  // Ids to remember as seen after this run (authored only). If the pool had
  // to be reset, start the memory over from just this run.
  function seenAfter(st, seen) {
    var base = st.seenReset ? [] : (Array.isArray(seen) ? seen.slice() : []);
    var have = {};
    base.forEach(function (id) { have[id] = true; });
    for (var i = 0; i < Math.min(st.i + (st.picked !== null ? 1 : 0), st.qs.length); i++) {
      var id = st.qs[i].id;
      if (id.charAt(0) !== "g" && !have[id]) { have[id] = true; base.push(id); }
    }
    return base;
  }

  return {
    CATS: CATS, AVATARS: AVATARS, MIN: Q.MIN, BANK: Q.BANK,
    newRun: newRun, answer: answer, next: next, current: current, turnOf: turnOf, total: total,
    stars: stars, winner: winner, seenAfter: seenAfter, finishPractice: finishPractice,
    genMath: genMath, counts: counts, qid: qid, rand: rand
  };
});
