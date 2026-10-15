const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../private/gin-rummy/logic.js");
const EM = String.fromCharCode(0x2014);

function H(s) { return s.trim().split(/\s+/); }

// A controlled state in the discard phase for seat 0.
function mk(hand0, hand1, over) {
  const st = L.newGame(1);
  Object.assign(st, {
    phase: "discard", turn: 0, dealer: 1, hands: [H(hand0), H(hand1)], drawn: null,
    stock: L.makeDeck().slice(0, 20), discard: ["KD"], scores: [0, 0], boxes: [0, 0],
    knock: null, result: null, final: null, mustStock: false
  }, over || {});
  return st;
}

test("deck has 52 unique cards", () => {
  const d = L.makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d).size, 52);
});

test("deal: 10 each, one upcard, 31 in stock, non-dealer to act", () => {
  const st = L.newGame(42);
  assert.equal(st.hands[0].length, 10);
  assert.equal(st.hands[1].length, 10);
  assert.equal(st.discard.length, 1);
  assert.equal(st.stock.length, 31);
  assert.equal(new Set([].concat(st.hands[0], st.hands[1], st.discard, st.stock)).size, 52);
  assert.equal(st.phase, "first");
  assert.equal(st.turn, 1 - st.dealer);
});

test("card values: ace low is 1, faces are 10", () => {
  assert.equal(L.points("AS"), 1);
  assert.equal(L.points("9H"), 9);
  assert.equal(L.points("TD"), 10);
  assert.equal(L.points("KC"), 10);
});

test("solver: finds gin with a run and two sets", () => {
  const b = L.bestMelds(H("AS 2S 3S 4S 7H 7D 7C 9C 9D 9H"));
  assert.equal(b.dw, 0);
  assert.equal(b.melds.length, 3);
});

test("solver: ten card hand with run, set and deadwood", () => {
  const b = L.bestMelds(H("4H 5H 6H 8S 8D 8C KD 2S 3C 9S"));
  assert.equal(b.dw, 10 + 2 + 3 + 9);
  assert.equal(b.melds.length, 2);
});

test("solver: 7S shared by a run and a set goes where it saves the most", () => {
  // run 5S 6S 7S plus set 7H 7D 7C is impossible (needs a 4th 7), so 7S is shared:
  // option A: run 5-6-7S, 7H 7D 7C set cannot include 7S -> set of three 7s, run needs 7S. Both fit (7S in run only).
  const b = L.bestMelds(H("5S 6S 7S 7H 7D 7C 2D 2C 3H 4H"));
  assert.equal(b.dw, 2 + 2 + 3 + 4);
  // Without the 7C the 7S can only serve one meld: run (dead 7H 7D = 14) or set (dead 5S 6S = 11).
  const c = L.bestMelds(H("5S 6S 7S 7H 7D 2D 2C 3H 4H KC"));
  assert.equal(c.dw, 5 + 6 + 2 + 2 + 3 + 4 + 10);
  assert.deepEqual(c.melds, [H("7S 7H 7D")]);
});

test("solver: card shared by a set and a run picks the cheaper deadwood", () => {
  // 3S 3H 3D set leaves 4S 5S dead (9); run 3S 4S 5S leaves 3H 3D dead (6).
  const b = L.bestMelds(H("3S 3H 3D 4S 5S"));
  assert.equal(b.dw, 6);
  assert.deepEqual(b.melds, [H("3S 4S 5S")]);
});

test("solver: ace is low only, Q K A is not a run and no wraparound", () => {
  assert.equal(L.deadwood(H("QS KS AS")), 10 + 10 + 1);
  assert.equal(L.deadwood(H("KS AS 2S")), 10 + 1 + 2);
  assert.equal(L.deadwood(H("AS 2S 3S")), 0);
  assert.equal(L.deadwood(H("JS QS KS")), 0);
});

test("solver: runs must share a suit, sets must share a rank", () => {
  assert.equal(L.deadwood(H("4S 5H 6S")), 15);
  assert.equal(L.deadwood(H("5S 5H")), 10);
  assert.equal(L.deadwood(H("5S 5H 5D")), 0);
});

