const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../private/hearts/logic.js");
const EM = String.fromCharCode(0x2014);

// Controlled state in the play phase. Hands default to empty.
function mk(over) {
  const st = L.newGame(1);
  Object.assign(st, {
    phase: "play", passDir: "none", turn: 0, leader: 0, trick: [], trickNo: 1, taken: [[], [], [], []],
    broken: false, played: [], voids: [{}, {}, {}, {}], scores: [0, 0, 0, 0], winner: -1,
    hands: [[], [], [], []], handNo: 4
  }, over || {});
  return st;
}
function playAll(st, cards) { cards.forEach((c) => L.play(st, c)); }
function ctx(first, broken) { return { first: !!first, broken: !!broken }; }

test("deck has 52 unique cards", () => {
  const d = L.makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d).size, 52);
  for (const s of "SHDC") for (const r of "23456789TJQKA") assert.ok(d.includes(r + s));
});

test("deal gives 13 each, nothing missing or duplicated", () => {
  const st = L.newGame(42);
  st.hands.forEach((h) => assert.equal(h.length, 13));
  assert.equal(new Set(st.hands.flat()).size, 52);
  assert.equal(st.phase, "pass");
  assert.equal(st.passDir, "left");
  assert.deepEqual(st.scores, [0, 0, 0, 0]);
});

test("pass direction rotates left, right, across, none", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(L.passDirName), ["left", "right", "across", "none", "left", "right", "across", "none"]);
  assert.equal(L.passTarget(0, "left"), 1);
  assert.equal(L.passTarget(0, "right"), 3);
  assert.equal(L.passTarget(0, "across"), 2);
});

for (const [dir, handNo, off] of [["left", 1, 1], ["right", 2, 3], ["across", 3, 2]]) {
  test("passing " + dir + " moves exactly the chosen cards", () => {
    const st = L.newGame(5);
    while (st.handNo < handNo) { st.phase = "handdone"; L.nextHand(st); }
    assert.equal(st.passDir, dir);
    const before = st.hands.map((h) => h.slice());
    const picks = before.map((h) => [h[0], h[4], h[8]]);
    for (let s = 0; s < 4; s++) L.submitPass(st, s, picks[s]);
    assert.equal(st.phase, "play");
    for (let s = 0; s < 4; s++) {
      const from = (s - off + 4) % 4;
      assert.equal(st.hands[s].length, 13);
      picks[from].forEach((c) => assert.ok(st.hands[s].includes(c)));
      picks[s].forEach((c) => assert.ok(!st.hands[s].includes(c)));
      assert.deepEqual(st.received[s].slice().sort(), picks[from].slice().sort());
    }
    assert.equal(new Set(st.hands.flat()).size, 52);
  });
}

test("a hold hand skips the pass and goes straight to play", () => {
  const st = L.newGame(9);
  while (st.handNo < 4) { st.phase = "handdone"; L.nextHand(st); }
  assert.equal(st.passDir, "none");
  assert.equal(st.phase, "play");
  st.hands.forEach((h) => assert.equal(h.length, 13));
});

test("pass validation: three distinct cards from your hand, only once", () => {
  const st = L.newGame(3);
  const h = st.hands[0];
  assert.throws(() => L.submitPass(st, 0, [h[0], h[1]]));
  assert.throws(() => L.submitPass(st, 0, [h[0], h[0], h[1]]));
  const foreign = st.hands[1][0];
  assert.throws(() => L.submitPass(st, 0, [h[0], h[1], foreign]));
  L.submitPass(st, 0, [h[0], h[1], h[2]]);
  assert.throws(() => L.submitPass(st, 0, [h[3], h[4], h[5]]));
});

test("holder of the 2 of clubs leads and may only play it", () => {
  for (let seed = 1; seed < 30; seed++) {
    const st = L.newGame(seed);
    while (st.phase === "pass") L.aiStep(st);
    const holder = st.hands.findIndex((h) => h.includes("2C"));
    assert.equal(st.turn, holder);
    assert.equal(st.leader, holder);
    assert.deepEqual(L.legalPlays(st, holder), ["2C"]);
  }
});

test("first trick: no hearts or Queen of Spades unless nothing else", () => {
  // void in clubs, has other cards
  assert.deepEqual(L.legalFrom(["QS", "5H", "9D", "3S"], [{ seat: 3, card: "2C" }], ctx(true)).sort(), ["3S", "9D"]);
  // only point cards, anything goes
  assert.deepEqual(L.legalFrom(["QS", "5H"], [{ seat: 3, card: "2C" }], ctx(true)).sort(), ["5H", "QS"]);
  // must still follow clubs
  assert.deepEqual(L.legalFrom(["QS", "5C", "AH"], [{ seat: 3, card: "2C" }], ctx(true)), ["5C"]);
  // Jack of diamonds is not a point card on the first trick
  assert.ok(L.legalFrom(["JD", "QS", "5H"], [{ seat: 3, card: "2C" }], ctx(true)).includes("JD"));
  // after the first trick, dumping is fine
  assert.equal(L.legalFrom(["QS", "5H"], [{ seat: 3, card: "2C" }], ctx(false)).length, 2);
});

