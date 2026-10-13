"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../private/yahtzee/logic.js");

const C = {};
L.CATS.forEach((c, i) => { C[c.id] = i; });
const sc = (id, dice) => L.scoreCategory(C[id], dice);

function player(scores = {}) {
  const p = L.newPlayer("T", "human");
  for (const k of Object.keys(scores)) p.scores[C[k]] = scores[k];
  return p;
}
function fillAll(p, skip) {
  L.CATS.forEach((c, i) => { if (!skip.includes(c.id) && p.scores[i] === null) p.scores[i] = 0; });
  return p;
}

test("upper categories sum matching dice", () => {
  assert.equal(sc("ones", [1, 1, 2, 3, 1]), 3);
  assert.equal(sc("twos", [1, 3, 4, 5, 6]), 0);
  assert.equal(sc("threes", [3, 3, 3, 3, 3]), 15);
  assert.equal(sc("fours", [4, 4, 1, 1, 2]), 8);
  assert.equal(sc("fives", [5, 5, 5, 1, 2]), 15);
  assert.equal(sc("sixes", [6, 6, 6, 6, 1]), 24);
});

test("three and four of a kind score the sum of all dice", () => {
  assert.equal(sc("threeKind", [3, 3, 3, 4, 5]), 18);
  assert.equal(sc("threeKind", [3, 3, 4, 4, 5]), 0);
  assert.equal(sc("threeKind", [2, 2, 2, 2, 2]), 10);
  assert.equal(sc("threeKind", [6, 6, 6, 6, 1]), 25);
  assert.equal(sc("fourKind", [6, 6, 6, 6, 1]), 25);
  assert.equal(sc("fourKind", [6, 6, 6, 1, 1]), 0);
  assert.equal(sc("fourKind", [1, 1, 1, 1, 1]), 5);
});

test("full house: exactly three and two; five of a kind is not one without Joker", () => {
  assert.equal(sc("fullHouse", [2, 2, 3, 3, 3]), 25);
  assert.equal(sc("fullHouse", [6, 1, 6, 1, 6]), 25);
  assert.equal(sc("fullHouse", [2, 2, 2, 2, 3]), 0);
  assert.equal(sc("fullHouse", [4, 4, 4, 4, 4]), 0);
  assert.equal(sc("fullHouse", [1, 2, 3, 3, 3]), 0);
});

test("straights", () => {
  assert.equal(sc("smStraight", [1, 2, 3, 4, 6]), 30);
  assert.equal(sc("smStraight", [3, 4, 5, 6, 6]), 30);
  assert.equal(sc("smStraight", [2, 3, 4, 5, 2]), 30);
  assert.equal(sc("smStraight", [1, 2, 3, 5, 6]), 0);
  assert.equal(sc("smStraight", [1, 2, 4, 5, 6]), 0);
  assert.equal(sc("smStraight", [1, 2, 3, 4, 5]), 30);
  assert.equal(sc("lgStraight", [1, 2, 3, 4, 5]), 40);
  assert.equal(sc("lgStraight", [6, 5, 4, 3, 2]), 40);
  assert.equal(sc("lgStraight", [1, 2, 3, 4, 6]), 0);
  assert.equal(sc("lgStraight", [1, 2, 3, 4, 4]), 0);
});

test("yahtzee and chance", () => {
  assert.equal(sc("yahtzee", [4, 4, 4, 4, 4]), 50);
  assert.equal(sc("yahtzee", [4, 4, 4, 4, 3]), 0);
  assert.equal(sc("chance", [1, 2, 3, 4, 6]), 16);
  assert.equal(sc("chance", [6, 6, 6, 6, 6]), 30);
});

