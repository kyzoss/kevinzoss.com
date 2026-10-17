"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/mexican-train/logic.js");

const DASH = String.fromCharCode(0x2014);
const T = (a, b) => [Math.min(a, b), Math.max(a, b)];
const key = (t) => L.tileKey(t);

// A controllable 4-seat table past everyone's first turn, with the hands we choose.
function table(opts) {
  opts = opts || {};
  const st = L.newGame({ players: opts.players || 4, seed: opts.seed || 1, rounds: opts.rounds || 4, humans: opts.humans, doubleBlank: opts.doubleBlank });
  if (opts.hands) st.hands = opts.hands.map((h) => h.map((t) => T(t[0], t[1])));
  if (opts.boneyard) st.boneyard = opts.boneyard.map((t) => T(t[0], t[1]));
  if (!opts.keepFirst) st.firstTurn = st.firstTurn.map(() => false);
  if (opts.turn !== undefined) st.turn = opts.turn;
  return st;
}
function trainsOf(st, tile) { return L.legalMoves(st).filter((m) => key(m.tile) === key(tile)).map((m) => m.train).sort(); }
function playAll(st, aiFor) {
  let guard = 0;
  while (st.phase !== "gameOver") {
    if (++guard > 60000) throw new Error("runaway game");
    if (st.phase === "roundOver") { assert.ok(L.nextRound(st)); continue; }
    const act = L.aiMove(st);
    assert.ok(act, "AI returned no action");
    if (act.type === "play") {
      const legal = L.legalMoves(st).some((m) => m.train === act.move.train && L.sameTile(m.tile, act.move.tile));
      assert.ok(legal, "AI chose an illegal play " + JSON.stringify(act) + " seed " + st.seed);
    } else if (act.type === "draw") assert.ok(L.canDraw(st), "AI drew when it could not, seed " + st.seed);
    else assert.ok(L.canPass(st), "AI passed when it could not, seed " + st.seed);
    assert.ok(L.applyAction(st, act), "action refused " + JSON.stringify(act));
  }
  return guard;
}

test("double-twelve set: 91 tiles, engine removed before the deal, nothing lost", () => {
  const all = L.allTiles();
  assert.equal(all.length, 91);
  assert.equal(new Set(all.map(key)).size, 91);
  assert.equal(all.filter(L.isDouble).length, 13);
  const st = L.newGame({ players: 4, seed: 3 });
  const dealt = st.hands.flat().concat(st.boneyard);
  assert.equal(dealt.length, 90);
  assert.equal(new Set(dealt.map(key)).size, 90);
  assert.ok(!dealt.some((t) => t[0] === 12 && t[1] === 12), "the engine is in the hub, not in play");
  assert.equal(st.engine, 12);
});

test("hand sizes by player count: 15 / 12 / 10, rest in the boneyard", () => {
  const want = { 2: 15, 3: 15, 4: 15, 5: 12, 6: 12, 7: 10, 8: 10 };
  for (let n = 2; n <= 8; n++) {
    assert.equal(L.handSize(n), want[n]);
    const st = L.newGame({ players: n, seed: n });
    assert.equal(st.hands.length, n);
    st.hands.forEach((h) => assert.equal(h.length, want[n]));
    assert.equal(st.boneyard.length, 90 - n * want[n]);
    assert.equal(st.trains.length, n + 1, "one personal train each plus the Mexican train");
    assert.ok(st.trains[n].mex && st.trains[n].open);
  }
});

test("engine per round counts down from double 12; 13, 7 and 4 round games", () => {
  for (let r = 1; r <= 13; r++) assert.equal(L.engineFor(r), 13 - r);
  for (const rounds of [13, 7, 4]) {
    const st = L.newGame({ players: 2, seed: 5, rounds, humans: [false, false] });
    const engines = [];
    while (st.phase !== "gameOver") {
      if (st.phase === "roundOver") { L.nextRound(st); continue; }
      if (engines[engines.length - 1] !== st.engine) engines.push(st.engine);
      L.applyAction(st, L.aiMove(st));
    }
    assert.equal(engines.length, rounds);
    assert.deepEqual(engines, Array.from({ length: rounds }, (_, i) => 12 - i));
    assert.equal(st.scores.length, rounds);
  }
  assert.equal(L.newGame({ players: 2, rounds: 9 }).rounds, 13, "odd round counts fall back to 13");
});

