"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/stratego/logic.js");

const R = L.RED, B = L.BLUE;
const DASH = String.fromCharCode(0x2014);
const at = (r, c) => r * 10 + c; // 0-indexed row/col

function rand32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function breakdown(s, side) {
  const c = new Array(12).fill(0);
  s.board.forEach((p) => { if (p && p.o === side) c[p.r]++; });
  return c;
}
function sorted(ms) { return ms.map((m) => m.from + ">" + m.to).sort(); }
// A tiny arena: two far-apart Marshals so the board is otherwise controlled.
function arena(list, turn) { return L.fromPieces(list, { turn: turn === undefined ? R : turn }); }

function playVsRandom(seed, aiSide) {
  const s = L.newGame({ seed });
  if (aiSide === R) L.aiSetup(s, R); else L.randomSetup(s);
  L.startGame(s);
  const r = rand32(seed ^ 0x9e3779b9);
  let guard = 0;
  while (s.phase === "play") {
    if (++guard > 2000) throw new Error("runaway game, seed " + seed);
    if (s.turn === aiSide) {
      const mv = L.aiMove(s);
      assert.ok(mv, "AI had no move though the game was running");
      const legal = new Set(sorted(L.legalMoves(s)));
      assert.ok(legal.has(mv.from + ">" + mv.to), "AI chose an illegal move, seed " + seed);
      assert.ok(L.move(s, mv.from, mv.to));
    } else {
      const ms = L.legalMoves(s);
      const m = ms[Math.floor(r() * ms.length)];
      assert.ok(L.move(s, m.from, m.to));
    }
  }
  return s;
}

test("each side has the standard 40 pieces after setup", () => {
  const s = L.newGame({ seed: 5 });
  L.randomSetup(s);
  const expect = [1, 1, 8, 5, 4, 4, 4, 3, 2, 1, 1, 6];
  assert.deepEqual(L.COUNTS, expect);
  assert.equal(expect.reduce((a, b) => a + b, 0), 40);
  assert.deepEqual(breakdown(s, R), expect);
  assert.deepEqual(breakdown(s, B), expect);
  assert.equal(L.setupComplete(s), true);
  assert.equal(L.NAMES[10], "Marshal");
  assert.equal(L.NAMES[2], "Scout");
});

test("lakes are columns 3-4 and 7-8 on rows 5-6 (1-indexed)", () => {
  const lakes = [];
  for (let i = 0; i < 100; i++) if (L.isLake(i)) lakes.push(i);
  const want = [];
  for (const r of [4, 5]) for (const c of [2, 3, 6, 7]) want.push(r * 10 + c);
  assert.deepEqual(lakes, want);
  assert.equal(lakes.length, 8);
});

test("setup areas: Blue on rows 1-4, Red on rows 7-10, the AI never places in the middle", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = L.newGame({ seed });
    L.randomSetup(s);
    s.board.forEach((p, i) => {
      if (!p) return;
      const row = Math.floor(i / 10) + 1;
      if (p.o === B) assert.ok(row <= 4, "blue piece on row " + row);
      else assert.ok(row >= 7, "red piece on row " + row);
    });
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / 10);
      if (row >= 4 && row <= 5) assert.equal(s.board[i], null);
    }
  }
  const s = L.newGame({ seed: 1 });
  assert.equal(L.placePiece(s, 10, at(5, 0)), false, "cannot place outside own rows");
  assert.equal(L.placePiece(s, 10, at(3, 0)), false, "cannot place in Blue's rows");
  assert.equal(L.placePiece(s, 10, at(6, 0)), true);
});

test("AI setups put the flag on the back row and vary across seeds", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 120; seed++) {
    const s = L.newGame({ seed });
    const f = s.board.findIndex((p) => p && p.o === B && p.r === L.FLAG);
    assert.equal(Math.floor(f / 10), 0, "flag on Blue's back row");
    seen.add(s.board.map((p) => (p && p.o === B ? p.r : "-")).join(","));
  }
  assert.ok(seen.size > 100, "setups vary: " + seen.size);
});