test("must follow suit if able, otherwise anything", () => {
  const trick = [{ seat: 1, card: "9D" }];
  assert.deepEqual(L.legalFrom(["2D", "KD", "AH", "3S"], trick, ctx(false, true)).sort(), ["2D", "KD"]);
  assert.equal(L.legalFrom(["AH", "3S", "4C"], trick, ctx(false, true)).length, 3);
});

test("hearts cannot be led until broken", () => {
  assert.deepEqual(L.legalFrom(["3H", "9S", "KC"], [], ctx(false, false)).sort(), ["9S", "KC"]);
  assert.equal(L.legalFrom(["3H", "9S", "KC"], [], ctx(false, true)).length, 3);
});

test("only-hearts exception: a hand of nothing but hearts may lead one", () => {
  assert.deepEqual(L.legalFrom(["3H", "9H"], [], ctx(false, false)).sort(), ["3H", "9H"]);
});

test("Queen of Spades may be led before hearts are broken, and does not break them", () => {
  const st = mk({ hands: [["QS", "3H"], ["4S", "5S"], ["6S", "7S"], ["8S", "9S"]] });
  assert.ok(L.legalPlays(st, 0).includes("QS"));
  assert.equal(st.broken, false);
  L.play(st, "QS");
  assert.equal(st.broken, false);
});

test("playing a heart breaks hearts", () => {
  const st = mk({ turn: 0, hands: [["2D", "9S"], ["4H", "5D"], ["6D", "7S"], ["8D", "9D"]] });
  L.play(st, "2D");
  assert.equal(st.broken, false);
  L.play(st, "5D");
  L.play(st, "6D");
  L.play(st, "8D");
  const st2 = mk({ turn: 0, hands: [["2D", "9S"], ["4H", "9C"], ["6D", "7S"], ["8D", "AD"]] });
  L.play(st2, "2D"); L.play(st2, "4H");
  assert.equal(st2.broken, true);
});

test("illegal plays and plays out of turn throw", () => {
  const st = mk({ hands: [["2D", "9S"], ["4D", "5D"], ["6D", "7S"], ["8D", "9D"]] });
  L.play(st, "2D");
  assert.throws(() => L.play(st, "9S")); // seat 1 holds no 9S
  assert.throws(() => L.play(st, "7S")); // not in seat 1's hand
});

test("trick resolution: highest of the led suit wins, off suit never wins", () => {
  const st = mk({ turn: 2, hands: [["AS", "2D"], ["3D", "9H"], ["KD", "2S"], ["QD", "2H"]] });
  // seat 2 leads KD, seat 3 QD, seat 0 AS (off suit), seat 1 3D
  playAll(st, ["KD"]);
  assert.equal(st.turn, 3);
  L.play(st, "QD");
  assert.equal(st.turn, 0);
  assert.throws(() => L.play(st, "AS")); // must follow diamonds
  L.play(st, "2D");
  L.play(st, "3D");
  assert.equal(st.phase, "trickdone");
  assert.equal(st.trickWinner, 2);
  L.collect(st);
  assert.equal(st.turn, 2);
  assert.equal(st.trickNo, 2);
  assert.deepEqual(st.taken[2].slice().sort(), ["2D", "3D", "KD", "QD"]);
});

test("a discarded off suit ace does not win and records a void", () => {
  const st = mk({ turn: 0, hands: [["5D"], ["AS"], ["9D"], ["2D"]] });
  playAll(st, ["5D", "AS", "9D", "2D"]);
  assert.equal(st.trickWinner, 2);
  assert.equal(st.voids[1].D, true);
});

test("scoring: hearts one each, Queen of Spades 13", () => {
  const taken = [["2H", "3H", "QS"], ["4H"], [], ["AS"]];
  const r = L.scoreHand(taken, {});
  assert.deepEqual(r.raw, [15, 1, 0, 0]);
  assert.deepEqual(r.delta, [15, 1, 0, 0]);
  assert.equal(r.moon, -1);
});

function moonTaken(seat) {
  const t = [[], [], [], []];
  t[seat] = L.makeDeck().filter((c) => c[1] === "H" || c === "QS");
  t[(seat + 1) % 4] = L.makeDeck().filter((c) => !(c[1] === "H" || c === "QS"));
  return t;
}

