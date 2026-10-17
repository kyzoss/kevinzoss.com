"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/craps/logic.js");

const DASH = String.fromCharCode(0x2014);

// Mirror of the engine's mulberry32 so tests can look for a seed that throws a wanted sequence.
function diceFromSeed(seed, n) {
  const st = { rng: seed | 0 };
  const out = [];
  for (let i = 0; i < n; i++) {
    const d1 = 1 + Math.floor(L.nextRand(st) * 6), d2 = 1 + Math.floor(L.nextRand(st) * 6);
    out.push([d1, d2]);
  }
  return out;
}
// want: array of totals, or [d1,d2] pairs, or "hard6"/"easy6" strings
function seedFor(want) {
  for (let seed = 1; seed < 2000000; seed++) {
    const d = diceFromSeed(seed, want.length);
    let ok = true;
    for (let i = 0; i < want.length && ok; i++) {
      const w = want[i], t = d[i][0] + d[i][1];
      if (typeof w === "number") ok = t === w;
      else if (Array.isArray(w)) ok = d[i][0] === w[0] && d[i][1] === w[1];
      else if (w === "x") ok = true;
      else if (w.startsWith("hard")) ok = t === +w.slice(4) && d[i][0] === d[i][1];
      else if (w.startsWith("easy")) ok = t === +w.slice(4) && d[i][0] !== d[i][1];
    }
    if (ok) return seed;
  }
  throw new Error("no seed for " + JSON.stringify(want));
}
function game(want, bankroll) { return L.newGame({ bankroll: bankroll || 1000, seed: seedFor(want) }); }
function bet(st, kind, number, amount) {
  const r = L.placeBet(st, kind, number, amount);
  assert.ok(r.ok, `placing ${kind} ${number} ${amount}: ${r.reason}`);
  return r;
}
function find(res, key, kind) { return res.outcomes.find((o) => o.key === key && (!kind || o.kind === kind)); }
function invariant(st) {
  assert.equal(st.bankroll + L.totalOnTable(st), st.startBankroll + st.net, "money invariant");
  assert.ok(st.bankroll >= 0, "bankroll never negative");
}

test("new game: bankroll options, defaults, seed stored, no point", () => {
  const s = L.newGame({ bankroll: 5000, seed: 42 });
  assert.equal(s.bankroll, 5000);
  assert.equal(s.seed, 42);
  assert.equal(s.point, null);
  assert.deepEqual(s.bets, {});
  assert.equal(L.newGame({ bankroll: 777 }).bankroll, 1000, "unknown bankroll falls back to 1000");
  assert.deepEqual(L.BANKROLLS, [500, 1000, 5000]);
  assert.deepEqual(L.CHIPS, [1, 5, 25, 100, 500]);
  assert.equal(L.TABLE_MIN, 5);
  assert.ok(L.validState(s));
  assert.equal(L.canRoll(s).ok, false, "cannot roll with nothing on the table");
});

test("pass line on the come-out: 7 and 11 win, 2, 3 and 12 lose, a point goes on", () => {
  for (const t of [7, 11]) {
    const s = game([t]); bet(s, "pass", null, 10);
    assert.equal(s.bankroll, 990);
    const r = L.roll(s);
    assert.equal(r.total, t);
    assert.equal(find(r, "pass").result, "win");
    assert.equal(find(r, "pass").payout, 10);
    assert.equal(s.bankroll, 1010);
    assert.equal(s.point, null);
    assert.equal(s.bets.pass, undefined);
    invariant(s);
  }
  for (const t of [2, 3, 12]) {
    const s = game([t]); bet(s, "pass", null, 10);
    const r = L.roll(s);
    assert.equal(find(r, "pass").result, "lose");
    assert.equal(find(r, "pass").payout, -10);
    assert.equal(s.bankroll, 990);
    assert.equal(r.decision, "craps");
    invariant(s);
  }
  for (const t of [4, 5, 6, 8, 9, 10]) {
    const s = game([t]); bet(s, "pass", null, 10);
    const r = L.roll(s);
    assert.equal(s.point, t, "point is on");
    assert.equal(r.decision, "point");
    assert.equal(s.bets.pass.amount, 10, "pass bet rides");
    assert.equal(s.bankroll, 990);
  }
});

test("don't pass: 2 and 3 win, 7 and 11 lose, 12 is a push (bar 12) and the bet stays", () => {
  for (const t of [2, 3]) {
    const s = game([t]); bet(s, "dontpass", null, 10);
    assert.equal(find(L.roll(s), "dontpass").result, "win");
    assert.equal(s.bankroll, 1010);
  }
  for (const t of [7, 11]) {
    const s = game([t]); bet(s, "dontpass", null, 10);
    assert.equal(find(L.roll(s), "dontpass").result, "lose");
    assert.equal(s.bankroll, 990);
  }
  const s = game([12]); bet(s, "dontpass", null, 10);
  const o = find(L.roll(s), "dontpass");
  assert.equal(o.result, "push");
  assert.equal(o.payout, 0);
  assert.equal(s.bets.dontpass.amount, 10, "bar 12 keeps the bet up");
  assert.equal(s.bankroll, 990);
  invariant(s);
});

