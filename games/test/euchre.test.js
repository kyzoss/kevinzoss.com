const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../private/euchre/logic.js");
const EM = String.fromCharCode(0x2014);

// Build a controlled state in the play phase.
function mk(over) {
  const st = L.newGame(1);
  Object.assign(st, {
    phase: "play", trump: "H", maker: 0, alone: false, sitOut: -1, dealer: 3, turn: 0,
    trick: [], tricksWon: [0, 0], trickNo: 0, played: [], scores: [0, 0], winner: -1,
    hands: [[], [], [], []], voids: [{}, {}, {}, {}]
  }, over || {});
  return st;
}
function playTrick(st, cards) { cards.forEach((c) => L.play(st, c)); }

test("deck has 24 unique cards, 9 through ace in four suits", () => {
  const d = L.makeDeck();
  assert.equal(d.length, 24);
  assert.equal(new Set(d).size, 24);
  for (const s of "SHDC") for (const r of ["9", "T", "J", "Q", "K", "A"]) assert.ok(d.includes(r + s));
});

test("deal gives 5 cards each, a kitty of 4 and a face up card from the kitty", () => {
  const st = L.newGame(42);
  st.hands.forEach((h) => assert.equal(h.length, 5));
  assert.equal(st.kitty.length, 4);
  assert.equal(st.upcard, st.kitty[0]);
  const all = st.hands.flat().concat(st.kitty);
  assert.equal(new Set(all).size, 24);
  assert.equal(st.phase, "bid1");
  assert.equal(st.turn, (st.dealer + 1) % 4);
});

test("state is JSON serializable and survives a round trip", () => {
  const st = L.newGame(7);
  const copy = JSON.parse(JSON.stringify(st));
  assert.deepEqual(copy, st);
  while (copy.phase !== "gameover") L.aiStep(copy);
  const again = L.newGame(7);
  while (again.phase !== "gameover") L.aiStep(again);
  assert.deepEqual(copy.scores, again.scores);
});

test("bower ranking: right > left > A K Q 10 9 of trump > off suit", () => {
  const t = "H", led = "H";
  const order = ["JH", "JD", "AH", "KH", "QH", "TH", "9H"];
  for (let i = 0; i < order.length - 1; i++) assert.ok(L.power(order[i], t, led) > L.power(order[i + 1], t, led), order[i]);
  assert.equal(L.power("AS", t, led), -1);
  // trump beats a led off suit ace
  assert.ok(L.power("9H", t, "S") > L.power("AS", t, "S"));
  // off suit order A K Q J 10 9
  const off = ["AS", "KS", "QS", "JS", "TS", "9S"];
  for (let i = 0; i < off.length - 1; i++) assert.ok(L.power(off[i], t, "S") > L.power(off[i + 1], t, "S"));
});

test("left bower counts as trump, not its printed suit", () => {
  assert.equal(L.effSuit("JD", "H"), "H");
  assert.equal(L.effSuit("JH", "H"), "H");
  assert.equal(L.effSuit("JS", "H"), "S");
  assert.equal(L.effSuit("JC", "S"), "S");
  assert.equal(L.effSuit("JS", "C"), "C");
  assert.equal(L.leftSuit("D"), "H");
  assert.equal(L.effSuit("AD", "H"), "D");
});

test("follow suit: left bower is not a diamond when hearts are trump", () => {
  // hearts trump, diamonds led, hand has JD (left bower) and a plain diamond
  let hand = ["JD", "9D", "AS"];
  let legal = L.legalFrom(hand, [{ seat: 1, card: "KD" }], "H");
  assert.deepEqual(legal.sort(), ["9D"]);
  // only the left bower of the led printed suit: free to play anything
  hand = ["JD", "AS", "KC"];
  legal = L.legalFrom(hand, [{ seat: 1, card: "KD" }], "H");
  assert.deepEqual(legal.sort(), hand.slice().sort());
  // trump led: left bower must be played if it is the only trump
  legal = L.legalFrom(["JD", "AS"], [{ seat: 1, card: "9H" }], "H");
  assert.deepEqual(legal, ["JD"]);
  // leading allows anything
  assert.equal(L.legalFrom(["JD", "AS"], [], "H").length, 2);
});

