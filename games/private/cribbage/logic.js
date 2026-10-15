// Cribbage rules engine and computer opponent. Pure logic: no DOM, no clock
// reads, all randomness from a seeded mulberry32 whose state lives inside the
// game state, so a state is plain JSON and the same seed always gives the same
// deals. Player 0 is the human, player 1 is the computer.
//
// Cards are two character strings: rank (A 2 3 4 5 6 7 8 9 T J Q K) then suit
// (S H D C). Phases: "discard" (waiting for the human), "play" (pegging),
// "count" (showing hands one at a time), "over".
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CribbageLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
  var SUITS = ["S", "H", "D", "C"];
  var SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };
  var WIN = 121;
  var NAMES = ["You", "Computer"];
  var FULL = [];
  (function () { for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) FULL.push(RANKS[r] + SUITS[s]); })();

  // ---------------------------------------------------------------- basics

  function rankIdx(c) { return RANKS.indexOf(c[0]) + 1; }           // A=1 .. K=13 (run order)
  function val(c) { var r = rankIdx(c); return r > 10 ? 10 : r; }   // counting value
  function suitOf(c) { return c[1]; }
  function rankName(c) { return c[0] === "T" ? "10" : c[0]; }
  function cardName(c) { return rankName(c) + SYM[c[1]]; }
  function plural(c) { return rankName(c) + "s"; }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) d.push(RANKS[r] + SUITS[s]);
    return d;
  }

  function mulberry32(a) {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { next: a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }
  // Draw a number in [0,1) and advance the state stored in st.rng.
  function rnd(st) { var r = mulberry32(st.rng); st.rng = r.next; return r.v; }

  function shuffle(st, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(st) * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function sortCards(a) {
    return a.sort(function (x, y) { return rankIdx(x) - rankIdx(y) || SUITS.indexOf(x[1]) - SUITS.indexOf(y[1]); });
  }

  // ------------------------------------------------------------ hand count

  function combos(arr, k) {
    var out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  function isRun(cards) {
    var r = cards.map(rankIdx).sort(function (a, b) { return a - b; });
    for (var i = 1; i < r.length; i++) if (r[i] !== r[i - 1] + 1) return false;
    return true;
  }

  // Score a counted hand. hand: 4 cards. Returns { total, items:[{label, pts, cards}] }.
  // crib: true when scoring the crib (only a 5 card flush counts).
  function scoreHand(hand, starter, crib) {
    var all = hand.concat([starter]);
    var items = [], total = 0;
    function add(label, pts, cards) { items.push({ label: label, pts: pts, cards: cards }); total += pts; }

    // fifteens
    for (var k = 2; k <= 5; k++) {
      combos(all, k).forEach(function (cb) {
        var s = 0; cb.forEach(function (c) { s += val(c); });
        if (s === 15) add("15 for 2", 2, cb);
      });
    }
    // pairs
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      if (all[i][0] === all[j][0]) add("pair of " + plural(all[i]) + " for 2", 2, [all[i], all[j]]);
    }
    // runs: longest length only, every distinct combination counts (double and triple runs)
    for (var len = 5; len >= 3; len--) {
      var found = combos(all, len).filter(isRun);
      if (found.length) {
        found.forEach(function (cb) { add("run of " + len + " for " + len, len, cb); });
        break;
      }
    }
    // flush
    var fs = suitOf(hand[0]);
    if (hand.every(function (c) { return suitOf(c) === fs; })) {
      if (suitOf(starter) === fs) add("flush of 5 for 5", 5, all);
      else if (!crib) add("flush of 4 for 4", 4, hand.slice());
    }
    // nobs
    for (var n = 0; n < hand.length; n++) {
      if (hand[n][0] === "J" && suitOf(hand[n]) === suitOf(starter)) add("his nobs for 1", 1, [hand[n]]);
    }
    return { total: total, items: items };
  }

  // Allocation free total of scoreHand, used by the computer's discard search.
  // Kept equal to scoreHand(...).total (a test cross-checks them).
  function fastTotal(hand, starter, crib) {
    var cs = [hand[0], hand[1], hand[2], hand[3], starter];
    var v = [], r = [], cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], i, j, m, t = 0;
    for (i = 0; i < 5; i++) { r[i] = rankIdx(cs[i]); v[i] = r[i] > 10 ? 10 : r[i]; cnt[r[i]]++; }
    for (m = 1; m < 32; m++) {
      var s = 0;
      for (i = 0; i < 5; i++) if (m & (1 << i)) s += v[i];
      if (s === 15) t += 2;
    }
    for (i = 1; i <= 13; i++) t += cnt[i] * (cnt[i] - 1);         // 2 per pair
    for (var len = 5; len >= 3; len--) {
      var runs = 0;
      for (i = 1; i + len - 1 <= 13; i++) {
        var pr = 1;
        for (j = i; j < i + len; j++) pr *= cnt[j];
        runs += pr;
      }
      if (runs) { t += runs * len; break; }
    }
    var fs = hand[0][1];
    if (hand[1][1] === fs && hand[2][1] === fs && hand[3][1] === fs) {
      if (starter[1] === fs) t += 5; else if (!crib) t += 4;
    }
    for (i = 0; i < 4; i++) if (hand[i][0] === "J" && hand[i][1] === starter[1]) t++;
    return t;
  }

  // ----------------------------------------------------------- pegging score

  // pile: the cards of the current sequence (strings), last one just played.
  // Returns { pts, items:[{label, pts}] }.
  function pegScore(pile) {
    var items = [], pts = 0;
    function add(label, p) { items.push({ label: label, pts: p }); pts += p; }
    var total = 0; pile.forEach(function (c) { total += val(c); });
    if (total === 15) add("15 for 2", 2);
    if (total === 31) add("31 for 2", 2);
    // same rank in a row at the end
    var same = 1;
    for (var i = pile.length - 2; i >= 0 && pile[i][0] === pile[pile.length - 1][0]; i--) same++;
    if (same === 2) add("pair for 2", 2);
    else if (same === 3) add("three of a kind for 6", 6);
    else if (same >= 4) add("four of a kind for 12", 12);
    // longest run among the last n cards (any order)
    for (var n = pile.length; n >= 3; n--) {
      var tail = pile.slice(pile.length - n);
      var ranks = tail.map(rankIdx);
      var uniq = ranks.filter(function (r, ix) { return ranks.indexOf(r) === ix; });
      if (uniq.length === n && isRun(tail)) { add("run of " + n + " for " + n, n); break; }
    }
    return { pts: pts, items: items };
  }

  // --------------------------------------------------------------- game core

  function say(st, who, text) {
    st.log.push({ who: who, text: text });
    if (st.log.length > 80) st.log.splice(0, st.log.length - 80);
  }

  // Move a peg forward. Stops at 121 and ends the game on the spot.
  function award(st, p, pts, why) {
    if (st.phase === "over" || pts <= 0) return;
    st.prev[p] = st.scores[p];
    st.scores[p] = Math.min(WIN, st.scores[p] + pts);
    if (st.scores[p] >= WIN) {
      var loser = 1 - p;
      st.winner = p;
      st.skunk = st.scores[loser] < 61 ? 2 : st.scores[loser] < 91 ? 1 : 0;
      st.phase = "over";
      st.turn = -1;
      say(st, p, NAMES[p] + (p === 0 ? " reach" : " reaches") + " 121 and " + (p === 0 ? "win" : "wins") + (st.skunk === 2 ? " with a double skunk." : st.skunk === 1 ? " with a skunk." : "."));
    }
  }

  function newGame(seed) {
    var st = {
      v: 1, seed: seed >>> 0, rng: seed >>> 0, phase: "discard",
      scores: [0, 0], prev: [0, 0], dealer: 0, round: 0,
      hands: [[], []], keep: [[], []], crib: [], starter: null, deck: [],
      pegHands: [[], []], pile: [], total: 0, played: [], turn: -1, goSaid: -1,
      lastPlay: null, count: { step: 0, current: null }, discarded: [false, false],
      winner: -1, skunk: 0, log: []
    };
    st.dealer = rnd(st) < 0.5 ? 0 : 1;
    startRound(st);
    return st;
  }

  function startRound(st) {
    st.round++;
    var deck = shuffle(st, makeDeck());
    st.hands = [sortCards(deck.slice(0, 6)), sortCards(deck.slice(6, 12))];
    st.deck = deck.slice(12);
    st.keep = [[], []]; st.crib = []; st.starter = null;
    st.pegHands = [[], []]; st.pile = []; st.total = 0; st.played = [];
    st.goSaid = -1; st.lastPlay = null; st.turn = -1;
    st.count = { step: 0, current: null };
    st.discarded = [false, false];
    st.phase = "discard";
    say(st, -1, "Hand " + st.round + ": " + (st.dealer === 0 ? "you deal, the crib is yours." : "the computer deals, the crib is the computer's."));
    // The computer chooses its discards right away (hidden from the human).
    var pick = aiDiscard(st.hands[1], st.dealer === 1);
    discard(st, 1, pick);
  }

  function discard(st, p, cards) {
    if (st.phase !== "discard" || st.discarded[p]) return false;
    if (!cards || cards.length !== 2 || cards[0] === cards[1]) return false;
    var h = st.hands[p];
    if (!cards.every(function (c) { return h.indexOf(c) >= 0; })) return false;
    st.hands[p] = h.filter(function (c) { return cards.indexOf(c) < 0; });
    st.crib = st.crib.concat(cards);
    st.discarded[p] = true;
    say(st, p, NAMES[p] + (p === 0 ? " send" : " sends") + " 2 cards to the crib.");
    if (st.discarded[0] && st.discarded[1]) cut(st);
    return true;
  }

  function cut(st) {
    st.keep = [sortCards(st.hands[0].slice()), sortCards(st.hands[1].slice())];
    st.pegHands = [st.keep[0].slice(), st.keep[1].slice()];
    st.starter = st.deck[Math.floor(rnd(st) * st.deck.length)];
    st.deck = [];
    st.phase = "play";
    st.turn = 1 - st.dealer;
    say(st, -1, "Starter card: " + cardName(st.starter) + ".");
    if (st.starter[0] === "J") {
      say(st, st.dealer, NAMES[st.dealer] + " peg" + (st.dealer === 0 ? "" : "s") + " 2 for his heels.");
      award(st, st.dealer, 2, "his heels");
    }
  }

  function legalPlays(st, p) {
    if (st.phase !== "play") return [];
    return st.pegHands[p].filter(function (c) { return st.total + val(c) <= 31; });
  }

  function resetSeq(st) { st.pile = []; st.total = 0; st.goSaid = -1; }

  function play(st, p, card) {
    if (st.phase !== "play" || st.turn !== p) return false;
    if (legalPlays(st, p).indexOf(card) < 0) return false;
    st.pegHands[p] = st.pegHands[p].filter(function (c) { return c !== card; });
    st.pile.push(card);
    st.played.push({ p: p, card: card });
    st.total += val(card);
    var sc = pegScore(st.pile);
    st.lastPlay = { p: p, card: card, pts: sc.pts, total: st.total };
    var txt = NAMES[p] + (p === 0 ? " play " : " plays ") + cardName(card) + " (" + st.total + ")";
    if (sc.items.length) txt += ": " + sc.items.map(function (i) { return i.label; }).join(", ");
    say(st, p, txt);
    award(st, p, sc.pts, "play");
    if (st.phase === "over") return true;
    afterPlay(st, p);
    return true;
  }

  function canPlay(st, p) { return legalPlays(st, p).length > 0; }

  function afterPlay(st, p) {
    var o = 1 - p, ph = st.pegHands;
    if (!ph[0].length && !ph[1].length) {
      if (st.total !== 31) {
        say(st, p, NAMES[p] + (p === 0 ? " get" : " gets") + " 1 for the last card.");
        award(st, p, 1, "last card");
        if (st.phase === "over") return;
      }
      endPlay(st);
      return;
    }
    if (st.total === 31) { resetSeq(st); st.turn = ph[o].length ? o : p; return; }
    if (canPlay(st, o)) { st.turn = o; return; }
    if (canPlay(st, p)) {
      if (ph[o].length && st.goSaid !== o) { st.goSaid = o; say(st, o, NAMES[o] + (o === 0 ? " have no playable card: go." : " says go.")); }
      st.turn = p;
      return;
    }
    // neither can play: last player to play pegs one for go
    if (ph[o].length && st.goSaid !== o) say(st, o, NAMES[o] + (o === 0 ? " have no playable card: go." : " says go."));
    say(st, p, NAMES[p] + (p === 0 ? " get" : " gets") + " 1 for go.");
    award(st, p, 1, "go");
    if (st.phase === "over") return;
    resetSeq(st);
    st.turn = ph[o].length ? o : p;
  }

  function endPlay(st) {
    st.phase = "count";
    st.turn = -1;
    st.count = { step: 0, current: null };
    st.pile = []; st.total = 0;
    say(st, -1, "Pegging is over. Time to count the hands.");
  }

  // Show and score the next hand (non-dealer, dealer, crib). After the crib,
  // the next call starts the next deal.
  function countNext(st) {
    if (st.phase !== "count") return false;
    var c = st.count;
    if (c.step >= 3) {
      st.dealer = 1 - st.dealer;
      startRound(st);
      return true;
    }
    var nd = 1 - st.dealer, who, kind, cards;
    if (c.step === 0) { who = nd; kind = "hand"; cards = st.keep[nd]; }
    else if (c.step === 1) { who = st.dealer; kind = "hand"; cards = st.keep[st.dealer]; }
    else { who = st.dealer; kind = "crib"; cards = sortCards(st.crib.slice()); }
    var sc = scoreHand(cards, st.starter, kind === "crib");
    c.current = { who: who, kind: kind, cards: cards.slice(), items: sc.items, total: sc.total };
    c.step++;
    var nm = kind === "crib" ? (who === 0 ? "Your crib" : "The computer's crib") : (who === 0 ? "Your hand" : "The computer's hand");
    say(st, who, nm + " counts " + sc.total + (sc.items.length ? ": " + sc.items.map(function (i) { return i.label; }).join(", ") : " (no points)") + ".");
    award(st, who, sc.total, kind);
    return true;
  }

  // ------------------------------------------------------------ computer AI

  // Rough value of two cards thrown to the crib, in points.
  function cribValue(a, b) {
    var v = 0, ra = rankIdx(a), rb = rankIdx(b);
    if (val(a) + val(b) === 15) v += 2;
    if (ra === rb) v += 2;
    var d = Math.abs(ra - rb);
    if (d === 1) v += 1.1; else if (d === 2) v += 0.6;
    if (a[0] === "5" || b[0] === "5") v += 1.2;       // a 5 makes fifteens with any ten card
    if (a[0] === "J" || b[0] === "J") v += 0.3;       // nobs chance
    if (suitOf(a) === suitOf(b)) v += 0.2;
    return v;
  }

  // Choose 2 cards to discard from 6: keep the 4 with the best average score
  // over the 46 unseen starters, then add or subtract the crib's expected value.
  function aiDiscard(hand6, ownsCrib) {
    var unseen = FULL.filter(function (c) { return hand6.indexOf(c) < 0; });
    var best = null, bestV = -1e9;
    combos(hand6, 4).forEach(function (keep) {
      var sum = 0;
      for (var i = 0; i < unseen.length; i++) sum += fastTotal(keep, unseen[i], false);
      var out = hand6.filter(function (c) { return keep.indexOf(c) < 0; });
      var cv = cribValue(out[0], out[1]) * 0.9;
      var v = sum / unseen.length + (ownsCrib ? cv : -cv);
      if (v > bestV + 1e-9) { bestV = v; best = out; }
    });
    return best;
  }

  // Chance that the opponent (holding n unknown cards) has a card worth v.
  function oppHasValue(st, me, v) {
    var seen = {};
    st.played.forEach(function (x) { seen[x.card] = true; });
    st.keep[me].forEach(function (c) { seen[c] = true; });
    seen[st.starter] = true;
    var unseen = 0, hit = 0;
    FULL.forEach(function (c) {
      if (seen[c]) return;
      unseen++;
      if (val(c) === v) hit++;
    });
    if (!unseen) return 0;
    var n = st.pegHands[1 - me].length;
    return 1 - Math.pow(1 - hit / unseen, n);
  }

  function aiPlayChoice(st, p) {
    var legal = legalPlays(st, p);
    if (legal.length <= 1) return legal[0] || null;
    var best = null, bestV = -1e9;
    legal.forEach(function (c) {
      var pile = st.pile.concat([c]);
      var sc = pegScore(pile);
      var t = st.total + val(c);
      var v = sc.pts * 10;
      // what could the opponent make in reply
      if (t < 15 && 15 - t <= 10) v -= 2.6 * oppHasValue(st, p, 15 - t) * 2;
      if (t < 31 && 31 - t <= 10) v -= 2.2 * oppHasValue(st, p, 31 - t);
      // pair or run setups for the opponent are mild risks
      if (st.pile.length && st.pile[st.pile.length - 1][0] === c[0]) v -= 0.5;
      if (!st.pile.length) {
        if (c[0] === "5") v -= 3;
        else if (val(c) === 10) v -= 1.2;
        else if (val(c) <= 4) v += 0.8;
      }
      // keep a small card in reserve for go: spend big cards first when nothing else matters
      v += val(c) * 0.06;
      // do not burn the last low card if a larger legal card does the same job
      if (v > bestV + 1e-9) { bestV = v; best = c; }
    });
    return best;
  }

  // Let the computer act if it is its turn. Returns true if it did something.
  function aiStep(st) {
    if (st.phase === "play" && st.turn === 1) {
      var c = aiPlayChoice(st, 1);
      if (c) return play(st, 1, c);
    }
    return false;
  }

  return {
    RANKS: RANKS, SUITS: SUITS, SYM: SYM, WIN: WIN, NAMES: NAMES,
    makeDeck: makeDeck, mulberry32: mulberry32, val: val, rankIdx: rankIdx, cardName: cardName, rankName: rankName,
    sortCards: sortCards, scoreHand: scoreHand, fastTotal: fastTotal, pegScore: pegScore, newGame: newGame, startRound: startRound,
    discard: discard, legalPlays: legalPlays, play: play, countNext: countNext,
    aiDiscard: aiDiscard, aiPlayChoice: aiPlayChoice, aiStep: aiStep, cribValue: cribValue
  };
});