test("point made pays pass and its odds at true odds; don't pass and lay odds lose", () => {
  const cases = { 4: [10, 20], 10: [10, 20], 5: [10, 15], 9: [10, 15], 6: [10, 12], 8: [10, 12] };
  for (const p of Object.keys(cases).map(Number)) {
    const s = game([p, p]);
    bet(s, "pass", null, 10);
    L.roll(s);
    assert.equal(s.point, p);
    assert.equal(L.maxOdds(s, "passodds", null), 10 * L.MAX_ODDS[p]);
    bet(s, "passodds", null, cases[p][0]);
    const r = L.roll(s);
    assert.equal(r.decision, "made");
    assert.equal(find(r, "pass", "pass").payout, 10);
    assert.equal(find(r, "pass", "passodds").payout, cases[p][1]);
    assert.equal(s.bankroll, 1000 + 10 + cases[p][1]);
    assert.equal(s.point, null);
    assert.equal(s.stats.pointsMade, 1);
    invariant(s);
  }
  // don't pass with lay odds loses when the point is made
  const d = game([4, 4]);
  bet(d, "dontpass", null, 10); L.roll(d);
  assert.equal(L.maxOdds(d, "dpodds", null), 60);
  bet(d, "dpodds", null, 40);
  const r = L.roll(d);
  assert.equal(find(r, "dontpass", "dontpass").payout, -10);
  assert.equal(find(r, "dontpass", "dpodds").payout, -40);
  assert.equal(d.bankroll, 950);
  invariant(d);
});

test("seven out: pass and odds lose, don't pass wins with lay odds, every place, buy, hardway and come bet clears", () => {
  const s = game([6, 5, 8, 7]);
  bet(s, "pass", null, 10); bet(s, "dontpass", null, 10);
  L.roll(s); // point 6
  bet(s, "passodds", null, 50);
  bet(s, "dpodds", null, 60); // lay 60 to win 50
  bet(s, "place", 5, 10); bet(s, "place", 8, 12); bet(s, "buy", 4, 20); bet(s, "lay", 10, 20);
  bet(s, "hard", 8, 5); bet(s, "come", null, 10);
  L.roll(s); // 5: come travels to 5
  assert.equal(s.bets["come:5"].amount, 10);
  bet(s, "comeodds", 5, 20);
  bet(s, "come", null, 10);
  L.roll(s); // 8: place 8 wins, come travels to 8, hard 8? depends on dice, both fine
  assert.equal(s.bets["come:8"].amount, 10);
  const before = s.bankroll;
  const r = L.roll(s); // seven out
  assert.equal(r.decision, "sevenout");
  assert.equal(find(r, "pass", "pass").result, "lose");
  assert.equal(find(r, "pass", "passodds").payout, -50);
  assert.equal(find(r, "dontpass", "dontpass").payout, 10);
  assert.equal(find(r, "dontpass", "dpodds").payout, 50);
  assert.equal(find(r, "place:5").result, "lose");
  assert.equal(find(r, "buy:4").result, "lose");
  assert.equal(find(r, "lay:10").result, "win");
  assert.equal(find(r, "lay:10").payout, 10 - 1, "lay 20 on 10 wins 10 less 1 vig");
  assert.equal(find(r, "come:5", "come").payout, -10);
  assert.equal(find(r, "come:5", "comeodds").payout, -20);
  assert.equal(find(r, "come:8", "come").payout, -10);
  assert.deepEqual(Object.keys(s.bets), [], "table is empty after a seven out");
  assert.equal(s.point, null);
  assert.equal(s.stats.sevenOuts, 1);
  assert.ok(s.bankroll > before, "the don't side and the lay paid");
  invariant(s);
});

test("come bet travels to its number, takes odds, and wins with true odds; come in the box wins on 7 and 11", () => {
  const s = game([4, 9, 9]);
  bet(s, "pass", null, 5); L.roll(s);
  assert.equal(L.canBet(s, "come", null, 10).ok, true);
  bet(s, "come", null, 10);
  assert.equal(L.canBet(s, "comeodds", 9, 10).ok, false, "no odds before it travels");
  let r = L.roll(s);
  assert.equal(find(r, "come:9").result, "travel");
  assert.equal(s.bets.come, undefined);
  assert.equal(s.bets["come:9"].number, 9);
  assert.equal(L.maxOdds(s, "comeodds", 9), 40);
  assert.equal(L.canBet(s, "comeodds", 9, 41).ok, false, "over the 4x max");
  assert.equal(L.canBet(s, "comeodds", 9, 5).code, "increment", "odds on 9 must be even");
  bet(s, "comeodds", 9, 20);
  r = L.roll(s);
  assert.equal(find(r, "come:9", "come").payout, 10);
  assert.equal(find(r, "come:9", "comeodds").payout, 30);
  assert.equal(s.bets["come:9"], undefined);
  assert.equal(s.point, 4, "pass point unaffected");
  invariant(s);

  const n = game([5, 11, 3]);
  bet(n, "pass", null, 5); L.roll(n);
  bet(n, "come", null, 10);
  assert.equal(find(L.roll(n), "come").payout, 10, "natural 11 wins the come bet");
  bet(n, "come", null, 10);
  assert.equal(find(L.roll(n), "come").payout, -10, "3 craps out the come bet");
  invariant(n);
});

