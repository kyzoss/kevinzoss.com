const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../private/cribbage/logic.js");
const EM = String.fromCharCode(0x2014);

const H = (s) => s.trim().split(/\s+/);
const hand = (h, s, crib) => L.scoreHand(H(h), s, !!crib).total;

// A controlled state in the pegging phase.
function mk(over) {
  const st = L.newGame(1);
  Object.assign(st, {
    phase: "play", dealer: 0, turn: 1, scores: [0, 0], prev: [0, 0], winner: -1, skunk: 0,
    pile: [], total: 0, played: [], goSaid: -1, starter: "KD",
    keep: [[], []], pegHands: [[], []], log: []
  }, over || {});
  st.keep = [st.pegHands[0].slice(), st.pegHands[1].slice()];
  return st;
}

// ------------------------------------------------------------- hand counting

// Independent brute force reference for the cross check below.
function refScore(h4, starter, crib) {
  const R = "A23456789TJQK";
  const rk = (c) => R.indexOf(c[0]) + 1, vl = (c) => Math.min(10, rk(c));
  const all = h4.concat([starter]);
  let t = 0;
  for (let m = 1; m < 32; m++) {
    const cs = all.filter((_, i) => m & (1 << i));
    if (cs.reduce((a, c) => a + vl(c), 0) === 15) t += 2;
  }
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (all[i][0] === all[j][0]) t += 2;
  for (let len = 5; len >= 3; len--) {
    let n = 0;
    for (let m = 1; m < 32; m++) {
      const cs = all.filter((_, i) => m & (1 << i));
      if (cs.length !== len) continue;
      const r = cs.map(rk).sort((a, b) => a - b);
      if (r.every((x, i) => i === 0 || x === r[i - 1] + 1)) n++;
    }
    if (n) { t += n * len; break; }
  }
  if (h4.every((c) => c[1] === h4[0][1])) {
    if (starter[1] === h4[0][1]) t += 5; else if (!crib) t += 4;
  }
  h4.forEach((c) => { if (c[0] === "J" && c[1] === starter[1]) t += 1; });
  return t;
}

test("matches an independent reference on 3000 random hands", () => {
  let x = 12345;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  for (let n = 0; n < 3000; n++) {
    const d = L.makeDeck();
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    const h = d.slice(0, 4), s = d[4], crib = n % 2 === 1;
    assert.equal(L.fastTotal(h, s, crib), refScore(h, s, crib));
    assert.equal(L.scoreHand(h, s, crib).total, refScore(h, s, crib), h.join(" ") + " / " + s + (crib ? " crib" : ""));
  }
});

test("fifteens score 2 each, every combination", () => {
  assert.equal(hand("5H TS 2C 8D", "AC"), 4);           // 5+10, 5+8+2
  assert.equal(hand("6H 9S 2C 3D", "KC"), 4);            // 6+9, 2+3+K
});

test("zero hands", () => {
  assert.equal(hand("2H 4S 7C KD", "QC"), 0);
  assert.equal(hand("AH 3S 9C QD", "7D"), 0);
  assert.equal(L.scoreHand(H("2H 4S 7C KD"), "QC", false).items.length, 0);
});

test("pairs, trips and quads", () => {
  assert.equal(hand("4H 4S 9C KD", "QC"), 2);
  assert.equal(hand("4H 4S 4C KD", "QC"), 6);
  assert.equal(hand("4H 4S 4C 4D", "QC"), 12);
  assert.equal(hand("QH QS 7C 2D", "2C"), 4);            // two pairs
  assert.equal(hand("9H 9S 9C AD", "AC"), 6 + 2);        // pair royal and a pair
});

test("runs: five long, double, triple, double double", () => {
  assert.equal(hand("9H TS JC QD", "KD"), 5);
  assert.equal(hand("3H 4S 5C KD", "6D"), 4 + 4);        // run of 4, plus 5+K and 4+5+6
  assert.equal(hand("3H 4S 4C 5D", "KD"), 6 + 2 + 2);    // double run 6, pair 2, 5+K 2
  assert.equal(hand("7H 7S 8C 8D", "9D"), 12 + 4 + 8);   // double double run, two pairs, four 7+8
});

test("double run of three is 8 with a pair", () => {
  const r = L.scoreHand(H("4H 5S 5C 9D"), "6D", false);
  const lab = r.items.map((i) => i.label);
  assert.equal(lab.filter((l) => l.startsWith("run of 3")).length, 2);
  assert.ok(lab.includes("pair of 5s for 2"));
});