test("trick resolution in every case", () => {
  const w = (cards, trump) => L.trickWinnerOf(cards.map((c, i) => ({ seat: i, card: c })), trump);
  assert.equal(w(["9S", "KS", "AS", "QS"], "H"), 2, "highest of led suit");
  assert.equal(w(["AS", "9H", "KS", "QS"], "H"), 1, "any trump beats led suit");
  assert.equal(w(["AS", "9H", "AH", "KH"], "H"), 2, "highest trump");
  assert.equal(w(["9H", "JD", "AH", "JH"], "H"), 3, "right bower beats all");
  assert.equal(w(["9H", "JD", "AH", "KH"], "H"), 1, "left bower beats ace of trump");
  assert.equal(w(["AS", "AD", "AC", "KS"], "H"), 0, "off suit discards lose");
  assert.equal(w(["KD", "JD", "AD", "9D"], "H"), 1, "left bower beats led diamonds");
  assert.equal(w(["JD", "AD", "9H", "KD"], "H"), 0 + 0, "left bower leads and wins over trump 9? no, 9H trump is lower") ;
  assert.equal(w(["9D", "AC", "KC", "QC"], "H"), 0, "led suit wins when nobody follows or trumps");
});

test("winner of a trick leads the next and tricks are counted by team", () => {
  const st = mk({ hands: [["AS", "9C"], ["KS", "9D"], ["QS", "TD"], ["9S", "KD"]], trump: "H", turn: 0 });
  playTrick(st, ["AS", "KS", "QS", "9S"]);
  assert.equal(st.phase, "trickdone");
  assert.equal(st.trickWinner, 0);
  L.collect(st);
  assert.equal(st.phase, "play");
  assert.equal(st.turn, 0);
  assert.deepEqual(st.tricksWon, [1, 0]);
});

test("illegal plays are rejected", () => {
  const st = mk({ hands: [["AS", "9C"], ["KS", "9D"], [], []], turn: 0 });
  L.play(st, "AS");
  assert.throws(() => L.play(st, "9D"), /illegal|not in hand/);
  assert.throws(() => L.play(st, "AH"), /not in hand/);
});

test("bidding round 1: order up makes the upcard suit trump and dealer picks up", () => {
  const st = L.newGame(3);
  const d = st.dealer, up = st.upcard;
  L.bid(st, { type: "pass" });
  assert.equal(st.turn, (d + 2) % 4);
  L.bid(st, { type: "order", alone: false });
  assert.equal(st.trump, up[1]);
  assert.equal(st.maker, (d + 2) % 4);
  assert.equal(st.phase, "discard");
  assert.equal(st.hands[d].length, 6);
  assert.ok(st.hands[d].includes(up));
  const drop = st.hands[d][0];
  L.discard(st, drop);
  assert.equal(st.hands[d].length, 5);
  assert.equal(st.phase, "play");
  assert.equal(st.turn, (d + 1) % 4);
  assert.equal(new Set(st.hands.flat().concat(st.kitty)).size, 24);
  assert.throws(() => L.discard(st, drop));
});

test("bidding round 2: turned suit is out, passes advance, dealer sticks", () => {
  const st = L.newGame(5);
  const d = st.dealer, down = st.upcard[1];
  for (let i = 0; i < 4; i++) L.bid(st, { type: "pass" });
  assert.equal(st.phase, "bid2");
  assert.equal(st.turnedDown, down);
  assert.equal(st.turn, (d + 1) % 4);
  assert.throws(() => L.bid(st, { type: "call", suit: down }));
  for (let i = 0; i < 3; i++) L.bid(st, { type: "pass" });
  assert.equal(st.turn, d);
  assert.ok(!L.legalBids(st).some((b) => b.type === "pass"), "dealer cannot pass when sticking");
  assert.throws(() => L.bid(st, { type: "pass" }));
  const other = L.SUITS.find((s) => s !== down);
  L.bid(st, { type: "call", suit: other, alone: false });
  assert.equal(st.trump, other);
  assert.equal(st.maker, d);
  assert.equal(st.phase, "play");
  assert.equal(st.hands[d].length, 5, "no pick up in round 2");
});

test("stick the dealer off: all pass turns the deal", () => {
  const st = L.newGame(5, { stick: false });
  const d = st.dealer, hn = st.handNo;
  for (let i = 0; i < 8; i++) L.bid(st, { type: "pass" });
  assert.equal(st.phase, "bid1");
  assert.equal(st.dealer, (d + 1) % 4);
  assert.equal(st.handNo, hn + 1);
  assert.equal(st.hands[0].length, 5);
  assert.ok(st.notice.length > 0);
});

test("going alone: partner sits out, trick has three cards, play skips the partner", () => {
  const st = L.newGame(9);
  st.dealer = 0; st.turn = 1; st.phase = "bid1";
  // seat 1 (West) orders alone; partner is seat 3 (East)
  L.bid(st, { type: "order", alone: true });
  assert.equal(st.alone, true);
  assert.equal(st.sitOut, 3);
  L.discard(st, st.hands[0][0]);
  assert.equal(st.turn, 1, "left of dealer leads");
  const order = [];
  for (let i = 0; i < 3; i++) { order.push(st.turn); L.play(st, L.legalPlays(st)[0]); }
  assert.deepEqual(order, [1, 2, 0]);
  assert.equal(st.phase, "trickdone");
  assert.equal(st.trick.length, 3);
  assert.equal(st.hands[3].length, 5, "sitting out hand untouched");
});

