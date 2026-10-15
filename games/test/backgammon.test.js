"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/backgammon/logic.js");

// Black's own point number for the point White calls n.
const bk = (n) => 25 - n;

function sum(pts, sign) { return pts.reduce((a, v) => a + (v * sign > 0 ? Math.abs(v) : 0), 0); }
function moveSet(ms) { return ms.map((m) => `${m.from}>${m.to}:${m.die}`).sort(); }

function rand32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// agents[p] is "ai" or "rand". Returns the final state.
function playGame(seed, agents, opts) {
  const s = L.newGame(Object.assign({ seed }, opts || {}));
  const r = rand32(seed ^ 0x9e3779b9);
  let guard = 0;
  while (s.phase !== "over") {
    if (++guard > 3000) throw new Error("runaway game, seed " + seed);
    if (s.phase === "opening") { L.roll(s); continue; }
    if (s.phase === "double") {
      const take = agents[1 - s.offer.by] === "ai" ? L.aiShouldTake(s) : r() < 0.5;
      if (take) L.takeDouble(s); else L.dropDouble(s);
      continue;
    }
    if (s.phase === "roll") {
      if (agents[s.turn] === "ai" && L.aiShouldDouble(s)) { assert.ok(L.offerDouble(s)); continue; }
      L.roll(s);
      continue;
    }
    // move phase
    if (agents[s.turn] === "ai") {
      const moves = L.chooseTurn(s);
      assert.ok(L.playMoves(s, moves), "AI produced an illegal move, seed " + seed);
    } else {
      let ms;
      while ((ms = L.legalMoves(s)).length && s.phase === "move") {
        assert.ok(L.move(s, ms[Math.floor(r() * ms.length)]));
      }
    }
    if (s.phase === "over") break;
    assert.ok(L.endTurn(s), "turn could not end, seed " + seed);
  }
  return s;
}

test("initial setup has 15 checkers per side on the right points", () => {
  const s = L.newGame({ seed: 1 });
  assert.equal(sum(s.pts, 1), 15);
  assert.equal(sum(s.pts, -1), 15);
  const w = {}, b = {};
  for (let i = 0; i < 24; i++) {
    if (s.pts[i] > 0) w[i + 1] = s.pts[i];
    if (s.pts[i] < 0) b[24 - i] = -s.pts[i];
  }
  assert.deepEqual(w, { 24: 2, 13: 5, 8: 3, 6: 5 });
  assert.deepEqual(b, { 24: 2, 13: 5, 8: 3, 6: 5 });
  assert.equal(L.pipCount(L.posOf(s), 0), 167);
  assert.equal(L.pipCount(L.posOf(s), 1), 167);
  assert.deepEqual(s.bar, [0, 0]);
  assert.deepEqual(s.off, [0, 0]);
  assert.equal(s.phase, "opening");
});

test("opening roll: higher die starts and uses both dice, ties reroll", () => {
  let tied = 0, started = 0;
  for (let seed = 1; seed < 60; seed++) {
    const s = L.newGame({ seed });
    let res = L.roll(s);
    while (res.tie) { tied++; assert.equal(s.phase, "opening"); res = L.roll(s); }
    started++;
    const [a, b] = s.opening.dice;
    assert.notEqual(a, b);
    assert.equal(s.turn, a > b ? 0 : 1);
    assert.equal(s.phase, "move");
    assert.deepEqual(s.dice, [a, b]);
    assert.equal(s.remaining.length, 2);
  }
  assert.ok(tied > 0 && started === 59);
});

test("single move generation for each die", () => {
  const s = L.custom({ white: { 13: 1, 24: 1 }, black: { 24: 1 }, dice: [3, 4] });
  const ms = moveSet(L.legalMoves(s));
  assert.ok(ms.includes("12>9:3"));
  assert.ok(ms.includes("12>8:4"));
  assert.ok(ms.includes("23>20:3"));
  assert.ok(ms.includes("23>19:4"));
  assert.equal(ms.length, 4);
});