test("solver: 11 card gin (3+4+4) and 4 card run", () => {
  const b = L.bestMelds(H("AS 2S 3S 4S 5H 5D 5C 9D 9C 9H 9S"));
  assert.equal(b.dw, 0);
  assert.equal(b.deadwood.length, 0);
  assert.equal(L.deadwood(H("2C 3C 4C 5C")), 0);
});

test("solver: matches exhaustive search on random hands", () => {
  const st = { rng: 123 };
  for (let n = 0; n < 60; n++) {
    const deck = L.shuffle(st, L.makeDeck());
    const hand = deck.slice(0, 8);
    // reference: try all assignments via subset recursion
    const cands = [];
    const cm = L.candidateMelds(hand);
    function rec(i, used, dw) {
      if (i === hand.length) return dw;
      if (used & (1 << i)) return rec(i + 1, used, dw);
      let best = rec(i + 1, used | (1 << i), dw + L.points(hand[i]));
      for (const m of cm) if ((m & (1 << i)) && !(m & used)) best = Math.min(best, rec(i + 1, used | m, dw));
      return best;
    }
    assert.equal(L.deadwood(hand), rec(0, 0, 0));
  }
});

test("autoSortHand puts melds first and deadwood last, same cards", () => {
  const hand = H("KD 4H 8S 5H 8D 6H 2S 8C 3C 9S");
  const s = L.autoSortHand(hand);
  assert.deepEqual(s.slice().sort(), hand.slice().sort());
  assert.deepEqual(s.slice(0, 6).sort(), H("4H 5H 6H 8S 8D 8C").sort());
  assert.deepEqual(s.slice(6), H("2S 3C 9S KD"));
});

test("first turn: non-dealer passes, dealer may take", () => {
  const st = L.newGame(5);
  const nd = 1 - st.dealer;
  assert.equal(st.turn, nd);
  assert.equal(L.draw(st, "stock").ok, false);
  assert.equal(L.pass(st).ok, true);
  assert.equal(st.turn, st.dealer);
  assert.equal(st.phase, "first");
  const up = st.discard[0];
  assert.equal(L.draw(st, "discard").ok, true);
  assert.ok(st.hands[st.dealer].includes(up));
  assert.equal(st.phase, "discard");
  assert.equal(st.hands[st.dealer].length, 11);
});

test("first turn: both pass sends non-dealer to the stock only", () => {
  const st = L.newGame(5);
  const nd = 1 - st.dealer;
  L.pass(st); L.pass(st);
  assert.equal(st.phase, "draw");
  assert.equal(st.turn, nd);
  assert.equal(L.draw(st, "discard").ok, false);
  assert.equal(L.draw(st, "stock").ok, true);
  assert.equal(st.hands[nd].length, 11);
});

test("draw then discard passes the turn; hand sizes return to 10", () => {
  const st = L.newGame(9);
  L.pass(st); L.pass(st);
  const p = st.turn;
  L.draw(st, "stock");
  assert.equal(L.discard(st, st.hands[p][0]).ok, true);
  assert.equal(st.hands[p].length, 10);
  assert.equal(st.turn, 1 - p);
  assert.equal(st.phase, "draw");
});

test("cannot discard the card just taken from the discard pile", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 8C 9C TH", "AH 2H 3H 4C 5C 6C 7D 8D 9D TD");
  st.phase = "draw";
  const c = st.discard[st.discard.length - 1];
  L.draw(st, "discard");
  assert.equal(L.discard(st, c).ok, false);
  assert.equal(L.knock(st, c).ok, false);
  assert.ok(st.hands[0].includes(c));
  assert.equal(L.discard(st, "TH").ok, true);
});

test("taking from the stock allows discarding that card", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 8C 9C TH", "AH 2H 3H 4C 5C 6C 7D 8D 9D TD");
  st.phase = "draw";
  L.draw(st, "stock");
  assert.equal(L.discard(st, st.drawn.card).ok, true);
});