test("come odds are off on the come-out roll and are returned, not paid or lost", () => {
  // point 6, come travels to 8, point made, then on the come-out the 8 repeats
  const s = game([6, 8, 6, 8]);
  bet(s, "pass", null, 5); L.roll(s);
  bet(s, "come", null, 10); L.roll(s);
  bet(s, "comeodds", 8, 25); L.roll(s); // point made
  assert.equal(s.point, null);
  const r = L.roll(s); // come-out roll, 8 hits the come point
  assert.equal(find(r, "come:8", "come").payout, 10);
  const od = find(r, "come:8", "comeodds");
  assert.equal(od.result, "push");
  assert.equal(od.returned, 25);
  invariant(s);
  // and a 7 on the come-out returns the odds while losing the flat
  const t = game([6, 8, 6, 7]);
  bet(t, "pass", null, 5); L.roll(t);
  bet(t, "come", null, 10); L.roll(t);
  bet(t, "comeodds", 8, 25); L.roll(t);
  const r2 = L.roll(t);
  assert.equal(find(r2, "come:8", "come").payout, -10);
  assert.equal(find(r2, "come:8", "comeodds").result, "push");
  assert.equal(find(r2, "come:8", "comeodds").returned, 25);
  invariant(t);
  // with working called on, the odds are paid on the come-out
  const w = game([6, 8, 6, 8]);
  bet(w, "pass", null, 5); L.roll(w);
  bet(w, "come", null, 10); L.roll(w);
  bet(w, "comeodds", 8, 25); L.roll(w);
  L.toggleWorking(w);
  assert.equal(find(L.roll(w), "come:8", "comeodds").payout, 30);
  invariant(w);
});

test("don't come travels, lays odds, wins on a seven and loses when its number repeats", () => {
  const s = game([5, 8, 7]);
  bet(s, "pass", null, 5); L.roll(s);
  bet(s, "dontcome", null, 10); L.roll(s);
  assert.equal(s.bets["dontcome:8"].amount, 10);
  assert.equal(L.maxOdds(s, "dcodds", 8), 60);
  assert.equal(L.canBet(s, "dcodds", 8, 10).code, "increment", "lay odds on 8 in multiples of 6");
  bet(s, "dcodds", 8, 30);
  const r = L.roll(s);
  assert.equal(find(r, "dontcome:8", "dontcome").payout, 10);
  assert.equal(find(r, "dontcome:8", "dcodds").payout, 25);
  invariant(s);
  const t = game([5, 8, 8]);
  bet(t, "pass", null, 5); L.roll(t);
  bet(t, "dontcome", null, 10); L.roll(t);
  assert.equal(find(L.roll(t), "dontcome:8").payout, -10);
  invariant(t);
  const u = game([5, 12]);
  bet(u, "pass", null, 5); L.roll(u);
  bet(u, "dontcome", null, 10);
  assert.equal(find(L.roll(u), "dontcome").result, "push", "12 bars the don't come");
  assert.equal(u.bets.dontcome.amount, 10);
});

test("place bets pay 9:5, 7:5, 7:6 and stay up; off on the come-out by default, working when toggled", () => {
  const pays = { 4: [10, 18], 10: [10, 18], 5: [10, 14], 9: [10, 14], 6: [12, 14], 8: [12, 14] };
  for (const n of Object.keys(pays).map(Number)) {
    const s = game([5 === n ? 6 : 5, n]);
    bet(s, "pass", null, 5); L.roll(s);
    bet(s, "place", n, pays[n][0]);
    const r = L.roll(s);
    const o = find(r, "place:" + n);
    assert.equal(o.result, "win");
    assert.equal(o.payout, pays[n][1]);
    assert.equal(s.bets["place:" + n].amount, pays[n][0], "place bet stays up");
    invariant(s);
  }
  // off on the come-out
  const c = game([6, 6, 6, 7]);
  bet(c, "pass", null, 5); L.roll(c);
  bet(c, "place", 6, 12); L.roll(c); // point made, place 6 wins 14
  assert.equal(c.point, null);
  let r = L.roll(c); // come-out 6: place bet is off
  assert.equal(find(r, "place:6").result, "push");
  assert.equal(c.point, 6);
  r = L.roll(c); // 7 with point on: loses
  assert.equal(find(r, "place:6").result, "lose");
  invariant(c);
  const w = game([6, 6, 7]);
  bet(w, "pass", null, 5); L.roll(w);
  bet(w, "place", 6, 12); L.roll(w);
  L.toggleWorking(w);
  r = L.roll(w); // come-out 7 with place bets working: lose
  assert.equal(find(r, "place:6").result, "lose");
  invariant(w);
});