test("triple run (three of a kind plus two) and double double run", () => {
  const triple = L.scoreHand(H("3H 3S 3C 4D"), "5D", false);
  assert.equal(triple.items.filter((i) => i.label.startsWith("run of 3")).length, 3);
  assert.equal(triple.items.filter((i) => i.label.startsWith("pair of 3s")).length, 3);
  const dd = L.scoreHand(H("3H 3S 4C 4D"), "5D", false);
  assert.equal(dd.items.filter((i) => i.label.startsWith("run of 3")).length, 4);
});

test("run of 4 inside five cards does not also score runs of 3", () => {
  const r = L.scoreHand(H("3H 4S 5C 6D"), "KD", false);
  assert.equal(r.items.filter((i) => i.label.startsWith("run")).length, 1);
  assert.equal(r.items.find((i) => i.label.startsWith("run")).pts, 4);
});

test("the famous 29 hand", () => {
  assert.equal(hand("5H 5D 5S JC", "5C"), 29);
  const r = L.scoreHand(H("5H 5D 5S JC"), "5C", false);
  assert.equal(r.items.filter((i) => i.label === "15 for 2").length, 8);
  assert.ok(r.items.some((i) => i.label === "his nobs for 1"));
});

test("nobs needs the starter's suit, and a jack starter is not nobs", () => {
  assert.equal(hand("5H 5D 5S JD", "5C"), 28);
});

test("flush: four in hand is 4, five with starter is 5", () => {
  assert.equal(hand("2H 4H 7H KH", "QS"), 4);
  assert.equal(hand("2H 4H 7H KH", "QH"), 5);
  assert.equal(hand("2H 4H 7H KS", "QH"), 0);
});

test("crib only counts a five card flush", () => {
  assert.equal(hand("2H 4H 7H KH", "QS", true), 0);
  assert.equal(hand("2H 4H 7H KH", "QH", true), 5);
});

test("nobs: jack in hand matching starter suit is 1, starter jack and off suit jack do not", () => {
  assert.equal(hand("JH 2S 7C KD", "9H") - hand("JD 2S 7C KD", "9H"), 1);
  assert.equal(hand("2C 4S 7C KD", "JH"), 0);
  assert.equal(L.scoreHand(H("JH 2S 7C 9D"), "4H", true).items.some((i) => i.label === "his nobs for 1"), true);
});

test("labels are plain language", () => {
  const r = L.scoreHand(H("5H 5D TS 2C"), "AC", false);
  const lab = r.items.map((i) => i.label);
  assert.ok(lab.includes("15 for 2"));
  assert.ok(lab.includes("pair of 5s for 2"));
});

// --------------------------------------------------------------- pegging play

test("pegScore: 15, 31, pair, trips, quads", () => {
  assert.equal(L.pegScore(H("TH 5S")).pts, 2);
  assert.equal(L.pegScore(H("TH TS 8C 3D")).pts, 2);   // 31
  assert.equal(L.pegScore(H("4H 4S")).pts, 2);
  assert.equal(L.pegScore(H("9H 4H 4S 4C")).pts, 6);
  assert.equal(L.pegScore(H("9H 4H 4S 4C 4D")).pts, 12);
  assert.equal(L.pegScore(H("4H 9S 4S")).pts, 0);       // not consecutive
});

test("pegScore: pair that also makes 15 or 31 scores both", () => {
  assert.equal(L.pegScore(H("7H 8S 8C")).pts, 2);                    // 23, pair only
  assert.equal(L.pegScore(H("5H 5S 5C")).pts, 2 + 6);                // 15 and three of a kind
  assert.equal(L.pegScore(H("2H 5S 5C 5D")).pts, 6);                 // 17
});

test("pegScore: runs in any order, longest of the latest cards", () => {
  assert.equal(L.pegScore(H("3H 5S 4C")).pts, 3);
  assert.equal(L.pegScore(H("5H 3S 4C 6D")).pts, 4);
  assert.equal(L.pegScore(H("KH 5H 3S 4C 6D")).pts, 4);
  assert.equal(L.pegScore(H("2H 9S 3C 4D")).pts, 0);   // 9 breaks it for the three
  assert.equal(L.pegScore(H("9H 2S 3C 4D")).pts, 3);
  assert.equal(L.pegScore(H("3H 4S 4C 5D")).pts, 0);   // a repeated rank spoils the run
  assert.equal(L.pegScore(H("QH KS AC")).pts, 0);      // ace is low, no wrap
});