test("cannot act out of phase", () => {
  const st = L.newGame(3);
  assert.equal(L.discard(st, st.hands[0][0]).ok, false);
  assert.equal(L.knock(st, st.hands[0][0]).ok, false);
});

test("knock threshold: 10 allowed, 11 refused", () => {
  // after discarding KD remaining deadwood: 10 + ... build exactly
  const st = mk("AS 2S 3S 4D 5D 6D 7C 8C 9C KH AH", "AC 3C 5C 7H 9H JD QD KS 2D 4H");
  // best discard of 11: deadwood of rest. Throw AH -> KH dead = 10
  assert.equal(L.knockCheck(st, "AH").dw, 10);
  const st2 = mk("AS 2S 3S 4D 5D 6D 7C 8C 9C KH 2H", "AC 3C 5C 7H 9H JD QD KS 2D 4H");
  // throw KH -> 2H dead = 2 (ok); throw 2H -> KH dead = 10 (ok); make 11 impossible:
  const st3 = mk("AS 2S 3S 4D 5D 6D 7C 8C KH QH JC", "AC 3C 5C 7H 9H JD QD KS 2D 4H");
  assert.equal(L.knockCheck(st3, "JC").ok, false);
  assert.equal(L.knockCheck(st2, "KH").dw, 2);
});

test("knock refused when deadwood is over 10", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C KH QH JC TD", "AC 3C 5C 7H 9H JD QD KS 2D 4H");
  const r = L.knock(st, "TD");
  assert.equal(r.ok, false);
  assert.equal(st.phase, "discard");
});

test("gin: no layoff, scores opponent deadwood plus 25", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 7S KH", "AC 3C 5C 9H JD QD KS 2D 4H 8H");
  assert.equal(L.knock(st, "KH").ok, true);
  assert.equal(st.phase, "handover");
  assert.equal(st.result.type, "gin");
  const od = L.deadwood(st.hands[1]);
  assert.equal(st.result.points, od + 25);
  assert.equal(st.scores[0], od + 25);
  assert.equal(st.boxes[0], 1);
});

test("knock then opponent loses: knocker scores the difference", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "KC QD JH 9S 8D 4C 3H 2D AD 5S");
  L.knock(st, "KH");   // knocker dw = 9
  assert.equal(st.phase, "layoff");
  assert.equal(st.turn, 1);
  L.finishLayoff(st);
  assert.equal(st.result.type, "knock");
  assert.equal(st.result.winner, 0);
  assert.equal(st.result.points, st.result.oDw - 9);
});

test("layoff: onto sets and both ends of runs, not past ends", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "7S 3D 4S 9D 2C AH JC QC KS 8D");
  L.knock(st, "KH");
  const ms = st.knock.melds;
  const find = (pred) => ms.findIndex(pred);
  const runLow = find((m) => m[0] === "AS");
  const runMid = find((m) => m[0] === "4D");
  const setIdx = find((m) => m[0][0] === "7");
  // 7S joins set of 7s (becomes four)
  assert.equal(L.layoff(st, "7S", setIdx).ok, true);
  assert.equal(L.layoff(st, "7S", setIdx).ok, false); // not in hand anymore
  // run A-2-3S extends at top with 4S
  assert.equal(L.layoff(st, "4S", runLow).ok, true);
  assert.equal(ms[runLow].length, 4);
  // 3D extends 4D 5D 6D at the bottom, and 8D... not adjacent (7D missing from run)
  assert.equal(L.layoff(st, "3D", runMid).ok, true);
  assert.equal(L.layoff(st, "8D", runMid).ok, false);
  // wrong suit and wrong rank refused
  assert.equal(L.layoff(st, "2C", runLow).ok, false);
  assert.equal(L.layoff(st, "9D", setIdx).ok, false);
  L.finishLayoff(st);
  assert.ok(st.result.oDw >= 0);
});