test("buy pays true odds less 5% vig, lay pays inverse odds less vig on the win", () => {
  const s = game([6, 4]);
  bet(s, "pass", null, 5); L.roll(s);
  bet(s, "buy", 4, 25);
  const o = find(L.roll(s), "buy:4");
  assert.equal(o.payout, 50 - 1);
  assert.equal(s.bets["buy:4"].amount, 25, "buy stays up");
  invariant(s);
  const l = game([6, 7]);
  bet(l, "pass", null, 5); L.roll(l);
  bet(l, "lay", 4, 40);
  const lo = find(L.roll(l), "lay:4");
  assert.equal(lo.payout, 20 - 1);
  assert.equal(lo.returned, 40 + 19);
  assert.equal(l.bets["lay:4"], undefined);
  invariant(l);
  const m = game([6, 4]);
  bet(m, "pass", null, 5); L.roll(m);
  bet(m, "lay", 4, 40);
  assert.equal(find(L.roll(m), "lay:4").payout, -40);
});

test("hardways pay 7:1 on 4 and 10, 9:1 on 6 and 8, lose on the easy way or 7, stay up after a win", () => {
  for (const n of [4, 6, 8, 10]) {
    const pay = L.HARD_PAY[n];
    const s = game([5, "hard" + n, "easy" + n]);
    bet(s, "pass", null, 5); L.roll(s);
    bet(s, "hard", n, 5);
    let r = L.roll(s);
    assert.equal(find(r, "hard:" + n).payout, 5 * pay);
    assert.equal(s.bets["hard:" + n].amount, 5, "stays up");
    r = L.roll(s);
    assert.equal(find(r, "hard:" + n).result, "lose");
    assert.equal(s.bets["hard:" + n], undefined);
    invariant(s);
  }
  const t = game([5, 7]);
  bet(t, "pass", null, 5); L.roll(t);
  bet(t, "hard", 8, 5);
  assert.equal(find(L.roll(t), "hard:8").payout, -5);
  const u = game([5, 3]);
  bet(u, "pass", null, 5); L.roll(u);
  bet(u, "hard", 8, 5);
  assert.equal(find(L.roll(u), "hard:8"), undefined, "no decision on an unrelated roll");
  assert.equal(u.bets["hard:8"].amount, 5);
});

test("field pays even money, double on 2 and triple on 12, and loses on 5, 6, 7, 8", () => {
  const expect = { 2: 20, 3: 10, 4: 10, 9: 10, 10: 10, 11: 10, 12: 30, 5: -10, 6: -10, 7: -10, 8: -10 };
  for (const t of Object.keys(expect).map(Number)) {
    const s = game([t]);
    bet(s, "field", null, 10);
    const o = find(L.roll(s), "field");
    assert.equal(o.payout, expect[t], "field on " + t);
    assert.equal(s.bets.field, undefined, "field is one roll");
    invariant(s);
  }
});

test("single roll props: any 7, any craps, 2, 3, 11, 12", () => {
  const check = (kind, total, payout) => {
    const s = game([total]);
    bet(s, kind, null, 2);
    const o = find(L.roll(s), kind);
    assert.equal(o.payout, payout, kind + " on " + total);
    invariant(s);
  };
  check("any7", 7, 8); check("any7", 8, -2);
  check("anycraps", 2, 14); check("anycraps", 3, 14); check("anycraps", 12, 14); check("anycraps", 11, -2);
  check("two", 2, 60); check("two", 3, -2);
  check("three", 3, 30); check("three", 2, -2);
  check("eleven", 11, 30); check("eleven", 7, -2);
  check("twelve", 12, 60); check("twelve", 2, -2);
});

test("horn splits four ways and C and E splits two ways", () => {
  const horn = { 2: 27, 3: 12, 11: 12, 12: 27, 7: -4 };
  for (const t of Object.keys(horn).map(Number)) {
    const s = game([t]);
    assert.equal(L.canBet(s, "horn", null, 5).code, "increment");
    bet(s, "horn", null, 4);
    const o = find(L.roll(s), "horn");
    assert.equal(o.payout, horn[t], "horn on " + t);
    invariant(s);
  }
  const ce = { 2: 6, 3: 6, 12: 6, 11: 14, 5: -2 };
  for (const t of Object.keys(ce).map(Number)) {
    const s = game([t]);
    assert.equal(L.canBet(s, "ce", null, 3).code, "increment");
    bet(s, "ce", null, 2);
    assert.equal(find(L.roll(s), "ce").payout, ce[t], "C and E on " + t);
    invariant(s);
  }
});