test("a point with two opposing checkers is blocked", () => {
  const s = L.custom({ white: { 13: 1 }, black: { [bk(10)]: 2 }, dice: [3, 4] });
  const ms = L.legalMoves(s);
  assert.ok(!ms.some((m) => m.die === 3 && m.from === 12));
  assert.ok(ms.some((m) => m.die === 4));
});

test("a blot is hit and goes to the bar", () => {
  const s = L.custom({ white: { 13: 1, 8: 1 }, black: { [bk(10)]: 1, 5: 2 }, dice: [3, 6] });
  const m = L.legalMoves(s).find((x) => x.from === 12 && x.die === 3);
  assert.ok(m && m.hit);
  assert.ok(L.move(s, m));
  assert.equal(s.bar[1], 1);
  assert.equal(s.pts[9], 1);
  assert.equal(s.played[0].hit, true);
  assert.match(L.notation(0, s.played), /13\/10\*/);
});

test("checkers on the bar must enter first, into the opponent's home board", () => {
  const s = L.custom({ white: { 6: 2 }, bar: [1, 0], black: { [bk(22)]: 1 }, dice: [3, 5] });
  const ms = L.legalMoves(s);
  assert.ok(ms.every((m) => m.from === "bar"));
  assert.deepEqual(moveSet(ms), ["bar>19:5", "bar>21:3"]);
  // entering with 3 lands on white's point 22 (index 21) which holds a black blot: hit
  assert.ok(ms.find((m) => m.die === 3).hit);
  assert.ok(L.move(s, ms.find((m) => m.die === 3)));
  assert.equal(s.bar[1], 1);
  // the other die can now be played by any checker
  assert.ok(L.legalMoves(s).some((m) => m.from !== "bar"));
});

test("a blocked entry point loses that die, a fully closed board loses the turn", () => {
  let s = L.custom({ white: { 6: 2 }, bar: [1, 0], black: { 3: 2 }, dice: [3, 5] });
  let ms = L.legalMoves(s);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].die, 5);
  L.move(s, ms[0]);
  assert.ok(L.legalMoves(s).some((m) => m.die === 3 && m.from === 5));

  s = L.custom({ white: { 6: 2 }, bar: [1, 0], black: { 3: 2, 5: 2 }, dice: [3, 5] });
  assert.equal(s.maxUse, 0);
  assert.equal(L.legalMoves(s).length, 0);
  assert.ok(L.canEnd(s));
  assert.ok(L.endTurn(s));
  assert.equal(s.turn, 1);
  assert.equal(s.phase, "roll");
  assert.equal(s.log[s.log.length - 1].text, "no legal move");
});

test("both dice must be used when possible, even if only one order works", () => {
  // White checker on 12. Die 4 is blocked at 8, but 3 then 4 is playable (12>9>5).
  const s = L.custom({ white: { 12: 1 }, black: { [bk(8)]: 2 }, dice: [4, 3] });
  assert.equal(s.maxUse, 2);
  const ms = L.legalMoves(s);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].die, 3);
  L.move(s, ms[0]);
  const next = L.legalMoves(s);
  assert.equal(next.length, 1);
  assert.equal(next[0].die, 4);
});

test("when only one die can be played the higher one is forced", () => {
  // From 10: 6 goes to 4, 2 goes to 8, but afterwards the other die is blocked at 2.
  const s = L.custom({ white: { 10: 1 }, black: { [bk(2)]: 2 }, dice: [2, 6] });
  assert.equal(s.maxUse, 1);
  const ms = L.legalMoves(s);
  assert.deepEqual(moveSet(ms), ["9>3:6"]);
  assert.ok(L.move(s, ms[0]));
  assert.ok(L.canEnd(s));
});