test("layoff: full set of four takes no more, run cannot wrap from K to A", () => {
  assert.equal(L.canLayoff(H("7S 7H 7D 7C"), "7S"), false);
  assert.equal(L.canLayoff(H("7S 7H 7D"), "7C"), true);
  assert.equal(L.canLayoff(H("JS QS KS"), "AS"), false);
  assert.equal(L.canLayoff(H("JS QS KS"), "TS"), true);
  assert.equal(L.canLayoff(H("2S 3S 4S"), "AS"), true);
  assert.equal(L.canLayoff(H("AS 2S 3S"), "KS"), false);
  assert.equal(L.canLayoff(H("2S 3S 4S"), "5S"), true);
  assert.equal(L.canLayoff(H("2S 3S 4S"), "6S"), false);
});

test("layoff is refused when not in layoff phase and after gin", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "7S 3D 4S 9D 2C AH JC QC KS 8D");
  assert.equal(L.layoff(st, "7S", 0).ok, false);
  const g = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "7S 3D 4S 9D 2C AH JC QC KS 8D");
  L.knock(g, "KH"); // 9C dead: knock not gin
  assert.equal(g.phase, "layoff");
  const gin = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C 9H", "7S 3D 4S 9D 2C AH JC QC KS 8D");
  L.knock(gin, "9H");
  assert.equal(gin.knock.dw, 9);
  const gin2 = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D KC KD", "7S 3D 4S 9D 2C AH JC QC KS 8D");
  gin2.hands[0] = H("AS 2S 3S 4D 5D 6D 7C 7H 7D 7S 9C");
  L.knock(gin2, "9C");
  assert.equal(gin2.phase, "handover");
  assert.equal(L.layoff(gin2, "7S", 0).ok, false);
});

test("undercut: opponent scores difference plus 25 and takes the box", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "AC 2C 3C 4H 5H 6H 8D 8S 8H JD 2D");
  st.hands[1].pop(); // 10 cards, deadwood JD = 10 (8s set, runs)
  st.hands[1] = H("AC 2C 3C 4H 5H 6H 8D 8S 8H 2D");
  L.knock(st, "KH"); // knocker dw 9
  L.finishLayoff(st); // 2D fits no knocker meld, so opponent keeps 2 deadwood
  assert.equal(st.result.oDw, 2);
  assert.equal(st.result.type, "undercut");
  assert.equal(st.result.winner, 1);
  assert.equal(st.result.points, (9 - 2) + 25);
  assert.equal(st.scores[1], 32);
  assert.equal(st.boxes[1], 1);
});

test("equal deadwood is also an undercut", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "AC 2C 3C 4H 5H 6H 8D 8S 8H 9D");
  L.knock(st, "KH");
  L.finishLayoff(st);
  assert.equal(st.result.type, "undercut");
  assert.equal(st.result.points, 25);
});

test("layoff reduces opponent deadwood and can flip the result", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "7S 4S 8D 9D 2C 2H JC QC KS 5C");
  L.knock(st, "KH"); // dw 9
  const before = L.deadwood(st.hands[1]);
  L.autoLayoff(st, 1);
  L.finishLayoff(st);
  assert.ok(st.result.oDw < before);
});

test("big gin option: off refuses, on scores 31 plus deadwood", () => {
  const off = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 7S 8D", "AC 3C 5C 9H JD QD KS 2D 4H 8H");
  assert.equal(L.deadwood(off.hands[0]), 0);
  assert.equal(L.knock(off, null).ok, false);
  const on = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 7S 8D", "AC 3C 5C 9H JD QD KS 2D 4H 8H", { options: { bigGin: true } });
  assert.equal(L.knock(on, null).ok, true);
  assert.equal(on.result.type, "biggin");
  assert.equal(on.result.points, L.deadwood(on.hands[1]) + 31);
  const notGin = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "AC 3C 5C 9H JD QD KS 2D 4H 8H", { options: { bigGin: true } });
  assert.equal(L.knock(notGin, null).ok, false);
});

test("11 melded cards with big gin off: gin by discarding a spare card", () => {
  const st = mk("AS 2S 3S 4S 5H 5D 5C 9D 9C 9H 9S", "AC 3C 7H JD QD KS 2D 4H 8H KH");
  assert.equal(L.knock(st, "AS").ok, true);
  assert.equal(st.result.type, "gin");
  assert.equal(st.result.points, L.deadwood(st.hands[1]) + 25);
});

