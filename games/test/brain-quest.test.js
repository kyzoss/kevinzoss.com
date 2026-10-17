"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/brain-quest/logic.js");
const Q = require("../private/brain-quest/questions.js");

const DASH = String.fromCharCode(0x2014);
const dir = path.join(__dirname, "..", "private", "brain-quest");

function playThrough(s, chooser) {
  let guard = 0;
  while (!s.done) {
    if (++guard > 500) throw new Error("runaway run");
    const q = L.current(s);
    const r = L.answer(s, chooser(q, s));
    assert.ok(r, "answer accepted");
    L.next(s);
  }
  return s;
}
const always = (q) => q.c;
const never = (q) => (q.c + 1) % q.a.length;

// ------------------------------------------------------------ question bank
test("bank: every question is well formed, categories allowed, counts met, no duplicates, no em dash", () => {
  let fun = 0;
  for (const lv of [5, 8]) {
    const bank = Q.BANK[lv];
    const allowed = Object.keys(Q.CATS[lv]);
    const optLen = lv === 5 ? 3 : 4;
    const texts = new Set();
    const perCat = {};
    assert.ok(bank.length >= Q.MIN[lv], `age ${lv} has ${bank.length}, needs ${Q.MIN[lv]}`);
    for (const x of bank) {
      assert.equal(typeof x.q, "string"); assert.ok(x.q.trim().length > 0, "empty question");
      assert.ok(Array.isArray(x.a) && x.a.length === optLen, `options for "${x.q}"`);
      assert.equal(new Set(x.a).size, x.a.length, `duplicate options in "${x.q}"`);
      for (const o of x.a) assert.ok(typeof o === "string" && o.trim().length > 0, `empty option in "${x.q}"`);
      assert.ok(Number.isInteger(x.c) && x.c >= 0 && x.c < x.a.length, `c out of range in "${x.q}"`);
      assert.ok(allowed.includes(x.cat), `bad category ${x.cat} in "${x.q}"`);
      assert.ok(!texts.has(x.q), `duplicate question "${x.q}"`);
      texts.add(x.q);
      const blob = x.q + x.a.join("") + (x.fun || "");
      assert.ok(!blob.includes(DASH), `em dash in "${x.q}"`);
      if (x.fun) { assert.equal(typeof x.fun, "string"); fun++; }
      perCat[x.cat] = (perCat[x.cat] || 0) + 1;
    }
    for (const c of allowed) assert.ok(perCat[c] >= 30, `age ${lv} category ${c} has only ${perCat[c]}`);
  }
  assert.ok(fun >= 120, "fun facts: " + fun);
  assert.ok(Q.BANK[5].length >= 220 && Q.BANK[8].length >= 260);
  assert.equal(Q.CATS[5].count, "Counting and numbers");
  assert.equal(Object.keys(Q.CATS[8]).length, 5);
});

test("counts() reports per-category totals that add up", () => {
  for (const lv of [5, 8]) {
    const c = L.counts(lv);
    const sum = Object.keys(Q.CATS[lv]).reduce((a, k) => a + c[k], 0);
    assert.equal(sum, c.total);
    assert.equal(c.total, Q.BANK[lv].length);
  }
});