test("first turn: a continuous run on your own train only, then End turn", () => {
  const st = table({ keepFirst: true, hands: [[[12, 5], [5, 5], [5, 2], [2, 9], [8, 1]], [[12, 1]], [[12, 2]], [[12, 3]]] });
  assert.ok(L.inFirstTurn(st));
  assert.deepEqual(trainsOf(st, [12, 5]), [0], "only the own train during the first turn, not the Mexican train");
  assert.equal(L.canPass(st), false, "cannot end a first turn without playing while a play exists");
  assert.ok(L.play(st, { tile: [12, 5], train: 0 }));
  assert.equal(st.turn, 0, "the same player keeps going");
  assert.ok(L.play(st, { tile: [5, 5], train: 0 }));
  assert.ok(st.pending, "a double inside the run is pending until the next tile");
  assert.ok(L.play(st, { tile: [5, 2], train: 0 }));
  assert.equal(st.pending, null);
  assert.ok(L.play(st, { tile: [2, 9], train: 0 }));
  assert.equal(st.turn, 0);
  assert.deepEqual(L.legalMoves(st), [], "8-1 does not continue the run");
  assert.equal(L.canDraw(st), false, "no draw needed after laying a run");
  assert.ok(L.canPass(st));
  assert.ok(L.pass(st));
  assert.equal(st.turn, 1);
  assert.equal(st.trains[0].open, false, "ending a first turn after playing does not open the train");
  assert.deepEqual(st.trains[0].tiles, [[12, 5], [5, 5], [5, 2], [2, 9]]);
  assert.equal(st.trains[0].end, 9);
  assert.equal(st.firstTurn[0], false);
});

test("first turn may be ended early by choice; the run must be on the own train even when others are open", () => {
  const st = table({ keepFirst: true, hands: [[[12, 5], [5, 2], [12, 7]], [[12, 1]], [[12, 2]], [[12, 3]]] });
  st.trains[1].open = true;
  assert.ok(L.play(st, { tile: [12, 5], train: 0 }));
  assert.deepEqual(trainsOf(st, [5, 2]), [0]);
  assert.equal(trainsOf(st, [12, 7]).length, 0, "open trains are not available during the first turn");
  assert.ok(L.canPass(st), "may stop the run early");
  assert.ok(L.pass(st));
  assert.equal(st.turn, 1);
});

test("after the first turn it is one tile per turn and the turn advances", () => {
  const st = table({ hands: [[[12, 5], [5, 2], [2, 9]], [[12, 1]], [[12, 2]], [[12, 3]]] });
  assert.ok(L.play(st, { tile: [12, 5], train: 0 }));
  assert.equal(st.turn, 1);
  assert.equal(L.legalMoves(st, 0).length, 0, "no moves when it is not your turn");
  assert.equal(L.play(st, { tile: [5, 2], train: 0 }), false);
});

test("play legality per train: own always, Mexican always, opponents only with a marker", () => {
  const st = table({ hands: [[[12, 5], [12, 7]], [[12, 1]], [[12, 2]], [[12, 3]]] });
  assert.deepEqual(trainsOf(st, [12, 5]), [0, 4], "own train and the Mexican train");
  st.trains[2].open = true;
  assert.deepEqual(trainsOf(st, [12, 5]), [0, 2, 4], "an open opponent train joins the list");
  assert.ok(L.play(st, { tile: [12, 5], train: 2 }));
  assert.equal(st.trains[2].open, true, "playing on someone else's train does not remove their marker");
  assert.equal(st.trains[2].end, 5);
  assert.equal(st.turn, 1);
  assert.equal(L.play(st, { tile: [12, 1], train: 3 }), false, "closed opponent train is refused");
  assert.ok(L.play(st, { tile: [12, 1], train: 4 }), "anyone may start the Mexican train");
  assert.equal(st.trains[4].end, 1);
});

