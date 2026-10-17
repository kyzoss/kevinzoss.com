// Road Trip pure logic. No DOM, no clock reads, no unseeded randomness: every function
// takes its inputs as arguments (states are plain JSON, timestamps are passed
// in) so the same seed always gives the same cards, prompts and stories.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.RoadTripContent);
  else root.RoadTripLogic = factory(root.RoadTripContent);
})(typeof self !== "undefined" ? self : this, function (preloaded) {
  "use strict";
  var C = preloaded || (typeof require === "function" ? require("./content.js") : null);

  // ------------------------------------------------------------ rng
  function mulberry(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(st, n) { return Math.floor(mulberry(st) * n); }
  function shuffle(st, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var k = randInt(st, i + 1); var tmp = a[i]; a[i] = a[k]; a[k] = tmp; }
    return a;
  }
  function seedFrom(n) { return (Number(n) | 0) || 1; }

  // Rotation: picks indexes from a pool with no repeats until the pool is exhausted, then starts over.
  function newRotation(seed, size) { return { rng: seedFrom(seed), size: size, used: [] }; }
  function rotate(rot) {
    if (rot.used.length >= rot.size) rot.used = [];
    var free = [];
    for (var i = 0; i < rot.size; i++) if (rot.used.indexOf(i) < 0) free.push(i);
    var pick = free[randInt(rot, free.length)];
    rot.used.push(pick);
    return pick;
  }

  // ------------------------------------------------------------ games list and deep links
  var GAMES = [
    { id: "bingo", title: "Road Trip Bingo", emoji: "🚗", group: "look", blurb: "Spot things out the window and fill a row." },
    { id: "ispy", title: "I Spy", emoji: "👀", group: "look", blurb: "The phone picks a colour, letter or shape. You find it." },
    { id: "alphabet", title: "Alphabet Hunt", emoji: "🔤", group: "look", blurb: "Find A to Z on signs and plates." },
    { id: "plates", title: "License Plate Hunt", emoji: "🚘", group: "look", blurb: "Collect all 50 states plus D.C." },
    { id: "count", title: "Count It", emoji: "🔢", group: "look", blurb: "A counting race. First to the finish wins." },
    { id: "twenty", title: "20 Questions", emoji: "❓", group: "talk", blurb: "Guess the secret thing in 20 yes or no questions." },
    { id: "rather", title: "Would You Rather", emoji: "🤔", group: "talk", blurb: "Silly choices. Pass the phone and vote." },
    { id: "story", title: "Story Chain", emoji: "📖", group: "talk", blurb: "Fill the blanks for a silly story, or build one together." },
    { id: "riddles", title: "Riddles and Jokes", emoji: "😂", group: "talk", blurb: "Tap to reveal the answer or the punchline." },
    { id: "quiet", title: "Quiet Game", emoji: "🤫", group: "busy", blurb: "Who can stay quiet the longest? Shh." }
  ];
  var GROUPS = [
    { id: "look", title: "Look out the window" },
    { id: "talk", title: "Talk and laugh" },
    { id: "busy", title: "Keep busy" }
  ];
  function gameById(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; }
  // ?g=<id> deep link. Unknown or missing ids fall back to the menu.
  function parseGame(search) {
    var m = /[?&]g=([a-z]+)/.exec(search || "");
    return m && gameById(m[1]) ? m[1] : "menu";
  }
  function parseSeed(search) {
    var m = /[?&]seed=(-?\d+)/.exec(search || "");
    return m ? seedFrom(parseInt(m[1], 10)) : null;
  }

  // ------------------------------------------------------------ prefs
  function defaultPrefs() { return { age: "little", players: [] }; }
  function normalizePrefs(p) {
    var d = defaultPrefs();
    if (!p || typeof p !== "object") return d;
    if (p.age === "big" || p.age === "little") d.age = p.age;
    if (Array.isArray(p.players)) {
      d.players = p.players.filter(function (x) { return x && typeof x.name === "string"; }).slice(0, 4)
        .map(function (x) { return { name: String(x.name).slice(0, 14), emoji: typeof x.emoji === "string" ? x.emoji : "🙂" }; });
    }
    return d;
  }

  // ------------------------------------------------------------ bingo
  var BINGO_LINES = (function () {
    var L = [], r, c;
    for (r = 0; r < 5; r++) { var row = []; for (c = 0; c < 5; c++) row.push(r * 5 + c); L.push(row); }
    for (c = 0; c < 5; c++) { var col = []; for (r = 0; r < 5; r++) col.push(r * 5 + c); L.push(col); }
    L.push([0, 6, 12, 18, 24]); L.push([4, 8, 12, 16, 20]);
    return L;
  })();
  var FREE = 12;
  function bingoPool(tier) { return C.BINGO.filter(function (b) { return tier === "big" ? b.tier === "big" : b.tier === "little"; }); }
  function makeBingoCard(seed, tier) {
    var st = { rng: seedFrom(seed) };
    var pool = shuffle(st, bingoPool(tier)).slice(0, 24).map(function (b) { return b.id; });
    pool.splice(FREE, 0, "free");
    var marked = []; for (var i = 0; i < 25; i++) marked.push(i === FREE);
    return { seed: seedFrom(seed), tier: tier === "big" ? "big" : "little", cells: pool, marked: marked, won: false };
  }
  function bingoItem(id) { for (var i = 0; i < C.BINGO.length; i++) if (C.BINGO[i].id === id) return C.BINGO[i]; return null; }
  function bingoLines(marked) {
    var out = [];
    for (var i = 0; i < BINGO_LINES.length; i++) {
      var ok = true;
      for (var k = 0; k < 5; k++) if (!marked[BINGO_LINES[i][k]]) { ok = false; break; }
      if (ok) out.push(i);
    }
    return out;
  }
  function bingoBlackout(marked) { for (var i = 0; i < 25; i++) if (!marked[i]) return false; return true; }
  function bingoToggle(card, i) {
    if (i === FREE) return card;
    var before = bingoLines(card.marked).length;
    card.marked[i] = !card.marked[i];
    var after = bingoLines(card.marked).length;
    card.justWon = after > before;
    if (after > 0) card.won = true;
    return card;
  }
  function bingoCells(card) { return card.cells.map(function (id) { return id === "free" ? { id: "free", label: "Free", emoji: "⭐" } : bingoItem(id); }); }

  // ------------------------------------------------------------ I spy
  function newSpy(seed, tier) {
    var s = seedFrom(seed);
    var letters = tier === "big" ? C.ISPY_LETTERS_BIG : C.ISPY_LETTERS;
    return {
      tier: tier === "big" ? "big" : "little", kind: { rng: s },
      colour: newRotation(s + 1, C.ISPY_COLOURS.length), letter: newRotation(s + 2, letters.length), shape: newRotation(s + 3, C.ISPY_SHAPES.length),
      got: 0, skipped: 0, current: null, timer: null
    };
  }
  function spyNext(st) {
    var kinds = ["colour", "colour", "letter", "shape"];
    if (st.tier === "little") kinds = ["colour", "colour", "colour", "letter", "shape"];
    var kind = kinds[randInt(st.kind, kinds.length)];
    var letters = st.tier === "big" ? C.ISPY_LETTERS_BIG : C.ISPY_LETTERS;
    var idx = rotate(st[kind]);
    if (kind === "colour") { var c = C.ISPY_COLOURS[idx]; st.current = { kind: kind, text: "something " + c.name, value: c.name, hex: c.hex }; }
    else if (kind === "letter") st.current = { kind: kind, text: "something that starts with " + letters[idx], value: letters[idx] };
    else st.current = { kind: kind, text: "something that is " + C.ISPY_SHAPES[idx], value: C.ISPY_SHAPES[idx] };
    return st.current;
  }
  function spyGot(st) { st.got++; return spyNext(st); }
  function spySkip(st) { st.skipped++; return spyNext(st); }

  // ------------------------------------------------------------ 20 questions
  var TWENTY_MAX = 20;
  function newTwenty(seed) { return { rot: newRotation(seed, C.TWENTY.length), secret: null, asked: 0, revealed: false, cat: "any" }; }
  function twentyPick(st, cat) {
    st.cat = cat || "any";
    var tries = 0, idx;
    do { idx = rotate(st.rot); tries++; } while (st.cat !== "any" && C.TWENTY[idx].cat !== st.cat && tries < 400);
    st.secret = C.TWENTY[idx]; st.asked = 0; st.revealed = false;
    return st.secret;
  }
  function twentyAsk(st) { if (st.asked < TWENTY_MAX && !st.revealed) st.asked++; return st.asked; }
  function twentyUnask(st) { if (st.asked > 0) st.asked--; return st.asked; }
  function twentyOut(st) { return st.asked >= TWENTY_MAX; }
  function twentyCats() {
    var out = [];
    C.TWENTY.forEach(function (x) { if (out.indexOf(x.cat) < 0) out.push(x.cat); });
    return out;
  }

  // ------------------------------------------------------------ would you rather
  function ratherPool(tier) { return C.RATHER.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return tier === "big" ? x.p.tier === "big" : x.p.tier === "little"; }); }
  function newRather(seed, tier, players) {
    var pool = ratherPool(tier);
    return { tier: tier === "big" ? "big" : "little", rot: newRotation(seed, pool.length), pool: pool.map(function (x) { return x.i; }),
      players: (players || []).slice(0, 4), current: null, turn: 0, votes: {}, rounds: 0, totals: {} };
  }
  function ratherNext(st) {
    st.current = st.pool[rotate(st.rot)];
    st.turn = 0; st.votes = {};
    return C.RATHER[st.current];
  }
  // Records a vote for player index `who` (0 when there is no roster). Returns true when the round is complete.
  function ratherVote(st, who, side) {
    if (side !== "a" && side !== "b") return false;
    var n = Math.max(1, st.players.length);
    if (who < 0 || who >= n || st.votes[who]) return st.turn >= n;
    st.votes[who] = side;
    st.turn++;
    var key = String(who);
    st.totals[key] = st.totals[key] || { a: 0, b: 0 };
    st.totals[key][side]++;
    if (st.turn >= n) st.rounds++;
    return st.turn >= n;
  }
  function ratherRoundDone(st) { return st.turn >= Math.max(1, st.players.length); }
  function ratherTotals(st) {
    var n = Math.max(1, st.players.length), out = [];
    for (var i = 0; i < n; i++) {
      var t = st.totals[String(i)] || { a: 0, b: 0 };
      out.push({ who: i, name: st.players[i] ? st.players[i].name : "Everyone", emoji: st.players[i] ? st.players[i].emoji : "🚗", a: t.a, b: t.b, total: t.a + t.b });
    }
    return out;
  }

  // ------------------------------------------------------------ alphabet hunt
  var ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  function newAlphabet(mode) { return { mode: mode === "any" ? "any" : "order", found: [], startedAt: null, finishedAt: null }; }
  function alphaNext(st) { for (var i = 0; i < 26; i++) if (st.found.indexOf(ALPHA[i]) < 0) return ALPHA[i]; return null; }
  function alphaCanTap(st, letter) {
    if (st.finishedAt || st.found.indexOf(letter) >= 0) return false;
    return st.mode === "any" ? true : alphaNext(st) === letter;
  }
  function alphaTap(st, letter, now) {
    if (!alphaCanTap(st, letter)) return false;
    if (st.startedAt === null) st.startedAt = now;
    st.found.push(letter);
    if (st.found.length === 26) st.finishedAt = now;
    return true;
  }
  function alphaUndo(st) { if (st.found.length && !st.finishedAt) st.found.pop(); if (!st.found.length) st.startedAt = null; return st; }
  function alphaElapsed(st, now) { if (st.startedAt === null) return 0; return (st.finishedAt || now) - st.startedAt; }
  function alphaBest(best, st) { if (!st.finishedAt) return best; var t = st.finishedAt - st.startedAt; return best === null || t < best ? t : best; }

  // ------------------------------------------------------------ license plates
  function newPlates() { return { found: {} }; }
  function platesToggle(st, ab) { if (st.found[ab]) delete st.found[ab]; else st.found[ab] = 1; return !!st.found[ab]; }
  function platesCount(st) { var n = 0; for (var k in st.found) if (st.found[k]) n++; return n; }
  function statesSorted() { return C.STATES.slice().sort(function (a, b2) { return a.name < b2.name ? -1 : 1; }); }

  // ------------------------------------------------------------ story chain
  var SLOT_RE = /\{(noun|animal|place|verb|number)\}/g;
  function newStory(seed) {
    var s = seedFrom(seed);
    var rots = { tpl: newRotation(s, C.STORIES.length) };
    Object.keys(C.STORY_WORDS).forEach(function (k, i) { rots[k] = newRotation(s + 7 * (i + 1), C.STORY_WORDS[k].length); });
    return { rots: rots, tpl: null, slots: [], filled: {}, step: 0 };
  }
  function storySlots(tpl) { var out = [], m; SLOT_RE.lastIndex = 0; while ((m = SLOT_RE.exec(tpl))) out.push(m[1]); return out; }
  // Starts a new story: picks a template and offers choices for each slot.
  function storyNext(st) {
    st.tpl = rotate(st.rots.tpl);
    st.slots = storySlots(C.STORIES[st.tpl]);
    st.filled = {}; st.step = 0;
    return st;
  }
  // Three word chips for the current slot (no repeats within the offer).
  function storyChoices(st) {
    if (st.step >= st.slots.length) return [];
    var kind = st.slots[st.step], words = C.STORY_WORDS[kind], out = [], seen = {};
    while (out.length < 3 && out.length < words.length) {
      var w = words[rotate(st.rots[kind])];
      if (!seen[w]) { seen[w] = 1; out.push(w); }
    }
    return out;
  }
  function storyPick(st, word) {
    if (st.step >= st.slots.length) return false;
    st.filled[st.step] = word; st.step++;
    return true;
  }
  function storyBack(st) { if (st.step > 0) { st.step--; delete st.filled[st.step]; } return st; }
  function storyDone(st) { return st.tpl !== null && st.step >= st.slots.length; }
  // Fills a template in order with the given words (missing words become a blank marker). Returns parts for rendering.
  function fillStory(tpl, words) {
    var parts = [], last = 0, i = 0, m;
    SLOT_RE.lastIndex = 0;
    while ((m = SLOT_RE.exec(tpl))) {
      if (m.index > last) parts.push({ text: tpl.slice(last, m.index) });
      parts.push({ slot: m[1], word: words[i] === undefined ? null : words[i] });
      i++; last = m.index + m[0].length;
    }
    if (last < tpl.length) parts.push({ text: tpl.slice(last) });
    return parts;
  }
  function storyText(st) {
    var words = []; for (var i = 0; i < st.slots.length; i++) words.push(st.filled[i]);
    return fillStory(C.STORIES[st.tpl], words).map(function (p) { return p.text !== undefined ? p.text : (p.word === null ? "____" : p.word); }).join("");
  }
  // Quick fill for "Surprise me": fills every slot from the rotations.
  function storyAuto(st) {
    while (!storyDone(st)) storyPick(st, storyChoices(st)[0]);
    return storyText(st);
  }
  // Round robin: a growing story the kids dictate, 30 seconds per turn.
  var ROBIN_SECS = 30;
  function newRobin(players, now) { return { players: (players || []).slice(0, 4), turn: 0, lines: [], turnStartedAt: now, secs: ROBIN_SECS }; }
  function robinWho(st) { var n = Math.max(1, st.players.length); return st.players[st.turn % n] || { name: "Next person", emoji: "🗣️" }; }
  function robinRemaining(st, now) { return Math.max(0, st.secs - Math.floor((now - st.turnStartedAt) / 1000)); }
  function robinAdd(st, text, now) { st.lines.push(String(text || "").trim() || "(sentence " + (st.lines.length + 1) + ")"); st.turn++; st.turnStartedAt = now; return st; }

  // ------------------------------------------------------------ riddles and jokes
  function filterTier(list, tier) {
    if (tier === "all") return list.slice();
    return list.filter(function (x) { return x.tier === (tier === "big" ? "big" : "little"); });
  }
  function newRiddles(seed, kind, tier) {
    var list = filterTier(kind === "jokes" ? C.JOKES : C.RIDDLES, tier);
    return { kind: kind === "jokes" ? "jokes" : "riddles", tier: tier, rot: newRotation(seed, list.length), idx: null, revealed: false, seen: 0 };
  }
  function riddleList(st) { return filterTier(st.kind === "jokes" ? C.JOKES : C.RIDDLES, st.tier); }
  function riddleNext(st) { st.idx = rotate(st.rot); st.revealed = false; st.seen++; return riddleList(st)[st.idx]; }
  function riddleReveal(st) { st.revealed = true; return st; }

  // ------------------------------------------------------------ count it
  function newCount(ids, target) {
    var counts = {}; ids.slice(0, 4).forEach(function (id) { counts[id] = 0; });
    return { ids: ids.slice(0, 4), target: Math.max(1, target | 0), counts: counts, history: [], winner: null };
  }
  function countAdd(st, id) {
    if (st.winner || !(id in st.counts)) return false;
    st.counts[id]++; st.history.push(id);
    if (st.counts[id] >= st.target) st.winner = id;
    return true;
  }
  function countUndo(st) {
    if (!st.history.length) return false;
    var id = st.history.pop(); st.counts[id]--;
    if (st.winner === id && st.counts[id] < st.target) st.winner = null;
    return true;
  }
  function countable(id) { for (var i = 0; i < C.COUNTABLES.length; i++) if (C.COUNTABLES[i].id === id) return C.COUNTABLES[i]; return null; }

  // ------------------------------------------------------------ quiet game
  function newQuiet(minutes, now, record) {
    return { total: Math.max(1, minutes) * 60000, startedAt: now, running: true, talks: 0, record: record || 0, done: false };
  }
  function quietTick(st, now) {
    if (!st.running) return { remaining: st.total, frac: 0, done: st.done };
    var elapsed = Math.max(0, now - st.startedAt), remaining = Math.max(0, st.total - elapsed);
    if (remaining === 0 && !st.done) { st.done = true; st.running = false; st.record = Math.max(st.record, st.total); }
    return { remaining: remaining, frac: Math.min(1, elapsed / st.total), done: st.done };
  }
  // Someone talked: the streak so far counts toward the record, then the timer restarts.
  function quietTalked(st, now) {
    var elapsed = Math.max(0, now - st.startedAt);
    if (st.running) st.record = Math.max(st.record, elapsed);
    st.talks++; st.startedAt = now; st.running = true; st.done = false;
    return st;
  }
  function fmtMs(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  return {
    GAMES: GAMES, GROUPS: GROUPS, gameById: gameById, parseGame: parseGame, parseSeed: parseSeed, mulberry: mulberry, shuffle: shuffle,
    newRotation: newRotation, rotate: rotate, defaultPrefs: defaultPrefs, normalizePrefs: normalizePrefs,
    BINGO_LINES: BINGO_LINES, FREE: FREE, bingoPool: bingoPool, makeBingoCard: makeBingoCard, bingoLines: bingoLines, bingoBlackout: bingoBlackout, bingoToggle: bingoToggle, bingoCells: bingoCells, bingoItem: bingoItem,
    newSpy: newSpy, spyNext: spyNext, spyGot: spyGot, spySkip: spySkip,
    TWENTY_MAX: TWENTY_MAX, newTwenty: newTwenty, twentyPick: twentyPick, twentyAsk: twentyAsk, twentyUnask: twentyUnask, twentyOut: twentyOut, twentyCats: twentyCats,
    newRather: newRather, ratherNext: ratherNext, ratherVote: ratherVote, ratherRoundDone: ratherRoundDone, ratherTotals: ratherTotals,
    ALPHA: ALPHA, newAlphabet: newAlphabet, alphaNext: alphaNext, alphaCanTap: alphaCanTap, alphaTap: alphaTap, alphaUndo: alphaUndo, alphaElapsed: alphaElapsed, alphaBest: alphaBest,
    newPlates: newPlates, platesToggle: platesToggle, platesCount: platesCount, statesSorted: statesSorted,
    newStory: newStory, storySlots: storySlots, storyNext: storyNext, storyChoices: storyChoices, storyPick: storyPick, storyBack: storyBack, storyDone: storyDone, fillStory: fillStory, storyText: storyText, storyAuto: storyAuto,
    ROBIN_SECS: ROBIN_SECS, newRobin: newRobin, robinWho: robinWho, robinRemaining: robinRemaining, robinAdd: robinAdd,
    filterTier: filterTier, newRiddles: newRiddles, riddleList: riddleList, riddleNext: riddleNext, riddleReveal: riddleReveal,
    newCount: newCount, countAdd: countAdd, countUndo: countUndo, countable: countable,
    newQuiet: newQuiet, quietTick: quietTick, quietTalked: quietTalked, fmtMs: fmtMs
  };
});