test("totals and upper bonus threshold at exactly 63", () => {
  const p = player({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
  assert.equal(L.totals(p).upper, 63);
  assert.equal(L.totals(p).upperBonus, 35);
  assert.equal(L.totals(p).total, 98);
  const q = player({ ones: 2, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
  assert.equal(L.totals(q).upper, 62);
  assert.equal(L.totals(q).upperBonus, 0);
  assert.equal(L.totals(q).total, 62);
});

test("total score computation with lower section and yahtzee bonus", () => {
  const p = player({ ones: 1, threeKind: 20, fullHouse: 25, yahtzee: 50, chance: 22 });
  p.bonus = 2;
  const t = L.totals(p);
  assert.equal(t.lower, 117);
  assert.equal(t.yahtzeeBonus, 200);
  assert.equal(t.total, 1 + 117 + 200);
});

test("Joker: no joker when the yahtzee box is open", () => {
  const p = player({});
  assert.equal(L.jokerApplies(p, [3, 3, 3, 3, 3]), false);
  assert.equal(L.legalCategories(p, [3, 3, 3, 3, 3]).length, 13);
  assert.equal(L.scoreFor(p, [3, 3, 3, 3, 3], C.fullHouse), 0);
});

test("Joker branch 1: matching upper box open is forced", () => {
  const p = player({ yahtzee: 50 });
  assert.deepEqual(L.legalCategories(p, [4, 4, 4, 4, 4]), [C.fours]);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.fours), 20);
});

test("Joker branch 2: upper filled, any open lower box, full value for FH/SS/LS", () => {
  const p = player({ yahtzee: 50, fours: 8 });
  const legal = L.legalCategories(p, [4, 4, 4, 4, 4]);
  assert.deepEqual(legal, [6, 7, 8, 9, 10, 12]);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.fullHouse), 25);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.smStraight), 30);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.lgStraight), 40);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.threeKind), 20);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.fourKind), 20);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.chance), 20);
  const q = player({ yahtzee: 50, fours: 8, fullHouse: 25, chance: 10 });
  assert.deepEqual(L.legalCategories(q, [4, 4, 4, 4, 4]), [6, 7, 9, 10]);
});

test("Joker branch 3: no lower box open, must score an open upper box (0)", () => {
  const p = player({ yahtzee: 50, fours: 8, threeKind: 1, fourKind: 1, fullHouse: 1, smStraight: 1, lgStraight: 1, chance: 1 });
  const legal = L.legalCategories(p, [4, 4, 4, 4, 4]);
  assert.deepEqual(legal, [0, 1, 2, 4, 5]);
  assert.equal(L.scoreFor(p, [4, 4, 4, 4, 4], C.sixes), 0);
});

test("Joker applies when the yahtzee box holds 0, but gives no bonus", () => {
  const g = L.newGame(1, [{ name: "A", type: "human" }]);
  const p = g.players[0];
  p.scores[C.yahtzee] = 0;
  g.dice = [5, 5, 5, 5, 5]; g.rollsLeft = 2;
  assert.equal(L.jokerApplies(p, g.dice), true);
  assert.deepEqual(L.legal(g), [C.fives]);
  const ev = L.score(g, C.fives);
  assert.equal(ev.points, 25);
  assert.equal(ev.yahtzeeBonus, false);
  assert.equal(p.bonus, 0);
});

test("Yahtzee bonus: 100 for each additional yahtzee after a 50", () => {
  const g = L.newGame(1, [{ name: "A", type: "human" }]);
  const p = g.players[0];
  p.scores[C.yahtzee] = 50;
  g.dice = [2, 2, 2, 2, 2]; g.rollsLeft = 1;
  const ev = L.score(g, C.twos);
  assert.equal(ev.yahtzeeBonus, true);
  assert.equal(p.bonus, 1);
  g.dice = [6, 6, 6, 6, 6]; g.rollsLeft = 1;
  fillAll(p, ["chance"]);
  p.scores[C.sixes] = 18;
  L.score(g, C.chance);
  assert.equal(p.bonus, 2);
  assert.equal(L.totals(p).yahtzeeBonus, 200);
});

test("scoring the first yahtzee in the box gives no bonus", () => {
  const g = L.newGame(1, [{ name: "A", type: "human" }]);
  g.dice = [3, 3, 3, 3, 3]; g.rollsLeft = 0;
  const ev = L.score(g, C.yahtzee);
  assert.equal(ev.points, 50);
  assert.equal(ev.yahtzeeBonus, false);
  assert.equal(g.players[0].bonus, 0);
});

test("illegal actions are rejected", () => {
  const g = L.newGame(7, [{ name: "A", type: "human" }]);
  assert.throws(() => L.score(g, 0));            // not rolled
  L.roll(g); L.roll(g); L.roll(g);
  assert.throws(() => L.roll(g));                // no rolls left
  L.score(g, C.chance);
  assert.throws(() => { L.roll(g); L.score(g, C.chance); }); // filled box
  const h = L.newGame(7, [{ name: "A" }]);
  assert.equal(L.toggleHold(h, 0), false);       // cannot hold before first roll
  L.roll(h);
  assert.equal(L.toggleHold(h, 0), true);
  const kept = h.dice[0];
  L.roll(h);
  assert.equal(h.dice[0], kept);
});