test("pegScore: 15 and a run together", () => {
  const r = L.pegScore(H("4H 5S 6C"));
  assert.equal(r.pts, 2 + 3);
  assert.deepEqual(r.items.map((i) => i.label), ["15 for 2", "run of 3 for 3"]);
});

test("play: legal only up to 31, enforces turn", () => {
  const st = mk({ pegHands: [["KH", "2S", "3S", "4S"], ["QH", "5C", "6C", "7C"]], total: 25, pile: ["KD", "9D", "6H"], turn: 0 });
  assert.deepEqual(L.legalPlays(st, 0).sort(), ["2S", "3S", "4S"].sort());
  assert.equal(L.play(st, 0, "KH"), false);
  assert.equal(L.play(st, 1, "5C"), false);   // not your turn
  assert.equal(L.play(st, 0, "4S"), true);
});

test("31 scores 2, resets the count, and the other player leads", () => {
  const st = mk({ pegHands: [["KH", "2S"], ["QH", "3C"]], total: 29, pile: ["KD", "9D", "9S", "2C"], turn: 0 });
  L.play(st, 0, "2S");
  assert.equal(st.scores[0], 2);
  assert.equal(st.total, 0);
  assert.equal(st.turn, 1);
  assert.equal(st.pile.length, 0);
});

test("go point: opponent cannot play, player pegs 1 on the final card of the sequence", () => {
  const st = mk({ pegHands: [["8H", "2S"], ["QH", "KC"]], total: 20, pile: ["KD", "QD"], turn: 0 });
  L.play(st, 0, "8H");               // 28; opponent has only tens: must say go; player 0 has 2S? 28+2=30 legal
  assert.equal(st.turn, 0);
  assert.ok(st.log.some((l) => /says go/.test(l.text)));
  L.play(st, 0, "2S");               // 30; nobody can play: 1 for go
  assert.equal(st.scores[0], 1);
  assert.equal(st.total, 0);
  assert.equal(st.turn, 1);          // other player leads the new sequence
});

test("last card scores 1 and moves to counting, but 31 on the last card scores only 2", () => {
  const a = mk({ pegHands: [["2H"], []], total: 10, pile: ["KD"], turn: 0 });
  L.play(a, 0, "2H");
  assert.equal(a.scores[0], 1);
  assert.equal(a.phase, "count");
  const b = mk({ pegHands: [["AH"], []], total: 30, pile: ["KD", "QD", "JD"], turn: 0 });
  L.play(b, 0, "AH");
  assert.equal(b.scores[0], 2);
  assert.equal(b.phase, "count");
});

test("his heels: dealer pegs 2 when the starter is a jack", () => {
  let found = 0, notFound = 0;
  for (let s = 1; s < 400 && (found < 3 || notFound < 3); s++) {
    const st = L.newGame(s);
    const keep = L.aiDiscard(st.hands[0], st.dealer === 0);
    L.discard(st, 0, keep);
    assert.equal(st.phase, "play");
    const heels = st.starter[0] === "J";
    const base = st.scores[st.dealer];
    assert.equal(base, heels ? 2 : 0);
    assert.equal(st.scores[1 - st.dealer], 0);
    heels ? found++ : notFound++;
  }
  assert.ok(found >= 3 && notFound >= 3);
});

test("win mid-play ends the game at once and caps at 121", () => {
  const st = mk({ pegHands: [["5H", "2S"], ["QH", "KC"]], total: 10, pile: ["KD"], turn: 0, scores: [119, 80] });
  L.play(st, 0, "5H");     // 15 for 2 -> 121
  assert.equal(st.scores[0], 121);
  assert.equal(st.phase, "over");
  assert.equal(st.winner, 0);
  assert.equal(st.skunk, 1);
  assert.equal(L.play(st, 1, "QH"), false);
  assert.equal(L.countNext(st), false);
});