test("odds limits follow 3-4-5x for the right side and 6x lay for the wrong side", () => {
  const right = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
  for (const p of Object.keys(right).map(Number)) {
    const s = game([p]);
    bet(s, "pass", null, 10); bet(s, "dontpass", null, 10);
    assert.equal(L.maxOdds(s, "passodds", null), null, "no odds before the point");
    assert.equal(L.canBet(s, "passodds", null, 10).ok, false);
    L.roll(s);
    assert.equal(L.maxOdds(s, "passodds", null), 10 * right[p]);
    assert.equal(L.maxOdds(s, "dpodds", null), 60);
    const inc = L.increment("passodds", p);
    assert.equal(L.canBet(s, "passodds", null, 10 * right[p]).ok, true);
    assert.equal(L.canBet(s, "passodds", null, 10 * right[p] + inc).code, "max");
    const linc = L.increment("dpodds", p);
    assert.equal(L.canBet(s, "dpodds", null, 60).ok, true);
    assert.equal(L.canBet(s, "dpodds", null, 60 + linc).code, "max");
  }
});

test("increments and minimums: place 6/8 by 6, place 5/9 by 5, lay by 2/3/6, props from 1, table minimum 5", () => {
  const s = game([5]);
  bet(s, "pass", null, 5); L.roll(s);
  assert.equal(L.canBet(s, "place", 6, 5).code, "increment");
  assert.match(L.canBet(s, "place", 6, 5).reason, /multiples of 6/);
  assert.equal(L.canBet(s, "place", 6, 6).ok, true);
  assert.equal(L.canBet(s, "place", 9, 6).code, "increment");
  assert.equal(L.canBet(s, "place", 9, 10).ok, true);
  assert.equal(L.canBet(s, "place", 4, 7).code, "increment");
  assert.equal(L.canBet(s, "lay", 4, 5).code, "increment");
  assert.equal(L.canBet(s, "lay", 9, 6).ok, true);
  assert.equal(L.canBet(s, "lay", 8, 6).ok, true);
  assert.equal(L.canBet(s, "lay", 8, 4).code, "increment");
  assert.equal(L.canBet(s, "buy", 5, 5).code, "increment");
  assert.equal(L.canBet(s, "buy", 4, 3).code, "min");
  assert.equal(L.canBet(s, "field", null, 1).ok, true);
  assert.equal(L.canBet(s, "hard", 8, 1).ok, true);
  assert.equal(L.canBet(s, "come", null, 4).code, "min");
  assert.equal(L.canBet(s, "come", null, 2.5).code, "amount");
  assert.equal(L.canBet(s, "come", null, 0).code, "amount");
  assert.equal(L.canBet(s, "place", 7, 5).code, "number");
  assert.equal(L.canBet(s, "hard", 5, 5).code, "number");
  assert.equal(L.canBet(s, "bogus", null, 5).code, "kind");
  assert.equal(L.minBet("lay", 8), 6);
  assert.equal(L.minBet("place", 4), 5);
  assert.equal(L.minBet("horn", null), 4);
  // adding to an existing bet is checked on the total
  bet(s, "place", 6, 6);
  assert.equal(L.canBet(s, "place", 6, 5).code, "increment");
  assert.equal(L.canBet(s, "place", 6, 6).ok, true);
});

test("fitBet rounds a tapped chip to the nearest legal unit, or down to the odds max", () => {
  const s = game([6]);
  bet(s, "pass", null, 10); L.roll(s);
  assert.deepEqual(L.fitBet(s, "place", 6, 5).amount, 6, "a 5 chip on the six becomes 6");
  assert.equal(L.fitBet(s, "place", 6, 1).amount, 6, "a 1 chip on an empty six becomes the 6 minimum");
  assert.match(L.fitBet(s, "place", 6, 5).note, /units of 6/);
  assert.equal(L.fitBet(s, "place", 6, 25).amount, 30);
  bet(s, "place", 6, 6);
  assert.equal(L.fitBet(s, "place", 6, 1).amount, 6, "one more unit on top of 6");
  assert.equal(L.fitBet(s, "place", 6, 6).amount, 6, "already valid, unchanged");
  assert.equal(L.fitBet(s, "horn", null, 1).amount, 4);
  assert.equal(L.fitBet(s, "ce", null, 5).amount, 6);
  assert.equal(L.fitBet(s, "lay", 4, 5).amount, 6);
  assert.equal(L.fitBet(s, "passodds", null, 100).amount, 50, "down to the 5x max on the 6");
  assert.match(L.fitBet(s, "passodds", null, 100).note, /Max odds/);
  bet(s, "passodds", null, 50);
  assert.equal(L.fitBet(s, "passodds", null, 5).amount, 0, "nothing fits once the max is reached");
  assert.equal(L.fitBet(s, "pass", null, 5).code, "phase", "non-fit refusals pass through");
  const poor = L.newGame({ bankroll: 500, seed: 1 });
  bet(poor, "field", null, 497);
  assert.equal(poor.bankroll, 3);
  assert.equal(L.fitBet(poor, "horn", null, 1).code, "bankroll");
  assert.match(L.fitBet(poor, "horn", null, 1).reason, /needs 4 more/);
});

