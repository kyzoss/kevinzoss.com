const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../private/bourre/logic.js");
const EM = String.fromCharCode(0x2014);

function playState(over) {
  const st = L.newGame(1, { opponents: 3 });
  Object.assign(st, {
    phase: "play", trump: "H", decl: ["in", "in", "in", "in"], hands: [[], [], [], []],
    trick: [], trickNo: 0, tricksWon: [0, 0, 0, 0], trickWinners: [], leader: 1, turn: 1, dealer: 0
  }, over || {});
  return st;
}
const T = (p, card) => ({ p, card });

function runToEnd(st, limit) {
  let n = 0;
  while (st.phase !== "gameover") {
    if (st.phase === "handdone") L.nextHand(st); else L.aiStep(st);
    if (++n > (limit || 200000)) throw new Error("loop");
  }
  return n;
}

test("deck has 52 unique cards", () => {
  const d = L.makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d).size, 52);
});

test("deal: 5 cards each, trump turned from the deck, nothing duplicated", () => {
  const st = L.newGame(42);
  assert.equal(st.n, 4);
  st.hands.forEach((h) => assert.equal(h.length, 5));
  assert.equal(st.trump, st.upcard[1]);
  const all = st.hands.flat().concat(st.deck, [st.upcard]);
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
  assert.equal(st.deck.length, 52 - 20 - 1);
});

test("opponent count is clamped to 2..5", () => {
  assert.equal(L.newGame(1, { opponents: 1 }).n, 3);
  assert.equal(L.newGame(1, { opponents: 9 }).n, 6);
  assert.equal(L.newGame(1).n, 4);
});

test("ante and pot arithmetic", () => {
  const st = L.newGame(5, { opponents: 4, ante: 2, start: 50 });
  assert.equal(st.pot, 10);
  assert.equal(st.potStart, 10);
  st.chips.forEach((c) => assert.equal(c, 48));
  assert.equal(st.trickValues.reduce((a, b) => a + b, 0), 10);
});

test("trick values always sum to the pot, even when it does not divide by five", () => {
  const st = L.newGame(5); // pot 4
  assert.deepEqual(st.trickValues, [1, 1, 1, 1, 0]);
  const s2 = L.newGame(5, { opponents: 5 }); // pot 6
  assert.deepEqual(s2.trickValues, [2, 1, 1, 1, 1]);
});

test("declare order starts left of the dealer and the dealer decides last", () => {
  const st = L.newGame(9);
  const seen = [];
  const dealer = st.dealer;
  assert.equal(st.turn, (dealer + 1) % 4);
  while (st.phase === "declare") {
    seen.push(st.turn);
    // force everybody to fold if allowed, otherwise stay
    if (!L.declare(st, "out")) L.declare(st, "in");
  }
  assert.equal(seen[0], (dealer + 1) % 4);
  assert.ok(seen.length <= 4);
  if (seen.length === 4) assert.equal(seen[3], dealer);
});

test("ace of trump forces the holder to stay in (and the option can be turned off)", () => {
  const st = L.newGame(3);
  const p = st.turn;
  st.hands[p][0] = "A" + st.trump;
  assert.deepEqual(L.legalDeclares(st, p), ["in"]);
  assert.equal(L.declare(st, "out"), false);
  assert.equal(st.decl[p], null);
  assert.equal(L.declare(st, "in"), true);
  const s2 = L.newGame(3, { aceForced: false });
  s2.hands[s2.turn][0] = "A" + s2.trump;
  assert.deepEqual(L.legalDeclares(s2, s2.turn), ["in", "out"]);
});

test("everyone folds but one: that player takes the whole pot, chips conserved", () => {
  const st = L.newGame(11, { aceForced: false });
  const before = L.totalChips(st);
  const pot = st.pot;
  const dealer = st.dealer;
  let lastIn = -1;
  while (st.phase === "declare") {
    const p = st.turn;
    if (p === dealer || lastIn >= 0) L.declare(st, p === dealer && lastIn < 0 ? "in" : "out");
    else { lastIn = p; L.declare(st, "in"); }
  }
  assert.equal(st.phase, "handdone");
  assert.equal(st.result.kind, "solo");
  assert.equal(st.pot, 0);
  assert.equal(st.chips[st.result.winner], 100 - 1 + pot);
  assert.equal(L.totalChips(st), before);
});