test("setup tray: place, replace, swap, remove, clear, presets, start", () => {
  const s = L.newGame({ seed: 9 });
  assert.equal(L.trayCounts(s)[10], 1);
  assert.ok(L.placePiece(s, 10, at(9, 4)));
  assert.equal(L.trayCounts(s)[10], 0);
  assert.equal(L.placePiece(s, 10, at(9, 5)), false, "only one marshal");
  assert.ok(L.placePiece(s, 9, at(9, 5)));
  assert.ok(L.swapPieces(s, at(9, 4), at(9, 5)));
  assert.equal(s.board[at(9, 4)].r, 9);
  assert.equal(s.board[at(9, 5)].r, 10);
  assert.ok(L.swapPieces(s, at(9, 4), at(9, 0)), "moving into an empty cell");
  assert.equal(s.board[at(9, 0)].r, 9);
  assert.ok(L.placePiece(s, 2, at(9, 0)), "replace returns the old piece to the tray");
  assert.equal(L.trayCounts(s)[9], 1);
  assert.ok(L.removePiece(s, at(9, 0)));
  assert.equal(L.startGame(s), false, "start needs all 40");
  L.clearSetup(s);
  assert.equal(L.placedCount(s, R), 0);
  assert.equal(L.placedCount(s, B), 40, "clear does not touch Blue");
  for (const kind of ["defensive", "aggressive"]) {
    assert.ok(L.presetSetup(s, kind));
    assert.deepEqual(breakdown(s, R), L.COUNTS);
  }
  L.presetSetup(s, "defensive");
  const f = s.board.findIndex((p) => p && p.o === R && p.r === L.FLAG);
  assert.equal(Math.floor(f / 10), 9, "defensive flag on the back row");
  const around = L.NB[f].filter((j) => s.board[j] && s.board[j].r === L.BOMB).length;
  assert.ok(around >= 3, "bombs around the flag");
  assert.ok(L.startGame(s));
  assert.equal(s.phase, "play");
  assert.equal(s.turn, R, "Red moves first");
});

test("normal pieces step one orthogonal square onto empty or enemy squares", () => {
  const s = arena([[R, 4, at(7, 4)], [R, 5, at(7, 5)], [B, 4, at(6, 4)], [R, 10, at(9, 9)], [B, 10, at(0, 0)]]);
  const m = L.destinations(s, at(7, 4)).sort((a, b) => a - b);
  assert.deepEqual(m, [at(6, 4), at(7, 3), at(8, 4)].sort((a, b) => a - b), "friend blocks, enemy attackable");
  // lake blocks
  const t = arena([[R, 4, at(6, 2)], [B, 10, at(0, 0)]]);
  assert.deepEqual(L.destinations(t, at(6, 2)).sort((a, b) => a - b), [at(6, 1), at(6, 3), at(7, 2)].sort((a, b) => a - b));
  // corner
  const c = arena([[R, 4, at(9, 9)], [B, 10, at(0, 0)]]);
  assert.deepEqual(L.destinations(c, at(9, 9)).sort((a, b) => a - b), [at(8, 9), at(9, 8)].sort((a, b) => a - b));
});

