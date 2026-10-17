"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/dominoes/logic.js");

const DASH = String.fromCharCode(0x2014);
const T = (a, b) => [a, b];

// Build a mid-hand position without going through the deal.
function setup(o) {
  const st = L.newGame({ players: o.hands.length, mode: o.mode || "fives", seed: o.seed || 1, humans: o.humans || [], target: o.target });
  st.hands = o.hands.map((h) => h.map((t) => t.slice()));
  st.boneyard = (o.boneyard || []).map((t) => t.slice());
  st.turn = o.turn || 0;
  st.starter = st.turn;
  if (o.scores) st.scores = o.scores.slice();
  st.board = L.emptyBoard();
  for (const m of o.plays || []) {
    const [tile, end] = m;
    const inner = end === "S" ? tile[0] : L.openEnds(st).find((e) => e.end === end).value;
    const placed = tile[0] === inner ? [tile[0], tile[1]] : [tile[1], tile[0]];
    st.board.seq.push({ tile: tile.slice(), end, placed, seat: 0 });
    L.applyToBoard(st.board, { tile, end, placed }, st.mode);
  }
  return st;
}
function ends(st) { return L.openEnds(st).map((e) => e.end + e.value).sort().join(" "); }
function playAll(seedBase, mode, players) {
  const st = L.newGame({ players, mode, seed: seedBase, humans: [] });
  let guard = 0, plays = 0, draws = 0, passes = 0;
  while (st.phase !== "gameover") {
    if (++guard > 5000) throw new Error("runaway game " + mode + " " + players + " seed " + seedBase);
    if (st.phase === "roundover") { assert.ok(L.nextRound(st)); continue; }
    const before = JSON.stringify(st.hands);
    const a = L.aiMove(st);
    assert.ok(a, "AI returned nothing while the hand was live");
    if (a.type === "play") {
      const legal = L.legalMoves(st).some((m) => m.end === a.move.end && L.sameTile(m.tile, a.move.tile) && m.placed.join() === a.move.placed.join());
      assert.ok(legal, "AI chose an illegal move " + JSON.stringify(a.move) + " seed " + seedBase);
      assert.ok(L.play(st, a.move)); plays++;
    } else if (a.type === "draw") {
      assert.equal(L.legalMoves(st).length, 0, "AI drew while it could play");
      assert.ok(st.boneyard.length > 2, "AI drew from a boneyard of 2 or fewer");
      assert.ok(L.draw(st)); draws++;
    } else {
      assert.equal(a.type, "pass");
      assert.equal(L.legalMoves(st).length, 0, "AI passed while it could play");
      assert.ok(st.boneyard.length <= 2, "AI passed while it could still draw");
      assert.ok(L.pass(st)); passes++;
    }
    assert.notEqual(before, undefined);
  }
  return { st, plays, draws, passes };
}

test("the double six set has 28 distinct tiles worth 168 pips", () => {
  assert.equal(L.TILES.length, 28);
  const keys = new Set(L.TILES.map(L.key));
  assert.equal(keys.size, 28);
  assert.equal(L.pipCount(L.TILES), 168);
  assert.equal(L.TILES.filter(L.isDouble).length, 7);
});

test("dealing: 7 each for two players, 5 each for three and four, boneyard holds the rest, hands sorted", () => {
  for (const n of [2, 3, 4]) {
    const st = L.newGame({ players: n, seed: 11 });
    const per = n === 2 ? 7 : 5;
    st.hands.forEach((h) => {
      assert.equal(h.length, per);
      for (let i = 1; i < h.length; i++) assert.ok(h[i - 1][0] < h[i][0] || (h[i - 1][0] === h[i][0] && h[i - 1][1] <= h[i][1]), "sorted");
    });
    assert.equal(st.boneyard.length, 28 - n * per);
    const all = new Set([].concat(...st.hands, st.boneyard).map(L.key));
    assert.equal(all.size, 28, "every tile is dealt or in the boneyard exactly once");
    assert.equal(st.scores.length, n);
    assert.equal(st.names.length, n);
  }
});