test("a win on the go point and a win while counting", () => {
  const st = mk({ pegHands: [["8H"], ["QH", "KC"]], total: 22, pile: ["KD", "QD", "2S"], turn: 0, scores: [120, 100] });
  L.play(st, 0, "8H");   // 30: opponent cannot play, player 0 cannot: go
  assert.equal(st.winner, 0);
  assert.equal(st.scores[0], 121);

  const c = mk({ phase: "count", dealer: 1, starter: "5C", pegHands: [[], []], scores: [117, 115] });
  c.keep = [H("5H 5D 5S JC"), H("2H 4S 7C KD")];
  c.crib = H("AH 3S 9C QD");
  c.count = { step: 0, current: null };
  L.countNext(c);        // non-dealer (human) counts first: 29, wins before the dealer counts
  assert.equal(c.phase, "over");
  assert.equal(c.winner, 0);
  assert.equal(c.scores[1], 115);
  assert.equal(c.count.step, 1);
});

test("counting order is non-dealer, dealer, crib, then a new deal with the dealer swapped", () => {
  const st = mk({ phase: "count", dealer: 1, starter: "9C", pegHands: [[], []] });
  st.keep = [H("2H 4S 7C KD"), H("AH 3S 9D QD")];
  st.crib = H("5H 5S 5D JC");
  st.count = { step: 0, current: null };
  L.countNext(st); assert.equal(st.count.current.who, 0); assert.equal(st.count.current.kind, "hand");
  L.countNext(st); assert.equal(st.count.current.who, 1); assert.equal(st.count.current.kind, "hand");
  L.countNext(st); assert.equal(st.count.current.who, 1); assert.equal(st.count.current.kind, "crib");
  assert.equal(st.scores[1], L.scoreHand(st.keep[1], "9C", false).total + L.scoreHand(H("5H 5S 5D JC"), "9C", true).total);
  L.countNext(st);
  assert.equal(st.dealer, 0);
  assert.equal(st.phase, "discard");
  assert.equal(st.hands[0].length, 6);
});

// ----------------------------------------------------------------- skunks

test("skunk and double skunk detection", () => {
  const mkWin = (loser) => {
    const st = mk({ pegHands: [["5H"], ["QH"]], total: 10, pile: ["KD"], turn: 0, scores: [119, loser] });
    L.play(st, 0, "5H");
    return st;
  };
  assert.equal(mkWin(91).skunk, 0);
  assert.equal(mkWin(90).skunk, 1);
  assert.equal(mkWin(61).skunk, 1);
  assert.equal(mkWin(60).skunk, 2);
  assert.equal(mkWin(0).skunk, 2);
});

// ------------------------------------------------------------ deal and crib

test("deal: 6 each from a 52 card deck, no duplicates, computer discards, crib has 2", () => {
  const st = L.newGame(7);
  assert.equal(st.phase, "discard");
  assert.equal(st.hands[0].length, 6);
  assert.equal(st.hands[1].length, 4);
  assert.equal(st.crib.length, 2);
  const all = st.hands[0].concat(st.hands[1], st.crib, st.deck);
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
  assert.equal(L.makeDeck().length, 52);
});

test("discard validation and the cut", () => {
  const st = L.newGame(11);
  const h = st.hands[0].slice();
  assert.equal(L.discard(st, 0, [h[0]]), false);
  assert.equal(L.discard(st, 0, [h[0], h[0]]), false);
  assert.equal(L.discard(st, 0, [h[0], "XX"]), false);
  assert.equal(L.discard(st, 0, [h[0], h[1]]), true);
  assert.equal(L.discard(st, 0, [h[2], h[3]]), false);   // already discarded
  assert.equal(st.crib.length, 4);
  assert.equal(st.hands[0].length, 4);
  assert.equal(st.phase, "play");
  assert.ok(st.starter && !st.crib.includes(st.starter) && !st.hands[0].includes(st.starter) && !st.hands[1].includes(st.starter));
  assert.equal(st.turn, 1 - st.dealer);
});

test("dealer alternates each hand", () => {
  const st = L.newGame(21);
  const d0 = st.dealer;
  playOutRound(st);
  if (st.phase !== "over") assert.equal(st.dealer, 1 - d0);
});

// -------------------------------------------------- determinism, JSON, the AI

function playOutRound(st) {
  const r = st.round;
  let guard = 0;
  while (st.phase !== "over" && st.round === r && guard++ < 500) step(st);
}

function step(st) {
  if (st.phase === "discard") {
    const k = L.aiDiscard(st.hands[0], st.dealer === 0);
    assert.ok(L.discard(st, 0, k));
  } else if (st.phase === "play") {
    const p = st.turn;
    const legal = L.legalPlays(st, p);
    assert.ok(legal.length > 0, "player to move must have a legal card");
    const c = L.aiPlayChoice(st, p);
    assert.ok(legal.includes(c), "AI picked an illegal card");
    assert.ok(L.play(st, p, c));
  } else if (st.phase === "count") {
    assert.ok(L.countNext(st));
  }
}