test("draw then play: draw only when stuck, play the drawn tile at once if it fits", () => {
  const st = table({ hands: [[[3, 4]], [[12, 1]], [[12, 2]], [[12, 3]]], boneyard: [[7, 8], [12, 9]] });
  assert.equal(L.legalMoves(st).length, 0);
  assert.equal(L.canPass(st), false, "must draw before passing while the boneyard has tiles");
  assert.ok(L.canDraw(st));
  const t = L.draw(st);
  assert.deepEqual(t, [9, 12], "draws from the top of the boneyard");
  assert.equal(st.hands[0].length, 2);
  assert.equal(L.canDraw(st), false, "one draw per turn");
  assert.deepEqual(trainsOf(st, [12, 9]), [0, 4]);
  assert.equal(L.canPass(st), false, "a drawn tile that fits must be played");
  assert.ok(L.play(st, { tile: [12, 9], train: 0 }));
  assert.equal(st.turn, 1);
  assert.equal(st.trains[0].open, false);
  const s2 = table({ hands: [[[12, 5]], [[12, 1]], [[12, 2]], [[12, 3]]], boneyard: [[7, 8]] });
  assert.equal(L.canDraw(s2), false, "cannot draw while a play exists");
  assert.equal(L.draw(s2), null);
});

test("markers: a failed turn opens your train, playing on it closes it again", () => {
  const st = table({ hands: [[[3, 4]], [[12, 1], [8, 7]], [[12, 2]], [[12, 3]]], boneyard: [[7, 8]] });
  assert.ok(L.draw(st));
  assert.equal(L.legalMoves(st).length, 0);
  assert.ok(L.pass(st));
  assert.equal(st.trains[0].open, true, "marker placed");
  assert.equal(st.turn, 1);
  assert.deepEqual(trainsOf(st, [12, 1]), [0, 1, 4], "the open train is now public");
  assert.ok(L.play(st, { tile: [12, 1], train: 0 }));
  assert.equal(st.trains[0].open, true, "an opponent playing there does not close it");
  st.turn = 0; st.played = false; st.drew = false; st.hands[0] = [[1, 4]];
  assert.ok(L.play(st, { tile: [1, 4], train: 0 }));
  assert.equal(st.trains[0].open, false, "owner playing on their own train removes the marker");
  const s3 = table({ hands: [[[3, 4]], [[12, 1]], [[12, 2]], [[12, 3]]], boneyard: [] });
  assert.equal(L.canDraw(s3), false);
  assert.ok(L.canPass(s3), "empty boneyard: pass straight away");
  L.pass(s3);
  assert.equal(s3.trains[0].open, true);
});

test("doubles: must be satisfied by the next tile, the player gets the extra play", () => {
  const st = table({ hands: [[[12, 12], [12, 4], [4, 4], [3, 3]], [[12, 1], [4, 9]], [[12, 2]], [[12, 3]]] });
  assert.ok(L.play(st, { tile: [12, 12], train: 0 }));
  assert.deepEqual(st.pending, { train: 0, pip: 12 });
  assert.equal(st.turn, 0, "the double's player plays again immediately");
  const ms = L.legalMoves(st);
  assert.ok(ms.length === 1 && ms[0].train === 0 && key(ms[0].tile) === "4-12", "only plays onto the double are legal");
  assert.ok(L.play(st, { tile: [12, 4], train: 0 }));
  assert.equal(st.pending, null, "satisfied");
  assert.equal(st.turn, 1, "turn ends after the satisfying tile");
});