test("cannot bet more than the bankroll and the bankroll never goes negative", () => {
  const s = L.newGame({ bankroll: 500, seed: 3 });
  assert.equal(L.canBet(s, "pass", null, 501).code, "bankroll");
  assert.equal(L.placeBet(s, "pass", null, 501).ok, false);
  bet(s, "pass", null, 500);
  assert.equal(s.bankroll, 0);
  assert.equal(L.canBet(s, "field", null, 1).code, "bankroll");
  assert.equal(L.canRoll(s).ok, true);
  L.roll(s);
  assert.ok(s.bankroll >= 0);
  invariant(s);
});

test("phase rules: pass only on the come-out, come only with a point on, odds only behind a bet with a point", () => {
  const s = game([6]);
  assert.equal(L.canBet(s, "come", null, 5).code, "phase");
  assert.equal(L.canBet(s, "dontcome", null, 5).code, "phase");
  assert.equal(L.canBet(s, "passodds", null, 5).code, "parent");
  bet(s, "pass", null, 5);
  assert.equal(L.canBet(s, "passodds", null, 5).code, "phase");
  L.roll(s);
  assert.equal(L.canBet(s, "pass", null, 5).code, "phase");
  assert.equal(L.canBet(s, "dontpass", null, 5).code, "phase");
  assert.equal(L.canBet(s, "come", null, 5).ok, true);
  assert.equal(L.canBet(s, "passodds", null, 25).ok, true);
  assert.equal(L.canBet(s, "dpodds", null, 6).code, "parent");
});

test("removing bets: line bets lock once the point is set, odds, place and props come down, partial removal keeps a valid bet", () => {
  const s = game([8]);
  bet(s, "pass", null, 10); bet(s, "dontpass", null, 5); bet(s, "field", null, 5);
  assert.equal(L.canRemove(s, "pass", null).ok, true, "removable before the come-out roll");
  assert.equal(L.removeBet(s, "pass", null, 5).ok, true, "partial removal");
  assert.equal(s.bets.pass.amount, 5);
  assert.equal(L.removeBet(s, "pass", null, 3).code, "remainder", "would leave 2, under the minimum");
  assert.equal(L.removeBet(s, "field", null).ok, true);
  assert.equal(s.bets.field, undefined);
  assert.equal(s.bankroll, 990);
  L.roll(s); // point 8
  assert.equal(L.canRemove(s, "pass", null).code, "locked");
  assert.equal(L.removeBet(s, "dontpass", null).code, "locked");
  bet(s, "passodds", null, 25);
  bet(s, "place", 6, 12); bet(s, "hard", 8, 5); bet(s, "come", null, 10);
  assert.equal(L.removeBet(s, "passodds", null, 10).ok, true, "odds come down in part");
  assert.equal(s.bets.pass.odds, 15);
  assert.equal(L.removeBet(s, "place", 6, 6).ok, true);
  assert.equal(s.bets["place:6"].amount, 6);
  assert.equal(L.removeBet(s, "place", 6, 5).code, "remainder");
  assert.equal(L.removeBet(s, "hard", 8).ok, true);
  assert.equal(L.removeBet(s, "come", null).ok, true, "a come bet still in the box can be picked up");
  assert.equal(L.removeBet(s, "come", null).code, "none");
  invariant(s);
  // a travelled come bet is locked but its odds are not
  const t = game([5, 9]);
  bet(t, "pass", null, 5); L.roll(t); bet(t, "come", null, 10); L.roll(t);
  bet(t, "comeodds", 9, 10);
  assert.equal(L.canRemove(t, "come", 9).code, "locked");
  assert.equal(L.removeBet(t, "comeodds", 9).ok, true);
  assert.equal(t.bets["come:9"].odds, 0);
  invariant(t);
  // clearBets takes down everything that is allowed to come down
  bet(t, "place", 6, 12); bet(t, "comeodds", 9, 10);
  const n = L.clearBets(t);
  assert.equal(n, 2, "the place bet and the come odds come down");
  assert.equal(t.bets["place:6"], undefined);
  assert.equal(t.bets["come:9"].odds, 0);
  assert.equal(t.bets["come:9"].amount, 10);
  assert.equal(t.bets.pass.amount, 5);
  invariant(t);
});

test("repeat bets re-places the last table's bets that are legal now", () => {
  const s = game([11, 4]);
  bet(s, "pass", null, 10); bet(s, "field", null, 5); bet(s, "hard", 8, 5);
  L.roll(s); // natural 11: pass and field resolve, hard 8 stays
  assert.deepEqual(L.repeatable(s).map((r) => r.kind).sort(), ["field", "pass"]);
  assert.equal(L.repeatBets(s), 2);
  assert.equal(s.bets.pass.amount, 10);
  assert.equal(s.bets.field.amount, 5);
  assert.equal(s.bets["hard:8"].amount, 5, "not doubled");
  L.roll(s); // point 4
  assert.equal(L.repeatable(s).length, 1, "only the field can be repeated with the point on");
  invariant(s);
});