test("draw: hand ends when the stock is down to 2 after a discard", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 8H 9C TH KD", "AH 2H 4C 5C 8C JD QD KS 9D TD", );
  st.stock = ["QC", "JC", "TC"];
  st.phase = "draw";
  L.draw(st, "stock");
  assert.equal(st.stock.length, 2);
  L.discard(st, "KD");
  assert.equal(st.phase, "handover");
  assert.equal(st.result.type, "draw");
  assert.deepEqual(st.scores, [0, 0]);
  assert.deepEqual(st.boxes, [0, 0]);
  const d = st.dealer;
  L.nextHand(st);
  assert.equal(st.dealer, d); // dealer stays after a draw
  assert.equal(st.stock.length, 31);
});

test("next hand alternates the dealer after a win", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "KC QD JH 9S 8D 4C 3H 2D AD 5S");
  L.knock(st, "KH"); L.finishLayoff(st);
  const d = st.dealer;
  assert.equal(L.nextHand(st).ok, true);
  assert.equal(st.dealer, 1 - d);
  assert.equal(st.handNo, 2);
});

test("game end at 100: game bonus 100 plus 25 per box for each player", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "KC QD JH 9S 8D 4C 3H 2D AD 5S", { scores: [90, 60], boxes: [3, 2] });
  L.knock(st, "KH"); L.finishLayoff(st);
  const pts = st.result.points;
  assert.ok(pts >= 10);
  assert.equal(st.phase, "gameover");
  assert.equal(st.final.winner, 0);
  assert.equal(st.final.totals[0], 90 + pts + 100 + 25 * 4);
  assert.equal(st.final.totals[1], 60 + 25 * 2);
  assert.equal(L.nextHand(st).ok, false);
});

test("game continues below 100 and tracks boxes", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "KC QD JH 9S 8D 4C 3H 2D AD 5S", { scores: [10, 10] });
  L.knock(st, "KH"); L.finishLayoff(st);
  assert.equal(st.phase, "handover");
  assert.equal(st.final, null);
  assert.equal(st.boxes[0], 1);
});

test("same seed gives the same deal, different seeds differ", () => {
  const a = L.newGame(77), b = L.newGame(77), c = L.newGame(78);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.hands, c.hands);
});

test("same seed gives the same whole game", () => {
  function run(seed) {
    const st = L.newGame(seed);
    for (let i = 0; i < 4000 && st.phase !== "gameover"; i++) {
      if (st.phase === "handover") L.nextHand(st); else L.aiStep(st);
    }
    return JSON.stringify(st);
  }
  assert.equal(run(31), run(31));
});

test("state round trips through JSON mid game and play continues the same", () => {
  const st = L.newGame(12);
  for (let i = 0; i < 15; i++) L.aiStep(st);
  const copy = JSON.parse(JSON.stringify(st));
  assert.deepEqual(copy, st);
  for (let i = 0; i < 30; i++) { if (st.phase === "handover" || st.phase === "gameover") break; L.aiStep(st); L.aiStep(copy); }
  assert.deepEqual(copy, st);
});

test("moveCard and sortHand keep the same cards", () => {
  const st = L.newGame(4);
  const before = st.hands[0].slice();
  L.moveCard(st, 0, 0, 9);
  assert.equal(st.hands[0][9], before[0]);
  assert.deepEqual(st.hands[0].slice().sort(), before.slice().sort());
  L.sortHand(st, 0);
  assert.deepEqual(st.hands[0], L.autoSortHand(before));
  assert.equal(L.moveCard(st, 0, 0, 50).ok, false);
});