test("doubles: a double satisfied by a double chains; an unsatisfied double passes the duty on and opens the train", () => {
  const st = table({ hands: [[[12, 12], [3, 3]], [[12, 1], [9, 8]], [[12, 2], [1, 1]], [[12, 3]]], boneyard: [[2, 2], [5, 6]] });
  assert.ok(L.play(st, { tile: [12, 12], train: 0 }));
  assert.equal(L.legalMoves(st).length, 0);
  assert.ok(L.canDraw(st), "cannot satisfy: draw");
  L.draw(st);
  assert.deepEqual(st.hands[0][st.hands[0].length - 1], [5, 6]);
  assert.equal(L.legalMoves(st).length, 0);
  assert.ok(L.pass(st));
  assert.equal(st.trains[0].open, true, "train opens");
  assert.deepEqual(st.pending, { train: 0, pip: 12 }, "the double stays pending for the next player");
  assert.equal(st.turn, 1);
  assert.deepEqual(L.legalMoves(st).map((m) => key(m.tile) + "@" + m.train), ["1-12@0"], "seat 1 may only play onto the double, even though it is not their train");
  assert.equal(L.canPass(st), false);
  assert.ok(L.play(st, { tile: [12, 1], train: 0 }));
  assert.equal(st.pending, null);
  assert.equal(st.trains[0].open, true, "satisfying on someone else's train leaves their marker");
  assert.equal(st.turn, 2);
  assert.ok(L.play(st, { tile: [1, 1], train: 0 }), "seat 2 plays a double on the open train");
  assert.deepEqual(st.pending, { train: 0, pip: 1 });
  assert.equal(st.turn, 2, "and owes the next tile");
  assert.equal(L.legalMoves(st).length, 0);
  L.draw(st);
  assert.deepEqual(st.hands[2][st.hands[2].length - 1], [2, 2]);
  L.pass(st);
  assert.equal(st.trains[2].open, true);
  assert.equal(st.turn, 3);
  assert.deepEqual(st.pending, { train: 0, pip: 1 });
});

test("doubles: a pending double must be satisfied before a first-turn run, which then continues", () => {
  const st = table({ keepFirst: true, hands: [[[12, 12], [9, 9]], [[12, 1], [1, 7], [7, 3]], [[12, 2]], [[12, 3]]], boneyard: [[2, 2]] });
  assert.ok(L.play(st, { tile: [12, 12], train: 0 }));
  L.draw(st); L.pass(st);
  assert.equal(st.turn, 1);
  assert.ok(st.firstTurn[1]);
  assert.deepEqual(L.legalMoves(st).map((m) => key(m.tile) + "@" + m.train), ["1-12@0"]);
  assert.ok(L.play(st, { tile: [12, 1], train: 0 }));
  assert.equal(st.turn, 1, "still seat 1: the first turn run follows");
  assert.deepEqual(trainsOf(st, [1, 7]), [], "1-7 no longer fits the own train (engine 12)");
  assert.equal(L.legalMoves(st).length, 0);
  assert.ok(L.canPass(st));
});

test("round ends when a player goes out, a double as last tile ends it at once", () => {
  const st = table({ hands: [[[12, 5]], [[12, 1], [2, 3]], [[12, 2]], [[12, 3]]] });
  assert.ok(L.play(st, { tile: [12, 5], train: 0 }));
  assert.equal(st.phase, "roundOver");
  assert.equal(st.lastRound.reason, "out");
  assert.equal(st.lastRound.winner, 0);
  assert.deepEqual(st.lastRound.scores, [0, 18, 14, 15]);
  assert.deepEqual(st.totals, [0, 18, 14, 15]);
  const s2 = table({ hands: [[[12, 12]], [[12, 1]], [[12, 2]], [[12, 3]]] });
  assert.ok(L.play(s2, { tile: [12, 12], train: 0 }));
  assert.equal(s2.phase, "roundOver");
  assert.equal(s2.pending, null);
});

test("round ends blocked when the boneyard is empty and a full lap passes without a play", () => {
  const st = table({ hands: [[[3, 4]], [[5, 6]], [[7, 8]], [[9, 10]]], boneyard: [] });
  for (let i = 0; i < 3; i++) {
    assert.equal(L.legalMoves(st).length, 0);
    assert.ok(L.pass(st));
    assert.equal(st.phase, "play");
  }
  assert.ok(L.pass(st));
  assert.equal(st.phase, "roundOver");
  assert.equal(st.lastRound.reason, "blocked");
  assert.deepEqual(st.lastRound.scores, [7, 11, 15, 19]);
  assert.ok(st.trains.slice(0, 4).every((t) => t.open), "everyone's train opened on the way");
});