test("round one opens with the holder of the highest double, who may lead any tile", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const st = L.newGame({ players: 4, seed });
    let best = -1, seat = -1;
    st.hands.forEach((h, i) => h.forEach((t) => { if (L.isDouble(t) && t[0] > best) { best = t[0]; seat = i; } }));
    if (best >= 0) assert.equal(st.turn, seat, "seed " + seed);
    assert.equal(L.legalMoves(st).length, st.hands[st.turn].length);
    assert.ok(L.legalMoves(st).every((m) => m.end === "S"));
  }
});

test("seed determinism and JSON round trip", () => {
  const a = L.newGame({ players: 3, seed: 42, mode: "fives" });
  const b = L.newGame({ players: 3, seed: 42, mode: "fives" });
  assert.deepEqual(a, b);
  const c = L.newGame({ players: 3, seed: 43, mode: "fives" });
  assert.notDeepEqual(a.hands, c.hands);
  for (let i = 0; i < 12 && a.phase === "play"; i++) { L.aiStep(a); L.aiStep(b); }
  assert.deepEqual(a, b);
  const copy = JSON.parse(JSON.stringify(a));
  assert.deepEqual(copy, a);
  while (copy.phase === "play") { L.aiStep(copy); L.aiStep(a); }
  assert.deepEqual(copy, a);
  assert.deepEqual(L.layoutBoard(copy), L.layoutBoard(a));
});

test("spinner mechanics: side arms open only once both ends of the spinner are played, then all four arms take tiles", () => {
  const st = setup({ mode: "fives", hands: [[T(5, 5), T(5, 3), T(5, 0), T(5, 2), T(1, 5), T(3, 3)], [T(6, 6)]], turn: 0 });
  st.humans = [true, true]; // keep the turn with seat 0 by never advancing: we drive play() and reset turn
  assert.ok(L.play(st, { tile: T(5, 5), end: "S" }));
  assert.equal(st.board.spinner, 0);
  st.turn = 0;
  assert.equal(ends(st), "L5 R5", "a lone spinner has only its two sides");
  assert.ok(L.play(st, { tile: T(5, 3), end: "R" })); st.turn = 0;
  assert.equal(ends(st), "L5 R3", "one side played: arms still closed");
  assert.ok(L.play(st, { tile: T(5, 0), end: "L" })); st.turn = 0;
  assert.equal(ends(st), "D5 L0 R3 U5", "both sides played: up and down open on the spinner value");
  assert.ok(L.play(st, { tile: T(5, 2), end: "U" })); st.turn = 0;
  assert.equal(ends(st), "D5 L0 R3 U2");
  assert.ok(L.play(st, { tile: T(1, 5), end: "D" })); st.turn = 0;
  assert.equal(ends(st), "D1 L0 R3 U2");
  assert.equal(st.board.up.length, 1);
  assert.equal(st.board.down.length, 1);
  assert.equal(L.legalMoves(st).length, 1, "3-3 fits only the right end");
  assert.equal(L.legalMoves(st)[0].end, "R");
  // a second double never becomes a spinner
  assert.ok(L.play(st, { tile: T(3, 3), end: "R" }));
  assert.equal(st.board.spinner, 1, "spinner index tracks the left plays");
  assert.equal(st.board.spinnerVal, 5);
});

test("the spinner can appear later in the line and keeps its index when tiles go left of it", () => {
  const st = setup({ mode: "fives", hands: [[T(2, 3), T(3, 3), T(3, 1), T(2, 6)], [T(6, 6)]], turn: 0 });
  st.humans = [true, true];
  L.play(st, { tile: T(2, 3), end: "S" }); st.turn = 0;
  assert.equal(st.board.spinner, -1);
  L.play(st, { tile: T(3, 3), end: "R" }); st.turn = 0;
  assert.equal(st.board.spinner, 1);
  assert.equal(ends(st), "L2 R3", "spinner on the end: arms closed");
  L.play(st, { tile: T(2, 6), end: "L" }); st.turn = 0;
  assert.equal(st.board.spinner, 2);
  assert.equal(ends(st), "L6 R3", "still on the end");
  L.play(st, { tile: T(3, 1), end: "R" }); st.turn = 0;
  assert.equal(ends(st), "D3 L6 R1 U3");
});