// ------------------------------------------------------------ procedural math
function evalGen(q) {
  // Recompute the right answer from the question text for the checkable templates.
  let m;
  const t = q.q;
  if ((m = /^(\d+) \+ (\d+) = \?$/.exec(t))) return String(+m[1] + +m[2]);
  if ((m = /^(\d+) - (\d+) = \?$/.exec(t))) return String(m[1] - m[2]);
  if ((m = /^(\d+) x (\d+) = \?$/.exec(t))) return String(m[1] * m[2]);
  if ((m = /^(\d+) divided by (\d+) = \?$/.exec(t))) return String(m[1] / m[2]);
  if ((m = /^\? x (\d+) = (\d+)$/.exec(t))) return String(m[2] / m[1]);
  if ((m = /^What is double (\d+)\?$/.exec(t))) return String(m[1] * 2);
  if ((m = /^What is half of (\d+)\?$/.exec(t))) return String(m[1] / 2);
  if ((m = /^What is (\d+) plus (\d+)\?$/.exec(t))) return String(+m[1] + +m[2]);
  if ((m = /^What is (\d+) take away (\d+)\?$/.exec(t))) return String(m[1] - m[2]);
  if ((m = /^What number comes after (\d+)\?$/.exec(t))) return String(+m[1] + 1);
  if ((m = /^What number comes before (\d+)\?$/.exec(t))) return String(m[1] - 1);
  if ((m = /^Round (\d+) to the nearest ten\.$/.exec(t))) return String(Math.round(m[1] / 10) * 10);
  if ((m = /^Round (\d+) to the nearest hundred\.$/.exec(t))) return String(Math.round(m[1] / 100) * 100);
  if ((m = /has (\d+) \w+ and gives (\d+) away/.exec(t))) return String(m[1] - m[2]);
  if ((m = /has (\d+) boxes with (\d+) \w+ in each/.exec(t))) return String(m[1] * m[2]);
  if ((m = /is (\d+) cm long and (\d+) cm wide/.exec(t))) return String(2 * (+m[1] + +m[2]));
  if ((m = /is (\d+) units long and (\d+) units wide/.exec(t))) return String(m[1] * m[2]);
  if ((m = /^How much is (.+)\?$/.exec(t))) {
    let cents = 0;
    for (const part of m[1].split(" + ")) {
      const p = /^(\d+) (quarter|dime|nickel)s?$/.exec(part);
      cents += p[1] * { quarter: 25, dime: 10, nickel: 5 }[p[2]];
    }
    return cents + " cents";
  }
  if ((m = /^How many (.+)\?$/.exec(t))) return String(Array.from(m[1]).length);
  if ((m = /^What time is (.+) after (\d+):(\d\d)\?$/.exec(t))) {
    const add = m[1] === "1 hour" ? 60 : m[1] === "1 hour 30 minutes" ? 90 : parseInt(m[1], 10);
    let mins = ((+m[2]) % 12) * 60 + +m[3] + add;
    mins %= 720;
    let h = Math.floor(mins / 60); if (h === 0) h = 12;
    return h + ":" + String(mins % 60).padStart(2, "0");
  }
  if (t === "Which group has more?") {
    const groups = q.a.filter((o) => o !== "They are the same");
    return groups.sort((a, b) => Array.from(b).length - Array.from(a).length)[0];
  }
  throw new Error("unknown template: " + t);
}

test("procedural math: 1,000 generated questions per level are correct with distinct, plausible distractors", () => {
  for (const lv of [5, 8]) {
    const st = { rng: 12345 + lv };
    const templates = new Set();
    for (let i = 0; i < 1000; i++) {
      const q = L.genMath(lv, st);
      assert.equal(q.a.length, lv === 5 ? 3 : 4);
      assert.equal(new Set(q.a).size, q.a.length, "distinct options: " + q.q);
      assert.ok(q.c >= 0 && q.c < q.a.length);
      assert.equal(q.cat, lv === 5 ? "count" : "math");
      const want = evalGen(q);
      assert.equal(q.a[q.c], want, "correct answer for " + q.q);
      templates.add(q.q.replace(/\d+/g, "N").slice(0, 20));
      q.a.forEach((o, k) => {
        if (k === q.c) return;
        assert.notEqual(o, want);
        const n = parseInt(o, 10), w = parseInt(want, 10);
        if (!isNaN(n) && !isNaN(w) && /^\d+( cents)?$/.test(o)) {
          assert.ok(n >= 0, "negative distractor in " + q.q);
          assert.ok(Math.abs(n - w) <= Math.max(120, w), `implausible distractor ${o} for ${q.q} = ${want}`);
        }
      });
    }
    assert.ok(templates.size >= 5, "variety of templates");
  }
});