test("scouts slide any distance, stop at pieces, attack at the end, and cannot cross lakes", () => {
  const s = arena([[R, 2, at(6, 0)], [R, 4, at(6, 3)], [B, 4, at(3, 0)], [B, 10, at(0, 9)], [R, 10, at(9, 9)]]);
  const d = L.destinations(s, at(6, 0));
  // along the row: cells 1,2 then blocked by the friend on col 3 (and lake above col 2/3 is not on the row)
  assert.ok(d.includes(at(6, 1)) && d.includes(at(6, 2)));
  assert.ok(!d.includes(at(6, 3)) && !d.includes(at(6, 4)));
  // upward: rows 5,4 are open at col 0, then the enemy on row 3 can be attacked, nothing past it
  assert.ok(d.includes(at(5, 0)) && d.includes(at(4, 0)) && d.includes(at(3, 0)));
  assert.ok(!d.includes(at(2, 0)));
  // downward to the back row
  assert.ok(d.includes(at(9, 0)));
  // lake: scout below a lake cannot go up through it
  const t = arena([[R, 2, at(6, 2)], [B, 10, at(0, 0)], [R, 10, at(9, 9)]]);
  const e = L.destinations(t, at(6, 2));
  assert.ok(!e.includes(at(5, 2)) && !e.includes(at(4, 2)) && !e.includes(at(3, 2)));
  // an enemy behind a friend or lake is not reachable
  const u = arena([[R, 2, at(6, 5)], [B, 5, at(3, 5)], [B, 10, at(0, 0)], [R, 10, at(9, 9)]]);
  assert.ok(L.destinations(u, at(6, 5)).includes(at(3, 5)), "open file attack");
  // a long move reveals the scout, a one-step move does not
  const r1 = L.move(u, at(6, 5), at(4, 5));
  assert.equal(r1.leap, true);
  assert.equal(u.board[at(4, 5)].rev, true);
  const w = arena([[R, 2, at(6, 5)], [B, 10, at(0, 0)], [R, 10, at(9, 9)]]);
  L.move(w, at(6, 5), at(5, 5));
  assert.equal(w.board[at(5, 5)].rev, false);
});

test("bombs and the flag never move", () => {
  const s = arena([[R, L.BOMB, at(9, 0)], [R, L.FLAG, at(9, 1)], [R, 3, at(9, 5)], [B, 10, at(0, 0)]]);
  assert.deepEqual(L.destinations(s, at(9, 0)), []);
  assert.deepEqual(L.destinations(s, at(9, 1)), []);
  assert.equal(L.move(s, at(9, 0), at(8, 0)), null);
  assert.ok(L.legalMoves(s, R).every((m) => m.from === at(9, 5)));
});

test("a piece cannot move onto a friend, a lake, off the board, or out of turn", () => {
  const s = arena([[R, 4, at(7, 4)], [R, 4, at(7, 5)], [B, 4, at(2, 4)]]);
  assert.equal(L.move(s, at(7, 4), at(7, 5)), null);
  assert.equal(L.move(s, at(2, 4), at(3, 4)), null, "Blue cannot move on Red's turn");
  assert.equal(L.move(s, at(7, 4), at(7, 6)), null, "two squares");
  assert.equal(L.move(s, at(7, 4), at(6, 5)), null, "diagonal");
  assert.ok(L.move(s, at(7, 4), at(6, 4)));
});