test("block mode has no spinner and never opens side arms", () => {
  const st = setup({ mode: "block", hands: [[T(5, 5), T(5, 3), T(5, 0), T(5, 2)], [T(6, 6)]], turn: 0 });
  st.humans = [true, true];
  L.play(st, { tile: T(5, 5), end: "S" }); st.turn = 0;
  L.play(st, { tile: T(5, 3), end: "R" }); st.turn = 0;
  L.play(st, { tile: T(5, 0), end: "L" }); st.turn = 0;
  assert.equal(st.board.spinner, -1);
  assert.equal(ends(st), "L0 R3");
  assert.equal(L.legalMoves(st).length, 0, "5-2 has nowhere to go without arms");
  assert.equal(L.fivesPoints(st), 0, "no scoring during a block hand");
});

test("end sum: lone spinner counts both halves, then one side, then only the arms once both sides are played", () => {
  const st = setup({ mode: "fives", hands: [[T(5, 5), T(5, 3), T(5, 0), T(5, 2), T(1, 5), T(2, 2)], [T(6, 6)]], turn: 0 });
  st.humans = [true, true];
  assert.equal(L.endsSum(st), 0, "empty table");
  L.play(st, { tile: T(5, 5), end: "S" }); st.turn = 0;
  assert.equal(L.endsSum(st), 10);
  assert.equal(st.scores[0], 10, "double five scores ten on the open");
  L.play(st, { tile: T(5, 3), end: "R" }); st.turn = 0;
  assert.equal(L.endsSum(st), 13, "spinner still counts 10 with one side open");
  L.play(st, { tile: T(5, 0), end: "L" }); st.turn = 0;
  assert.equal(L.endsSum(st), 3, "spinner stops counting; empty arms count nothing");
  L.play(st, { tile: T(5, 2), end: "U" }); st.turn = 0;
  assert.equal(L.endsSum(st), 5);
  assert.equal(st.scores[0], 15, "0 + 3 + 2 = 5 scores five");
  L.play(st, { tile: T(1, 5), end: "D" }); st.turn = 0;
  assert.equal(L.endsSum(st), 6);
  L.play(st, { tile: T(2, 2), end: "U" }); st.turn = 0;
  assert.equal(L.endsSum(st), 0 + 3 + 4 + 1, "a double on an arm end counts both halves");
});

test("a double at an end of the main line counts both halves; a non-double first tile counts both ends", () => {
  const a = setup({ mode: "fives", hands: [[T(6, 4), T(4, 4), T(6, 6)], [T(0, 0)]], turn: 0 });
  a.humans = [true, true];
  L.play(a, { tile: T(6, 4), end: "S" }); a.turn = 0;
  assert.equal(L.endsSum(a), 10);
  assert.equal(a.scores[0], 10);
  L.play(a, { tile: T(4, 4), end: "R" }); a.turn = 0;
  assert.equal(L.endsSum(a), 6 + 8);
  L.play(a, { tile: T(6, 6), end: "L" }); a.turn = 0;
  assert.equal(L.endsSum(a), 12 + 8);
  assert.equal(a.scores[0], 30, "twenty more");
  assert.equal(L.roundTo5(12), 10);
  assert.equal(L.roundTo5(13), 15);
  assert.equal(L.roundTo5(7), 5);
  assert.equal(L.roundTo5(8), 10);
  assert.equal(L.roundTo5(0), 0);
});