test("game ends after 13 rounds for every player, turn order rotates", () => {
  const g = L.newGame(5, [{ name: "A" }, { name: "B" }]);
  let turns = 0;
  while (!g.over) {
    assert.equal(g.current, turns % 2);
    L.roll(g);
    L.score(g, L.legal(g)[0]);
    turns++;
    assert.ok(turns <= 26);
  }
  assert.equal(turns, 26);
  assert.equal(g.round, 13);
  g.players.forEach((p) => assert.ok(p.scores.every((s) => s !== null)));
  assert.throws(() => L.roll(g));
  assert.ok(L.winners(g).length >= 1);
});

test("seed determinism", () => {
  const run = (seed) => {
    const g = L.newGame(seed, [{ name: "A" }]);
    const seen = [];
    while (!g.over) {
      L.roll(g); seen.push(g.dice.join(""));
      L.setHolds(g, [true, false, true, false, false]); L.roll(g); seen.push(g.dice.join(""));
      L.score(g, L.legal(g)[0]);
    }
    return seen.join(",");
  };
  assert.equal(run(42), run(42));
  assert.notEqual(run(42), run(43));
  const r = L.mulberry32(9), g = L.newGame(9, [{ name: "A" }]);
  L.roll(g);
  for (let i = 0; i < 5; i++) assert.equal(g.dice[i], 1 + Math.floor(r() * 6));
});

test("saved game continues the same random stream", () => {
  const a = L.newGame(11, [{ name: "A" }]);
  L.roll(a);
  const b = JSON.parse(JSON.stringify(a));
  assert.ok(L.validGame(b));
  L.roll(a); L.roll(b);
  assert.deepEqual(a.dice, b.dice);
});

test("bot always picks legal actions, finishes games, solo and multi", () => {
  for (let s = 1; s <= 30; s++) {
    const g = L.newGame(s, [{ name: "B1", type: "bot" }, { name: "B2", type: "bot" }, { name: "B3", type: "bot" }, { name: "B4", type: "bot" }]);
    let turns = 0;
    while (!g.over) {
      const rec = L.botPlayTurn(g);
      assert.ok(rec.rolls >= 1 && rec.rolls <= 3);
      assert.ok(Number.isInteger(rec.cat));
      turns++;
    }
    assert.equal(turns, 52);
    g.players.forEach((p) => assert.ok(p.scores.every((x) => x !== null)));
  }
});

test("bot makes sensible decisions", () => {
  const g = L.newGame(1, [{ name: "B", type: "bot" }]);
  const planner = L.makePlanner(g.players[0]);
  // keeps a made large straight
  g.dice = [1, 2, 3, 4, 5]; g.rollsLeft = 2;
  assert.deepEqual(L.botAction(g, planner), { action: "score", cat: C.lgStraight });
  // keeps four sixes
  g.dice = [6, 6, 6, 6, 2]; g.rollsLeft = 2;
  const a = L.botAction(g, planner);
  assert.equal(a.action, "roll");
  assert.deepEqual(a.mask, [true, true, true, true, false]);
  // five of a kind: scores yahtzee
  g.dice = [3, 3, 3, 3, 3]; g.rollsLeft = 1;
  assert.deepEqual(L.botAction(g, planner), { action: "score", cat: C.yahtzee });
});

test("optimal bot averages well above 200 over seeded games", () => {
  const n = 300;
  let sum = 0;
  for (let s = 1; s <= n; s++) sum += L.totals(L.playBotGame(1000 + s, 1).players[0]).total;
  const avg = sum / n;
  console.log("bot average over " + n + " games: " + avg.toFixed(1));
  assert.ok(avg > 200, "average " + avg);
});

test("no em dash in shipped yahtzee files", () => {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "private", "yahtzee");
  for (const f of fs.readdirSync(dir)) {
    assert.ok(!fs.readFileSync(path.join(dir, f), "utf8").includes(String.fromCharCode(0x2014)), f);
  }
});

// ------------------------------------------------------------ real dice scoreboard
const range = (a, b, st = 1) => { const o = []; for (let i = a; i <= b; i += st) o.push(i); return o; };

