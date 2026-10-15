/* Bourre game logic. Pure, no DOM. State is JSON-serializable.
   All randomness comes from a mulberry32 stream kept in st.rng.
   Player 0 is the human. Play-money chips only. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BourreLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RANKS = "23456789TJQKA";
  var SUITS = "SHDC";
  var NAMES = ["You", "Rosalie", "Thibodeaux", "Marcel", "Boudreaux", "Fontenot"];
  var START_CHIPS = 100;
  var RAISE_EVERY = 5;
  var DEFAULTS = { opponents: 3, aceForced: true, ante: 1, start: START_CHIPS, raise: true };

  function rankOf(c) { return RANKS.indexOf(c[0]); }
  function suitOf(c) { return c[1]; }

  function rand(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) d.push(RANKS[r] + SUITS[s]);
    return d;
  }
  function shuffle(st, a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand(st) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sortHand(h, trump) {
    var order = { S: 0, H: 1, C: 2, D: 3 };
    h.sort(function (a, b) {
      var sa = a[1] === trump ? -1 : order[a[1]], sb = b[1] === trump ? -1 : order[b[1]];
      if (sa !== sb) return sa - sb;
      return rankOf(b) - rankOf(a);
    });
  }

  function log(st, msg) {
    st.log.push(msg);
    if (st.log.length > 80) st.log.shift();
  }

  // ---------------------------------------------------------------- seats
  function nextFrom(st, p, pred) {
    for (var i = 1; i <= st.n; i++) {
      var q = (p + i) % st.n;
      if (pred(q)) return q;
    }
    return -1;
  }
  function alive(st, p) { return !st.bust[p]; }
  function isIn(st, p) { return st.decl[p] === "in"; }
  function nextAlive(st, p) { return nextFrom(st, p, function (q) { return alive(st, q); }); }
  function nextIn(st, p) { return nextFrom(st, p, function (q) { return isIn(st, q); }); }
  function inList(st) {
    var r = [];
    for (var p = 0; p < st.n; p++) if (isIn(st, p)) r.push(p);
    return r;
  }
  function totalChips(st) {
    var s = st.pot;
    for (var i = 0; i < st.n; i++) s += st.chips[i];
    return s;
  }

  // ---------------------------------------------------------------- new game
  function newGame(seed, opts) {
    var o = {};
    var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (k in opts) if (opts[k] !== undefined) o[k] = opts[k];
    o.opponents = Math.max(2, Math.min(5, o.opponents | 0));
    o.ante = Math.max(1, o.ante | 0);
    o.start = Math.max(o.ante * 5, o.start | 0);
    var n = o.opponents + 1;
    var st = {
      v: 1, seed: seed | 0, rng: seed | 0, opts: o, n: n,
      ante: o.ante, chips: [], bust: [], pot: 0, potStart: 0, dealer: n - 1, handNo: 0,
      deck: [], hands: [], upcard: null, trump: null,
      decl: [], phase: "declare", turn: 0,
      trick: [], tricksWon: [], trickNo: 0, leader: 0, lastWinner: -1,
      trickValues: [0, 0, 0, 0, 0], trickWinners: [],
      result: null, winner: -1, log: [], startChips: o.start
    };
    for (var i = 0; i < n; i++) { st.chips.push(o.start); st.bust.push(false); }
    st.dealer = n - 1; // first deal: last seat deals so the human is not forced first
    dealHand(st);
    return st;
  }

  function checkGameOver(st) {
    var others = 0;
    for (var p = 1; p < st.n; p++) if (!st.bust[p]) others++;
    if (st.bust[0]) { st.phase = "gameover"; st.winner = -1; return true; }
    if (others === 0) { st.phase = "gameover"; st.winner = 0; return true; }
    return false;
  }

  function dealHand(st) {
    st.handNo++;
    if (st.opts.raise && st.handNo > 1 && (st.handNo - 1) % RAISE_EVERY === 0) {
      st.ante += st.opts.ante;
      log(st, "The ante rises to " + st.ante + ".");
    }
    st.result = null;
    st.trick = []; st.trickNo = 0; st.trickWinners = [];
    st.tricksWon = []; st.decl = []; st.hands = [];
    for (var i = 0; i < st.n; i++) { st.tricksWon.push(0); st.decl.push(null); st.hands.push([]); }
    // ante
    for (var p = 0; p < st.n; p++) {
      if (st.bust[p]) continue;
      if (st.chips[p] < st.ante) {
        st.bust[p] = true;
        log(st, NAMES[p] + " cannot cover the ante and " + (p === 0 ? "are" : "is") + " bust.");
        continue;
      }
      st.chips[p] -= st.ante;
      st.pot += st.ante;
    }
    if (checkGameOver(st)) return;
    st.potStart = st.pot;
    var v = Math.floor(st.pot / 5), rem = st.pot % 5;
    st.trickValues = [];
    for (var t = 0; t < 5; t++) st.trickValues.push(v + (t < rem ? 1 : 0));
    // ensure the dealer is alive
    if (st.bust[st.dealer]) st.dealer = nextAlive(st, st.dealer);
    st.deck = shuffle(st, makeDeck());
    var first = nextAlive(st, st.dealer);
    var seat = first;
    var order = [];
    do { order.push(seat); seat = nextAlive(st, seat); } while (seat !== first);
    for (var r = 0; r < 5; r++) for (var j = 0; j < order.length; j++) st.hands[order[j]].push(st.deck.pop());
    st.upcard = st.deck.pop();
    st.trump = suitOf(st.upcard);
    for (var q = 0; q < st.n; q++) sortHand(st.hands[q], st.trump);
    st.phase = "declare";
    st.turn = first;
    log(st, "Hand " + st.handNo + ": pot " + st.pot + ". Trump is " + st.trump + " (turned " + st.upcard + "). " + NAMES[st.dealer] + " deals.");
  }

  function nextHand(st) {
    if (st.phase !== "handdone") return false;
    if (checkGameOver(st)) return true;
    st.dealer = nextAlive(st, st.dealer);
    dealHand(st);
    return true;
  }

  // ---------------------------------------------------------------- declare
  function holdsTrumpAce(st, p) { return st.hands[p].indexOf("A" + st.trump) >= 0; }
  function mustStay(st, p) { return !!st.opts.aceForced && holdsTrumpAce(st, p); }
  function legalDeclares(st, p) {
    if (st.phase !== "declare" || st.turn !== p) return [];
    return mustStay(st, p) ? ["in"] : ["in", "out"];
  }

  function soloWin(st, p, why) {
    var amt = st.pot;
    st.chips[p] += amt;
    st.pot = 0;
    st.result = { kind: "solo", winner: p, amount: amt, penalties: [], won: wonZeros(st) };
    st.result.won[p] = amt;
    log(st, NAMES[p] + " " + why + " and takes the pot of " + amt + ".");
    st.phase = "handdone";
  }
  function wonZeros(st) { var a = []; for (var i = 0; i < st.n; i++) a.push(0); return a; }

  function afterDeclare(st) {
    var dealer = st.dealer;
    var cur = st.turn;
    if (cur === dealer) {
      // dealer just declared
      var list = inList(st);
      if (list.length === 1) { soloWin(st, list[0], "is the only one in"); return; }
      startDraw(st);
      return;
    }
    var nxt = nextAlive(st, cur);
    st.turn = nxt;
    if (nxt === dealer && inList(st).length === 0) {
      st.decl[dealer] = "in";
      log(st, NAMES[dealer] + " is left as the only player.");
      soloWin(st, dealer, "wins by default");
    }
  }

  function declare(st, choice) {
    if (st.phase !== "declare") return false;
    var p = st.turn;
    if (choice !== "in" && choice !== "out") return false;
    if (choice === "out" && mustStay(st, p)) return false;
    st.decl[p] = choice;
    log(st, NAMES[p] + (choice === "in" ? " is IN" : " folds") + (choice === "in" && mustStay(st, p) ? " (holds the ace of trump)" : "") + ".");
    afterDeclare(st);
    return true;
  }

  // ---------------------------------------------------------------- draw
  function startDraw(st) {
    st.phase = "draw";
    st.turn = nextIn(st, st.dealer);
    // dealer-left first among those in; if the dealer is the only candidate nextIn handles wraparound
  }
  function maxDiscard(st) { return Math.min(5, st.deck.length); }

  function draw(st, cards) {
    if (st.phase !== "draw") return false;
    var p = st.turn;
    var h = st.hands[p];
    var uniq = {};
    cards = cards || [];
    if (cards.length > maxDiscard(st)) return false;
    for (var i = 0; i < cards.length; i++) {
      if (h.indexOf(cards[i]) < 0 || uniq[cards[i]]) return false;
      uniq[cards[i]] = 1;
    }
    for (var j = 0; j < cards.length; j++) h.splice(h.indexOf(cards[j]), 1);
    for (var k = 0; k < cards.length; k++) h.push(st.deck.pop());
    sortHand(h, st.trump);
    log(st, NAMES[p] + (cards.length ? " draws " + cards.length : " stands pat") + ".");
    // next in order
    var list = inList(st);
    var idx = -1, seat = nextIn(st, st.dealer), order = [];
    for (var z = 0; z < list.length; z++) { order.push(seat); seat = nextIn(st, seat); }
    idx = order.indexOf(p);
    if (idx === order.length - 1) startPlay(st);
    else st.turn = order[idx + 1];
    return true;
  }

  // ---------------------------------------------------------------- play
  function startPlay(st) {
    st.phase = "play";
    st.trick = [];
    st.trickNo = 0;
    st.leader = nextIn(st, st.dealer);
    st.turn = st.leader;
    log(st, "Play begins. " + NAMES[st.leader] + " leads. Tricks are worth " + st.trickValues.join(", ") + ".");
  }

  function beats(a, b, trump, led) {
    // does card a beat card b, given the led suit
    var at = a[1] === trump, bt = b[1] === trump;
    if (at && !bt) return true;
    if (bt && !at) return false;
    if (a[1] === b[1]) return rankOf(a) > rankOf(b);
    if (a[1] === led && b[1] !== led) return true;
    return false;
  }
  function winningPlay(st, trick) {
    var led = trick[0].card[1];
    var best = trick[0];
    for (var i = 1; i < trick.length; i++) if (beats(trick[i].card, best.card, st.trump, led)) best = trick[i];
    return best;
  }

  function legalCards(hand, trick, trump, firstTrick) {
    var i, c;
    if (!trick.length) {
      if (firstTrick) {
        var tr = hand.filter(function (x) { return x[1] === trump; });
        if (tr.length) return tr;
      }
      return hand.slice();
    }
    var led = trick[0].card[1];
    var follow = hand.filter(function (x) { return x[1] === led; });
    if (follow.length) {
      var hi = -1;
      for (i = 0; i < trick.length; i++) { c = trick[i].card; if (c[1] === led && rankOf(c) > hi) hi = rankOf(c); }
      var higher = follow.filter(function (x) { return rankOf(x) > hi; });
      return higher.length ? higher : follow;
    }
    var trumps = hand.filter(function (x) { return x[1] === trump; });
    if (!trumps.length) return hand.slice();
    var ht = -1;
    for (i = 0; i < trick.length; i++) { c = trick[i].card; if (c[1] === trump && rankOf(c) > ht) ht = rankOf(c); }
    if (ht >= 0) {
      var over = trumps.filter(function (x) { return rankOf(x) > ht; });
      if (over.length) return over;
    }
    return trumps;
  }
  function legalPlays(st, p) {
    if (st.phase !== "play" || st.turn !== p) return [];
    return legalCards(st.hands[p], st.trick, st.trump, st.trickNo === 0);
  }

  function play(st, card) {
    if (st.phase !== "play") return false;
    var p = st.turn;
    if (legalPlays(st, p).indexOf(card) < 0) return false;
    var h = st.hands[p];
    h.splice(h.indexOf(card), 1);
    st.trick.push({ p: p, card: card });
    if (st.trick.length === inList(st).length) {
      var w = winningPlay(st, st.trick);
      st.lastWinner = w.p;
      st.phase = "trickdone";
      log(st, NAMES[w.p] + " takes trick " + (st.trickNo + 1) + " (worth " + st.trickValues[st.trickNo] + ").");
    } else {
      st.turn = nextIn(st, p);
    }
    return true;
  }

  function collect(st) {
    if (st.phase !== "trickdone") return false;
    var w = st.lastWinner;
    var val = st.trickValues[st.trickNo];
    st.chips[w] += val;
    st.pot -= val;
    st.tricksWon[w]++;
    st.trickWinners.push(w);
    st.trickNo++;
    st.trick = [];
    if (st.trickNo >= 5) { finishHand(st); return true; }
    st.leader = w;
    st.turn = w;
    st.phase = "play";
    return true;
  }

  function finishHand(st) {
    var won = wonZeros(st), pen = [];
    for (var t = 0; t < 5; t++) won[st.trickWinners[t]] += st.trickValues[t];
    for (var p = 0; p < st.n; p++) {
      if (!isIn(st, p) || st.tricksWon[p] > 0) continue;
      var owe = st.potStart;
      var pay = Math.min(owe, st.chips[p]);
      st.chips[p] -= pay;
      st.pot += pay;
      var wentBust = pay < owe;
      if (wentBust) st.bust[p] = true;
      pen.push({ p: p, owed: owe, paid: pay, bust: wentBust });
      log(st, NAMES[p] + " is bourre and puts " + pay + " into the next pot" + (wentBust ? " (cannot cover it, bust)" : "") + ".");
    }
    st.result = { kind: "played", winner: -1, amount: 0, penalties: pen, won: won };
    st.phase = "handdone";
  }

  // ---------------------------------------------------------------- AI
  function cardCost(c, trump) { return (c[1] === trump ? 100 : 0) + rankOf(c); }

  function handStrength(hand, trump) {
    var s = 0;
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i], r = rankOf(c);
      if (c[1] === trump) s += 1 + r / 12;
      else if (r === 12) s += 0.6;
      else if (r === 11) s += 0.25;
    }
    // length bonus for three or more trumps
    var tc = hand.filter(function (x) { return x[1] === trump; }).length;
    if (tc >= 3) s += 0.5 * (tc - 2);
    return s;
  }

  var TH_BASE = 1.6, TH_PER = 0.3;
  function aiDeclare(st, p) {
    if (mustStay(st, p)) return "in";
    var s = handStrength(st.hands[p], st.trump);
    var inCount = inList(st).length;
    var potBonus = Math.min(0.9, (st.pot / st.ante - st.n) * 0.08);
    if (potBonus < 0) potBonus = 0;
    var th = TH_BASE - potBonus + TH_PER * inCount;
    if (inCount === 0) th -= 0.25;
    if (p === st.dealer && inCount === 1) th -= 0.6; // few others in, cheap to compete
    if (st.chips[p] < st.potStart * 2 + 2) th += 0.6; // a bourre would bust us
    return s >= th ? "in" : "out";
  }

  function aiDiscards(st, p) {
    var h = st.hands[p];
    var keep = h.filter(function (c) { return c[1] === st.trump || rankOf(c) >= 11; });
    var toss = h.filter(function (c) { return keep.indexOf(c) < 0; });
    // keep a lone non-trump king only if we have fewer than two trumps
    var tc = h.filter(function (x) { return x[1] === st.trump; }).length;
    if (tc >= 2) {
      toss = toss.concat(keep.filter(function (c) { return c[1] !== st.trump && rankOf(c) === 11; }));
    }
    toss.sort(function (a, b) { return rankOf(a) - rankOf(b); });
    return toss.slice(0, maxDiscard(st));
  }

  function aiPlay(st, p) {
    var legal = legalPlays(st, p);
    if (legal.length === 1) return legal[0];
    var need = st.tricksWon[p] === 0;
    var byCost = function (a, b) { return cardCost(a, st.trump) - cardCost(b, st.trump); };
    var sorted = legal.slice().sort(byCost);
    if (!st.trick.length) {
      if (st.trickNo === 0 && legal[0][1] === st.trump) return sorted[sorted.length - 1]; // highest trump
      if (need) return sorted[sorted.length - 1];
      return sorted[0];
    }
    var cur = winningPlay(st, st.trick).card, led = st.trick[0].card[1];
    var winners = sorted.filter(function (c) { return beats(c, cur, st.trump, led); });
    if (need) {
      if (winners.length) return winners[0];
      return sorted[0];
    }
    // already won something: avoid winning if possible
    var losers = sorted.filter(function (c) { return winners.indexOf(c) < 0; });
    if (losers.length) return losers[0];
    return sorted[0];
  }

  function actor(st) {
    if (st.phase === "declare" || st.phase === "draw" || st.phase === "play") return st.turn;
    return -1;
  }

  function aiStep(st) {
    var p = st.turn;
    if (st.phase === "declare") return declare(st, aiDeclare(st, p));
    if (st.phase === "draw") return draw(st, aiDiscards(st, p));
    if (st.phase === "play") return play(st, aiPlay(st, p));
    if (st.phase === "trickdone") return collect(st);
    if (st.phase === "handdone") return nextHand(st);
    return false;
  }

  return {
    RANKS: RANKS, SUITS: SUITS, NAMES: NAMES, DEFAULTS: DEFAULTS, RAISE_EVERY: RAISE_EVERY, START_CHIPS: START_CHIPS,
    rankOf: rankOf, suitOf: suitOf, rand: rand, makeDeck: makeDeck, newGame: newGame,
    nextHand: nextHand, declare: declare, legalDeclares: legalDeclares, mustStay: mustStay,
    draw: draw, maxDiscard: maxDiscard, play: play, collect: collect, legalCards: legalCards,
    legalPlays: legalPlays, winningPlay: winningPlay, beats: beats, actor: actor, aiStep: aiStep,
    aiDeclare: aiDeclare, aiDiscards: aiDiscards, aiPlay: aiPlay, handStrength: handStrength,
    totalChips: totalChips, inList: inList, nextAlive: nextAlive, checkGameOver: checkGameOver,
    sortHand: sortHand
  };
});
