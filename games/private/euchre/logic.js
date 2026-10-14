// Euchre rules engine and computer players. Pure logic: no DOM, no clock reads,
// all randomness from a seeded mulberry32 whose state lives inside the game
// state, so a state is plain JSON and the same seed always gives the same deals.
//
// Seats run clockwise: 0 South (human), 1 West, 2 North, 3 East.
// Teams: seats 0 and 2 are team 0 (North/South), seats 1 and 3 are team 1.
// Cards are two character strings: rank (9 T J Q K A) then suit (S H D C).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EuchreLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SUITS = ["S", "H", "D", "C"];
  var RANKS = ["9", "T", "J", "Q", "K", "A"];
  var NT = RANKS;                       // non-trump order, low to high
  var TR = ["9", "T", "Q", "K", "A"];   // trump order below the bowers
  var SEAT_NAMES = ["South", "West", "North", "East"];
  var WIN_SCORE = 10;

  // ---------------------------------------------------------------- basics

  function leftSuit(s) { return { S: "C", C: "S", H: "D", D: "H" }[s]; }
  function cardRank(c) { return c[0]; }
  function cardSuit(c) { return c[1]; }
  function partner(seat) { return (seat + 2) % 4; }
  function teamOf(seat) { return seat % 2; }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 0; r < 6; r++) d.push(RANKS[r] + SUITS[s]);
    return d;
  }

  // Suit a card belongs to for following and trick purposes. The left bower is trump.
  function effSuit(c, trump) {
    if (trump && c[0] === "J" && c[1] === leftSuit(trump)) return trump;
    return c[1];
  }

  // Strength of a card in a trick with the given trump and led (effective) suit.
  // -1 means it can not win (off suit, not trump).
  function power(c, trump, led) {
    if (trump) {
      if (c === "J" + trump) return 100;
      if (c === "J" + leftSuit(trump)) return 90;
      if (c[1] === trump) return 10 + TR.indexOf(c[0]);
    }
    if (c[1] === led) return NT.indexOf(c[0]);
    return -1;
  }

  function isBower(c, trump) { return c === "J" + trump || c === "J" + leftSuit(trump); }

  // Cards a player may play from a hand against the current trick.
  function legalFrom(hand, trick, trump) {
    if (!trick.length) return hand.slice();
    var led = effSuit(trick[0].card, trump);
    var follow = hand.filter(function (c) { return effSuit(c, trump) === led; });
    return follow.length ? follow : hand.slice();
  }

  function trickWinnerOf(trick, trump) {
    var led = effSuit(trick[0].card, trump), best = -2, w = -1;
    for (var i = 0; i < trick.length; i++) {
      var p = power(trick[i].card, trump, led);
      if (p > best) { best = p; w = trick[i].seat; }
    }
    return w;
  }

  // Display order: by suit (alternating colours) then by trump or plain rank.
  function sortHand(hand, trump) {
    var order = ["S", "H", "C", "D"];
    function key(c) {
      var es = effSuit(c, trump);
      var si = order.indexOf(es);
      if (trump && es === trump) si = -1;
      var p = trump ? power(c, trump, es) : NT.indexOf(c[0]);
      if (!(trump && es === trump)) p = NT.indexOf(c[0]);
      return si * 1000 - p;
    }
    return hand.slice().sort(function (a, b) { return key(a) - key(b); });
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

  function newGame(seed, opts) {
    var st = {
      seed: seed | 0,
      rng: seed | 0,
      opts: { stick: !(opts && opts.stick === false) },
      scores: [0, 0],
      dealer: 0,
      handNo: 0,
      winner: -1,
      notice: "",
      phase: "bid1"
    };
    st.dealer = Math.floor(nextRand(st) * 4);
    deal(st);
    return st;
  }

  function deal(st) {
    var deck = makeDeck();
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(nextRand(st) * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    st.hands = [deck.slice(0, 5), deck.slice(5, 10), deck.slice(10, 15), deck.slice(15, 20)];
    st.kitty = deck.slice(20, 24);
    st.upcard = st.kitty[0];
    st.turnedDown = null;
    st.phase = "bid1";
    st.turn = (st.dealer + 1) % 4;
    st.bids = [];
    st.trump = null;
    st.maker = -1;
    st.alone = false;
    st.sitOut = -1;
    st.trick = [];
    st.trickWinner = -1;
    st.tricksWon = [0, 0];
    st.trickNo = 0;
    st.played = [];
    st.voids = [{}, {}, {}, {}];
    st.last = null;
    st.lastTrick = null;
    st.result = null;
    st.handNo++;
    return st;
  }

  function nextHand(st) {
    if (st.phase !== "handdone") throw new Error("hand not finished");
    st.dealer = (st.dealer + 1) % 4;
    st.notice = "";
    deal(st);
    return st;
  }

  function nextSeat(st, seat) {
    var n = (seat + 1) % 4;
    if (n === st.sitOut) n = (n + 1) % 4;
    return n;
  }

  // ---------------------------------------------------------------- bidding

  function legalBids(st) {
    var out = [];
    if (st.phase === "bid1") {
      out.push({ type: "pass" });
      out.push({ type: "order", alone: false });
      out.push({ type: "order", alone: true });
    } else if (st.phase === "bid2") {
      if (!(st.opts.stick && st.turn === st.dealer)) out.push({ type: "pass" });
      for (var i = 0; i < 4; i++) {
        if (SUITS[i] === st.turnedDown) continue;
        out.push({ type: "call", suit: SUITS[i], alone: false });
        out.push({ type: "call", suit: SUITS[i], alone: true });
      }
    }
    return out;
  }

  function startPlay(st) {
    st.phase = "play";
    st.trick = [];
    var l = (st.dealer + 1) % 4;
    if (l === st.sitOut) l = (l + 1) % 4;
    st.turn = l;
    st.leader = l;
  }

  function makeTrump(st, seat, suit, alone) {
    st.trump = suit;
    st.maker = seat;
    st.alone = !!alone;
    st.sitOut = alone ? partner(seat) : -1;
  }

  // act is {type:"pass"} | {type:"order", alone} | {type:"call", suit, alone}
  function bid(st, act) {
    if (st.phase !== "bid1" && st.phase !== "bid2") throw new Error("not bidding");
    var seat = st.turn;
    var legal = legalBids(st).some(function (b) {
      return b.type === act.type && (b.suit || null) === (act.suit || null) && (b.alone || false) === (act.alone || false);
    });
    if (!legal) throw new Error("illegal bid");
    var rec = { seat: seat, round: st.phase === "bid1" ? 1 : 2, type: act.type, suit: act.suit || null, alone: !!act.alone };
    st.bids.push(rec);

    if (act.type === "pass") {
      if (st.phase === "bid1") {
        if (seat === st.dealer) {
          st.phase = "bid2";
          st.turnedDown = st.upcard[1];
          st.turn = (st.dealer + 1) % 4;
        } else st.turn = (seat + 1) % 4;
      } else {
        if (seat === st.dealer) {
          // only reachable with stick the dealer off: everyone passed, turn the deal
          st.notice = "Everyone passed. New deal.";
          st.dealer = (st.dealer + 1) % 4;
          var note = st.notice;
          deal(st);
          st.notice = note;
        } else st.turn = (seat + 1) % 4;
      }
      return st;
    }

    if (act.type === "order") {
      makeTrump(st, seat, st.upcard[1], act.alone);
      if (st.sitOut === st.dealer) {
        // the dealer is sitting out: no pick up, the card is simply turned down
        startPlay(st);
      } else {
        st.hands[st.dealer].push(st.upcard);
        st.phase = "discard";
        st.turn = st.dealer;
      }
      return st;
    }

    makeTrump(st, seat, act.suit, act.alone);
    startPlay(st);
    return st;
  }

  function discard(st, card) {
    if (st.phase !== "discard") throw new Error("not discarding");
    var h = st.hands[st.dealer];
    var i = h.indexOf(card);
    if (i < 0) throw new Error("card not in dealer hand");
    h.splice(i, 1);
    st.kitty[0] = card; // keeps the 24 cards accounted for
    startPlay(st);
    return st;
  }

  // ---------------------------------------------------------------- play

  function legalPlays(st, seat) {
    if (seat === undefined) seat = st.turn;
    return legalFrom(st.hands[seat], st.trick, st.trump);
  }

  function play(st, card) {
    if (st.phase !== "play") throw new Error("not playing");
    var seat = st.turn;
    var hand = st.hands[seat];
    if (hand.indexOf(card) < 0) throw new Error("card not in hand");
    if (legalFrom(hand, st.trick, st.trump).indexOf(card) < 0) throw new Error("illegal card");
    if (st.trick.length) {
      var led = effSuit(st.trick[0].card, st.trump);
      if (effSuit(card, st.trump) !== led) st.voids[seat][led] = true;
    }
    hand.splice(hand.indexOf(card), 1);
    st.trick.push({ seat: seat, card: card });
    st.played.push(card);
    st.last = { seat: seat, card: card };
    var need = st.alone ? 3 : 4;
    if (st.trick.length === need) {
      st.phase = "trickdone";
      st.trickWinner = trickWinnerOf(st.trick, st.trump);
    } else st.turn = nextSeat(st, seat);
    return st;
  }

  function collect(st) {
    if (st.phase !== "trickdone") throw new Error("no trick to collect");
    var w = st.trickWinner;
    st.tricksWon[teamOf(w)]++;
    st.lastTrick = { cards: st.trick.slice(), winner: w };
    st.trick = [];
    st.trickNo++;
    st.last = null;
    if (st.trickNo === 5) { scoreHand(st); return st; }
    st.phase = "play";
    st.turn = w;
    st.leader = w;
    return st;
  }

  function scoreHand(st) {
    var mt = teamOf(st.maker), dt = 1 - mt;
    var mk = st.tricksWon[mt];
    var pts, team, euchre = false;
    if (mk >= 3) {
      team = mt;
      pts = mk === 5 ? (st.alone ? 4 : 2) : 1;
    } else {
      team = dt; pts = 2; euchre = true;
    }
    st.scores[team] += pts;
    st.result = {
      makerTeam: mt, maker: st.maker, trump: st.trump, alone: st.alone,
      makerTricks: mk, defTricks: st.tricksWon[dt],
      team: team, points: pts, euchre: euchre, march: mk === 5
    };
    if (st.scores[team] >= WIN_SCORE) {
      st.winner = team;
      st.phase = "gameover";
    } else st.phase = "handdone";
  }

  // The seat whose decision is awaited, or -1 when the engine itself must advance.
  function actor(st) {
    if (st.phase === "bid1" || st.phase === "bid2" || st.phase === "play") return st.turn;
    if (st.phase === "discard") return st.dealer;
    return -1;
  }

  // ---------------------------------------------------------------- AI helpers

  var TV = { A: 2, K: 1.6, Q: 1.3, T: 1.1, "9": 1 };

  // Rough trick-taking value of a set of cards if `trump` is trump.
  function handValue(cards, trump) {
    var v = 0, tc = 0, cnt = { S: 0, H: 0, D: 0, C: 0 }, offAce = {};
    var left = "J" + leftSuit(trump), right = "J" + trump;
    cards.forEach(function (c) {
      if (c === right) { v += 3; tc++; }
      else if (c === left) { v += 2.5; tc++; }
      else if (c[1] === trump) { v += TV[c[0]]; tc++; }
      else {
        cnt[c[1]]++;
        if (c[0] === "A") { v += 1; offAce[c[1]] = true; }
        else if (c[0] === "K") v += 0.25;
      }
    });
    if (tc >= 2) {
      SUITS.forEach(function (s) {
        if (s === trump) return;
        if (cnt[s] === 0) v += 0.6;
        else if (cnt[s] === 1 && !offAce[s]) v += 0.25;
      });
    }
    if (tc >= 4) v += 1; else if (tc === 3) v += 0.5;
    return v;
  }

  // Best five of six after picking up: value plus the card to throw away.
  function bestKeep(six, trump) {
    var best = -1, bi = 0;
    for (var i = 0; i < six.length; i++) {
      var rest = six.filter(function (_, k) { return k !== i; });
      var v = handValue(rest, trump);
      var pw = power(six[i], trump, six[i][1]);
      // tiebreak: throw away the weakest card
      var score = v - 0.001 * pw;
      if (best === -1 || score > best) { best = score; bi = i; }
    }
    var rest2 = six.filter(function (_, k) { return k !== bi; });
    return { value: handValue(rest2, trump), discard: six[bi] };
  }

  var ORDER_T = 5.6, CALL_T = 4.8, ALONE_T = 11;

  function aiBid(st) {
    var seat = st.turn, hand = st.hands[seat];
    var pos = (seat - st.dealer + 4) % 4; // 1 = left of dealer ... 0 = dealer
    if (st.phase === "bid1") {
      var t = st.upcard[1], v, thr = ORDER_T;
      if (seat === st.dealer) {
        v = bestKeep(hand.concat([st.upcard]), t).value;
        thr -= 0.3;
      } else {
        v = handValue(hand, t);
        var up = st.upcard[0] === "J" ? 3 : TV[st.upcard[0]];
        if (partner(seat) === st.dealer) v += 0.5 * up; else v -= 0.5 * up;
      }
      if (v >= thr) return { type: "order", alone: v >= ALONE_T };
      return { type: "pass" };
    }
    // round 2
    var bestS = null, bestV = -1;
    SUITS.forEach(function (s) {
      if (s === st.turnedDown) return;
      var val = handValue(hand, s);
      if (val > bestV) { bestV = val; bestS = s; }
    });
    var mustCall = st.opts.stick && seat === st.dealer;
    var thr2 = CALL_T - (pos === 0 ? 0.6 : 0) - (pos === 3 ? 0.2 : 0);
    if (mustCall || bestV >= thr2) return { type: "call", suit: bestS, alone: bestV >= ALONE_T };
    return { type: "pass" };
  }

  function aiDiscard(st) {
    return bestKeep(st.hands[st.dealer], st.trump).discard;
  }

  function unseenCards(st, seat) {
    var hand = st.hands[seat];
    var seen = {};
    hand.forEach(function (c) { seen[c] = 1; });
    st.played.forEach(function (c) { seen[c] = 1; });
    st.trick.forEach(function (t) { seen[t.card] = 1; });
    if (st.turnedDown) seen[st.upcard] = 1;
    return makeDeck().filter(function (c) { return !seen[c]; });
  }

  function lowestBy(cards, f) {
    var b = cards[0], bv = f(b);
    for (var i = 1; i < cards.length; i++) { var x = f(cards[i]); if (x < bv) { bv = x; b = cards[i]; } }
    return b;
  }
  function highestBy(cards, f) {
    var b = cards[0], bv = f(b);
    for (var i = 1; i < cards.length; i++) { var x = f(cards[i]); if (x > bv) { bv = x; b = cards[i]; } }
    return b;
  }

  function aiLead(st, seat, hand) {
    var trump = st.trump;
    var myTeam = teamOf(seat), makerTeam = teamOf(st.maker);
    var onMakers = myTeam === makerTeam;
    var trumps = hand.filter(function (c) { return effSuit(c, trump) === trump; });
    var offs = hand.filter(function (c) { return effSuit(c, trump) !== trump; });
    var unseen = unseenCards(st, seat);
    var unseenTrump = unseen.filter(function (c) { return effSuit(c, trump) === trump; });
    var tp = function (c) { return power(c, trump, trump); };
    var right = "J" + trump, left = "J" + leftSuit(trump);
    var hasR = hand.indexOf(right) >= 0, hasL = hand.indexOf(left) >= 0;

    if (hasR && hasL) return right;

    if (trumps.length && unseenTrump.length) {
      var top = highestBy(trumps, tp);
      var topMaster = unseenTrump.every(function (c) { return tp(c) < tp(top); });
      if (onMakers) {
        if (hasR) return right;
        if (seat === st.maker && (trumps.length >= 3 || topMaster || hasL)) return top;
        if (topMaster) return top;
      }
    }

    // off-suit masters (aces, or kings once the ace is gone)
    var oppVoid = function (s) {
      return [0, 1, 2, 3].some(function (o) { return teamOf(o) !== myTeam && o !== st.sitOut && st.voids[o][s]; });
    };
    var masters = offs.filter(function (c) {
      var s = c[1];
      return !unseen.some(function (u) { return effSuit(u, trump) === s && NT.indexOf(u[0]) > NT.indexOf(c[0]); });
    });
    if (masters.length) {
      var safe = masters.filter(function (c) { return !oppVoid(c[1]) || !unseenTrump.length; });
      var pool = safe.length ? safe : masters;
      // aces first, then lower masters
      return highestBy(pool, function (c) { return NT.indexOf(c[0]); });
    }

    if (offs.length) {
      var count = {};
      offs.forEach(function (c) { count[c[1]] = (count[c[1]] || 0) + 1; });
      return lowestBy(offs, function (c) {
        return NT.indexOf(c[0]) + 0.3 * count[c[1]] + (oppVoid(c[1]) ? 3 : 0) + (c[0] === "K" ? 1 : 0);
      });
    }
    return onMakers ? highestBy(trumps, tp) : lowestBy(trumps, tp);
  }

  function aiPlay(st) {
    var seat = st.turn, hand = st.hands[seat], trump = st.trump;
    var legal = legalFrom(hand, st.trick, trump);
    if (legal.length === 1) return legal[0];
    if (!st.trick.length) return aiLead(st, seat, hand);

    var led = effSuit(st.trick[0].card, trump);
    var pw = function (c) { return power(c, trump, led); };
    var cur = st.trick[0];
    st.trick.forEach(function (t) { if (pw(t.card) > pw(cur.card)) cur = t; });
    var curPow = pw(cur.card);
    var partnerWinning = teamOf(cur.seat) === teamOf(seat);

    // opponents still to act after me
    var oppAfter = 0, s = seat;
    var need = st.alone ? 3 : 4;
    for (var k = 0; k < need - st.trick.length - 1; k++) {
      s = nextSeat(st, s);
      if (teamOf(s) !== teamOf(seat)) oppAfter++;
    }

    var unseen = unseenCards(st, seat);
    var canFollow = hand.some(function (c) { return effSuit(c, trump) === led; });

    var discardLow = function (cards) {
      var non = cards.filter(function (c) { return effSuit(c, trump) !== trump; });
      if (!non.length) return lowestBy(cards, function (c) { return power(c, trump, c[1]); });
      var count = {};
      hand.forEach(function (c) { var e = effSuit(c, trump); count[e] = (count[e] || 0) + 1; });
      return lowestBy(non, function (c) {
        return NT.indexOf(c[0]) + (c[0] === "A" ? 3 : 0) - (count[c[1]] === 1 ? 0.7 : 0);
      });
    };

    if (canFollow) {
      if (partnerWinning) return lowestBy(legal, pw);
      var winners = legal.filter(function (c) { return pw(c) > curPow; });
      if (!winners.length) return lowestBy(legal, pw);
      if (oppAfter === 0) return lowestBy(winners, pw);
      var sure = winners.filter(function (c) {
        return !unseen.some(function (u) { return pw(u) > pw(c); });
      });
      if (sure.length) return lowestBy(sure, pw);
      return highestBy(winners, pw);
    }

    // void in the led suit
    if (partnerWinning) return discardLow(legal);
    var tIn = legal.filter(function (c) { return effSuit(c, trump) === trump; });
    if (tIn.length) {
      var win = tIn.filter(function (c) { return pw(c) > curPow; });
      if (win.length) return lowestBy(win, pw);
    }
    return discardLow(legal);
  }

  // Do whatever the current phase needs for a computer-controlled actor, or the
  // engine housekeeping steps (collect a trick, deal the next hand).
  function aiStep(st) {
    switch (st.phase) {
      case "bid1": case "bid2": return bid(st, aiBid(st));
      case "discard": return discard(st, aiDiscard(st));
      case "play": return play(st, aiPlay(st));
      case "trickdone": return collect(st);
      case "handdone": return nextHand(st);
      default: return st;
    }
  }

  return {
    SUITS: SUITS, RANKS: RANKS, SEAT_NAMES: SEAT_NAMES, WIN_SCORE: WIN_SCORE,
    leftSuit: leftSuit, cardRank: cardRank, cardSuit: cardSuit, partner: partner, teamOf: teamOf,
    makeDeck: makeDeck, effSuit: effSuit, power: power, isBower: isBower,
    legalFrom: legalFrom, trickWinnerOf: trickWinnerOf, sortHand: sortHand,
    newGame: newGame, deal: deal, nextHand: nextHand, nextSeat: nextSeat,
    legalBids: legalBids, bid: bid, discard: discard, legalPlays: legalPlays,
    play: play, collect: collect, actor: actor,
    handValue: handValue, aiBid: aiBid, aiDiscard: aiDiscard, aiPlay: aiPlay, aiStep: aiStep
  };
});