test("validScoresFor lists for every category", () => {
  for (let f = 1; f <= 6; f++) assert.deepEqual(L.validScoresFor(f - 1), range(0, 5 * f, f));
  const sum = [0, ...range(5, 30)];
  assert.deepEqual(L.validScoresFor(C.threeKind), sum);
  assert.deepEqual(L.validScoresFor(C.fourKind), sum);
  assert.deepEqual(L.validScoresFor(C.chance), sum);
  assert.deepEqual(L.validScoresFor(C.fullHouse), [0, 25]);
  assert.deepEqual(L.validScoresFor(C.smStraight), [0, 30]);
  assert.deepEqual(L.validScoresFor(C.lgStraight), [0, 40]);
  assert.deepEqual(L.validScoresFor(C.yahtzee), [0, 50]);
  assert.throws(() => L.validScoresFor(13));
});

test("board: entering scores advances turns and rejects bad input", () => {
  const b = L.newBoard(["A", "B", "C"]);
  assert.equal(b.current, 0);
  L.boardEnter(b, C.ones, 3);
  assert.equal(b.current, 1);
  L.boardEnter(b, C.ones, 0);
  L.boardEnter(b, C.chance, 22);
  assert.equal(b.current, 0);
  assert.equal(b.round, 2);
  assert.throws(() => L.boardEnter(b, C.ones, 2));      // box filled
  assert.throws(() => L.boardEnter(b, C.twos, 3));      // invalid for Twos
  assert.throws(() => L.boardEnter(b, C.fullHouse, 30));
  assert.equal(b.players[0].scores[C.ones], 3);
});

test("board: upper bonus at exactly 63 via entered scores", () => {
  const b = L.newBoard(["Solo"]);
  [3, 6, 9, 12, 15].forEach((v, i) => L.boardEnter(b, i, v));
  assert.equal(L.bonusToGo(b.players[0]), 63 - 45);
  L.boardEnter(b, C.sixes, 12);
  assert.equal(L.totals(b.players[0]).upper, 57);
  assert.equal(L.totals(b.players[0]).upperBonus, 0);
  assert.equal(L.bonusToGo(b.players[0]), 6);
  L.boardEdit(b, 0, C.sixes, 18);
  assert.equal(L.totals(b.players[0]).upper, 63);
  assert.equal(L.totals(b.players[0]).upperBonus, 35);
  assert.equal(L.totals(b.players[0]).total, 98);
  assert.equal(L.bonusToGo(b.players[0]), 0);
  L.boardEdit(b, 0, C.ones, 2);
  assert.equal(L.totals(b.players[0]).upperBonus, 0);
});

test("board: editing and clearing recalculate totals and the turn", () => {
  const b = L.newBoard(["A", "B"]);
  L.boardEnter(b, C.chance, 20);
  L.boardEnter(b, C.chance, 10);
  L.boardEdit(b, 1, C.chance, 25);
  assert.equal(L.totals(b.players[1]).total, 25);
  L.boardEdit(b, 0, C.chance, null);
  assert.equal(L.totals(b.players[0]).total, 0);
  assert.equal(b.current, 0);            // A has fewer boxes again
  assert.equal(b.round, 1);
  assert.throws(() => L.boardEdit(b, 0, C.twos, 3));
  assert.throws(() => L.boardEdit(b, 5, C.twos, 2));
});

test("board: undo is multi-step and restores everything", () => {
  const b = L.newBoard(["A", "B"]);
  assert.equal(L.boardUndo(b), false);
  L.boardEnter(b, C.yahtzee, 50);
  assert.throws(() => L.boardAddBonus(b));       // B has no 50 in the box
  L.boardEnter(b, C.ones, 1);
  L.boardAddBonus(b);                            // A is up and has 50
  assert.equal(b.players[0].bonus, 1);
  L.boardEdit(b, 1, C.ones, 4);
  L.boardEnter(b, C.twos, 6);
  assert.equal(L.boardUndo(b), true);            // undo A twos
  assert.equal(b.players[0].scores[C.twos], null);
  assert.equal(b.current, 0);
  L.boardUndo(b);                                // undo edit
  assert.equal(b.players[1].scores[C.ones], 1);
  L.boardUndo(b);                                // undo bonus
  assert.equal(b.players[0].bonus, 0);
  L.boardUndo(b); L.boardUndo(b);
  assert.equal(b.players[0].scores[C.yahtzee], null);
  assert.equal(b.current, 0);
  assert.equal(L.boardUndo(b), false);
});