test("seed determinism and JSON round trip", () => {
  const a = L.newGame({ bankroll: 1000, seed: 123 }), b = L.newGame({ bankroll: 1000, seed: 123 });
  const seqA = [], seqB = [];
  for (let i = 0; i < 30; i++) {
    bet(a, "field", null, 5); bet(b, "field", null, 5);
    seqA.push(L.roll(a).total); seqB.push(L.roll(b).total);
  }
  assert.deepEqual(seqA, seqB);
  assert.equal(a.bankroll, b.bankroll);
  const c = L.newGame({ bankroll: 1000, seed: 124 });
  const seqC = [];
  for (let i = 0; i < 30; i++) { bet(c, "field", null, 5); seqC.push(L.roll(c).total); }
  assert.notDeepEqual(seqA, seqC, "a different seed throws different dice");
  // round trip mid-hand
  const s = game([6, 5]);
  bet(s, "pass", null, 10); L.roll(s); bet(s, "passodds", null, 25); bet(s, "come", null, 10); bet(s, "place", 8, 12);
  const copy = JSON.parse(JSON.stringify(s));
  assert.ok(L.validState(copy));
  const r1 = L.roll(s), r2 = L.roll(copy);
  assert.deepEqual(r1, r2);
  assert.deepEqual(copy, JSON.parse(JSON.stringify(s)));
  assert.equal(L.validState({ v: 1 }), false);
  assert.equal(L.validState(null), false);
  assert.equal(L.validState({ v: 1, rng: 1, bankroll: -1, point: null, bets: {}, stats: {} }), false);
  assert.equal(L.validState({ v: 1, rng: 1, bankroll: 10, point: 7, bets: {}, stats: {} }), false);
});

test("dice are fair-ish and every total appears over many rolls", () => {
  const s = L.newGame({ bankroll: 5000, seed: 99 });
  const counts = {};
  for (let i = 0; i < 3600; i++) {
    bet(s, "field", null, 1);
    const r = L.roll(s);
    assert.ok(r.d1 >= 1 && r.d1 <= 6 && r.d2 >= 1 && r.d2 <= 6);
    counts[r.total] = (counts[r.total] || 0) + 1;
    if (s.bankroll === 0) break;
  }
  for (let t = 2; t <= 12; t++) assert.ok(counts[t] > 0, "total " + t + " shows up");
  assert.ok(counts[7] > counts[2] && counts[7] > counts[12]);
});

test("stats: rolls, points made, seven outs, biggest win, net", () => {
  const s = game([6, 6, 7, 5, 7]);
  bet(s, "pass", null, 10); L.roll(s); bet(s, "passodds", null, 25); L.roll(s);
  assert.equal(s.stats.pointsMade, 1);
  assert.equal(s.stats.biggestWin, 40);
  assert.equal(s.net, 40);
  bet(s, "pass", null, 10); L.roll(s); // natural 7
  bet(s, "pass", null, 10); L.roll(s); L.roll(s); // point 5 then seven out
  assert.equal(s.stats.rolls, 5);
  assert.equal(s.stats.sevenOuts, 1);
  assert.equal(s.net, 40 + 10 - 10);
  assert.equal(s.bankroll, 1040);
  assert.deepEqual(s.history, [6, 6, 7, 5, 7]);
  invariant(s);
});