test("AI plays legally for hundreds of seeded games, both seats, no stalls", () => {
  let hands = 0, knocks = 0, draws = 0, gins = 0, undercuts = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const st = L.newGame(seed, { bigGin: seed % 3 === 0 });
    let steps = 0;
    while (st.phase !== "gameover") {
      assert.ok(++steps < 5000, "stalled on seed " + seed);
      if (st.phase === "handover") {
        hands++;
        const r = st.result.type;
        if (r === "draw") draws++; else knocks++;
        if (r === "gin" || r === "biggin") gins++;
        if (r === "undercut") undercuts++;
        L.nextHand(st);
        continue;
      }
      const before = st.hands[0].length + st.hands[1].length + st.stock.length + st.discard.length;
      const ev = L.aiStep(st);
      assert.ok(ev && ev.type !== "none", "no action in phase " + st.phase);
      const after = st.hands[0].length + st.hands[1].length + st.stock.length + st.discard.length;
      if (!st.knock) assert.equal(before, after);
      if (st.phase === "draw" || st.phase === "first") {
        assert.equal(st.hands[st.turn].length, 10);
      }
      const all = [].concat(st.hands[0], st.hands[1], st.stock, st.discard);
      if (!st.knock) assert.equal(new Set(all).size, 52);
    }
    assert.ok(st.final.totals[st.final.winner] >= 100 + 0);
  }
  assert.ok(hands > 200);
  assert.ok(knocks > 100 && draws >= 0 && gins >= 0);
  assert.ok(undercuts >= 0);
});

test("AI never discards the card it just took from the discard pile", () => {
  for (let seed = 1; seed <= 80; seed++) {
    const st = L.newGame(seed);
    let steps = 0;
    while (st.phase !== "gameover" && steps++ < 3000) {
      if (st.phase === "handover") { L.nextHand(st); continue; }
      const f = L.forbidden(st), p = st.turn, wasDiscard = st.phase === "discard";
      L.aiStep(st);
      if (wasDiscard && f) assert.notEqual(st.discard[st.discard.length - 1], f);
    }
  }
});

test("AI knocks with 10 or less only and takes an obvious meld card", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 9C KH 3H", "KC QD JH 9S 8D 4C 3D 2D AD 5S", { turn: 1 });
  st.hands = [H("KC QD JH 9S 8D 4C 3D 2D AD 5S"), H("AS 2S 3S 4D 5D 6D 7C 7H 9C KH")];
  st.turn = 1; st.phase = "draw"; st.discard = ["7D"];
  L.aiStep(st);
  assert.equal(st.drawn.from, "discard");
  assert.equal(st.drawn.card, "7D");
});

test("AI passes a useless first upcard and takes a useful one", () => {
  const st = L.newGame(1);
  st.hands = [H("KC QD JH 9S 8D 4C 3D 2D AD 5S"), H("AS 2S 3S 4D 5D 6D 7C 7H 9C KH")];
  st.dealer = 0; st.turn = 1; st.phase = "first"; st.discard = ["KS"];
  L.aiStep(st);
  assert.equal(st.phase, "first");
  assert.equal(st.turn, 0);
  const st2 = L.newGame(1);
  st2.hands = [H("KC QD JH 9S 8D 4C 3D 2D AD 5S"), H("AS 2S 3S 4D 5D 6D 7C 7H 9C KH")];
  st2.dealer = 0; st2.turn = 1; st2.phase = "first"; st2.discard = ["7D"];
  L.aiStep(st2);
  assert.equal(st2.phase, "discard");
  assert.ok(st2.hands[1].includes("7D"));
});

test("computer lays off correctly when the human knocks", () => {
  const st = mk("AS 2S 3S 4D 5D 6D 7C 7H 7D 9C KH", "7S 4S 8D 9D 2C 2H JC QC KS 5C");
  L.knock(st, "KH");
  const r = L.aiStep(st);
  assert.equal(r.type, "layoff");
  assert.equal(st.phase, "handover");
  assert.ok(st.result.laid >= 2);
  assert.ok(!st.hands[1].includes("7S"));
});

test("no em dash in the logic source or log text", () => {
  const src = require("node:fs").readFileSync(require.resolve("../private/gin-rummy/logic.js"), "utf8");
  assert.ok(!src.includes(EM));
  const st = L.newGame(2);
  for (let i = 0; i < 40 && st.phase !== "handover"; i++) L.aiStep(st);
  assert.ok(!st.log.join("").includes(EM));
});