test("shooting the moon, default: shooter 0, everyone else +26", () => {
  const r = L.scoreHand(moonTaken(2), { moon: "others" });
  assert.equal(r.moon, 2);
  assert.deepEqual(r.delta, [26, 26, 0, 26]);
  assert.deepEqual(L.scoreHand(moonTaken(1), undefined).delta, [26, 0, 26, 26]);
});

test("shooting the moon, option: shooter -26, others 0", () => {
  const r = L.scoreHand(moonTaken(3), { moon: "self" });
  assert.deepEqual(r.delta, [0, 0, 0, -26]);
});

test("13 hearts without the Queen is not a moon", () => {
  const t = [L.makeDeck().filter((c) => c[1] === "H"), ["QS"], [], []];
  const r = L.scoreHand(t, {});
  assert.equal(r.moon, -1);
  assert.deepEqual(r.delta, [13, 13, 0, 0]);
});

test("Jack of Diamonds: minus 10 only when the option is on", () => {
  const taken = [["JD", "2H"], ["QS"], [], []];
  assert.deepEqual(L.scoreHand(taken, { jd: false }).delta, [1, 13, 0, 0]);
  assert.deepEqual(L.scoreHand(taken, { jd: true }).delta, [-9, 13, 0, 0]);
  assert.equal(L.cardPoints("JD", false), 0);
  assert.equal(L.cardPoints("JD", true), -10);
});

test("a full hand end is scored into the totals and applies the moon", () => {
  const st = mk({ trickNo: 12, hands: [["AH"], ["2H"], ["3H"], ["4H"]], turn: 0 });
  // seat 0 already holds ten point cards and wins the last trick of four hearts
  st.taken[0] = L.makeDeck().filter((c) => (c[1] === "H" || c === "QS") && !["AH", "2H", "3H", "4H"].includes(c));
  playAll(st, ["AH", "2H", "3H", "4H"]);
  assert.equal(st.trickWinner, 0);
  L.collect(st);
  assert.equal(st.trickNo, 13);
  assert.equal(st.result.moon, 0);
  assert.deepEqual(st.scores, [0, 26, 26, 26]);
  assert.equal(st.phase, "handdone");
});

function endState(scores, raw) {
  const st = mk({ trickNo: 12, scores: scores.slice(), hands: [["2D"], ["3D"], ["4D"], ["5D"]], turn: 0 });
  st.taken = [[], [], [], []];
  // seat 3 wins the last trick holding the cards implied by raw (hearts only), 5D is highest
  const hearts = L.makeDeck().filter((c) => c[1] === "H");
  let k = 0;
  raw.forEach((n, s) => { for (let i = 0; i < n; i++) st.taken[s].push(hearts[k++]); });
  playAll(st, ["2D", "3D", "4D", "5D"]);
  L.collect(st);
  return st;
}

test("game ends when someone reaches 100, lowest total wins", () => {
  const st = endState([60, 99, 40, 30], [0, 1, 0, 0]);
  assert.equal(st.phase, "gameover");
  assert.equal(st.scores[1], 100);
  assert.equal(st.winner, 3);
});

test("below 100 the game continues", () => {
  const st = endState([60, 98, 40, 30], [0, 1, 0, 0]);
  assert.equal(st.phase, "handdone");
  assert.equal(st.winner, -1);
});

test("a tie for the lowest score when the game would end plays one more hand", () => {
  const st = endState([100, 80, 20, 20], [0, 0, 0, 0]);
  assert.equal(st.phase, "handdone");
  assert.equal(st.winner, -1);
  assert.match(st.notice, /Tied/);
  assert.deepEqual(L.lowestSeats(st.scores), [2, 3]);
  L.nextHand(st);
  assert.equal(st.handNo, 5);
  assert.equal(st.phase, "pass");
});

test("a unique low score wins even when the ended game has several over 100", () => {
  const st = endState([120, 110, 20, 25], [0, 0, 0, 0]);
  assert.equal(st.phase, "gameover");
  assert.equal(st.winner, 2);
});

test("seed determinism: same seed same deals and same whole game", () => {
  const a = L.newGame(1234), b = L.newGame(1234), c = L.newGame(1235);
  assert.deepEqual(a.hands, b.hands);
  assert.notDeepEqual(a.hands, c.hands);
  while (a.phase !== "gameover") L.aiStep(a);
  while (b.phase !== "gameover") L.aiStep(b);
  assert.deepEqual(a.scores, b.scores);
  assert.equal(a.handNo, b.handNo);
});