test("dealer wins by default when all others fold", () => {
  const st = L.newGame(12, { aceForced: false });
  const dealer = st.dealer;
  while (st.phase === "declare") L.declare(st, "out");
  assert.equal(st.result.kind, "solo");
  assert.equal(st.result.winner, dealer);
});

test("draw round: counts, order, and the turned trump is never drawn", () => {
  const st = L.newGame(21, { aceForced: false });
  while (st.phase === "declare") L.declare(st, "in");
  assert.equal(st.phase, "draw");
  assert.equal(st.turn, (st.dealer + 1) % 4);
  const deckBefore = st.deck.length;
  const p = st.turn;
  const toss = st.hands[p].slice(0, 3);
  assert.equal(L.draw(st, ["XX"]), false);
  assert.equal(L.draw(st, toss.concat(st.hands[p][3], st.hands[p][4], st.hands[p][0])), false);
  assert.equal(L.draw(st, toss), true);
  assert.equal(st.hands[p].length, 5);
  assert.equal(st.deck.length, deckBefore - 3);
  assert.ok(!st.hands[p].includes(st.upcard));
  for (let i = 0; i < 3; i++) L.draw(st, []);
  assert.equal(st.phase, "play");
  assert.equal(st.turn, (st.dealer + 1) % 4);
  assert.equal(st.deck.length, deckBefore - 3);
});

test("draw round: deck exhaustion caps the discard count, hands stay at 5", () => {
  const st = L.newGame(33, { opponents: 5, aceForced: false });
  while (st.phase === "declare") L.declare(st, "in");
  assert.equal(st.deck.length, 52 - 30 - 1);
  st.deck.length = 4;
  assert.equal(L.maxDiscard(st), 4);
  const p = st.turn;
  assert.equal(L.draw(st, st.hands[p].slice()), false); // 5 > 4
  assert.equal(L.draw(st, st.hands[p].slice(0, 4)), true);
  assert.equal(st.deck.length, 0);
  assert.equal(L.maxDiscard(st), 0);
  const q = st.turn;
  assert.equal(L.draw(st, [st.hands[q][0]]), false);
  assert.equal(L.draw(st, []), true);
  st.hands.forEach((h) => assert.equal(h.length, 5));
});

test("legal play: first lead must be a trump when able", () => {
  const hand = ["AS", "KH", "2H", "9D"];
  assert.deepEqual(L.legalCards(hand, [], "H", true).sort(), ["2H", "KH"]);
  assert.equal(L.legalCards(hand, [], "H", false).length, 4);
  assert.equal(L.legalCards(["AS", "9D"], [], "H", true).length, 2);
});

test("legal play: must follow suit and head the trick when able", () => {
  const trick = [T(1, "9S")];
  assert.deepEqual(L.legalCards(["KS", "3S", "2H"], trick, "H", false).sort(), ["KS"]);
  // cannot head: any card of the suit
  assert.deepEqual(L.legalCards(["3S", "5S", "AH"], [T(1, "KS")], "H", false).sort(), ["3S", "5S"]);
  // a trump in the trick does not change the head requirement of the led suit
  assert.deepEqual(L.legalCards(["KS", "3S"], [T(1, "9S"), T(2, "2H")], "H", false), ["KS"]);
});

test("legal play: when the trump suit is led you must head it with trumps", () => {
  assert.deepEqual(L.legalCards(["QH", "3H", "AS"], [T(1, "9H")], "H", false).sort(), ["QH"]);
  assert.deepEqual(L.legalCards(["3H", "5H", "AS"], [T(1, "9H")], "H", false).sort(), ["3H", "5H"]);
});

test("legal play: void in the led suit means you must play a trump", () => {
  assert.deepEqual(L.legalCards(["2H", "5H", "AD"], [T(1, "9S")], "H", false).sort(), ["2H", "5H"]);
  // no trump either: anything
  assert.equal(L.legalCards(["AD", "KC"], [T(1, "9S")], "H", false).length, 2);
});