function duel(a, d, attackerSide) {
  // attacker adjacent to defender; both sides get a spare piece far away so the game goes on.
  const s = arena([[R, a, at(7, 0)], [B, d, at(6, 0)], [R, 10, at(9, 9)], [B, 10, at(0, 9)]], R);
  const res = L.move(s, at(7, 0), at(6, 0));
  return { s, res };
}
test("attack outcomes: higher rank wins and stays, lower dies", () => {
  let { s, res } = duel(8, 5);
  assert.equal(res.out, "win");
  assert.equal(s.board[at(6, 0)].r, 8);
  assert.equal(s.board[at(7, 0)], null);
  assert.deepEqual(s.dead[B], [5]);
  ({ s, res } = duel(5, 8));
  assert.equal(res.out, "lose");
  assert.equal(s.board[at(7, 0)], null);
  assert.equal(s.board[at(6, 0)].r, 8);
  assert.deepEqual(s.dead[R], [5]);
  // every pair of normal ranks 2..10
  for (let a = 2; a <= 10; a++) for (let d = 2; d <= 10; d++) {
    const o = duel(a, d).res.out;
    assert.equal(o, a > d ? "win" : a < d ? "lose" : "tie", a + " v " + d);
  }
});
test("equal ranks remove both pieces", () => {
  const { s, res } = duel(6, 6);
  assert.equal(res.out, "tie");
  assert.equal(s.board[at(6, 0)], null);
  assert.equal(s.board[at(7, 0)], null);
  assert.deepEqual(s.dead[R], [6]);
  assert.deepEqual(s.dead[B], [6]);
});
test("spy beats the marshal only when the spy attacks", () => {
  let { s, res } = duel(1, 10);
  assert.equal(res.out, "win");
  assert.equal(s.board[at(6, 0)].r, 1);
  // marshal attacking the spy: marshal wins
  const t = arena([[R, 10, at(7, 0)], [B, 1, at(6, 0)], [R, 4, at(9, 9)], [B, 4, at(0, 9)]]);
  const r2 = L.move(t, at(7, 0), at(6, 0));
  assert.equal(r2.out, "win");
  assert.equal(t.board[at(6, 0)].r, 10);
  // spy loses to everything else it attacks, including the general
  assert.equal(duel(1, 9).res.out, "lose");
  assert.equal(duel(1, 2).res.out, "lose");
  // spy defending against anything below marshal loses too
  assert.equal(duel(9, 1).res.out, "win");
  // spy vs spy ties
  assert.equal(duel(1, 1).res.out, "tie");
});
test("miners defuse bombs; everything else dies on a bomb, and the bomb stays", () => {
  let { s, res } = duel(3, L.BOMB);
  assert.equal(res.out, "defuse");
  assert.equal(s.board[at(6, 0)].r, 3);
  assert.deepEqual(s.dead[B], [L.BOMB]);
  for (const a of [1, 2, 4, 5, 6, 7, 8, 9, 10]) {
    const d = duel(a, L.BOMB);
    assert.equal(d.res.out, "lose", "rank " + a + " dies on a bomb");
    assert.equal(d.s.board[at(6, 0)].r, L.BOMB, "bomb survives");
    assert.equal(d.s.board[at(6, 0)].rev, true, "bomb is now revealed");
    assert.equal(d.s.board[at(7, 0)], null);
  }
  // a bomb never attacks
  const t = arena([[R, L.BOMB, at(7, 0)], [B, 4, at(6, 0)], [R, 4, at(9, 9)], [B, 4, at(0, 9)]]);
  assert.ok(!L.legalMoves(t, R).some((m) => m.from === at(7, 0)));
});
test("capturing the flag wins the game immediately", () => {
  const { s, res } = duel(2, L.FLAG);
  assert.equal(res.out, "flag");
  assert.equal(s.phase, "over");
  assert.equal(s.winner, R);
  assert.equal(s.reason, "flag");
  assert.equal(L.move(s, at(9, 9), at(8, 9)), null, "no moves after the game ends");
});
test("a player with no movable piece on their turn loses", () => {
  // Blue only has a bomb and a flag left after Red takes the last mover.
  const s = arena([[R, 5, at(7, 0)], [B, 2, at(6, 0)], [B, L.BOMB, at(0, 0)], [B, L.FLAG, at(0, 1)]], R);
  const res = L.move(s, at(7, 0), at(6, 0));
  assert.equal(res.out, "win");
  assert.equal(s.phase, "over");
  assert.equal(s.winner, R);
  assert.equal(s.reason, "blocked");
  // and a side boxed in by lakes/friends from the start
  const t = arena([[R, 4, at(9, 0)], [B, L.BOMB, at(0, 0)], [B, L.FLAG, at(0, 1)], [B, 3, at(0, 9)]], R);
  L.move(t, at(9, 0), at(8, 0));
  assert.equal(t.phase, "play");
  assert.ok(L.hasMove(t, B));
});