test("scoring: pips in hand, double blank 50 by default or 0 as an option", () => {
  assert.equal(L.handValue([[0, 0], [3, 4]], 50), 57);
  assert.equal(L.handValue([[0, 0], [3, 4]], 0), 7);
  assert.equal(L.tileValue([0, 5], 50), 5, "only the double blank is special");
  const st = table({ hands: [[[12, 5]], [[0, 0]], [[12, 2]], [[12, 3]]] });
  L.play(st, { tile: [12, 5], train: 0 });
  assert.deepEqual(st.lastRound.scores, [0, 50, 14, 15]);
  const s0 = table({ hands: [[[12, 5]], [[0, 0]], [[12, 2]], [[12, 3]]], doubleBlank: 0 });
  assert.equal(s0.doubleBlank, 0);
  L.play(s0, { tile: [12, 5], train: 0 });
  assert.deepEqual(s0.lastRound.scores, [0, 0, 14, 15]);
});

test("game over after the chosen number of rounds; lowest total wins; standings rank ties", () => {
  const st = L.newGame({ players: 3, seed: 8, rounds: 4, humans: [false, false, false] });
  playAll(st);
  assert.equal(st.phase, "gameOver");
  assert.equal(st.round, 4);
  assert.equal(st.scores.length, 4);
  for (let i = 0; i < 3; i++) assert.equal(st.totals[i], st.scores.reduce((a, r) => a + r[i], 0));
  const rows = L.standings(st);
  assert.equal(rows[0].total, Math.min(...st.totals));
  assert.deepEqual(rows, st.standings);
  assert.equal(L.nextRound(st), false, "no round after the last");
  const tie = { players: 3, names: ["A", "B", "C"], totals: [20, 10, 10] };
  assert.deepEqual(L.standings(tie).map((r) => r.name + r.rank), ["B1", "C1", "A3"]);
});

test("next round: new deal, new engine, trains cleared, markers off, starter rotates", () => {
  const st = L.newGame({ players: 3, seed: 2, rounds: 13, humans: [false, false, false] });
  assert.equal(st.starter, 0);
  while (st.phase === "play") L.applyAction(st, L.aiMove(st));
  assert.ok(L.nextRound(st));
  assert.equal(st.round, 2);
  assert.equal(st.engine, 11);
  assert.equal(st.starter, 1);
  assert.equal(st.turn, 1);
  assert.ok(st.trains.every((t) => t.tiles.length === 0 && t.end === 11));
  assert.ok(st.trains.slice(0, 3).every((t) => !t.open));
  assert.ok(st.firstTurn.every(Boolean));
  assert.equal(st.pending, null);
  st.hands.forEach((h) => assert.equal(h.length, 15));
  assert.ok(!st.hands.flat().concat(st.boneyard).some((t) => t[0] === 11 && t[1] === 11));
  assert.equal(st.totals.length, 3);
});

test("bestRun finds the longest continuous run from the engine and avoids ending on a double", () => {
  const run = L.bestRun([[12, 3], [3, 7], [7, 1], [9, 9], [12, 9], [1, 1], [2, 5]], 12);
  assert.deepEqual(run, [[12, 3], [3, 7], [7, 1], [1, 1]], "longest wins even when it ends on a double");
  assert.deepEqual(L.bestRun([[12, 3], [3, 7], [7, 1], [9, 9], [12, 9], [2, 5]], 12), [[12, 3], [3, 7], [7, 1]]);
  const run2 = L.bestRun([[12, 3], [12, 9], [9, 9], [3, 4]], 12);
  assert.deepEqual(run2, [[12, 3], [3, 4]], "same length, prefers not finishing on an unsatisfied double");
  const run3 = L.bestRun([[12, 9], [9, 9]], 12);
  assert.deepEqual(run3, [[12, 9], [9, 9]], "a double that empties the hand is fine");
  assert.deepEqual(L.bestRun([[1, 2], [3, 4]], 12), []);
  // stress: a 15 tile hand made of a dense number cluster finishes within the budget
  const dense = [];
  for (let a = 0; a <= 4; a++) for (let b = a; b <= 4; b++) dense.push([a, b]);
  const t0 = Date.now();
  const r = L.bestRun(dense, 0);
  assert.ok(r.length >= 10, "found a long run: " + r.length);
  assert.ok(Date.now() - t0 < 2000);
  for (let i = 1; i < r.length; i++) assert.equal(r[i][0], r[i - 1][1], "continuous");
});