test("legal moves carry the orientation: the inner pip always matches the end", () => {
  const st = setup({ mode: "fives", hands: [[T(1, 4), T(4, 6), T(2, 4), T(0, 1)], [T(0, 0)]], plays: [[T(1, 4), "S"]], turn: 0 });
  st.hands[0] = [T(4, 6), T(2, 4), T(0, 1), T(3, 3)];
  const ms = L.legalMoves(st);
  const ev = Object.fromEntries(L.openEnds(st).map((e) => [e.end, e.value]));
  assert.equal(ms.length, 3);
  for (const m of ms) assert.equal(m.placed[0], ev[m.end], "inner half matches " + m.end);
  assert.deepEqual(ms.find((m) => L.key(m.tile) === "2-4").placed, [4, 2]);
  assert.deepEqual(ms.find((m) => L.key(m.tile) === "0-1").placed, [1, 0]);
  assert.equal(L.play(st, { tile: T(3, 3), end: "R" }), false, "unplayable tile is refused");
  assert.equal(L.play(st, { tile: T(4, 6), end: "L" }), false, "wrong end is refused");
  assert.equal(L.legalMoves(st, 1).length, 0, "not that seat's turn");
  assert.ok(L.play(st, { tile: T(4, 6), end: "R" }));
  assert.deepEqual(st.board.main, [[1, 4], [4, 6]]);
});

test("draw rule: draw until playable while the boneyard keeps two, then pass; drawing and passing are refused otherwise", () => {
  const st = setup({
    mode: "fives", hands: [[T(0, 0), T(1, 1)], [T(6, 6)]], plays: [[T(5, 4), "S"]],
    boneyard: [T(2, 2), T(3, 3), T(2, 5), T(6, 3)], turn: 0
  });
  assert.equal(L.legalMoves(st).length, 0);
  assert.equal(L.canPass(st), false, "must draw while the boneyard has more than two");
  assert.equal(L.pass(st), false);
  assert.ok(L.canDraw(st));
  assert.ok(L.draw(st));
  assert.equal(st.hands[0].length, 3);
  assert.equal(st.turn, 0, "drawing keeps the turn");
  assert.equal(L.key(st.lastAction.tile), "3-6");
  assert.equal(L.legalMoves(st).length, 0, "6-3 does not fit 5 or 4");
  assert.ok(L.draw(st));
  assert.equal(L.key(st.lastAction.tile), "2-5");
  assert.equal(L.legalMoves(st).length, 1, "now playable");
  assert.equal(L.canDraw(st), false, "cannot draw once a play exists");
  assert.equal(L.draw(st), false);
  assert.equal(L.canPass(st), false);
  assert.equal(st.boneyard.length, 2);
  // A player who still cannot play with two left must pass.
  const st2 = setup({ mode: "fives", hands: [[T(0, 0)], [T(6, 6)]], plays: [[T(5, 4), "S"]], boneyard: [T(2, 2), T(3, 3)], turn: 0 });
  assert.equal(L.canDraw(st2), false, "the last two tiles stay in the boneyard");
  assert.ok(L.canPass(st2));
  assert.ok(L.pass(st2));
  assert.equal(st2.turn, 1);
  assert.deepEqual(st2.passes[0], { seat: 0, ends: [5, 4] });
  assert.ok(st2.passed[0][5] && st2.passed[0][4], "pass records the suits publicly");
});

test("blocked hand: everyone passes in turn, lowest pip count scores the others' pips rounded to five (fives) or exactly (block)", () => {
  const mk = (mode) => setup({ mode, hands: [[T(0, 0), T(1, 1)], [T(2, 2), T(3, 3)], [T(6, 6)]], plays: [[T(5, 4), "S"]], boneyard: [T(1, 2), T(2, 3)], turn: 0 });
  const f = mk("fives");
  assert.ok(L.isBlocked(f));
  assert.ok(L.pass(f)); assert.equal(f.phase, "play");
  assert.ok(L.pass(f)); assert.equal(f.phase, "play");
  assert.ok(L.pass(f));
  assert.equal(f.phase, "roundover");
  assert.equal(f.roundResult.kind, "blocked");
  assert.equal(f.roundResult.winner, 0, "two pips beats ten and twelve");
  assert.deepEqual(f.roundResult.pips, [2, 10, 12]);
  assert.equal(f.roundResult.raw, 22);
  assert.equal(f.roundResult.points, 20, "22 rounds to 20");
  assert.equal(f.scores[0], 20);
  const b = mk("block");
  L.pass(b); L.pass(b); L.pass(b);
  assert.equal(b.roundResult.points, 22, "block mode scores exact pips");
  assert.equal(b.scores[0], 22);
  assert.equal(b.nextStarter, 0, "the hand winner leads next");
});