test("two-square rule: a piece may not shuffle between the same two squares more than 3 times in a row", () => {
  const s = arena([[R, 4, at(9, 0)], [B, 4, at(0, 0)], [R, 10, at(9, 9)], [B, 10, at(0, 9)]], R);
  const redSeq = [[at(9, 0), at(9, 1)], [at(9, 1), at(9, 0)], [at(9, 0), at(9, 1)]];
  const blueSeq = [[at(0, 0), at(0, 1)], [at(0, 1), at(0, 0)], [at(0, 0), at(0, 1)]];
  for (let i = 0; i < 3; i++) {
    assert.ok(L.move(s, redSeq[i][0], redSeq[i][1]), "red shuffle " + (i + 1));
    assert.ok(L.move(s, blueSeq[i][0], blueSeq[i][1]), "blue shuffle " + (i + 1));
  }
  // the fourth back move is illegal for both, other moves of the same piece are fine
  assert.equal(L.move(s, at(9, 1), at(9, 0)), null);
  assert.ok(!L.legalMoves(s, R).some((m) => m.from === at(9, 1) && m.to === at(9, 0)));
  assert.ok(L.legalMoves(s, R).some((m) => m.from === at(9, 1) && m.to === at(8, 1)));
  assert.ok(L.move(s, at(9, 1), at(8, 1)));
  // moving a different piece resets the count
  const t = arena([[R, 4, at(9, 0)], [R, 5, at(9, 5)], [B, 4, at(0, 0)], [B, 10, at(0, 9)]], R);
  L.move(t, at(9, 0), at(9, 1)); L.move(t, at(0, 0), at(0, 1));
  L.move(t, at(9, 1), at(9, 0)); L.move(t, at(0, 1), at(0, 0));
  L.move(t, at(9, 5), at(9, 6)); L.move(t, at(0, 0), at(0, 1));
  assert.ok(L.move(t, at(9, 0), at(9, 1)));
});
test("long games without any attack are drawn, so no game can run forever", () => {
  const s = arena([[R, 4, at(9, 0)], [B, 4, at(0, 0)], [R, 5, at(9, 5)], [B, 5, at(0, 5)]], R);
  let guard = 0;
  while (s.phase === "play" && guard++ < 5000) {
    const ms = L.legalMoves(s);
    const mv = ms.find((m) => !s.board[m.to]) || ms[0];
    L.move(s, mv.from, mv.to);
  }
  assert.equal(s.phase, "over");
  assert.ok(s.ply <= L.DRAW_AFTER + 10);
});

test("combat reveals both pieces and the log records the rank to everyone", () => {
  const s = arena([[R, 7, at(7, 0)], [B, 4, at(6, 0)], [B, 8, at(2, 5)], [R, 10, at(9, 9)]], R);
  assert.equal(s.board[at(6, 0)].rev, false);
  L.move(s, at(7, 0), at(6, 0));
  assert.equal(s.board[at(6, 0)].rev, true, "surviving attacker is revealed");
  assert.equal(s.board[at(2, 5)].rev, false, "uninvolved pieces stay hidden");
  assert.deepEqual(s.log[0].ar, 7);
  assert.deepEqual(s.log[0].dr, 4);
  // the defender survives and is revealed
  const t = arena([[R, 4, at(7, 0)], [B, 8, at(6, 0)], [R, 10, at(9, 9)], [B, 10, at(0, 9)]], R);
  L.move(t, at(7, 0), at(6, 0));
  assert.equal(t.board[at(6, 0)].rev, true);
  assert.equal(t.board[at(6, 0)].r, 8);
  // moved flag
  const u = arena([[R, 4, at(7, 0)], [B, 8, at(2, 0)], [R, 10, at(9, 9)], [B, 10, at(0, 9)]], R);
  L.move(u, at(7, 0), at(7, 1));
  assert.equal(u.board[at(7, 1)].mv, true);
  assert.equal(u.board[at(7, 1)].rev, false);
});