function fullGame(seed) {
  const st = L.newGame(seed);
  let guard = 0;
  while (st.phase !== "over") {
    if (guard++ > 5000) throw new Error("no end for seed " + seed);
    step(st);
  }
  return st;
}

test("same seed gives the same game, different seeds differ", () => {
  const a = fullGame(5), b = fullGame(5), c = fullGame(6);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.log, c.log);
  assert.deepEqual(L.newGame(99).hands, L.newGame(99).hands);
});

test("state survives a JSON round trip mid-game and continues identically", () => {
  const a = L.newGame(33);
  for (let i = 0; i < 25 && a.phase !== "over"; i++) step(a);
  const b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(a, b);
  for (let i = 0; i < 400 && a.phase !== "over"; i++) { step(a); step(b); }
  assert.deepEqual(a, b);
});

test("AI discards are always two distinct cards from its own hand", () => {
  for (let s = 1; s <= 200; s++) {
    const st = L.newGame(s);
    assert.equal(st.hands[1].length, 4);
    assert.equal(st.crib.length, 2);
    assert.equal(new Set(st.crib).size, 2);
  }
});

test("AI keeps a monster hand and throws sensibly", () => {
  const d = L.aiDiscard(H("5H 5D 5S JC KH 2D"), true);
  assert.ok(!d.includes("5H") && !d.includes("5D") && !d.includes("5S"));
});

test("AI makes 15 and 31 when it can, and takes pairs", () => {
  const st = mk({ pegHands: [["9H"], ["5C", "2S", "9D"]], turn: 1, total: 10, pile: ["KD"], starter: "3D" });
  assert.equal(L.aiPlayChoice(st, 1), "5C");
  const st2 = mk({ pegHands: [["9H"], ["AC", "2S", "9D"]], turn: 1, total: 29, pile: ["KD", "QD", "9S"], starter: "3D" });
  assert.equal(L.aiPlayChoice(st2, 1), "2S");
  const st3 = mk({ pegHands: [["9H"], ["4C", "4S", "KD"]], turn: 1, total: 4, pile: ["4H"], starter: "3D" });
  assert.ok(["4C", "4S"].includes(L.aiPlayChoice(st3, 1)));
});

test("AI avoids leading a five when it has an alternative", () => {
  const st = mk({ pegHands: [["9H", "8H"], ["5C", "3S", "KD", "9D"]], turn: 1, starter: "AD" });
  assert.notEqual(L.aiPlayChoice(st, 1), "5C");
});

test("hundreds of seeded games finish with every move legal", () => {
  let skunks = 0, p0 = 0;
  for (let s = 1; s <= 300; s++) {
    const st = fullGame(s);
    assert.ok(st.winner === 0 || st.winner === 1);
    assert.equal(st.scores[st.winner], 121);
    assert.ok(st.scores[1 - st.winner] < 121);
    if (st.skunk) skunks++;
    if (st.winner === 0) p0++;
  }
  assert.ok(p0 > 60 && p0 < 240, "both sides win sometimes: " + p0);
  assert.ok(skunks >= 0);
});

test("scores only ever move forward and prev trails the score", () => {
  const st = L.newGame(8);
  let last = [0, 0], guard = 0;
  while (st.phase !== "over" && guard++ < 3000) {
    step(st);
    for (const p of [0, 1]) {
      assert.ok(st.scores[p] >= last[p]);
      assert.ok(st.prev[p] <= st.scores[p]);
      assert.ok(st.scores[p] <= 121);
    }
    last = st.scores.slice();
  }
});

test("no em dash anywhere in the shipped files", () => {
  const fs = require("node:fs"), path = require("node:path");
  const dir = path.join(__dirname, "..", "private", "cribbage");
  for (const f of fs.readdirSync(dir)) {
    assert.ok(!fs.readFileSync(path.join(dir, f), "utf8").includes(EM), f + " has an em dash");
  }
});

test("index.html pins its base path and uses relative files", () => {
  const fs = require("node:fs"), path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "private", "cribbage", "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/cribbage/"'));
  assert.ok(html.indexOf("<base") < html.indexOf("<link"));
  assert.ok(/src="logic\.js"/.test(html) && /src="app\.js"/.test(html) && /href="style\.css"/.test(html));
  assert.ok(!/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, "")));
});