test("a blocked hand with tied low counts scores nobody and the lead rotates", () => {
  const st = setup({ mode: "block", hands: [[T(1, 1)], [T(0, 2)], [T(6, 6)]], plays: [[T(5, 4), "S"]], boneyard: [T(1, 2), T(2, 3)], turn: 1 });
  L.pass(st); L.pass(st); L.pass(st);
  assert.equal(st.roundResult.winner, -1);
  assert.equal(st.roundResult.points, 0);
  assert.deepEqual(st.scores, [0, 0, 0]);
  assert.equal(st.nextStarter, 2, "seat after the starter leads");
});

test("going out: the dominoing player scores the others' pips, rounded to five in All Fives", () => {
  const f = setup({ mode: "fives", hands: [[T(5, 1)], [T(6, 6), T(0, 1)], [T(0, 0)]], plays: [[T(5, 4), "S"]], turn: 0 });
  assert.ok(L.play(f, { tile: T(5, 1), end: "L" }));
  assert.equal(f.phase, "roundover");
  assert.equal(f.roundResult.kind, "domino");
  assert.equal(f.roundResult.winner, 0);
  assert.equal(f.roundResult.raw, 13);
  assert.equal(f.roundResult.points, 15, "13 rounds up to 15");
  assert.equal(f.scores[0], 15 + 5, "plus the five scored by 1 + 4 on the ends");
  const b = setup({ mode: "block", hands: [[T(5, 1)], [T(6, 6), T(0, 1)], [T(0, 0)]], plays: [[T(5, 4), "S"]], turn: 0 });
  L.play(b, { tile: T(5, 1), end: "L" });
  assert.equal(b.roundResult.points, 13);
  assert.equal(b.scores[0], 13);
});

test("win detection: the first to the target after a hand wins; a tie at the top plays on", () => {
  const st = setup({ mode: "fives", target: 100, scores: [90, 40], hands: [[T(5, 1)], [T(6, 6)]], plays: [[T(5, 4), "S"]], turn: 0 });
  L.play(st, { tile: T(5, 1), end: "L" });
  assert.equal(st.roundResult.final, true);
  assert.equal(st.winner, 0);
  assert.ok(L.nextRound(st));
  assert.equal(st.phase, "gameover");
  assert.equal(L.aiMove(st), null);
  const tie = setup({ mode: "block", target: 100, scores: [88, 100], hands: [[T(5, 1)], [T(6, 6)]], plays: [[T(5, 4), "S"]], turn: 0 });
  L.play(tie, { tile: T(5, 1), end: "L" });
  assert.deepEqual(tie.scores, [100, 100]);
  assert.equal(tie.roundResult.final, false);
  assert.equal(tie.winner, -1);
  L.nextRound(tie);
  assert.equal(tie.phase, "play");
  assert.equal(tie.round, 2);
  assert.equal(tie.turn, 0, "hand winner leads the next hand");
  assert.equal(tie.hands[0].length, 7);
});

test("mid-hand scoring only counts positive multiples of five", () => {
  const st = setup({ mode: "fives", hands: [[T(0, 0), T(0, 5), T(6, 4)], [T(6, 6)]], turn: 0 });
  st.humans = [true, true];
  L.play(st, { tile: T(0, 0), end: "S" }); st.turn = 0;
  assert.equal(L.endsSum(st), 0);
  assert.equal(st.scores[0], 0, "zero is not a score");
  L.play(st, { tile: T(0, 5), end: "R" }); st.turn = 0;
  assert.equal(st.scores[0], 5, "0-0 counts nothing, five on the right");
  assert.equal(st.lastAction.points, 5);
});