test("viewFor hides the opponent's unrevealed ranks and nothing else", () => {
  const s = L.newGame({ seed: 3 });
  L.randomSetup(s); L.startGame(s);
  const v = L.viewFor(s, R);
  v.board.forEach((p, i) => {
    if (!p) return;
    if (p.o === B) assert.equal(p.r, -1);
    else assert.equal(p.r, s.board[i].r);
  });
  s.board[at(3, 3)].rev = true;
  assert.equal(L.viewFor(s, R).board[at(3, 3)].r, s.board[at(3, 3)].r);
});

// Mid-game state with some revealed pieces.
function midGame(seed, plies) {
  const s = L.newGame({ seed });
  L.randomSetup(s); L.startGame(s);
  const r = rand32(seed * 7 + 1);
  for (let i = 0; i < plies && s.phase === "play"; i++) {
    if (s.turn === B) L.aiPlay(s);
    else { const ms = L.legalMoves(s); const m = ms[Math.floor(r() * ms.length)]; L.move(s, m.from, m.to); }
  }
  return s;
}
test("no peeking: the AI picks the same move whatever the human's unrevealed ranks are", () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = midGame(seed, 20 + (seed % 5) * 14);
    if (s.phase !== "play") continue;
    if (s.turn !== B) {
      const ms = L.legalMoves(s); L.move(s, ms[0].from, ms[0].to);
      if (s.phase !== "play") continue;
    }
    const a = L.clone(s), b = L.clone(s);
    // shuffle all unrevealed Red ranks in b (including across moved/unmoved), swap in a with throwing getters in c
    const hidden = [];
    b.board.forEach((p, i) => { if (p && p.o === R && !p.rev) hidden.push(i); });
    const ranks = hidden.map((i) => b.board[i].r);
    const rf = rand32(seed + 999);
    for (let i = ranks.length - 1; i > 0; i--) { const j = Math.floor(rf() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
    hidden.forEach((i, k) => { b.board[i].r = ranks[k]; });
    const c = L.clone(s);
    hidden.forEach((i) => { Object.defineProperty(c.board[i], "r", { get() { throw new Error("peeked at a hidden rank"); }, enumerable: true }); });
    const ma = L.aiMove(a), mb = L.aiMove(b), mc = L.aiMove(c);
    assert.deepEqual(mb, ma, "move differs after shuffling hidden ranks, seed " + seed);
    assert.deepEqual(mc, ma);
    assert.equal(b.rng, a.rng, "random stream consumed differently");
    checked++;
  }
  assert.ok(checked >= 30, "enough positions checked: " + checked);
});
test("no peeking in the other direction either (AI as Red)", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const s = L.newGame({ seed });
    L.aiSetup(s, R); L.startGame(s);
    const a = L.clone(s), b = L.clone(s);
    const hid = [];
    b.board.forEach((p, i) => { if (p && p.o === B) hid.push(i); });
    const rk = hid.map((i) => b.board[i].r).reverse();
    hid.forEach((i, k) => { b.board[i].r = rk[k]; });
    assert.deepEqual(L.aiMove(a), L.aiMove(b));
  }
});

test("seed determinism: same seed gives the same AI setup, tie-breaks and game", () => {
  const g1 = JSON.stringify(playVsRandom(11, B).log);
  const g2 = JSON.stringify(playVsRandom(11, B).log);
  assert.equal(g1, g2);
  assert.notEqual(g1, JSON.stringify(playVsRandom(12, B).log));
  const a = L.newGame({ seed: 77 }), b = L.newGame({ seed: 77 });
  assert.deepEqual(a, b);
  // the human's setup button must not disturb the AI stream
  const c = L.newGame({ seed: 77 });
  for (let i = 0; i < 5; i++) L.randomSetup(c);
  assert.equal(c.rng, a.rng);
  L.randomSetup(a); L.startGame(a); L.startGame(c);
  L.presetSetup(c, "aggressive"); L.startGame(c);
  const ma = L.aiMove(L.clone(a));
  assert.ok(ma);
});