test("procedural math is deterministic from the rng state", () => {
  const a = { rng: 99 }, b = { rng: 99 };
  for (let i = 0; i < 50; i++) assert.deepEqual(L.genMath(8, a), L.genMath(8, b));
});

// ------------------------------------------------------------ runs
test("newRun picks the requested count, level, option length, and no repeats within a run", () => {
  for (const lv of [5, 8]) for (const count of [10, 20]) {
    const s = L.newRun({ level: lv, mode: "quiz", count, seed: 7 });
    assert.equal(s.qs.length, count);
    assert.equal(s.count, count);
    const ids = new Set(s.qs.map((q) => q.id));
    assert.equal(ids.size, count, "unique ids");
    const texts = new Set(s.qs.map((q) => q.q));
    assert.equal(texts.size, count, "unique texts");
    for (const q of s.qs) {
      assert.equal(q.a.length, lv === 5 ? 3 : 4);
      assert.ok(Q.CATS[lv][q.cat], "category " + q.cat);
      if (!q.gen) {
        const src = Q.BANK[lv][parseInt(q.id.split(":")[1], 10)];
        assert.equal(src.q, q.q);
        assert.equal(q.a[q.c], src.a[src.c], "shuffled options keep the right answer");
        assert.deepEqual(q.a.slice().sort(), src.a.slice().sort());
      }
    }
  }
});

test("a quiz mixes in procedural math (about a fifth) and none when another category is chosen", () => {
  const s = L.newRun({ level: 8, mode: "quiz", count: 20, seed: 3 });
  assert.equal(s.qs.filter((q) => q.gen).length, 4);
  const t = L.newRun({ level: 8, mode: "practice", category: "science", seed: 3 });
  assert.ok(t.qs.every((q) => !q.gen && q.cat === "science"));
  const u = L.newRun({ level: 5, mode: "quiz", count: 10, category: "count", seed: 3 });
  assert.equal(u.qs.filter((q) => q.gen).length, 5);
  assert.ok(u.qs.every((q) => q.cat === "count"));
});

test("seed determinism: same seed same run, different seed different run, JSON round trip", () => {
  const a = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 42 });
  const b = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 42 });
  assert.deepEqual(a, b);
  const c = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 43 });
  assert.notDeepEqual(a.qs.map((q) => q.id), c.qs.map((q) => q.id));
  const copy = JSON.parse(JSON.stringify(a));
  assert.deepEqual(copy, a);
  L.answer(copy, copy.qs[0].c); L.next(copy);
  L.answer(a, a.qs[0].c); L.next(a);
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), JSON.parse(JSON.stringify(a)));
});

test("answer: returns correctness, updates score and streak, rejects double answers and bad indexes", () => {
  const s = L.newRun({ level: 5, mode: "quiz", count: 10, seed: 5 });
  assert.equal(L.answer(s, 9), null, "out of range");
  assert.equal(L.answer(s, -1), null);
  let q = L.current(s);
  let r = L.answer(s, q.c);
  assert.equal(r.correct, true); assert.equal(r.correctIdx, q.c);
  assert.equal(s.score, 1); assert.equal(s.streak, 1);
  assert.equal(L.answer(s, q.c), null, "already answered");
  assert.ok(L.next(s));
  q = L.current(s);
  r = L.answer(s, (q.c + 1) % 3);
  assert.equal(r.correct, false); assert.equal(r.correctIdx, q.c);
  assert.equal(s.score, 1); assert.equal(s.streak, 0);
  assert.deepEqual(s.history, [true, false]);
});

test("next() needs an answer first, advances, and finishes the run at count", () => {
  const s = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 11 });
  assert.equal(L.next(s), false, "cannot skip");
  playThrough(s, always);
  assert.equal(s.done, true);
  assert.equal(s.i, 10);
  assert.equal(s.score, 10);
  assert.equal(s.best, 10);
  assert.equal(L.current(s), null);
  assert.equal(L.answer(s, 0), null, "no answers after done");
  assert.equal(L.next(s), false);
});