test("board: yahtzee bonus button and clearing the 50 drops the bonus", () => {
  const b = L.newBoard(["A"]);
  L.boardEnter(b, C.yahtzee, 50);
  L.boardAddBonus(b); L.boardAddBonus(b);
  assert.equal(L.totals(b.players[0]).yahtzeeBonus, 200);
  assert.equal(L.totals(b.players[0]).total, 250);
  L.boardEdit(b, 0, C.yahtzee, 0);
  assert.equal(b.players[0].bonus, 0);
  assert.throws(() => L.boardAddBonus(b));
});

test("board: ties share a rank, winners lists all tied", () => {
  const b = L.newBoard(["A", "B", "C"]);
  L.boardEnter(b, C.chance, 20); L.boardEnter(b, C.chance, 20); L.boardEnter(b, C.chance, 10);
  const st = L.boardStandings(b);
  assert.deepEqual(st.map((x) => x.rank), [1, 1, 3]);
  assert.deepEqual(L.boardWinners(b), [0, 1]);
  L.boardEdit(b, 2, C.chance, 30);
  assert.deepEqual(L.boardWinners(b), [2]);
  assert.deepEqual(L.boardStandings(b).map((x) => x.name), ["C", "A", "B"]);
});

test("board: entered dice use Joker rule and Yahtzee bonus", () => {
  const b = L.newBoard(["A", "B"]);
  assert.equal(L.boardPotentials(b, [1, 2, 3])[0], null);        // needs five dice
  let pot = L.boardPotentials(b, [4, 4, 4, 4, 4]);
  assert.equal(pot[C.yahtzee], 50);
  assert.equal(pot[C.fullHouse], 0);                              // no joker yet
  let ev = L.boardEnterDice(b, [4, 4, 4, 4, 4], C.yahtzee);
  assert.equal(ev.points, 50); assert.equal(ev.yahtzeeBonus, false);
  L.boardEnter(b, C.chance, 10);                                  // B
  pot = L.boardPotentials(b, [2, 2, 2, 2, 2]);                    // A again: joker
  assert.equal(pot[C.twos], 10);
  assert.equal(pot.filter((x) => x !== null).length, 1);          // forced upper
  ev = L.boardEnterDice(b, [2, 2, 2, 2, 2], C.twos);
  assert.equal(ev.yahtzeeBonus, true); assert.equal(ev.joker, true);
  assert.equal(b.players[0].bonus, 1);
  L.boardEnter(b, C.ones, 0);                                     // B
  assert.throws(() => L.boardEnterDice(b, [2, 2, 2, 2, 2], C.ones)); // twos filled: lower boxes only
});

test("board: joker falls through to lower boxes and full-value straights", () => {
  const b = L.newBoard(["A"]);
  b.players[0].scores[C.yahtzee] = 50;
  b.players[0].scores[C.sixes] = 24;
  const pot = L.boardPotentials(b, [6, 6, 6, 6, 6]);
  assert.equal(pot[C.fullHouse], 25);
  assert.equal(pot[C.smStraight], 30);
  assert.equal(pot[C.lgStraight], 40);
  assert.equal(pot[C.threeKind], 30);
  assert.equal(pot[C.ones], null);
  L.boardEnterDice(b, [6, 6, 6, 6, 6], C.lgStraight);
  assert.equal(b.players[0].scores[C.lgStraight], 40);
  assert.equal(b.players[0].bonus, 1);
});

test("board: game ends after all players fill 13 boxes; resume round-trip", () => {
  const b = L.newBoard(["A", "B", "C", "D", "E", "F"]);
  let n = 0;
  while (!b.over) {
    if (n === 20) {
      const copy = JSON.parse(JSON.stringify(b));
      assert.ok(L.validBoard(copy));
      L.boardRecalc(copy);
      assert.equal(copy.current, b.current);
      assert.equal(copy.history.length, b.history.length);
      L.boardUndo(copy);
      assert.equal(copy.history.length, 19);
    }
    const p = b.players[b.current];
    const cat = p.scores.findIndex((s) => s === null);
    L.boardEnter(b, cat, L.validScoresFor(cat)[1]);
    n++;
  }
  assert.equal(n, 78);
  assert.throws(() => L.boardEnter(b, 0, 1));
  L.boardEdit(b, 0, 0, null);
  assert.equal(b.over, false);
  assert.equal(b.current, 0);
  assert.equal(L.validBoard({ v: 1, kind: "virtual" }), false);
});

test("board: one to six players only matter via validBoard", () => {
  assert.equal(L.validBoard(L.newBoard(["A"])), true);
  assert.equal(L.validBoard(L.newBoard(["1", "2", "3", "4", "5", "6", "7"])), false);
});