test("pass and play: a hand off is required whenever the phone moves to another human", () => {
  const st = L.newGame({ players: 3, humans: "all", seed: 5 });
  assert.deepEqual(st.humans, [true, true, true]);
  assert.deepEqual(st.names, ["Player 1", "Player 2", "Player 3"]);
  assert.equal(st.handoff, true, "the opening player must take the phone first");
  L.confirmHandoff(st);
  assert.equal(st.handoff, false);
  assert.equal(st.lastHuman, st.turn);
  const seat = st.turn;
  L.play(st, L.legalMoves(st)[0]);
  assert.equal(st.turn, (seat + 1) % 3);
  assert.equal(st.handoff, true, "next human needs the phone");
  L.confirmHandoff(st);
  // drawing keeps the phone with the same player
  const d = setup({ mode: "fives", hands: [[T(0, 0)], [T(6, 6)]], humans: "all", plays: [[T(5, 4), "S"]], boneyard: [T(1, 2), T(2, 3), T(3, 3)], turn: 0 });
  L.confirmHandoff(d);
  L.draw(d);
  assert.equal(d.handoff, false);
  const ai = L.newGame({ players: 2, seed: 5 });
  assert.deepEqual(ai.humans, [true, false]);
  assert.deepEqual(ai.names, ["You", "Marisol"]);
  assert.equal(ai.handoff, false, "single human never hands off");
  while (ai.phase === "play") { L.aiStep(ai); assert.equal(ai.handoff, false); }
  const mixed = L.newGame({ players: 4, humans: [true, false, true, false], names: ["Kev", null, "Sam", null], seed: 2 });
  assert.deepEqual(mixed.names, ["Kev", "Marisol", "Sam", "Teodoro"]);
});

test("the computer only sees its own hand, the table, passes and counts", () => {
  const st = L.newGame({ players: 3, seed: 9, humans: [] });
  L.aiStep(st); L.aiStep(st);
  const v = L.aiView(st, st.turn);
  assert.deepEqual(Object.keys(v).sort(), ["board", "boneyard", "counts", "hand", "mode", "n", "passed", "scores", "seat", "target"]);
  assert.equal(typeof v.boneyard, "number");
  assert.deepEqual(v.hand, st.hands[st.turn]);
  const want = L.aiMove(st);
  // swapping the other hands and the boneyard changes nothing about the choice
  const alt = JSON.parse(JSON.stringify(st));
  const others = alt.hands.map((h, i) => i === alt.turn ? h : alt.boneyard.splice(0, h.length));
  alt.hands = others;
  const got = L.aiMove(alt);
  assert.deepEqual(got, want);
});

test("the computer takes points in All Fives and blocks a player known to be out of a suit", () => {
  const st = setup({ mode: "fives", hands: [[T(5, 1), T(5, 0)], [T(6, 6)]], plays: [[T(5, 5), "S"]], turn: 0 });
  const a = L.aiMove(st);
  assert.equal(a.type, "play");
  assert.equal(L.key(a.move.tile), "0-5", "10 + 0 scores ten, 10 + 1 scores nothing");
  const score = setup({ mode: "fives", hands: [[T(4, 1), T(4, 3)], [T(6, 6)]], plays: [[T(4, 2), "S"]], turn: 0 });
  assert.equal(L.key(L.aiMove(score).move.tile), "3-4", "3 + 2 = 5 scores, 1 + 2 does not");
  const blk = setup({ mode: "block", hands: [[T(3, 1), T(3, 2)], [T(6, 6), T(1, 1)]], plays: [[T(3, 4), "S"]], turn: 0 });
  blk.passed[1] = { 2: true };
  assert.equal(L.key(L.aiMove(blk).move.tile), "2-3", "leave the suit the opponent passed on");
  const shed = setup({ mode: "block", hands: [[T(3, 1), T(3, 6)], [T(6, 6), T(1, 1)]], plays: [[T(3, 4), "S"]], turn: 0 });
  assert.equal(L.key(L.aiMove(shed).move.tile), "3-6", "with nothing else to go on, shed the heavier tile");
});