test("state is JSON serializable and a restored copy plays on identically", () => {
  const st = L.newGame(7);
  for (let i = 0; i < 40; i++) L.aiStep(st);
  const copy = JSON.parse(JSON.stringify(st));
  assert.deepEqual(copy, st);
  while (st.phase !== "gameover") L.aiStep(st);
  while (copy.phase !== "gameover") L.aiStep(copy);
  assert.deepEqual(copy.scores, st.scores);
});

test("moonHand recognises an overwhelming hand only", () => {
  const big = ["AH", "KH", "QH", "JH", "TH", "9H", "AS", "KS", "QS", "AD", "KD", "AC", "3C"];
  assert.equal(L.moonHand(big), true);
  assert.equal(L.moonHand(["2H", "3H", "4H", "5H", "6H", "7H", "AS", "KS", "QS", "AD", "KD", "AC", "3C"]), false);
});

test("AI passes three of its own cards: dangerous spades go, a protected Queen stays", () => {
  const st = L.newGame(1);
  st.hands[1] = ["QS", "KS", "AS", "2D", "3D", "4D", "5C", "6C", "7C", "8C", "9C", "TC", "JC"];
  assert.deepEqual(L.chooseAIPass(st, 1).sort(), ["AS", "KS", "QS"]);
  st.hands[1] = ["QS", "2S", "3S", "4S", "5S", "9D", "TD", "JD", "7C", "8C", "9C", "TC", "JC"];
  assert.ok(!L.chooseAIPass(st, 1).includes("QS"));
  st.hands[1] = ["AH", "KH", "2H", "3D", "4D", "5D", "6C", "7C", "8C", "9C", "TC", "2S", "3S"];
  const p = L.chooseAIPass(st, 1);
  assert.ok(p.includes("AH") && p.includes("KH"));
});

test("AI dumps the Queen of Spades on a trick it cannot win", () => {
  const st = mk({ turn: 1, trickNo: 4, hands: [[], ["QS", "3S", "2D"], [], []] });
  st.trick = [{ seat: 0, card: "KS" }];
  st.played = ["KS"];
  st.turn = 1;
  assert.equal(L.chooseAIPlay(st, 1), "QS");
});

test("AI ducks under the current winner instead of taking points", () => {
  const st = mk({ turn: 1, trickNo: 4, broken: true, hands: [[], ["5H", "AH"], [], []] });
  st.trick = [{ seat: 0, card: "9H" }];
  st.played = ["9H"];
  assert.equal(L.chooseAIPlay(st, 1), "5H");
});

test("AI sloughs hearts or the Queen when void in the led suit", () => {
  const st = mk({ turn: 1, trickNo: 4, broken: true, hands: [[], ["QS", "AH", "2C"], [], []] });
  st.trick = [{ seat: 0, card: "9D" }];
  st.played = ["9D"];
  assert.equal(L.chooseAIPlay(st, 1), "QS");
});

test("AI never plays illegally and never loops across hundreds of seeded games", () => {
  let moons = 0;
  for (let seed = 1; seed <= 250; seed++) {
    const st = L.newGame(seed, { jd: seed % 2 === 0, moon: seed % 3 === 0 ? "self" : "others" });
    let steps = 0;
    while (st.phase !== "gameover") {
      if (st.phase === "play") {
        const s = st.turn;
        const choice = L.chooseAIPlay(st, s);
        assert.ok(L.legalPlays(st, s).includes(choice), "seed " + seed + " illegal " + choice);
      }
      if (st.phase === "handdone" && st.result.moon >= 0) moons++;
      L.aiStep(st);
      if (st.phase === "handdone") {
        assert.equal(st.hands.flat().length, 0);
        const sum = st.result.delta.reduce((a, b) => a + b, 0);
        assert.ok(st.result.moon >= 0 ? true : sum === (st.opts.jd ? 16 : 26), "points total " + sum);
      }
      if (++steps > 30000) throw new Error("loop at seed " + seed);
    }
    assert.ok(Math.max(...st.scores) >= 100);
    assert.equal(L.lowestSeats(st.scores).length, 1);
    assert.equal(st.winner, L.lowestSeats(st.scores)[0]);
  }
  assert.ok(moons >= 0);
});

test("no em dash in the game files", () => {
  const dir = path.join(__dirname, "..", "private", "hearts");
  for (const f of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, f), "utf8").includes(EM), f);
});

test("page pins its base path and uses relative assets", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "private", "hearts", "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/hearts/"'));
  assert.ok(/<head>\s*<meta charset[^>]*>\s*<base href="\/play\/hearts\/"/.test(html));
  assert.ok(html.includes('href="/play/"'));
});