test("streak resets on a miss and best streak is kept", () => {
  const s = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 12 });
  const plan = [1, 1, 1, 0, 1, 1, 0, 0, 1, 1];
  let k = 0;
  playThrough(s, (q) => (plan[k++] ? q.c : (q.c + 1) % 4));
  assert.equal(s.score, 7);
  assert.equal(s.best, 3);
  assert.equal(s.streak, 2);
});

test("star thresholds: 90% three, 60% two, else one, none before any answer", () => {
  const s = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 1 });
  assert.equal(L.stars(s), 0);
  const run = (hits) => { const r = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 1 }); let k = 0; playThrough(r, (q) => (k++ < hits ? q.c : (q.c + 1) % 4)); return L.stars(r); };
  assert.equal(run(10), 3); assert.equal(run(9), 3); assert.equal(run(8), 2); assert.equal(run(6), 2); assert.equal(run(5), 1); assert.equal(run(0), 1);
  const t = L.newRun({ level: 8, mode: "quiz", count: 20, seed: 1 }); let k = 0;
  playThrough(t, (q) => (k++ < 18 ? q.c : (q.c + 1) % 4));
  assert.equal(L.stars(t), 3);
});

test("seen tracking: a run never repeats questions seen before, and seenAfter accumulates", () => {
  let seen = [];
  const all = new Set();
  for (let round = 0; round < 5; round++) {
    const s = L.newRun({ level: 8, mode: "quiz", count: 20, seed: 100 + round, seen });
    assert.equal(s.seenReset, false);
    for (const q of s.qs) if (!q.gen) { assert.ok(!seen.includes(q.id), "repeat " + q.id); assert.ok(!all.has(q.id)); all.add(q.id); }
    playThrough(s, always);
    seen = L.seenAfter(s, seen);
  }
  assert.equal(seen.length, 5 * 16);
  assert.ok(seen.every((id) => !id.startsWith("g")), "procedural questions are not remembered");
});

test("seen tracking resets when a level or category is exhausted", () => {
  const total = L.counts(5).letters;
  const seen = [];
  for (let i = 0; i < Q.BANK[5].length; i++) if (Q.BANK[5][i].cat === "letters" && seen.length < total - 3) seen.push(L.qid(5, i));
  const s = L.newRun({ level: 5, mode: "quiz", count: 10, category: "letters", seed: 9, seen });
  assert.equal(s.seenReset, true);
  assert.ok(s.qs.every((q) => q.cat === "letters"));
  // the 3 unseen ones come first, then old ones
  const fresh = s.qs.filter((q) => !seen.includes(q.id));
  assert.equal(fresh.length, 3);
  playThrough(s, always);
  const after = L.seenAfter(s, seen);
  assert.equal(after.length, 10, "memory restarts from this run");
  // partial progress only remembers answered cards
  const t = L.newRun({ level: 8, mode: "quiz", count: 10, seed: 2 });
  L.answer(t, 0); L.next(t); L.answer(t, 0);
  const part = L.seenAfter(t, []);
  assert.equal(part.length, t.qs.slice(0, 2).filter((q) => !q.gen).length);
});

test("practice mode is endless with a running score and can be finished", () => {
  const s = L.newRun({ level: 8, mode: "practice", category: "brain", seed: 4 });
  assert.equal(s.count, 0);
  const seenIds = new Set();
  for (let i = 0; i < 100; i++) {
    const q = L.current(s);
    assert.ok(q, "always a question");
    assert.equal(q.cat, "brain");
    if (i < L.counts(8).brain) { assert.ok(!seenIds.has(q.id), "no repeat before the category is used up"); }
    seenIds.add(q.id);
    L.answer(s, i % 3 === 0 ? (q.c + 1) % 4 : q.c);
    assert.ok(L.next(s));
    assert.equal(s.done, false);
  }
  assert.equal(s.i, 100);
  assert.equal(s.score, 66);
  L.finishPractice(s);
  assert.equal(s.done, true);
  assert.equal(s.count, 100);
  assert.equal(L.stars(s), 2);
});