test("legal play: must overtrump when able, otherwise any trump", () => {
  assert.deepEqual(L.legalCards(["2H", "JH", "AD"], [T(1, "9S"), T(2, "8H")], "H", false).sort(), ["JH"]);
  assert.deepEqual(L.legalCards(["2H", "5H", "AD"], [T(1, "9S"), T(2, "8H")], "H", false).sort(), ["2H", "5H"]);
});

test("play rejects illegal cards and enforces the first-trick lead", () => {
  const st = playState({ hands: [["2C"], ["AS", "3H", "4D", "5C", "6C"], ["2D"], ["2S"]] });
  assert.equal(L.play(st, "AS"), false);
  assert.equal(L.play(st, "3H"), true);
});

test("trick winning: highest trump, else highest of the led suit", () => {
  const st = playState();
  assert.equal(L.winningPlay(st, [T(1, "9S"), T(2, "AS"), T(3, "2H"), T(0, "KH")]).p, 0);
  assert.equal(L.winningPlay(st, [T(1, "9S"), T(2, "AD"), T(3, "KS"), T(0, "2C")]).p, 3);
});

test("pot split per trick, winner leads next, bourre penalty goes into the next pot", () => {
  // player 1 wins all five tricks, 0/2/3 are bourre
  const st = playState({
    pot: 20, potStart: 20, trickValues: [4, 4, 4, 4, 4],
    chips: [90, 90, 90, 90],
    hands: [["2S", "3S", "4S", "5S", "6S"], ["AH", "KH", "QH", "JH", "TH"], ["2C", "3C", "4C", "5C", "6C"], ["2D", "3D", "4D", "5D", "6D"]]
  });
  for (let t = 0; t < 5; t++) {
    assert.equal(st.turn, 1);
    const h1 = st.hands[1][0];
    L.play(st, h1);
    L.play(st, st.hands[2][0]);
    L.play(st, st.hands[3][0]);
    L.play(st, st.hands[0][0]);
    assert.equal(st.phase, "trickdone");
    L.collect(st);
  }
  assert.equal(st.phase, "handdone");
  assert.equal(st.chips[1], 90 + 20);
  // penalties: three players each owe 20 and have 90
  assert.equal(st.chips[0], 70);
  assert.equal(st.chips[2], 70);
  assert.equal(st.chips[3], 70);
  assert.equal(st.pot, 60);
  assert.equal(st.result.penalties.length, 3);
  assert.equal(L.totalChips(st), 90 * 4 + 20);
});

test("folded players pay nothing; a player who wins a trick is not bourre", () => {
  const st = playState({
    decl: ["in", "in", "out", "out"], pot: 8, potStart: 8, trickValues: [2, 2, 2, 2, 2],
    chips: [50, 50, 50, 50], tricksWon: [0, 0, 0, 0],
    hands: [["3H", "4H", "5H", "6H", "7H"], ["AH", "KH", "QH", "JH", "2H"], [], []]
  });
  for (let t = 0; t < 5; t++) {
    L.play(st, st.hands[1][0]);
    L.play(st, L.legalPlays(st, 0)[0]);
    L.collect(st);
  }
  assert.equal(st.phase, "handdone");
  assert.equal(st.tricksWon[0], 1); // heads the lone low trump on the last trick
  assert.equal(st.result.penalties.length, 0);
  assert.equal(L.totalChips(st), 208);
  assert.equal(st.chips[2], 50);
  assert.equal(st.chips[3], 50);
});

test("the ante rises on schedule when the house option is on, and stays flat when off", () => {
  const a = L.newGame(2, { opponents: 2 });
  assert.equal(a.ante, 1);
  for (let h = 1; h < L.RAISE_EVERY + 1; h++) { a.phase = "handdone"; L.nextHand(a); }
  assert.equal(a.ante, 2);
  const b = L.newGame(2, { opponents: 2, raise: false });
  for (let h = 1; h < 30; h++) { b.phase = "handdone"; L.nextHand(b); }
  assert.equal(b.ante, 1);
});