test("10,000 roll random bettor session never breaks the money invariant", () => {
  const rng = { rng: 777 };
  const rnd = () => L.nextRand(rng);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const kinds = ["pass", "dontpass", "come", "dontcome", "place", "buy", "lay", "hard", "field", "any7", "anycraps", "horn", "ce", "two", "three", "eleven", "twelve", "passodds", "dpodds", "comeodds", "dcodds"];
  let s = L.newGame({ bankroll: 5000, seed: 2024 });
  let rolls = 0, placed = 0, refused = 0, removed = 0, resets = 0, outcomes = 0;
  const codes = {};
  while (rolls < 10000) {
    if (s.bankroll === 0 && Object.keys(s.bets).length === 0) { s = L.newGame({ bankroll: 5000, seed: rolls + 1 }); resets++; }
    const nBets = 1 + Math.floor(rnd() * 5);
    for (let i = 0; i < nBets; i++) {
      const kind = pick(kinds);
      const number = kind === "hard" ? pick(L.HARD_NUMBERS) : ["place", "buy", "lay", "comeodds", "dcodds"].indexOf(kind) >= 0 ? pick(L.POINTS) : null;
      const amount = pick([1, 2, 4, 5, 6, 10, 12, 15, 20, 25, 30, 50]);
      const before = s.bankroll;
      const c = L.canBet(s, kind, number, amount);
      const r = L.placeBet(s, kind, number, amount);
      assert.equal(r.ok, c.ok, "placeBet agrees with canBet");
      if (r.ok) { placed++; assert.equal(s.bankroll, before - amount); }
      else { refused++; codes[c.code] = (codes[c.code] || 0) + 1; assert.equal(s.bankroll, before, "a refused bet costs nothing"); }
      invariant(s);
    }
    if (rnd() < 0.15) {
      const keys = Object.keys(s.bets);
      if (keys.length) {
        const b = s.bets[pick(keys)];
        const useOdds = b.odds > 0 && rnd() < 0.5;
        const kind = useOdds ? L.oddsKindFor(b.kind) : b.kind;
        const before = s.bankroll;
        const r = L.removeBet(s, kind, b.number, rnd() < 0.5 ? undefined : 5);
        if (r.ok) { removed++; assert.equal(s.bankroll, before + r.removed); } else assert.equal(s.bankroll, before);
        invariant(s);
      }
    }
    if (rnd() < 0.05) L.toggleWorking(s);
    if (!L.canRoll(s).ok) { if (s.bankroll === 0) { s = L.newGame({ bankroll: 5000, seed: rolls + 7 }); resets++; } continue; }
    const r = L.roll(s);
    rolls++;
    assert.ok(r && r.total >= 2 && r.total <= 12);
    outcomes += r.outcomes.length;
    for (const o of r.outcomes) {
      assert.ok(["win", "lose", "push", "travel"].indexOf(o.result) >= 0);
      if (o.result === "win") assert.ok(o.payout > 0 && o.returned >= o.payout);
      if (o.result === "lose") assert.ok(o.payout === -o.amount && o.returned === 0);
      if (o.result === "push" || o.result === "travel") assert.equal(o.payout, 0);
      assert.equal(o.payout, Math.round(o.payout), "whole chip payouts");
    }
    assert.ok(s.point === null || L.POINTS.indexOf(s.point) >= 0);
    if (r.decision === "sevenout") {
      for (const k in s.bets) assert.ok(k === "dontcome" || s.bets[k].kind === "lay", "only a barred don't come or a lay could survive a seven out, found " + k);
    }
    for (const k in s.bets) {
      const b = s.bets[k];
      assert.equal(L.betKey(b.kind, b.number), k);
      assert.ok(b.amount > 0 && b.amount % L.increment(b.kind, b.number) === 0, "bet " + k + " keeps a valid amount: " + b.amount);
      if (b.odds) assert.ok(b.odds <= L.maxOdds(s, L.oddsKindFor(b.kind), b.number), "odds within max on " + k);
      if (b.kind === "come" && b.number === null) assert.ok(true);
    }
    invariant(s);
    assert.ok(L.validState(JSON.parse(JSON.stringify(s))));
  }
  assert.equal(rolls, 10000);
  assert.ok(placed > 10000 && refused > 1000 && removed > 100 && outcomes > 10000, `placed ${placed} refused ${refused} removed ${removed} outcomes ${outcomes} resets ${resets}`);
  assert.ok(codes.increment && codes.max && codes.phase && codes.bankroll, "every refusal reason came up: " + JSON.stringify(codes));
});

test("payout table and descriptions are complete", () => {
  const t = L.payoutTable();
  assert.ok(t.length >= 16);
  const bets = t.map((r) => r.bet).join(" ");
  for (const w of ["Pass", "Don't pass", "odds", "Place 6 or 8", "Buy", "Lay", "Field", "Hard", "Any seven", "Any craps", "Horn", "C and E", "30 to 1"]) {
    assert.ok((bets + t.map((r) => r.pays).join(" ")).indexOf(w) >= 0, "table mentions " + w);
  }
  assert.equal(L.describe("place", 6), "Place 6");
  assert.equal(L.describe("come", 9), "Come on 9");
  assert.equal(L.describe("comeodds", 9), "Come odds on 9");
  assert.equal(L.describe("eleven", null), "Yo (11)");
  assert.deepEqual(L.parseKey("hard:8"), { kind: "hard", number: 8 });
  assert.deepEqual(L.parseKey("field"), { kind: "field", number: null });
});

test("page contract: base href, noindex, relative assets, no em dash, no external URLs", () => {
  const dir = path.join(__dirname, "..", "private", "craps");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/craps/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/craps\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('name="theme-color" content="#F3EDE3"'));
  assert.ok(html.includes('href="/play/"'));
  assert.ok(/back to games|games/.test(html));
  assert.ok(html.includes("<title>Craps</title>"));
  assert.ok(html.includes('href="style.css"') && html.includes('src="app.js"') && html.includes('src="logic.js"'));
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  for (const f of ["/fonts/marcellus.woff2", "/fonts/jost-400.woff2", "/fonts/jost-500.woff2", "/fonts/jost-600.woff2"]) assert.ok(css.includes(f), "font " + f);
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!txt.includes(DASH), "em dash in " + f);
    assert.ok(!/https?:\/\//.test(txt.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "external URL in " + f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(DASH));
  const logic = fs.readFileSync(path.join(dir, "logic.js"), "utf8");
  assert.ok(!logic.match(/document\.|window\.|Math\.random|Date\./), "logic has no DOM, clock or unseeded randomness");
  const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  assert.ok(app.includes("kz.craps.save.v1") && app.includes("prefers-reduced-motion") && app.includes("window.__craps"));
});