test("two player: alternating turns, per-player scores, winner and ties", () => {
  const s = L.newRun({ level: 5, mode: "two", count: 10, seed: 6, players: [{ name: "Ada", emoji: "🦊" }, { name: "Ben", emoji: "🐸" }] });
  assert.equal(s.players.length, 2);
  assert.equal(s.players[0].name, "Ada"); assert.equal(s.players[1].emoji, "🐸");
  const turns = [];
  playThrough(s, (q, st) => { turns.push(L.turnOf(st)); return L.turnOf(st) === 0 ? q.c : (q.c + 1) % 3; });
  assert.deepEqual(turns, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
  assert.equal(s.players[0].score, 5); assert.equal(s.players[1].score, 0);
  assert.equal(s.score, 5);
  assert.equal(L.winner(s), 0);
  const t = L.newRun({ level: 5, mode: "two", count: 10, seed: 6 });
  playThrough(t, always);
  assert.equal(L.winner(t), -1, "tie");
  assert.equal(t.players[0].name, "Player 1");
  assert.equal(t.players[0].emoji, L.AVATARS[0]); assert.equal(t.players[1].emoji, L.AVATARS[1]);
  const u = L.newRun({ level: 5, mode: "two", count: 10, seed: 6, players: [{ name: "A", emoji: "💩" }, { name: "x".repeat(40) }] });
  assert.equal(u.players[0].emoji, L.AVATARS[0], "unknown avatar falls back");
  assert.equal(u.players[1].name.length, 16, "names are capped");
  assert.equal(L.winner(L.newRun({ level: 5, mode: "quiz", count: 10, seed: 1 })), -1);
});

test("newRun sanitises odd inputs", () => {
  const s = L.newRun({ level: 12, mode: "nonsense", count: 99, category: "pirates", seed: "x" });
  assert.equal(s.level, 5); assert.equal(s.mode, "quiz"); assert.equal(s.count, 10); assert.equal(s.cat, null); assert.equal(s.seed, 0);
  const t = L.newRun();
  assert.equal(t.qs.length, 10);
});

test("many seeds: full runs in every mode terminate with consistent bookkeeping", () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const mode of ["quiz", "two"]) for (const lv of [5, 8]) {
      const s = L.newRun({ level: lv, mode, count: seed % 2 ? 10 : 20, seed });
      let k = 0;
      playThrough(s, (q) => (k++ % 3 === 0 ? (q.c + 1) % q.a.length : q.c));
      assert.equal(s.history.length, s.count);
      assert.equal(s.score, s.history.filter(Boolean).length);
      if (mode === "two") assert.equal(s.players[0].score + s.players[1].score, s.score);
      assert.ok([1, 2, 3].includes(L.stars(s)));
    }
  }
});

// ------------------------------------------------------------ page contract
test("page contract: base href, noindex, relative assets, no em dash, no external URLs", () => {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/brain-quest/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/brain-quest\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('name="theme-color" content="#F3EDE3"'));
  assert.ok(html.includes('href="/play/"'));
  assert.ok(/back to games|games/.test(html));
  assert.ok(html.includes("<title>Brain Quest</title>"));
  assert.ok(html.includes('href="style.css"') && html.includes('src="app.js"') && html.includes('src="logic.js"') && html.includes('src="questions.js"'));
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  for (const f of ["/fonts/marcellus.woff2", "/fonts/jost-400.woff2", "/fonts/jost-500.woff2", "/fonts/jost-600.woff2"]) assert.ok(css.includes(f), f);
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!txt.includes(DASH), "em dash in " + f);
    assert.ok(!/https?:\/\//.test(txt.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "external URL in " + f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(DASH));
  for (const f of ["logic.js", "questions.js"]) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/document\.|window\.|Math\.random|Date\./.test(src), f + " is pure");
  }
  assert.ok(fs.readFileSync(path.join(dir, "app.js"), "utf8").includes("kz.brain-quest.save.v1"));
});