test("one die makes the other unplayable: the lower die is played when the higher cannot", () => {
  const s = L.custom({ white: { 10: 1 }, black: { [bk(2)]: 2, [bk(4)]: 2 }, dice: [6, 2] });
  assert.equal(s.maxUse, 1);
  assert.deepEqual(moveSet(L.legalMoves(s)), ["9>7:2"]);
});

test("doubles give four moves", () => {
  const s = L.custom({ white: { 13: 4 }, black: { 24: 2 }, dice: [3, 3] });
  assert.deepEqual(s.remaining, [3, 3, 3, 3]);
  assert.equal(s.maxUse, 4);
  for (let i = 0; i < 4; i++) {
    const ms = L.legalMoves(s);
    assert.ok(ms.length > 0);
    assert.ok(L.move(s, ms.find((m) => m.from === 12 || m.from === 9)));
  }
  assert.equal(s.remaining.length, 0);
  assert.ok(L.canEnd(s));
  assert.equal(s.played.length, 4);
});

test("doubles stop early when blocked", () => {
  // checker on 7 with 4s: 7>3, then 3 cannot move 4 (not all home? it is, bears off with higher die)
  const s = L.custom({ white: { 20: 1 }, black: { [bk(16)]: 2 }, dice: [4, 4] });
  assert.equal(s.maxUse, 0);
  assert.ok(L.canEnd(s));
});

test("bearing off: exact die", () => {
  const s = L.custom({ white: { 6: 2, 4: 1 }, black: { 13: 1 }, dice: [4, 6] });
  const ms = L.legalMoves(s);
  assert.ok(ms.some((m) => m.from === 3 && m.to === "off" && m.die === 4));
  assert.ok(ms.some((m) => m.from === 5 && m.to === "off" && m.die === 6));
});

test("bearing off: a higher die takes the highest checker only", () => {
  const s = L.custom({ white: { 4: 1, 2: 1 }, black: { 13: 1 }, dice: [6, 5] });
  const ms = L.legalMoves(s).filter((m) => m.to === "off");
  assert.ok(ms.length > 0);
  assert.ok(ms.every((m) => m.from === 3), "only the checker on the 4 point may bear off");
});

test("bearing off: lower point may not bear off while a higher point is occupied", () => {
  const s = L.custom({ white: { 5: 1, 2: 1 }, black: { 13: 1 }, dice: [3, 1] });
  const three = L.legalMoves(s).filter((m) => m.die === 3);
  assert.deepEqual(moveSet(three), ["4>1:3"]);
});

test("no bearing off while a checker is outside the home board or on the bar", () => {
  let s = L.custom({ white: { 8: 1, 2: 1 }, black: { 13: 1 }, dice: [2, 5] });
  assert.ok(!L.legalMoves(s).some((m) => m.to === "off"));
  s = L.custom({ white: { 2: 1 }, bar: [1, 0], black: { 13: 1 }, dice: [2, 5] });
  assert.ok(!L.legalMoves(s).some((m) => m.to === "off"));
});

test("bearing off works for Black in the mirrored direction", () => {
  const s = L.custom({ black: { 3: 1, 1: 1 }, white: { 13: 1 }, turn: 1, dice: [3, 1] });
  const ms = L.legalMoves(s);
  assert.ok(ms.some((m) => m.from === 21 && m.to === "off" && m.die === 3));
  assert.ok(ms.some((m) => m.from === 23 && m.to === "off" && m.die === 1));
});