test("AI legality and termination over 240 seeded games: both modes, 2, 3 and 4 players", () => {
  let games = 0;
  for (const mode of ["fives", "block"]) for (const players of [2, 3, 4]) for (let seed = 1; seed <= 40; seed++) {
    const r = playAll(seed * 7 + players, mode, players);
    games++;
    const st = r.st;
    assert.equal(st.phase, "gameover");
    assert.ok(st.winner >= 0 && st.winner < players);
    assert.ok(st.scores[st.winner] >= st.target, "winner reached the target");
    st.scores.forEach((s, i) => { if (i !== st.winner) assert.ok(s < st.scores[st.winner]); });
    if (mode === "fives") st.scores.forEach((s) => assert.equal(s % 5, 0, "all fives scores are multiples of five"));
    assert.ok(r.plays > 0);
  }
  assert.equal(games, 240);
});

test("every hand conserves the 28 tiles between hands, table and boneyard", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = L.newGame({ players: 4, seed, humans: [] });
    let guard = 0;
    while (st.phase === "play" && guard++ < 400) {
      L.aiStep(st);
      const all = [].concat(...st.hands, st.boneyard, st.board.main, st.board.up, st.board.down).map(L.key);
      assert.equal(new Set(all).size, 28, "seed " + seed);
      assert.equal(all.length, 28);
    }
  }
});

test("layout: anchor at the origin, tiles never overlap, arms turn before the table edge, open ends have tap targets", () => {
  for (const mode of ["fives", "block"]) for (const bounds of [undefined, { bx: 12, by: 10 }]) for (let seed = 1; seed <= 40; seed++) {
    const st = L.newGame({ players: 2, mode, seed, humans: [] });
    let guard = 0;
    while (st.phase === "play" && guard++ < 200) {
      L.aiStep(st);
      const lay = L.layoutBoard(st, bounds);
      const seen = new Set();
      for (const t of lay.tiles) for (const c of t.cells) { assert.ok(!seen.has(c), "overlap in " + mode + " seed " + seed); seen.add(c); }
      assert.equal(lay.tiles.length, st.board.main.length + st.board.up.length + st.board.down.length);
      assert.equal(lay.heads.length, L.openEnds(st).length);
      const anchor = lay.tiles[0];
      assert.equal(anchor.cx, 0); assert.equal(anchor.cy, 0);
      if (st.board.spinner >= 0) assert.equal(anchor.key, L.key(st.board.main[st.board.spinner]));
      assert.ok(lay.bbox.x1 - lay.bbox.x0 <= 40 && lay.bbox.y1 - lay.bbox.y0 <= (bounds ? 56 : 44), "layout stays compact: " + JSON.stringify(lay.bbox));
      for (const h of lay.heads) assert.ok(["L", "R", "U", "D"].includes(h.end));
    }
  }
  const e = L.newGame({ players: 2, seed: 1 });
  assert.deepEqual(L.layoutBoard(e).tiles, []);
});

test("pip counts and helpers", () => {
  const st = setup({ hands: [[T(6, 6), T(0, 1)], [T(2, 3)]], turn: 0 });
  assert.deepEqual(L.pipCounts(st), [13, 5]);
  assert.equal(L.humanCount(st), 0);
  assert.equal(L.sameTile([3, 1], [1, 3]), true);
  assert.deepEqual(L.sortHand([[6, 6], [0, 1], [0, 0]]), [[0, 0], [0, 1], [6, 6]]);
});

test("page contract: base href, noindex, relative assets, no em dash, no external URLs", () => {
  const dir = path.join(__dirname, "..", "private", "dominoes");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/dominoes/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/dominoes\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('name="theme-color" content="#F3EDE3"'));
  assert.ok(html.includes('href="/play/"'));
  assert.ok(html.includes("<title>Dominoes</title>"));
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
  assert.ok(!logic.match(/document\.|window\.|Math\.random|Date\./), "logic has no DOM, clock or unseeded randomness");
  const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  assert.ok(app.includes("kz.dominoes.save.v1"));
  assert.ok(app.includes("prefers-reduced-motion") || css.includes("prefers-reduced-motion"));
  assert.ok(app.includes("window.__dominoes"));
});