test("bust: cannot cover a bourre penalty pays what it has and is bust; human bust ends the game", () => {
  const st = playState({
    pot: 20, potStart: 20, trickValues: [4, 4, 4, 4, 4], chips: [5, 90, 90, 90],
    hands: [["2S", "3S", "4S", "5S", "6S"], ["AH", "KH", "QH", "JH", "TH"], ["2C", "3C", "4C", "5C", "6C"], ["2D", "3D", "4D", "5D", "6D"]]
  });
  const total = L.totalChips(st);
  for (let t = 0; t < 5; t++) {
    for (let k = 0; k < 4; k++) L.play(st, st.hands[st.turn][0]);
    L.collect(st);
  }
  assert.equal(st.bust[0], true);
  assert.equal(st.chips[0], 0);
  assert.equal(L.totalChips(st), total);
  L.nextHand(st);
  assert.equal(st.phase, "gameover");
  assert.equal(st.winner, -1);
});

test("bust at the ante, and the human wins when only the human remains", () => {
  const st = L.newGame(4, { opponents: 2 });
  st.phase = "handdone";
  st.chips = [50, 0, 0];
  st.pot = 0;
  L.nextHand(st);
  assert.equal(st.phase, "gameover");
  assert.equal(st.winner, 0);
  assert.equal(st.bust[1] && st.bust[2], true);
});

test("seed determinism and different seeds differ", () => {
  const a = L.newGame(77), b = L.newGame(77), c = L.newGame(78);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.hands, c.hands);
  runToEnd(a); runToEnd(b);
  assert.deepEqual(a, b);
});

test("JSON round trip mid game keeps playing identically", () => {
  const a = L.newGame(8);
  for (let i = 0; i < 60; i++) { if (a.phase === "handdone") L.nextHand(a); else L.aiStep(a); }
  const b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(b, a);
  for (let i = 0; i < 400 && a.phase !== "gameover"; i++) {
    if (a.phase === "handdone") { L.nextHand(a); L.nextHand(b); } else { L.aiStep(a); L.aiStep(b); }
  }
  assert.deepEqual(b, a);
});

test("chips are conserved across hands (chips plus pot is constant) in many games", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const opp = 2 + (seed % 4);
    const st = L.newGame(seed, { opponents: opp });
    const total = L.totalChips(st) + st.n * st.opts.ante * 0; // pot already holds the antes
    let guard = 0;
    while (st.phase !== "gameover" && guard++ < 100000) {
      if (st.phase === "handdone") L.nextHand(st); else L.aiStep(st);
      assert.equal(L.totalChips(st), total, "seed " + seed);
    }
  }
});

test("AI always declares, draws and plays legally; games terminate (hundreds of seeds)", () => {
  let declIn = 0, declTotal = 0, hands = 0, bourres = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const st = L.newGame(seed * 7919, { opponents: 2 + (seed % 4), aceForced: seed % 5 !== 0 });
    let guard = 0;
    while (st.phase !== "gameover") {
      assert.ok(guard++ < 60000, "no infinite loop, seed " + seed);
      if (st.phase === "handdone") {
        hands++;
        if (st.result.penalties.length) bourres++;
        L.nextHand(st);
        continue;
      }
      const p = st.turn;
      if (st.phase === "declare") {
        const d = L.aiDeclare(st, p);
        assert.ok(L.legalDeclares(st, p).includes(d));
        declTotal++; if (d === "in") declIn++;
      } else if (st.phase === "draw") {
        const tosses = L.aiDiscards(st, p);
        assert.ok(tosses.length <= L.maxDiscard(st));
        tosses.forEach((c) => assert.ok(st.hands[p].includes(c)));
      } else if (st.phase === "play") {
        const c = L.aiPlay(st, p);
        assert.ok(L.legalPlays(st, p).includes(c));
      }
      assert.equal(L.aiStep(st), true);
    }
  }
  assert.ok(hands > 500);
  assert.ok(bourres > 20, "bourres happen");
  const rate = declIn / declTotal;
  assert.ok(rate > 0.2 && rate < 0.85, "declare rate sane: " + rate);
});

test("page contract: base href, no em dash, relative assets", () => {
  const dir = path.join(__dirname, "../private/bourre");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/bourre/"'));
  assert.ok(html.indexOf("<base") < html.indexOf("<title"));
  assert.ok(html.includes('content="noindex"'));
  for (const f of fs.readdirSync(dir)) {
    assert.ok(!fs.readFileSync(path.join(dir, f), "utf8").includes(EM), f + " has an em dash");
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(EM));
});
