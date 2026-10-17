"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../private/road-trip/content.js");
const L = require("../private/road-trip/logic.js");

const DASH = String.fromCharCode(0x2014);
const uniq = (arr, key) => new Set(arr.map(key)).size;
const hasEmoji = (s) => /\p{Extended_Pictographic}|\u{1F000}-\u{1FAFF}/u.test(s);

// ---------------------------------------------------------------- banks
test("bank sizes meet the brief minimums", () => {
  assert.ok(C.BINGO.length >= 60, "bingo " + C.BINGO.length);
  assert.ok(C.TWENTY.length >= 150, "twenty " + C.TWENTY.length);
  assert.ok(C.RATHER.length >= 120, "rather " + C.RATHER.length);
  assert.equal(C.STATES.length, 51);
  assert.ok(C.STORIES.length >= 20, "stories " + C.STORIES.length);
  for (const k of ["noun", "animal", "place", "verb", "number"]) assert.ok(C.STORY_WORDS[k].length >= 40, k + " " + C.STORY_WORDS[k].length);
  assert.ok(C.RIDDLES.length >= 80, "riddles " + C.RIDDLES.length);
  assert.ok(C.JOKES.length >= 80, "jokes " + C.JOKES.length);
});

test("banks are unique, tiered where required and free of em dashes", () => {
  assert.equal(uniq(C.BINGO, (b) => b.id), C.BINGO.length);
  assert.equal(uniq(C.BINGO, (b) => b.label), C.BINGO.length);
  assert.equal(uniq(C.TWENTY, (x) => x.name), C.TWENTY.length);
  assert.equal(uniq(C.RATHER, (x) => x.a + "|" + x.b), C.RATHER.length);
  assert.equal(uniq(C.RIDDLES, (x) => x.q), C.RIDDLES.length);
  assert.equal(uniq(C.JOKES, (x) => x.q), C.JOKES.length);
  assert.equal(uniq(C.STORIES, (x) => x), C.STORIES.length);
  for (const k in C.STORY_WORDS) assert.equal(uniq(C.STORY_WORDS[k], (x) => x), C.STORY_WORDS[k].length, k);
  const all = JSON.stringify(C);
  assert.ok(!all.includes(DASH), "em dash in content");
  for (const list of [C.BINGO, C.RATHER, C.RIDDLES, C.JOKES]) for (const x of list) assert.ok(x.tier === "little" || x.tier === "big", "tier missing on " + JSON.stringify(x));
  for (const x of C.TWENTY) assert.ok(["Animal", "Food", "Place", "Object", "Job", "Vehicle"].includes(x.cat), x.name);
});

test("every bingo item has an emoji and both sets can fill a 24 cell card", () => {
  for (const b of C.BINGO) assert.ok(b.emoji && hasEmoji(b.emoji), b.id + " emoji");
  assert.ok(L.bingoPool("little").length >= 24);
  assert.ok(L.bingoPool("big").length >= 24);
  for (const c of C.COUNTABLES) assert.ok(hasEmoji(c.emoji) && /^#[0-9A-F]{6}$/i.test(c.color), c.id);
});

test("all 50 states plus DC are present once with a one line fact", () => {
  const want = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  assert.equal(want.length, 51);
  assert.deepEqual(C.STATES.map((s) => s.ab).sort(), want.slice().sort());
  assert.equal(uniq(C.STATES, (s) => s.name), 51);
  for (const s of C.STATES) {
    assert.ok(s.fact && s.fact.length > 20 && s.fact.length < 110, s.ab + " fact length");
    assert.ok(!s.fact.includes("\n"));
  }
  assert.equal(L.statesSorted()[0].name, "Alabama");
  assert.equal(L.statesSorted()[50].name, "Wyoming");
});

// ---------------------------------------------------------------- bingo
test("seeded bingo cards are deterministic, differ by seed and never repeat an item", () => {
  const a = L.makeBingoCard(42, "little"), b = L.makeBingoCard(42, "little"), c = L.makeBingoCard(43, "little");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.cells, c.cells);
  for (let seed = 1; seed <= 60; seed++) {
    for (const tier of ["little", "big"]) {
      const card = L.makeBingoCard(seed, tier);
      assert.equal(card.cells.length, 25);
      assert.equal(new Set(card.cells).size, 25, "duplicate on seed " + seed);
      assert.equal(card.cells[L.FREE], "free");
      assert.equal(card.marked.filter(Boolean).length, 1, "only the free space starts marked");
      for (const id of card.cells) if (id !== "free") assert.equal(L.bingoItem(id).tier, tier, "wrong tier on " + id);
    }
  }
  assert.equal(L.bingoCells(a)[L.FREE].label, "Free");
});