test("going alone: the sat out seat is skipped when it would lead", () => {
  const st = L.newGame(9);
  st.dealer = 0; st.turn = 1; st.phase = "bid1";
  L.bid(st, { type: "pass" }); // West
  L.bid(st, { type: "pass" }); // North
  L.bid(st, { type: "order", alone: true }); // East alone, partner West sits out
  assert.equal(st.sitOut, 1);
  L.discard(st, st.hands[0][0]);
  assert.equal(st.turn, 2, "West would lead but sits out");
});

test("going alone: dealer sitting out does not pick up", () => {
  const st = L.newGame(9);
  st.dealer = 2; st.turn = 3; st.phase = "bid1";
  L.bid(st, { type: "pass" }); // East
  L.bid(st, { type: "order", alone: true }); // South alone, partner North (dealer) sits out
  assert.equal(st.sitOut, 2);
  assert.equal(st.phase, "play");
  assert.equal(st.hands[2].length, 5);
  assert.equal(st.turn, 3);
});

test("scoring: makers 3 or 4 tricks score 1, march scores 2", () => {
  for (const [tricks, pts] of [[3, 1], [4, 1], [5, 2]]) {
    const st = mk({ maker: 0 });
    st.tricksWon = [tricks - 0, 5 - tricks]; st.trickNo = 4;
    st.hands = [["AH"], ["9S"], ["9C"], ["9D"]]; st.turn = 0;
    // force last trick won by seat 0 (team 0) or seat 1 (team 1)
    st.tricksWon = [tricks - 1, 5 - tricks]; 
    playTrick(st, ["AH", "9S", "9C", "9D"]);
    L.collect(st);
    assert.equal(st.result.points, pts, "tricks " + tricks);
    assert.equal(st.scores[0], pts);
    assert.equal(st.result.euchre, false);
  }
});

test("scoring: euchre gives defenders 2", () => {
  for (const mt of [0, 1]) {
    const st = mk({ maker: mt, trickNo: 4 });
    const maker = mt, def = 1 - mt;
    st.tricksWon = [0, 0]; st.tricksWon[maker] = 2; st.tricksWon[def] = 2;
    st.hands = [["9S"], ["9C"], ["9D"], ["AH"]]; // seat 3 holds the winning trump
    st.turn = 0;
    // winner is seat 3 (team 1)
    playTrick(st, ["9S", "9C", "9D", "AH"]);
    L.collect(st);
    // team 1 has 3 tricks now, team 0 has 2
    if (mt === 0) { assert.equal(st.result.euchre, true); assert.equal(st.scores[1], 2); assert.equal(st.result.points, 2); }
    else { assert.equal(st.result.euchre, false); assert.equal(st.scores[1], 1); }
  }
});

test("scoring: alone march scores 4, alone 3 or 4 tricks scores 1, alone euchre gives 2", () => {
  function finish(tricksForMaker, alone) {
    const st = mk({ maker: 0, alone, sitOut: alone ? 2 : -1, trickNo: 4, turn: 0 });
    st.tricksWon = [tricksForMaker - 1, 5 - tricksForMaker];
    st.hands = [["AH"], ["9S"], [], ["9D"]];
    if (!alone) st.hands[2] = ["9C"];
    playTrick(st, ["AH", "9S", ...(alone ? [] : ["9C"]), "9D"]);
    L.collect(st);
    return st;
  }
  assert.equal(finish(5, true).result.points, 4);
  assert.equal(finish(5, true).scores[0], 4);
  assert.equal(finish(4, true).result.points, 1);
  assert.equal(finish(3, true).result.points, 1);
  assert.equal(finish(5, false).result.points, 2);
  const e = mk({ maker: 0, alone: true, sitOut: 2, trickNo: 4, turn: 0 });
  e.tricksWon = [1, 3]; e.hands = [["9H"], ["AH"], [], ["9D"]];
  e.trump = "S";
  playTrick(e, ["9H", "AH", "9D"]);
  L.collect(e);
  assert.equal(e.result.euchre, true);
  assert.equal(e.scores[1], 2);
});

test("game ends when a side reaches 10", () => {
  const st = mk({ maker: 0, trickNo: 4, turn: 0, scores: [9, 4] });
  st.tricksWon = [2, 2];
  st.hands = [["AH"], ["9S"], ["9C"], ["9D"]];
  playTrick(st, ["AH", "9S", "9C", "9D"]);
  L.collect(st);
  assert.equal(st.scores[0], 10);
  assert.equal(st.phase, "gameover");
  assert.equal(st.winner, 0);
  const st2 = mk({ maker: 0, trickNo: 4, turn: 0, scores: [3, 8] });
  st2.tricksWon = [2, 2];
  st2.hands = [["9S"], ["9C"], ["9D"], ["AH"]];
  playTrick(st2, ["9S", "9C", "9D", "AH"]);
  L.collect(st2);
  assert.equal(st2.winner, 1, "euchre pushes defenders to 10");
  assert.equal(st2.scores[1], 10);
});