test("AI uses the longest run on its first turn, prefers satisfying doubles, and closes its own marker", () => {
  const st = table({ keepFirst: true, hands: [[[12, 3], [3, 7], [7, 1], [9, 9], [12, 9]], [[12, 1]], [[12, 2]], [[12, 3]]], humans: [false, false, false, false] });
  const plays = [];
  while (st.turn === 0 && st.phase === "play") {
    const a = L.aiMove(st);
    if (a.type === "play") plays.push(key(a.move.tile));
    L.applyAction(st, a);
  }
  assert.deepEqual(plays, ["3-12", "3-7", "1-7"]);
  assert.equal(st.trains[0].open, false);
  const s2 = table({ hands: [[[12, 12], [12, 4], [2, 5]], [[12, 1]], [[12, 2]], [[12, 3]]], humans: [false, false, false, false] });
  const a = L.aiMove(s2);
  assert.equal(key(a.move.tile), "12-12", "plays the double it can satisfy");
  const s3 = table({ hands: [[[12, 12], [2, 5]], [[12, 1]], [[12, 2]], [[12, 3]]], humans: [false, false, false, false] });
  s3.hands[0].push([12, 4]); s3.trains[0].end = 4; s3.trains[0].tiles = [[12, 4]];
  s3.hands[0] = [[12, 12], [4, 9]];
  s3.trains[0].open = true;
  const a3 = L.aiMove(s3);
  assert.equal(key(a3.move.tile) + "@" + a3.move.train, "4-9@0", "closes its own marker rather than opening a double on the Mexican train");
});

test("AI only takes legal actions and every game terminates: 100 seeded games across 2, 4 and 8 players", () => {
  let games = 0, blocked = 0, out = 0;
  const plan = [[2, 34], [4, 33], [8, 33]];
  for (const [players, count] of plan) {
    for (let seed = 1; seed <= count; seed++) {
      const humans = Array.from({ length: players }, () => false);
      const st = L.newGame({ players, seed: seed * 7 + players, rounds: 4, humans });
      playAll(st);
      assert.equal(st.phase, "gameOver");
      assert.equal(st.scores.length, 4);
      st.lastRound.reason === "blocked" ? blocked++ : out++;
      games++;
    }
  }
  assert.equal(games, 100);
  assert.ok(out > 0 && blocked >= 0);
  // and a couple of full 13-round games
  for (const players of [3, 6]) {
    const st = L.newGame({ players, seed: 99 + players, rounds: 13, humans: Array.from({ length: players }, () => false) });
    playAll(st);
    assert.equal(st.scores.length, 13);
    assert.equal(st.lastRound.engine, 0);
  }
});

test("AI never cheats: it decides from a copy with other hands hidden", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const st = L.newGame({ players: 4, seed, rounds: 4, humans: [false, false, false, false] });
    let n = 0;
    while (st.phase === "play" && n++ < 300) {
      const blind = JSON.parse(JSON.stringify(st));
      for (let i = 0; i < 4; i++) if (i !== st.turn) blind.hands[i] = blind.hands[i].map(() => [0, 0]);
      const a = L.aiMove(blind), b = L.aiMove(st);
      assert.deepEqual(a, b, "decision changed when other hands were hidden, seed " + seed);
      L.applyAction(st, b);
    }
  }
});

test("pass and play: every seat human, named Player N, turns hand from one human to the next", () => {
  const st = L.newGame({ players: 3, seed: 4, humans: [true, true, true], names: ["", "Dot", ""] });
  assert.deepEqual(st.humans, [true, true, true]);
  assert.deepEqual(st.names, ["Player 1", "Dot", "Player 3"]);
  assert.equal(st.turn, 0);
  // each human seat gets its own first turn and the next human seat follows
  let seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(st.turn);
    assert.ok(st.firstTurn[st.turn]);
    L.applyAction(st, L.aiMove(st));
    while (st.turn === seen[seen.length - 1] && st.phase === "play") L.applyAction(st, L.aiMove(st));
  }
  assert.deepEqual(seen, [0, 1, 2]);
  const ai = L.newGame({ players: 3, seed: 4 });
  assert.deepEqual(ai.humans, [true, false, false]);
  assert.deepEqual(ai.names, ["You", "Mabel", "Otis"]);
  assert.equal(L.newGame({ players: 8, seed: 1 }).names.length, 8);
  assert.equal(new Set(L.newGame({ players: 8, seed: 1 }).names).size, 8, "names are distinct");
});