test("single game win, gammon and backgammon scoring", () => {
  // single: loser has borne off one
  let s = L.custom({ white: { 1: 1 }, off: [14, 1], black: { 13: 14 }, dice: [1, 2] });
  assert.ok(L.move(s, L.legalMoves(s).find((m) => m.to === "off")));
  assert.equal(s.phase, "over");
  assert.deepEqual([s.result.winner, s.result.kind, s.result.points], [0, "single", 1]);

  // gammon: loser has borne off none, nothing in the winner's home
  s = L.custom({ white: { 1: 1 }, off: [14, 0], black: { 10: 15 }, dice: [1, 2] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.deepEqual([s.result.kind, s.result.points], ["gammon", 2]);

  // backgammon: loser still has a checker in the winner's home board
  s = L.custom({ white: { 2: 1 }, off: [14, 0], black: { 24: 2, 8: 13 }, dice: [2, 1] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.deepEqual([s.result.kind, s.result.points], ["backgammon", 3]);

  // backgammon: loser on the bar
  s = L.custom({ white: { 1: 1 }, off: [14, 0], black: { 10: 14 }, bar: [0, 1], dice: [1, 2] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.deepEqual([s.result.kind, s.result.points], ["backgammon", 3]);

  // Black wins: mirrored home board check
  s = L.custom({ black: { 1: 1 }, off: [0, 14], white: { 1: 2, 10: 13 }, turn: 1, dice: [1, 2] });
  // white point 1 is index 0, which is in Black's home? Black home is indices 18..23, so this is a gammon only
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.deepEqual([s.result.winner, s.result.kind], [1, "gammon"]);
  s = L.custom({ black: { 2: 1 }, off: [0, 14], white: { 24: 2, 10: 13 }, turn: 1, dice: [2, 1] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.deepEqual([s.result.winner, s.result.kind, s.result.points], [1, "backgammon", 3]);
});

test("optional cube: off by default, offer, take and pass", () => {
  let s = L.custom({ cube: false });
  assert.equal(L.canDouble(s), false);

  s = L.custom({ cube: true, white: { 13: 15 }, black: { 13: 15 } });
  assert.ok(L.canDouble(s));
  assert.ok(L.offerDouble(s));
  assert.equal(s.phase, "double");
  assert.ok(L.takeDouble(s));
  assert.equal(s.cube.value, 2);
  assert.equal(s.cube.owner, 1);
  assert.equal(s.phase, "roll");
  assert.equal(L.canDouble(s, 0), false, "doubler cannot redouble");
  s.turn = 1;
  assert.ok(L.canDouble(s), "owner may redouble");
  L.offerDouble(s);
  assert.ok(L.dropDouble(s));
  assert.equal(s.phase, "over");
  assert.deepEqual([s.result.winner, s.result.points, s.result.kind], [1, 2, "pass"]);

  // cannot double after rolling, nor in the opening
  s = L.custom({ cube: true, dice: [3, 1] });
  assert.equal(L.canDouble(s), false);
  assert.equal(L.newGame({ seed: 1, cube: true }).phase, "opening");
  assert.equal(L.canDouble(L.newGame({ seed: 1, cube: true })), false);
});

test("cube multiplies gammon points", () => {
  const s = L.custom({ cube: true, cubeValue: 4, cubeOwner: 0, white: { 1: 1 }, off: [14, 0], black: { 10: 15 }, dice: [1, 2] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.equal(s.result.points, 8);
});

test("match play with the Crawford rule", () => {
  let s = L.custom({ cube: true, matchTo: 5, scores: [3, 0], white: { 1: 1 }, off: [14, 1], black: { 13: 14 }, dice: [1, 2] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.deepEqual(s.match.score, [4, 0]);
  assert.equal(s.match.winner, null);
  const g2 = L.nextGame(s);
  assert.equal(g2.crawfordGame, true);
  assert.equal(L.canDouble(Object.assign(L.newGame({ seed: 5, cube: true, matchTo: 5, scores: [4, 0], crawfordGame: true }), { phase: "roll" })), false);
  // finish the Crawford game, next one allows the cube again
  g2.phase = "over"; g2.result = { winner: 1 }; g2.match.score[1] += 1;
  const g3 = L.nextGame(g2);
  assert.equal(g3.crawfordGame, false);
  assert.equal(g3.gameNo, 3);
  // match end
  s = L.custom({ matchTo: 3, scores: [2, 0], white: { 1: 1 }, off: [14, 0], black: { 10: 15 }, dice: [1, 2] });
  L.move(s, L.legalMoves(s).find((m) => m.to === "off"));
  assert.equal(s.match.winner, 0);
  assert.equal(L.nextGame(s), null);
});

test("seeded dice are deterministic and different seeds differ", () => {
  const a = L.newGame({ seed: 777 }), b = L.newGame({ seed: 777 });
  const seqA = [], seqB = [];
  for (let i = 0; i < 20; i++) { seqA.push(L.rollDie(a)); seqB.push(L.rollDie(b)); }
  assert.deepEqual(seqA, seqB);
  const c = L.newGame({ seed: 778 });
  const seqC = [];
  for (let i = 0; i < 20; i++) seqC.push(L.rollDie(c));
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every((d) => d >= 1 && d <= 6));
  // identical full games from the same seed
  const g1 = playGame(42, ["ai", "ai"]), g2 = playGame(42, ["ai", "ai"]);
  assert.deepEqual(g1, g2);
});

test("state survives a JSON round trip mid-turn and continues identically", () => {
  const s = L.newGame({ seed: 99, cube: true });
  while (s.phase === "opening") L.roll(s);
  L.move(s, L.legalMoves(s)[0]);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  const ms1 = L.legalMoves(s), ms2 = L.legalMoves(copy);
  assert.deepEqual(ms1, ms2);
  L.playMoves(s, L.chooseTurn(s)); L.playMoves(copy, L.chooseTurn(copy));
  L.endTurn(s); L.endTurn(copy);
  L.roll(s); L.roll(copy);
  assert.deepEqual(s, copy);
});

test("undo restores the position, dice and bar", () => {
  const s = L.custom({ white: { 13: 1, 8: 1 }, black: { [bk(10)]: 1, 5: 2 }, dice: [3, 6] });
  const before = JSON.stringify([s.pts, s.bar, s.off, s.remaining]);
  L.move(s, L.legalMoves(s).find((m) => m.from === 12 && m.die === 3));
  assert.equal(s.bar[1], 1);
  assert.ok(L.undo(s));
  assert.equal(JSON.stringify([s.pts, s.bar, s.off, s.remaining]), before);
  assert.equal(s.played.length, 0);
  assert.equal(L.undo(s), false);
  // undo one of two
  L.move(s, L.legalMoves(s)[0]);
  const m2 = L.legalMoves(s)[0];
  L.move(s, m2);
  assert.ok(L.undo(s));
  assert.equal(s.played.length, 1);
  assert.equal(s.remaining.length, 1);
});

test("illegal moves and early end of turn are rejected", () => {
  const s = L.custom({ white: { 13: 2 }, black: { 24: 2 }, dice: [3, 4] });
  assert.equal(L.move(s, { from: 12, to: 5, die: 7 }), false);
  assert.equal(L.endTurn(s), false);
  assert.equal(L.move(s, { from: 3, to: 0, die: 3 }), false);
});

test("AI plays only legal moves in hundreds of seeded games and always finishes", () => {
  let games = 0, white = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const s = playGame(seed, ["ai", "ai"]);
    assert.equal(s.phase, "over");
    assert.ok(s.off[s.result.winner] === 15 || s.result.kind === "pass");
    assert.ok(sum(s.pts, 1) + s.bar[0] + s.off[0] === 15);
    assert.ok(sum(s.pts, -1) + s.bar[1] + s.off[1] === 15);
    games++; if (s.result.winner === 0) white++;
  }
  assert.equal(games, 120);
  assert.ok(white > 20 && white < 100, "no huge colour bias: " + white);
});

test("AI and random players finish cube games legally", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = playGame(seed, seed % 2 ? ["ai", "ai"] : ["ai", "rand"], { cube: true });
    assert.equal(s.phase, "over");
    assert.ok(s.result.points >= 1);
  }
});

test("AI beats a random player in at least 85% of 200 seeded games", () => {
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const aiIsWhite = seed % 2 === 0;
    const s = playGame(1000 + seed, aiIsWhite ? ["ai", "rand"] : ["rand", "ai"]);
    const aiColour = aiIsWhite ? 0 : 1;
    if (s.result.winner === aiColour) wins++;
  }
  console.log("AI win rate vs random: " + wins + "/200");
  assert.ok(wins >= 170, "AI won only " + wins + " of 200");
});

test("evaluation prefers safety, made points and hits", () => {
  const base = { white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 24: 2, 13: 5, 8: 3, 6: 5 } };
  const safe = L.custom(Object.assign({}, base, { white: { 24: 2, 13: 5, 8: 3, 6: 4, 5: 1 } }));
  const safe2 = L.custom(Object.assign({}, base, { white: { 24: 2, 13: 4, 8: 3, 6: 5, 5: 1 } }));
  // blot on the 7 point is exposed to the back checkers, a stack on 6 is not
  const exposed = L.custom(Object.assign({}, base, { white: { 24: 2, 13: 5, 8: 3, 7: 1, 6: 4 } }));
  const stacked = L.custom(Object.assign({}, base, { white: { 24: 2, 13: 5, 8: 2, 7: 2, 6: 4 } }));
  assert.ok(L.evaluate(L.posOf(stacked), 0) > L.evaluate(L.posOf(exposed), 0));
  assert.ok(L.shotProb(L.posOf(exposed), 0, 6) > 0.1);
  // a hit is worth a lot
  const hit = L.custom(Object.assign({}, base, { bar: [0, 1], black: { 24: 1, 13: 5, 8: 3, 6: 5 } }));
  const nohit = L.custom(base);
  assert.ok(L.evaluate(L.posOf(hit), 0) > L.evaluate(L.posOf(nohit), 0) + 10);
  assert.ok(L.evaluate(L.posOf(safe), 0) !== L.evaluate(L.posOf(safe2), 0));
});

test("AI makes the 5 point on a 3-1 opening", () => {
  const g = L.custom({ white: { 24: 2, 13: 5, 8: 3, 6: 5 }, black: { 24: 2, 13: 5, 8: 3, 6: 5 }, dice: [3, 1] });
  L.playMoves(g, L.chooseTurn(g));
  assert.equal(g.pts[4], 2, "makes the 5 point with 8/5 6/5: " + g.pts.join());
});

test("AI cube decisions follow pip lead", () => {
  // White far ahead in a pure race: doubles, opponent passes
  const s = L.custom({ cube: true, white: { 3: 5, 2: 5, 1: 5 }, black: { 6: 5, 5: 5, 4: 5 } });
  assert.ok(L.aiShouldDouble(s));
  L.offerDouble(s);
  assert.equal(L.aiShouldTake(s), false);
  // roughly even race: no double
  const e = L.custom({ cube: true, white: { 3: 5, 2: 5, 1: 5 }, black: { 3: 5, 2: 5, 1: 5 } });
  assert.equal(L.aiShouldDouble(e), false);
  // slightly behind in a race: take
  const t = L.custom({ cube: true, white: { 3: 5, 2: 5, 1: 4 }, off: [1, 0], black: { 3: 5, 2: 5, 1: 5 }, turn: 0 });
  t.phase = "double"; t.offer = { by: 0 };
  assert.equal(L.aiShouldTake(t), true);
});

test("page contract: base href first in head, no em dash, relative assets", () => {
  const dir = path.join(__dirname, "..", "private", "backgammon");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(/<head>\s*<meta charset[^>]*>\s*<base href="\/play\/backgammon\/"/.test(html));
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(!/(src|href)="https?:/.test(html));
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!text.includes("—"), f + " contains an em dash");
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes("—"));
});