test("dealer rotates clockwise between hands", () => {
  const st = L.newGame(11);
  const d = st.dealer;
  while (st.phase !== "handdone" && st.phase !== "gameover") L.aiStep(st);
  if (st.phase === "handdone") { L.nextHand(st); assert.equal(st.dealer, (d + 1) % 4); }
});

test("same seed gives the same deals, different seeds differ", () => {
  const a = L.newGame(123), b = L.newGame(123), c = L.newGame(124);
  assert.deepEqual(a.hands, b.hands);
  assert.equal(a.dealer, b.dealer);
  assert.notDeepEqual(a.hands, c.hands);
});

test("AI evaluates a monster hand as an alone bid and a junk hand as a pass", () => {
  const st = L.newGame(1);
  st.dealer = 0; st.turn = 1; st.phase = "bid1"; st.upcard = "9H"; st.kitty[0] = "9H";
  st.hands[1] = ["JH", "JD", "AH", "KH", "AS"];
  const b = L.aiBid(st);
  assert.equal(b.type, "order");
  assert.equal(b.alone, true);
  st.hands[1] = ["9S", "TC", "QD", "9C", "KD"];
  assert.equal(L.aiBid(st).type, "pass");
});

test("AI leads right bower with both bowers, off aces as defender, and does not trump partner", () => {
  let st = mk({ trump: "H", maker: 0, turn: 1 });
  st.hands[1] = ["JH", "JD", "9S", "9C", "9D"];
  assert.equal(L.aiPlay(st), "JH");
  st = mk({ trump: "H", maker: 0, turn: 1 });
  st.hands[1] = ["AS", "KC", "9C", "TH", "9D"];
  assert.equal(L.aiPlay(st), "AS");
  // partner (seat 3) is winning with the ace, seat 1 is void in spades and holds trump: discard low
  st = mk({ trump: "H", maker: 0, turn: 1, trick: [{ seat: 3, card: "AS" }] });
  st.hands[1] = ["9H", "KC", "9D"];
  const c = L.aiPlay(st);
  assert.notEqual(c, "9H");
  assert.equal(c, "9D");
  // opponent winning, void and holding trump: trump in with the lowest
  st = mk({ trump: "H", maker: 1, turn: 0, trick: [{ seat: 1, card: "AS" }] });
  st.hands[0] = ["9H", "QH", "9D"];
  assert.equal(L.aiPlay(st), "9H");
});

test("dealer discard keeps trump and bowers, throws a weak off suit card", () => {
  const st = L.newGame(1);
  st.dealer = 0; st.trump = "H"; st.phase = "discard";
  st.hands[0] = ["JH", "JD", "AH", "9S", "AC", "9D"];
  const d = L.aiDiscard(st);
  assert.ok(["9S", "9D"].includes(d));
});

test("AI always plays legal cards and bids legally over hundreds of full games", () => {
  let hands = 0, alone = 0, euchres = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const st = L.newGame(seed, { stick: seed % 5 !== 0 });
    let steps = 0;
    while (st.phase !== "gameover") {
      assert.ok(++steps < 3000, "no infinite loop, seed " + seed);
      if (st.phase === "bid1" || st.phase === "bid2") {
        const b = L.aiBid(st);
        assert.ok(L.legalBids(st).some((x) => x.type === b.type && (x.suit || null) === (b.suit || null) && (x.alone || false) === (b.alone || false)), "legal bid");
      } else if (st.phase === "play") {
        const c = L.aiPlay(st);
        assert.ok(L.legalPlays(st).includes(c), "legal play");
        assert.ok(st.hands[st.turn].includes(c));
      } else if (st.phase === "discard") {
        assert.ok(st.hands[st.dealer].includes(L.aiDiscard(st)));
      }
      L.aiStep(st);
      if (st.phase === "handdone" || st.phase === "gameover") {
        hands++; if (st.result.alone) alone++; if (st.result.euchre) euchres++;
        assert.ok(st.result.points >= 1 && st.result.points <= 4);
      }
    }
    assert.ok(st.scores[st.winner] >= 10);
    assert.ok(st.scores[1 - st.winner] < 10);
  }
  assert.ok(hands > 1000);
  assert.ok(alone > 0, "AI does go alone sometimes");
  assert.ok(euchres > 0);
});

test("no em dash in the game files", () => {
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "../private/euchre");
  for (const f of fs.readdirSync(dir)) {
    assert.ok(!fs.readFileSync(path.join(dir, f), "utf8").includes(EM), f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(EM));
});