test("state round-trips through JSON and play continues identically", () => {
  const s = midGame(21, 60);
  const t = JSON.parse(JSON.stringify(s));
  assert.deepEqual(t, s);
  const r1 = rand32(5), r2 = rand32(5);
  for (let i = 0; i < 40 && s.phase === "play"; i++) {
    for (const x of [[s, r1], [t, r2]]) {
      if (x[0].turn === B) L.aiPlay(x[0]);
      else { const ms = L.legalMoves(x[0]); const m = ms[Math.floor(x[1]() * ms.length)]; L.move(x[0], m.from, m.to); }
    }
  }
  assert.deepEqual(t, s);
});

test("AI never plays an illegal move over many seeded games vs a random player (both colours)", () => {
  for (let seed = 1; seed <= 150; seed++) {
    const s = playVsRandom(seed, seed % 2 ? B : R);
    assert.equal(s.phase, "over");
    assert.ok(s.ply < 2000);
  }
});

test("AI beats a random-move player at least 90 percent of the time over 100 games", () => {
  let wins = 0, losses = 0, draws = 0;
  for (let seed = 1000; seed < 1100; seed++) {
    const s = playVsRandom(seed, seed % 2 ? B : R);
    const ai = seed % 2 ? B : R;
    if (s.winner === ai) wins++; else if (s.winner === 2) draws++; else losses++;
  }
  console.log("AI vs random: " + wins + " wins, " + losses + " losses, " + draws + " draws of 100");
  assert.ok(wins >= 90, "win rate " + wins + "%");
});

test("AI vs AI games always terminate", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = L.newGame({ seed });
    L.aiSetup(s, R); L.startGame(s);
    let guard = 0;
    while (s.phase === "play") {
      const mv = L.aiMove(s);
      assert.ok(mv && L.move(s, mv.from, mv.to), "illegal AI move, seed " + seed);
      assert.ok(++guard < 2000, "no runaway");
    }
    assert.ok([0, 1, 2].includes(s.winner));
  }
});

test("AI behaviour: takes a free revealed flag, defends against a revealed marshal's spy, avoids bombs", () => {
  // Blue general can capture an adjacent flag that is revealed
  const s = arena([[B, 9, at(4, 4)], [R, L.FLAG, at(5, 4), { rev: true }], [R, 10, at(9, 9)], [B, 4, at(0, 0)]], B);
  const mv = L.aiMove(s);
  assert.deepEqual(mv, { from: at(4, 4), to: at(5, 4) });
  // A lone revealed Red Spy beside the Blue Marshal: the marshal takes it
  const t = arena([[B, 10, at(3, 4)], [R, 1, at(4, 4), { rev: true, mv: true }], [R, 4, at(9, 9)], [B, 4, at(0, 0)]], B);
  assert.deepEqual(L.aiMove(t), { from: at(3, 4), to: at(4, 4) });
  // A Blue marshal does not walk next to a revealed spy when it has a safe alternative
  const u = arena([[B, 10, at(3, 4)], [R, 1, at(5, 4), { rev: true, mv: true }], [R, 4, at(9, 9)], [B, 4, at(0, 0)]], B);
  const m2 = L.aiMove(u);
  assert.notDeepEqual(m2, { from: at(3, 4), to: at(4, 4) });
});

test("page contract: base href, noindex, relative assets, no em dash, no external URLs", () => {
  const dir = path.join(__dirname, "..", "private", "stratego");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/stratego/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/stratego\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('href="/play/"'));
  assert.ok(html.includes("<title>Stratego</title>"));
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!txt.includes(DASH), "em dash in " + f);
    assert.ok(!/https?:\/\//.test(txt.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "external URL in " + f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(DASH));
  assert.ok(!fs.readFileSync(path.join(dir, "logic.js"), "utf8").match(/document\.|window\./), "logic has no DOM access");
});
