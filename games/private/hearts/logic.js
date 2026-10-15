// Hearts rules engine and computer players. Pure logic: no DOM, no clock reads,
// all randomness from a seeded mulberry32 whose state lives inside the game
// state, so a state is plain JSON and the same seed always gives the same deals.
//
// Seats run clockwise: 0 South (human), 1 West, 2 North, 3 East.
// Cards are two character strings: rank (2-9 T J Q K A) then suit (S H D C).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HeartsLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SUITS = ["S", "H", "D", "C"];
  var RANKS = "23456789TJQKA".split("");
  var SEAT_NAMES = ["South", "West", "North", "East"];
  var DIRS = ["left", "right", "across", "none"];
  var END_SCORE = 100;
  var QS = "QS", JD = "JD", TWO_C = "2C";

  // ---------------------------------------------------------------- basics

  function rankIdx(c) { return RANKS.indexOf(c[0]); }
  function suitOf(c) { return c[1]; }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) d.push(RANKS[r] + SUITS[s]);
    return d;
  }

  // Penalty value of a card: hearts 1, Queen of Spades 13, Jack of Diamonds -10 when enabled.
  function cardPoints(c, jd) {
    if (c === QS) return 13;
    if (c[1] === "H") return 1;
    if (c === JD && jd) return -10;
    return 0;
  }
  function isPointCard(c) { return c === QS || c[1] === "H"; }

  function passDirName(handNo) { return DIRS[(handNo - 1) % 4]; }
  // Seat that receives the cards passed from `seat`.
  function passTarget(seat, dir) {
    if (dir === "left") return (seat + 1) % 4;
    if (dir === "right") return (seat + 3) % 4;
    if (dir === "across") return (seat + 2) % 4;
    return seat;
  }

  // Display order: suit blocks (alternating colours), high to low inside a suit.
  function sortHand(hand) {
    var order = ["S", "H", "C", "D"];
    return hand.slice().sort(function (a, b) {
      var d = order.indexOf(a[1]) - order.indexOf(b[1]);
      return d || rankIdx(b) - rankIdx(a);
    });
  }

  // ---------------------------------------------------------------- rng

  function nextRand(st) {
    var a = (st.rng + 0x6d2b79f5) | 0;
    st.rng = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- setup

  // opts: { moon: "others" (default, others +26) | "self" (shooter -26), jd: false }
  function newGame(seed, opts) {
    var st = {
      seed: seed | 0,
      rng: seed | 0,
      opts: {
        moon: opts && opts.moon === "self" ? "self" : "others",
        jd: !!(opts && opts.jd)
      },
      scores: [0, 0, 0, 0],
      handNo: 0,
      winner: -1,
      notice: "",
      phase: "pass"
    };
    deal(st);
    return st;
  }

  function deal(st) {
    var deck = makeDeck();
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(nextRand(st) * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    st.handNo += 1;
    st.hands = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)];
    st.passDir = passDirName(st.handNo);
    st.passSel = [null, null, null, null];
    st.received = [[], [], [], []];
    st.trick = [];
    st.trickWinner = -1;
    st.trickNo = 0;
    st.taken = [[], [], [], []];
    st.broken = false;
    st.played = [];
    st.voids = [{}, {}, {}, {}];
    st.last = null;
    st.lastTrick = null;
    st.result = null;
    st.leader = -1;
    st.turn = 0;
    if (st.passDir === "none") startPlay(st);
    else st.phase = "pass";
  }

  function startPlay(st) {
    st.phase = "play";
    for (var s = 0; s < 4; s++) if (st.hands[s].indexOf(TWO_C) >= 0) st.leader = s;
    st.turn = st.leader;
  }

  // ---------------------------------------------------------------- passing

  function validPass(st, seat, cards) {
    if (st.phase !== "pass" || st.passSel[seat]) return false;
    if (!cards || cards.length !== 3) return false;
    var hand = st.hands[seat];
    for (var i = 0; i < 3; i++) {
      if (hand.indexOf(cards[i]) < 0) return false;
      if (cards.indexOf(cards[i]) !== i) return false;
    }
    return true;
  }

  // Record one seat's three cards. When all four are in, the exchange happens at once.
  function submitPass(st, seat, cards) {
    if (!validPass(st, seat, cards)) throw new Error("illegal pass");
    st.passSel[seat] = cards.slice();
    var done = true;
    for (var s = 0; s < 4; s++) if (!st.passSel[s]) done = false;
    if (done) resolvePass(st);
  }

  function resolvePass(st) {
    var give = st.passSel, s;
    for (s = 0; s < 4; s++) {
      st.hands[s] = st.hands[s].filter(function (c) { return give[s].indexOf(c) < 0; });
    }
    for (s = 0; s < 4; s++) {
      var to = passTarget(s, st.passDir);
      st.hands[to] = st.hands[to].concat(give[s]);
      st.received[to] = give[s].slice();
    }
    startPlay(st);
  }

  // ---------------------------------------------------------------- play rules

  // Cards a player may play. ctx: { first: bool (first trick), broken: bool }
  function legalFrom(hand, trick, ctx) {
    var i, out;
    if (!trick.length) {
      if (ctx.first) return hand.indexOf(TWO_C) >= 0 ? [TWO_C] : hand.slice();
      if (!ctx.broken) {
        out = [];
        for (i = 0; i < hand.length; i++) if (hand[i][1] !== "H") out.push(hand[i]);
        if (out.length) return out;
      }
      return hand.slice();
    }
    var led = trick[0].card[1];
    out = [];
    for (i = 0; i < hand.length; i++) if (hand[i][1] === led) out.push(hand[i]);
    if (out.length) return out;
    if (ctx.first) {
      for (i = 0; i < hand.length; i++) if (!isPointCard(hand[i])) out.push(hand[i]);
      if (out.length) return out;
    }
    return hand.slice();
  }

  function legalPlays(st, seat) {
    if (st.phase !== "play") return [];
    return legalFrom(st.hands[seat], st.trick, { first: st.trickNo === 0, broken: st.broken });
  }

  function trickWinnerOf(trick) {
    var led = trick[0].card[1], best = -1, w = -1;
    for (var i = 0; i < trick.length; i++) {
      var c = trick[i].card;
      if (c[1] === led && rankIdx(c) > best) { best = rankIdx(c); w = trick[i].seat; }
    }
    return w;
  }

  function play(st, card) {
    if (st.phase !== "play") throw new Error("not in play");
    var seat = st.turn;
    if (legalPlays(st, seat).indexOf(card) < 0) throw new Error("illegal play " + card);
    var hand = st.hands[seat];
    hand.splice(hand.indexOf(card), 1);
    if (st.trick.length && card[1] !== st.trick[0].card[1]) st.voids[seat][st.trick[0].card[1]] = true;
    st.trick.push({ seat: seat, card: card });
    st.played.push(card);
    st.last = { seat: seat, card: card };
    if (card[1] === "H") st.broken = true;
    if (st.trick.length === 4) {
      st.trickWinner = trickWinnerOf(st.trick);
      st.phase = "trickdone";
    } else st.turn = (seat + 1) % 4;
  }

  // Winner picks up a finished trick; next trick or end of hand.
  function collect(st) {
    if (st.phase !== "trickdone") throw new Error("no trick to collect");
    var w = st.trickWinner;
    var cards = st.trick.map(function (t) { return t.card; });
    for (var i = 0; i < cards.length; i++) st.taken[w].push(cards[i]);
    st.lastTrick = { cards: st.trick.slice(), winner: w };
    st.trick = [];
    st.trickNo += 1;
    st.last = null;
    if (st.trickNo === 13) finishHand(st);
    else { st.phase = "play"; st.turn = w; }
  }

  // ---------------------------------------------------------------- scoring

  // Pure: raw points, moon shooter (or -1) and the points each seat actually gets.
  function scoreHand(taken, opts) {
    var jd = !!(opts && opts.jd), moonMode = opts && opts.moon === "self" ? "self" : "others";
    var raw = [0, 0, 0, 0], moon = -1, s;
    for (s = 0; s < 4; s++) {
      var pc = 0;
      for (var i = 0; i < taken[s].length; i++) {
        raw[s] += cardPoints(taken[s][i], jd);
        if (isPointCard(taken[s][i])) pc++;
      }
      if (pc === 14) moon = s;
    }
    var delta = raw.slice();
    if (moon >= 0) {
      for (s = 0; s < 4; s++) {
        if (moonMode === "self") delta[s] = s === moon ? -26 : 0;
        else delta[s] = s === moon ? 0 : 26;
      }
    }
    return { raw: raw, moon: moon, delta: delta };
  }

  function lowestSeats(scores) {
    var m = Math.min.apply(null, scores), out = [];
    for (var s = 0; s < 4; s++) if (scores[s] === m) out.push(s);
    return out;
  }

  function finishHand(st) {
    var r = scoreHand(st.taken, st.opts);
    for (var s = 0; s < 4; s++) st.scores[s] += r.delta[s];
    st.result = { raw: r.raw, delta: r.delta, moon: r.moon, scores: st.scores.slice() };
    st.notice = "";
    var over = false;
    for (s = 0; s < 4; s++) if (st.scores[s] >= END_SCORE) over = true;
    if (over) {
      var low = lowestSeats(st.scores);
      if (low.length === 1) { st.winner = low[0]; st.phase = "gameover"; return; }
      st.notice = "Tied for the lowest score. One more hand decides it.";
    }
    st.phase = "handdone";
  }

  function nextHand(st) {
    if (st.phase !== "handdone") throw new Error("hand not finished");
    deal(st);
  }

  // ---------------------------------------------------------------- AI helpers

  function unseenCards(st, seat) {
    var gone = {}, i, out = [];
    for (i = 0; i < st.played.length; i++) gone[st.played[i]] = 1;
    var h = st.hands[seat];
    for (i = 0; i < h.length; i++) gone[h[i]] = 1;
    var d = makeDeck();
    for (i = 0; i < d.length; i++) if (!gone[d[i]]) out.push(d[i]);
    return out;
  }

  function bySuit(cards, s) { return cards.filter(function (c) { return c[1] === s; }); }

  // Is this an overwhelming moon hand before the pass?
  function moonHand(hand) {
    var hearts = bySuit(hand, "H"), has = function (c) { return hand.indexOf(c) >= 0; };
    if (hearts.length < 6) return false;
    if (!has("AH") || !has("KH") || !has("QH")) return false;
    var aks = hand.filter(function (c) { return c[0] === "A" || c[0] === "K"; }).length;
    if (aks < 5) return false;
    return has(QS) || (has("AS") && has("KS"));
  }

  function chooseAIPass(st, seat) {
    var hand = st.hands[seat], jd = st.opts.jd;
    var cnt = { S: 0, H: 0, D: 0, C: 0 };
    hand.forEach(function (c) { cnt[c[1]]++; });
    var holdQS = hand.indexOf(QS) >= 0;
    var lowSp = hand.filter(function (c) { return c[1] === "S" && rankIdx(c) < 10; }).length;
    var protectedQ = lowSp >= 4;
    var scored;
    if (moonHand(hand)) {
      // keep the strength, give away the weakest side cards
      scored = hand.map(function (c) {
        var sc = c[1] === "H" || rankIdx(c) >= 11 || c === QS ? -50 : 20 - rankIdx(c);
        return { c: c, sc: sc };
      });
    } else {
      scored = hand.map(function (c) {
        var r = rankIdx(c), s = c[1], sc;
        if (c === QS) sc = protectedQ ? -5 : 100;
        else if (s === "S" && r >= 11) sc = (holdQS && protectedQ) || lowSp >= 4 ? 8 : 60 + r;
        else if (s === "H") sc = r >= 8 ? 50 + r : 6 + r;
        else if (c === JD && jd) sc = cnt.D >= 4 ? -30 : -5;
        else {
          var n = cnt[s];
          sc = r * 2 + (n <= 3 ? (4 - n) * 8 : 0) + (r >= 10 ? 10 : 0);
          if (c === TWO_C) sc -= 4;
        }
        return { c: c, sc: sc };
      });
    }
    scored.sort(function (a, b) { return b.sc - a.sc || rankIdx(b.c) - rankIdx(a.c); });
    return [scored[0].c, scored[1].c, scored[2].c];
  }

  function collectedPoints(st) {
    var n = 0;
    for (var s = 0; s < 4; s++) for (var i = 0; i < st.taken[s].length; i++) if (isPointCard(st.taken[s][i])) n++;
    return n;
  }
  function pointCount(cards) {
    var n = 0;
    for (var i = 0; i < cards.length; i++) if (isPointCard(cards[i])) n++;
    return n;
  }

  function sureCount(hand, unseen) {
    var n = 0;
    SUITS.forEach(function (s) {
      var mine = bySuit(hand, s), out = bySuit(unseen, s), mx = -1;
      out.forEach(function (c) { mx = Math.max(mx, rankIdx(c)); });
      mine.forEach(function (c) { if (rankIdx(c) > mx) n++; });
    });
    return n;
  }

  function wantMoon(st, seat, unseen) {
    var coll = collectedPoints(st), mine = pointCount(st.taken[seat]);
    if (coll !== mine) return false;
    var hand = st.hands[seat], len = hand.length;
    var sure = sureCount(hand, unseen);
    if (sure < len - (len >= 8 ? 3 : 1)) return false;
    return mine >= 1 || moonHand(hand) || (st.trickNo === 0 && sure >= 11);
  }

  // Seat that looks like it is running the moon (public information only), or -1.
  function moonThreat(st, me) {
    var coll = collectedPoints(st);
    if (coll < 4 || st.trickNo < 3) return -1;
    for (var t = 0; t < 4; t++) {
      if (t !== me && pointCount(st.taken[t]) === coll) return t;
    }
    return -1;
  }

  function chooseAILead(st, seat, legal, unseen, moon) {
    var hand = st.hands[seat];
    var holdQS = hand.indexOf(QS) >= 0, qsUnseen = unseen.indexOf(QS) >= 0, best = null, bs = 1e9;
    var i, c;
    if (moon) {
      var top = null, tr = -1, any = null, ar = -1;
      for (i = 0; i < legal.length; i++) {
        c = legal[i];
        var hi = bySuit(unseen, c[1]).some(function (u) { return rankIdx(u) > rankIdx(c); });
        if (!hi && rankIdx(c) > tr) { top = c; tr = rankIdx(c); }
        if (rankIdx(c) > ar) { any = c; ar = rankIdx(c); }
      }
      return top || any;
    }
    for (i = 0; i < legal.length; i++) {
      c = legal[i];
      var r = rankIdx(c), s = c[1];
      var us = bySuit(unseen, s);
      var sc = r;
      if (!us.length) sc += 20;
      for (var o = 0; o < 4; o++) if (o !== seat && st.voids[o][s]) sc += 6;
      if (s === "H") sc += 4;
      if (c === QS) sc += 40;
      if (s === "S") {
        if (holdQS) sc += 5;
        if (qsUnseen) sc += r < 10 ? -6 : 18;
      }
      if (c === JD && st.opts.jd) sc -= 6;
      if (sc < bs) { bs = sc; best = c; }
    }
    return best;
  }

  function chooseAIFollow(st, seat, legal, unseen, moon, threat) {
    var jd = st.opts.jd, trick = st.trick, led = trick[0].card[1];
    var curBest = -1, curSeat = -1, trickPts = 0, i, k;
    for (i = 0; i < trick.length; i++) {
      trickPts += cardPoints(trick[i].card, jd);
      if (trick[i].card[1] === led && rankIdx(trick[i].card) > curBest) { curBest = rankIdx(trick[i].card); curSeat = trick[i].seat; }
    }
    var later = [];
    for (k = 1; k <= 3 - trick.length; k++) later.push((seat + k) % 4);
    var qsUnseen = unseen.indexOf(QS) >= 0;
    var unseenLed = bySuit(unseen, led);
    var sorted = legal.slice().sort(function (a, b) { return rankIdx(a) - rankIdx(b); });
    var best = null, bc = 1e9;
    var avg = (st.scores[0] + st.scores[1] + st.scores[2] + st.scores[3]) / 4;
    for (i = 0; i < sorted.length; i++) {
      var c = sorted[i], r = rankIdx(c), p = cardPoints(c, jd), cost;
      if (c[1] === led) {
        var beats = r > curBest;
        var pw = 1, extra = 0;
        if (beats) {
          var hi = unseenLed.some(function (u) { return rankIdx(u) > r; });
          for (k = 0; k < later.length; k++) {
            if (st.voids[later[k]][led]) extra += 1.5;
            else if (hi) pw *= 0.5;
          }
        }
        if (moon) cost = beats ? -100 - r : 50 + r * 0.1;
        else if (beats) {
          if (threat >= 0 && trickPts + p > 0) cost = -20 * pw + r * 0.2;
          else {
            cost = pw * (trickPts + p + extra) + 0.3 - r * 0.1;
            if (led === "S" && qsUnseen && c !== QS) cost += pw * 3 * (later.length ? 1 : 0);
          }
        } else {
          cost = -(p * 0.8) - r * 0.2;
          if (threat >= 0 && curSeat === threat && p > 0) cost = p * 3 - r * 0.2;
        }
      } else {
        if (moon) cost = p * 10 + r;
        else {
          var f = p > 0 ? 1 + Math.max(-0.3, Math.min(0.6, (st.scores[curSeat] - avg) / 60)) : 1;
          cost = -(p > 0 ? p * f : p) - r * 0.25 - (c[1] === "H" ? 1.5 : 0);
          if (p < 0) cost = -p - r * 0.25;
          if (threat >= 0 && curSeat === threat && p > 0) cost = p * 5 - r * 0.1;
        }
      }
      if (cost < bc) { bc = cost; best = c; }
    }
    return best;
  }

  function chooseAIPlay(st, seat) {
    var legal = legalPlays(st, seat);
    if (legal.length === 1) return legal[0];
    var unseen = unseenCards(st, seat);
    var moon = wantMoon(st, seat, unseen);
    var threat = moon ? -1 : moonThreat(st, seat);
    if (!st.trick.length) return chooseAILead(st, seat, legal, unseen, moon);
    return chooseAIFollow(st, seat, legal, unseen, moon, threat);
  }

  // ---------------------------------------------------------------- driver

  // Whose input is needed. In the pass phase this is the first seat yet to choose.
  function actor(st) {
    if (st.phase === "pass") {
      for (var s = 0; s < 4; s++) if (!st.passSel[s]) return s;
      return 0;
    }
    if (st.phase === "play") return st.turn;
    return -1;
  }

  // One computer step for whoever is due (the UI only calls this for seats 1 to 3,
  // tests call it for all four). In the pass phase every remaining seat chooses.
  function aiStep(st) {
    if (st.phase === "pass") {
      for (var s = 0; s < 4; s++) {
        if (!st.passSel[s]) submitPass(st, s, chooseAIPass(st, s));
        if (st.phase !== "pass") break;
      }
    } else if (st.phase === "play") play(st, chooseAIPlay(st, st.turn));
    else if (st.phase === "trickdone") collect(st);
    else if (st.phase === "handdone") nextHand(st);
  }

  return {
    SUITS: SUITS, RANKS: RANKS, SEAT_NAMES: SEAT_NAMES, DIRS: DIRS, END_SCORE: END_SCORE,
    makeDeck: makeDeck, nextRand: nextRand, newGame: newGame, deal: deal, nextHand: nextHand,
    rankIdx: rankIdx, suitOf: suitOf, cardPoints: cardPoints, isPointCard: isPointCard,
    passDirName: passDirName, passTarget: passTarget, sortHand: sortHand,
    validPass: validPass, submitPass: submitPass,
    legalFrom: legalFrom, legalPlays: legalPlays, trickWinnerOf: trickWinnerOf,
    play: play, collect: collect, scoreHand: scoreHand, lowestSeats: lowestSeats,
    moonHand: moonHand, chooseAIPass: chooseAIPass, chooseAIPlay: chooseAIPlay,
    actor: actor, aiStep: aiStep
  };
});