test("all 12 bingo lines and blackout are detected", () => {
  assert.equal(L.BINGO_LINES.length, 12);
  for (let li = 0; li < 12; li++) {
    const card = L.makeBingoCard(5, "big");
    for (const i of L.BINGO_LINES[li]) if (i !== L.FREE) L.bingoToggle(card, i);
    assert.deepEqual(L.bingoLines(card.marked), [li], "line " + li);
    assert.equal(card.won, true);
  }
  const card = L.makeBingoCard(9, "little");
  assert.deepEqual(L.bingoLines(card.marked), []);
  assert.equal(L.bingoToggle(card, L.FREE).marked[L.FREE], true, "free space cannot be unmarked");
  for (let i = 0; i < 25; i++) if (i !== L.FREE) L.bingoToggle(card, i);
  assert.equal(L.bingoBlackout(card.marked), true);
  assert.equal(L.bingoLines(card.marked).length, 12);
  L.bingoToggle(card, 0);
  assert.equal(L.bingoBlackout(card.marked), false, "toggle off works");
  assert.equal(card.justWon, false);
});

// ---------------------------------------------------------------- rotation / I spy
test("rotation never repeats until the pool is exhausted, then starts over", () => {
  const rot = L.newRotation(7, 10);
  const first = [];
  for (let i = 0; i < 10; i++) first.push(L.rotate(rot));
  assert.deepEqual(first.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const second = [];
  for (let i = 0; i < 10; i++) second.push(L.rotate(rot));
  assert.deepEqual(second.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.notDeepEqual(first, second, "order should change between cycles");
});

test("I spy prompts rotate per kind without repeats and track counts", () => {
  const st = L.newSpy(3, "little");
  const seenColours = [];
  for (let i = 0; i < 60; i++) {
    const p = L.spyNext(st);
    assert.ok(["colour", "letter", "shape"].includes(p.kind));
    assert.ok(p.text.startsWith("something"));
    if (p.kind === "colour") { assert.match(p.hex, /^#/); seenColours.push(p.value); }
    if (p.kind === "letter") assert.ok(C.ISPY_LETTERS.includes(p.value), "little set skips hard letters");
  }
  const n = C.ISPY_COLOURS.length;
  const firstCycle = seenColours.slice(0, n);
  assert.equal(new Set(firstCycle).size, n, "no colour repeats in the first " + n);
  L.spyGot(st); L.spyGot(st); L.spySkip(st);
  assert.equal(st.got, 2); assert.equal(st.skipped, 1);
  const big = L.newSpy(3, "big");
  let sawQ = false;
  for (let i = 0; i < 200; i++) { const p = L.spyNext(big); if (p.kind === "letter" && p.value === "Q") sawQ = true; }
  assert.ok(sawQ, "big set includes Q");
  assert.deepEqual(L.newSpy(3, "little").colour, L.newSpy(3, "little").colour, "deterministic");
});

// ---------------------------------------------------------------- 20 questions
test("20 questions: picks honour the category, the counter stops at 20 and undo works", () => {
  const st = L.newTwenty(11);
  const s1 = L.twentyPick(st, "Animal");
  assert.equal(s1.cat, "Animal");
  assert.equal(st.asked, 0);
  for (let i = 0; i < 30; i++) L.twentyAsk(st);
  assert.equal(st.asked, 20);
  assert.equal(L.twentyOut(st), true);
  L.twentyUnask(st); assert.equal(st.asked, 19); assert.equal(L.twentyOut(st), false);
  const names = new Set();
  const st2 = L.newTwenty(5);
  for (let i = 0; i < C.TWENTY.length; i++) names.add(L.twentyPick(st2, "any").name);
  assert.equal(names.size, C.TWENTY.length, "a full cycle visits every item once");
  assert.deepEqual(L.twentyCats(), ["Animal", "Food", "Place", "Object", "Job", "Vehicle"]);
  for (const cat of L.twentyCats()) { const s3 = L.newTwenty(1); for (let i = 0; i < 10; i++) assert.equal(L.twentyPick(s3, cat).cat, cat); }
});

// ---------------------------------------------------------------- would you rather
test("would you rather: votes are counted per player and totals add up", () => {
  const players = [{ name: "Mia", emoji: "a" }, { name: "Leo", emoji: "b" }, { name: "Zoe", emoji: "c" }];
  const st = L.newRather(21, "little", players);
  assert.equal(st.pool.length, C.RATHER.filter((p) => p.tier === "little").length);
  const q = L.ratherNext(st);
  assert.equal(q.tier, "little");
  assert.equal(L.ratherVote(st, 0, "a"), false);
  assert.equal(L.ratherVote(st, 0, "b"), false, "a player cannot vote twice in a round");
  assert.equal(L.ratherVote(st, 1, "b"), false);
  assert.equal(L.ratherVote(st, 2, "a"), true, "third vote completes the round");
  assert.equal(L.ratherRoundDone(st), true);
  assert.equal(st.rounds, 1);
  L.ratherNext(st);
  assert.equal(st.turn, 0);
  L.ratherVote(st, 0, "a"); L.ratherVote(st, 1, "a"); L.ratherVote(st, 2, "b");
  const t = L.ratherTotals(st);
  assert.deepEqual(t.map((x) => [x.name, x.a, x.b]), [["Mia", 2, 0], ["Leo", 1, 1], ["Zoe", 1, 1]]);
  assert.equal(t.reduce((n, x) => n + x.total, 0), 6);
  assert.equal(L.ratherVote(st, 0, "c"), false, "bad side ignored");
  const solo = L.newRather(1, "big", []);
  L.ratherNext(solo);
  assert.equal(L.ratherVote(solo, 0, "a"), true, "no roster: one vote ends the round");
  assert.equal(L.ratherTotals(solo)[0].name, "Everyone");
  const seen = new Set();
  const cyc = L.newRather(3, "big", []);
  for (let i = 0; i < cyc.pool.length; i++) seen.add(L.ratherNext(cyc).a);
  assert.equal(seen.size, cyc.pool.length, "no repeats across one full cycle");
});

// ---------------------------------------------------------------- alphabet
test("alphabet hunt: in-order mode only enables the next letter, any mode enables all, timer and best", () => {
  const st = L.newAlphabet("order");
  assert.equal(L.alphaNext(st), "A");
  assert.equal(L.alphaCanTap(st, "B"), false);
  assert.equal(L.alphaTap(st, "B", 1000), false);
  assert.equal(L.alphaTap(st, "A", 1000), true);
  assert.equal(st.startedAt, 1000);
  assert.equal(L.alphaNext(st), "B");
  assert.equal(L.alphaCanTap(st, "A"), false, "found letters are not tappable");
  L.alphaUndo(st); assert.deepEqual(st.found, []); assert.equal(st.startedAt, null, "undoing the only letter resets the clock");
  let t = 2000;
  for (const ch of L.ALPHA) assert.equal(L.alphaTap(st, ch, (t += 1000)), true);
  assert.equal(st.finishedAt, t);
  assert.equal(L.alphaElapsed(st, 999999), 25000);
  assert.equal(L.alphaBest(null, st), 25000);
  assert.equal(L.alphaBest(20000, st), 20000);
  assert.equal(L.alphaBest(30000, st), 25000);
  const any = L.newAlphabet("any");
  assert.equal(L.alphaCanTap(any, "Q"), true);
  assert.equal(L.alphaTap(any, "Q", 5), true);
  assert.equal(L.alphaCanTap(any, "Q"), false);
  assert.equal(L.alphaElapsed(any, 1005), 1000);
  assert.equal(L.fmtMs(25000), "0:25");
  assert.equal(L.fmtMs(125000), "2:05");
});

// ---------------------------------------------------------------- plates
test("license plates: toggle, count and reset", () => {
  const st = L.newPlates();
  assert.equal(L.platesCount(st), 0);
  assert.equal(L.platesToggle(st, "CA"), true);
  assert.equal(L.platesToggle(st, "TX"), true);
  assert.equal(L.platesCount(st), 2);
  assert.equal(L.platesToggle(st, "CA"), false);
  assert.equal(L.platesCount(st), 1);
  for (const s of C.STATES) st.found[s.ab] = 1;
  assert.equal(L.platesCount(st), 51);
  assert.equal(L.platesCount(L.newPlates()), 0);
});

// ---------------------------------------------------------------- story
test("story fill never leaves a blank and every template has slots the banks can fill", () => {
  for (const tpl of C.STORIES) {
    const slots = L.storySlots(tpl);
    assert.ok(slots.length >= 3, "few slots: " + tpl);
    for (const s of slots) assert.ok(C.STORY_WORDS[s], "unknown slot " + s);
    assert.ok(!/\{[^}]*\}/.test(tpl.replace(/\{(noun|animal|place|verb|number)\}/g, "")), "stray brace in " + tpl);
  }
  for (let seed = 1; seed <= 40; seed++) {
    const st = L.newStory(seed);
    L.storyNext(st);
    const choices = L.storyChoices(st);
    assert.equal(choices.length, 3);
    assert.equal(new Set(choices).size, 3);
    assert.ok(C.STORY_WORDS[st.slots[0]].includes(choices[0]));
    L.storyPick(st, choices[1]);
    assert.equal(st.filled[0], choices[1]);
    L.storyBack(st); assert.equal(st.step, 0);
    const text = L.storyAuto(st);
    assert.ok(L.storyDone(st));
    assert.ok(!text.includes("{") && !text.includes("____"), text);
    assert.ok(!text.includes(DASH));
  }
  const parts = L.fillStory("A {animal} ate {number} {noun}s.", ["cat", "two"]);
  assert.deepEqual(parts, [{ text: "A " }, { slot: "animal", word: "cat" }, { text: " ate " }, { slot: "number", word: "two" }, { text: " " }, { slot: "noun", word: null }, { text: "s." }]);
  const seen = new Set();
  const st = L.newStory(2);
  for (let i = 0; i < C.STORIES.length; i++) { L.storyNext(st); seen.add(st.tpl); }
  assert.equal(seen.size, C.STORIES.length, "templates do not repeat until exhausted");
});

test("round robin story: turns rotate through players and the 30 second clock counts down", () => {
  const rb = L.newRobin([{ name: "Mia", emoji: "a" }, { name: "Leo", emoji: "b" }], 0);
  assert.equal(L.robinWho(rb).name, "Mia");
  assert.equal(L.robinRemaining(rb, 0), 30);
  assert.equal(L.robinRemaining(rb, 12000), 18);
  assert.equal(L.robinRemaining(rb, 99000), 0);
  L.robinAdd(rb, "  A goat drove to town.  ", 5000);
  assert.deepEqual(rb.lines, ["A goat drove to town."]);
  assert.equal(L.robinWho(rb).name, "Leo");
  assert.equal(L.robinRemaining(rb, 6000), 29);
  L.robinAdd(rb, "", 7000);
  assert.equal(rb.lines[1], "(sentence 2)");
  assert.equal(L.robinWho(rb).name, "Mia");
  assert.equal(L.robinWho(L.newRobin([], 0)).name, "Next person");
});

// ---------------------------------------------------------------- riddles
test("riddle and joke filters by tier, reveal and rotation", () => {
  const little = L.filterTier(C.RIDDLES, "little"), big = L.filterTier(C.RIDDLES, "big"), all = L.filterTier(C.RIDDLES, "all");
  assert.equal(little.length + big.length, all.length);
  assert.ok(little.length >= 30 && big.length >= 30);
  assert.ok(little.every((x) => x.tier === "little") && big.every((x) => x.tier === "big"));
  assert.ok(L.filterTier(C.JOKES, "little").length >= 30 && L.filterTier(C.JOKES, "big").length >= 30);
  const st = L.newRiddles(4, "jokes", "big");
  const first = L.riddleNext(st);
  assert.equal(first.tier, "big");
  assert.equal(st.revealed, false);
  L.riddleReveal(st); assert.equal(st.revealed, true);
  L.riddleNext(st); assert.equal(st.revealed, false);
  assert.equal(st.seen, 2);
  const qs = new Set();
  const n = L.riddleList(st).length;
  const st2 = L.newRiddles(8, "riddles", "little");
  for (let i = 0; i < L.riddleList(st2).length; i++) qs.add(L.riddleNext(st2).q);
  assert.equal(qs.size, L.riddleList(st2).length);
  assert.ok(n > 0);
  for (const x of C.RIDDLES.concat(C.JOKES)) assert.ok(x.q.length > 8 && x.a.length > 1, x.q);
});

// ---------------------------------------------------------------- count it
test("count it: counters, undo, win detection and the 2 to 4 limit", () => {
  const st = L.newCount(["redcars", "trucks", "cows", "dogs", "buses"], 3);
  assert.deepEqual(st.ids, ["redcars", "trucks", "cows", "dogs"], "at most four counters");
  assert.equal(L.countAdd(st, "nope"), false);
  L.countAdd(st, "redcars"); L.countAdd(st, "redcars"); L.countAdd(st, "cows");
  assert.equal(st.counts.redcars, 2);
  assert.equal(st.winner, null);
  L.countAdd(st, "redcars");
  assert.equal(st.winner, "redcars");
  assert.equal(L.countAdd(st, "trucks"), false, "no counting after a win");
  assert.equal(L.countUndo(st), true);
  assert.equal(st.winner, null);
  assert.equal(st.counts.redcars, 2);
  assert.equal(L.countUndo(st), true); assert.equal(st.counts.cows, 0);
  L.countUndo(st); L.countUndo(st);
  assert.equal(L.countUndo(st), false, "nothing left to undo");
  assert.deepEqual(st.counts, { redcars: 0, trucks: 0, cows: 0, dogs: 0 });
  assert.equal(L.newCount(["a"], 0).target, 1);
  assert.equal(L.countable("cows").label, "Cows");
});

// ---------------------------------------------------------------- quiet
test("quiet timer: pure transitions given timestamps, talked restarts and keeps the record", () => {
  const st = L.newQuiet(3, 1000, 0);
  assert.equal(st.total, 180000);
  let t = L.quietTick(st, 1000);
  assert.equal(t.remaining, 180000); assert.equal(t.frac, 0); assert.equal(t.done, false);
  t = L.quietTick(st, 91000);
  assert.equal(t.remaining, 90000); assert.equal(t.frac, 0.5);
  L.quietTalked(st, 91000);
  assert.equal(st.talks, 1);
  assert.equal(st.record, 90000, "the 90 second streak becomes the record");
  assert.equal(st.startedAt, 91000);
  assert.equal(L.quietTick(st, 91000).remaining, 180000);
  L.quietTalked(st, 101000);
  assert.equal(st.record, 90000, "a shorter streak does not lower the record");
  t = L.quietTick(st, 101000 + 180000 + 5000);
  assert.equal(t.done, true); assert.equal(t.remaining, 0); assert.equal(st.running, false);
  assert.equal(st.record, 180000, "finishing sets the record to the full time");
  assert.equal(L.quietTick(st, 999999999).done, true, "stays done");
  assert.equal(L.newQuiet(0, 0, 0).total, 60000, "minimum one minute");
});

// ---------------------------------------------------------------- shared
test("deep link parsing: known ids open the game, unknown or missing ids fall back to the menu", () => {
  for (const g of L.GAMES) assert.equal(L.parseGame("?g=" + g.id), g.id);
  assert.equal(L.GAMES.length, 10);
  assert.equal(L.parseGame("?g=bingo&seed=4"), "bingo");
  assert.equal(L.parseGame("?seed=4&g=plates"), "plates");
  assert.equal(L.parseGame("?g=poker"), "menu");
  assert.equal(L.parseGame("?g="), "menu");
  assert.equal(L.parseGame(""), "menu");
  assert.equal(L.parseGame(undefined), "menu");
  assert.equal(L.parseSeed("?g=bingo&seed=77"), 77);
  assert.equal(L.parseSeed("?seed=0"), 1);
  assert.equal(L.parseSeed("?g=bingo"), null);
  const groups = new Set(L.GAMES.map((g) => g.group));
  assert.deepEqual([...groups].sort(), ["busy", "look", "talk"]);
  for (const g of L.GAMES) assert.ok(g.blurb && g.emoji && g.title && !g.blurb.includes(DASH));
});

test("prefs normalisation and JSON round trips of every game state", () => {
  assert.deepEqual(L.normalizePrefs(null), { age: "little", players: [] });
  assert.deepEqual(L.normalizePrefs({ age: "huge", players: "x" }), { age: "little", players: [] });
  const p = L.normalizePrefs({ age: "big", players: [{ name: "A very very long name indeed", emoji: "x" }, { nope: 1 }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }] });
  assert.equal(p.age, "big");
  assert.equal(p.players.length, 4, "at most four players after filtering");
  assert.equal(p.players[0].name.length, 14);
  assert.equal(p.players[1].emoji, "🙂");
  const states = {
    bingo: L.makeBingoCard(1, "big"), spy: L.newSpy(1, "big"), twenty: L.newTwenty(1), rather: L.newRather(1, "little", [{ name: "A", emoji: "a" }]),
    alpha: L.newAlphabet("any"), plates: L.newPlates(), story: L.newStory(1), robin: L.newRobin([], 5), riddles: L.newRiddles(1, "riddles", "all"),
    count: L.newCount(["cows", "dogs"], 5), quiet: L.newQuiet(1, 0, 0)
  };
  L.spyNext(states.spy); L.twentyPick(states.twenty, "Food"); L.ratherNext(states.rather); L.storyNext(states.story); L.riddleNext(states.riddles);
  const back = JSON.parse(JSON.stringify(states));
  assert.deepEqual(back, states);
  // the revived copy keeps producing the same sequence as the original
  assert.equal(L.spyNext(back.spy).text, L.spyNext(states.spy).text);
  assert.equal(L.riddleNext(back.riddles).q, L.riddleNext(states.riddles).q);
  assert.deepEqual(L.storyChoices(back.story), L.storyChoices(states.story));
});

test("page contract: base href, noindex, relative assets, no em dash, no external URLs", () => {
  const dir = path.join(__dirname, "..", "private", "road-trip");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/road-trip/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/road-trip\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('name="theme-color" content="#F3EDE3"'));
  assert.ok(html.includes('href="/play/"'));
  assert.match(html, /href="\/play\/"[^>]*>[^<]*back to games/);
  assert.ok(html.includes("<title>Road Trip</title>"));
  assert.ok(html.includes('src="content.js"') && html.includes('src="logic.js"') && html.includes('src="app.js"') && html.includes('href="style.css"'));
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  for (const f of ["marcellus", "jost-400", "jost-500", "jost-600"]) assert.ok(css.includes("/fonts/" + f + ".woff2"), f);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["app.js", "content.js", "index.html", "logic.js", "style.css"]);
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!txt.includes(DASH), "em dash in " + f);
    assert.ok(!/https?:\/\//.test(txt.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "external URL in " + f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(DASH));
  for (const f of ["logic.js", "content.js"]) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/document\.\w|window\.\w|Math\.random|Date\.now|new Date/.test(src), f + " is pure");
  }
  const appSrc = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  assert.ok(appSrc.includes("kz.road-trip.save.v1") && appSrc.includes("kz.road-trip.prefs.v1"));
  assert.ok(appSrc.includes("prefers-reduced-motion") && appSrc.includes("speechSynthesis"));
});