test("state is plain JSON: round trip continues identically, same seed same deal", () => {
  const a = L.newGame({ players: 5, seed: 1234, humans: [false, false, false, false, false] });
  const b = L.newGame({ players: 5, seed: 1234, humans: [false, false, false, false, false] });
  assert.deepEqual(a, b);
  for (let i = 0; i < 40 && a.phase === "play"; i++) L.applyAction(a, L.aiMove(a));
  const c = JSON.parse(JSON.stringify(a));
  assert.deepEqual(c, a);
  for (let i = 0; i < 60; i++) {
    if (a.phase === "roundOver") { L.nextRound(a); L.nextRound(c); continue; }
    if (a.phase !== "play") break;
    L.applyAction(a, L.aiMove(a)); L.applyAction(c, L.aiMove(c));
    assert.deepEqual(c, a);
  }
  const d = L.newGame({ players: 5, seed: 4321 });
  assert.notDeepEqual(d.hands, b.hands);
});

test("sortHand: by high number or by pip total, never mutating", () => {
  const h = [[1, 2], [0, 0], [12, 12], [3, 9]];
  assert.deepEqual(L.sortHand(h, "number").map(key), ["12-12", "3-9", "1-2", "0-0"]);
  assert.deepEqual(L.sortHand(h, "pips").map(key), ["12-12", "3-9", "1-2", "0-0"]);
  assert.deepEqual(L.sortHand([[5, 5], [1, 9]], "pips").map(key), ["1-9", "5-5"], "equal pips: higher number first");
  assert.deepEqual(L.sortHand([[5, 5], [1, 9]], "number").map(key), ["1-9", "5-5"]);
  assert.deepEqual(h[0], [1, 2]);
});

test("guards: no action outside the play phase, bad moves refused", () => {
  const st = table({ hands: [[[12, 5]], [[12, 1]], [[12, 2]], [[12, 3]]] });
  assert.equal(L.play(st, { tile: [12, 5], train: 9 }), false);
  assert.equal(L.play(st, { tile: [1, 1], train: 0 }), false, "tile not in hand");
  assert.equal(L.play(st, null), false);
  L.play(st, { tile: [12, 5], train: 0 });
  assert.equal(st.phase, "roundOver");
  assert.deepEqual(L.legalMoves(st), []);
  assert.equal(L.draw(st), null);
  assert.equal(L.pass(st), false);
  assert.equal(L.aiMove(st), null);
});

test("page contract: base href, noindex, relative assets, no em dash, no external URLs", () => {
  const dir = path.join(__dirname, "..", "private", "mexican-train");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/mexican-train/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/mexican-train\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('name="theme-color" content="#F3EDE3"'));
  assert.ok(html.includes('href="/play/"'));
  assert.match(html, /back to games|>games</);
  assert.ok(html.includes("<title>Mexican Train</title>"));
  assert.ok(html.includes('href="style.css"') && html.includes('src="app.js"') && html.includes('src="logic.js"'));
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  for (const f of ["marcellus", "jost-400", "jost-500", "jost-600"]) assert.ok(css.includes("/fonts/" + f + ".woff2"), f);
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!txt.includes(DASH), "em dash in " + f);
    assert.ok(!/https?:\/\//.test(txt.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "external URL in " + f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(DASH));
  const logic = fs.readFileSync(path.join(dir, "logic.js"), "utf8");
  assert.ok(!logic.match(/document\.|window\.|Date\.|Math\.random/), "logic has no DOM, clock or unseeded randomness");
  assert.ok(fs.readFileSync(path.join(dir, "app.js"), "utf8").includes("kz.mexican-train.save.v1"));
});
