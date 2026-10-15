// Gin Rummy rules engine and computer player. Pure logic: no DOM, no clock reads.
// All randomness comes from a seeded mulberry32 whose state lives in the game
// state (st.rng), so a state is plain JSON and a seed always gives the same deals.
//
// Seats: 0 = You (human), 1 = Computer. Cards are two characters: rank
// (A 2 3 4 5 6 7 8 9 T J Q K) then suit (S H D C). Ace is low only.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GinLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SUITS = ["S", "H", "D", "C"];
  var RANKS = "A23456789TJQK";
  var NAMES = ["You", "Computer"];
  var GAME_TO = 100;
  var GIN_BONUS = 25;
  var BIG_GIN_BONUS = 31;
  var UNDERCUT_BONUS = 25;
  var BOX_BONUS = 25;
  var GAME_BONUS = 100;
  var KNOCK_MAX = 10;
  var SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };

  // ---------------------------------------------------------------- basics

  function rankVal(c) { return RANKS.indexOf(c[0]) + 1; }
  function suitOf(c) { return c[1]; }
  function points(c) { return Math.min(10, rankVal(c)); }
  function cardName(c) { return (c[0] === "T" ? "10" : c[0]) + SYM[c[1]]; }
  function sumPoints(cs) { var t = 0; for (var i = 0; i < cs.length; i++) t += points(cs[i]); return t; }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) d.push(RANKS[r] + SUITS[s]);
    return d;
  }

  function rnd(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function shuffle(st, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(st) * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function byRank(a, b) { return rankVal(a) - rankVal(b) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]); }

  // ---------------------------------------------------------------- meld solver

  // Every legal meld inside a hand, as index bitmasks.
  function candidateMelds(hand) {
    var out = [], i, j, k, m;
    var byR = {}, byS = {};
    for (i = 0; i < hand.length; i++) {
      (byR[hand[i][0]] = byR[hand[i][0]] || []).push(i);
      (byS[hand[i][1]] = byS[hand[i][1]] || []).push(i);
    }
    Object.keys(byR).forEach(function (r) {
      var g = byR[r];
      if (g.length >= 3) {
        for (i = 0; i < g.length; i++) for (j = i + 1; j < g.length; j++) for (k = j + 1; k < g.length; k++)
          out.push((1 << g[i]) | (1 << g[j]) | (1 << g[k]));
        if (g.length === 4) out.push((1 << g[0]) | (1 << g[1]) | (1 << g[2]) | (1 << g[3]));
      }
    });
    Object.keys(byS).forEach(function (s) {
      var g = byS[s].slice().sort(function (a, b) { return rankVal(hand[a]) - rankVal(hand[b]); });
      for (i = 0; i < g.length; i++) {
        m = 1 << g[i];
        for (j = i + 1; j < g.length; j++) {
          if (rankVal(hand[g[j]]) !== rankVal(hand[g[j - 1]]) + 1) break;
          m |= 1 << g[j];
          if (j - i >= 2) out.push(m);
        }
      }
    });
    return out;
  }

  // Minimum deadwood partition of a hand (any size). Brute force with bitmasks.
  function bestMelds(hand) {
    var n = hand.length, cands = candidateMelds(hand);
    var byLow = [];
    for (var i = 0; i < n; i++) byLow.push([]);
    cands.forEach(function (m) {
      for (var b = 0; b < n; b++) if (m & (1 << b)) byLow[b].push(m);
    });
    var pts = hand.map(points);
    var best = { dw: 1e9, melds: [], dead: 0 };
    var chosen = [];
    var full = (1 << n) - 1;
    function go(used, dw) {
      if (dw >= best.dw) return;
      if (used === full) { best = { dw: dw, melds: chosen.slice(), dead: deadMask(chosen) }; return; }
      var low = 0;
      while (used & (1 << low)) low++;
      var opts = byLow[low];
      for (var q = 0; q < opts.length; q++) {
        if (opts[q] & used) continue;
        chosen.push(opts[q]);
        go(used | opts[q], dw);
        chosen.pop();
      }
      go(used | (1 << low), dw + pts[low]);
    }
    function deadMask(ms) {
      var u = 0; ms.forEach(function (m) { u |= m; });
      return full & ~u;
    }
    go(0, 0);
    if (best.dw === 1e9) best = { dw: 0, melds: [], dead: 0 };
    function cards(mask) {
      var r = [];
      for (var b = 0; b < n; b++) if (mask & (1 << b)) r.push(hand[b]);
      return r.sort(byRank);
    }
    var melds = best.melds.map(cards).sort(function (a, b) { return byRank(a[0], b[0]); });
    var dead = cards(best.dead);
    return { melds: melds, deadwood: dead, dw: sumPoints(dead) };
  }

  function deadwood(hand) { return bestMelds(hand).dw; }

  function isSet(meld) {
    for (var i = 1; i < meld.length; i++) if (meld[i][0] !== meld[0][0]) return false;
    return meld.length >= 3;
  }

  // Can this card be added to a laid-down meld?
  function canLayoff(meld, card) {
    if (isSet(meld)) return card[0] === meld[0][0] && meld.length < 4;
    var s = meld[0][1];
    if (card[1] !== s) return false;
    var lo = rankVal(meld[0]), hi = rankVal(meld[meld.length - 1]), v = rankVal(card);
    return v === lo - 1 || v === hi + 1;
  }

  // Meld cards then deadwood, runs and sets grouped, deadwood last.
  function autoSortHand(hand) {
    var b = bestMelds(hand);
    var melds = b.melds.slice().sort(function (x, y) {
      // runs first, then sets, each by rank
      var rx = isSet(x) ? 1 : 0, ry = isSet(y) ? 1 : 0;
      return rx - ry || byRank(x[0], y[0]);
    });
    var out = [];
    melds.forEach(function (m) { out = out.concat(m); });
    return out.concat(b.deadwood.slice().sort(byRank));
  }

  // Best card to throw from an 11 card hand: lowest resulting deadwood.
  // forbid: a card that may not be discarded. Returns {card, dw}.
  function bestDiscard(hand, forbid) {
    var best = null;
    for (var i = 0; i < hand.length; i++) {
      if (hand[i] === forbid) continue;
      var rest = hand.slice(0, i).concat(hand.slice(i + 1));
      var dw = deadwood(rest);
      if (!best || dw < best.dw || (dw === best.dw && points(hand[i]) > points(best.card))) best = { card: hand[i], dw: dw };
    }
    return best;
  }

  // ---------------------------------------------------------------- state

  function who(p, base, third) { return NAMES[p] + " " + (p === 0 ? base : third); }

  function log(st, text) {
    st.log.push(text);
    if (st.log.length > 60) st.log.splice(0, st.log.length - 60);
  }

  function newGame(seed, opts) {
    var st = {
      seed: seed >>> 0, rng: seed | 0,
      options: { bigGin: !!(opts && opts.bigGin) },
      scores: [0, 0], boxes: [0, 0], handNo: 0, dealer: 1,
      hands: [[], []], stock: [], discard: [],
      phase: "first", turn: 0, firstPass: [false, false], mustStock: false,
      drawn: null, taken: [[], []], knock: null, result: null, final: null,
      log: []
    };
    dealHand(st);
    return st;
  }

  function dealHand(st) {
    var deck = shuffle(st, makeDeck());
    st.hands = [deck.splice(0, 10), deck.splice(0, 10)];
    st.discard = [deck.shift()];
    st.stock = deck;
    st.handNo++;
    st.turn = 1 - st.dealer;
    st.phase = "first";
    st.firstPass = [false, false];
    st.mustStock = false;
    st.drawn = null;
    st.taken = [[], []];
    st.knock = null;
    st.result = null;
    st.hands[0] = autoSortHand(st.hands[0]);
    st.hands[1] = autoSortHand(st.hands[1]);
    log(st, "Hand " + st.handNo + ". " + NAMES[st.dealer] + (st.dealer === 0 ? " deal." : " deals."));
  }

  // Start the next hand after a result. Draws keep the dealer, otherwise it alternates.
  function nextHand(st) {
    if (st.phase !== "handover") return { ok: false, error: "No hand to finish" };
    if (st.final) return { ok: false, error: "Game over" };
    if (!st.result || st.result.type !== "draw") st.dealer = 1 - st.dealer;
    dealHand(st);
    return { ok: true };
  }

  function bad(msg) { return { ok: false, error: msg }; }
  var OK = { ok: true };

  function pass(st) {
    if (st.phase !== "first") return bad("Not the first turn");
    st.firstPass[st.turn] = true;
    log(st, who(st.turn, "pass", "passes") + " on the upcard.");
    if (st.turn === 1 - st.dealer) {
      st.turn = st.dealer;
    } else {
      st.phase = "draw";
      st.turn = 1 - st.dealer;
      st.mustStock = true;
      log(st, "Both pass. " + who(st.turn, "must", "must") + " draw from the stock.");
    }
    return OK;
  }

  function draw(st, source) {
    var p = st.turn;
    if (st.phase === "first") {
      if (source !== "discard") return bad("Take the upcard or pass");
    } else if (st.phase !== "draw") return bad("Not your draw");
    if (source === "discard") {
      if (st.mustStock) return bad("Must draw from the stock");
      var c = st.discard.pop();
      st.hands[p].push(c);
      st.taken[p].push(c);
      st.drawn = { card: c, from: "discard" };
      log(st, who(p, "draw", "draws") + " from the discard pile (" + cardName(c) + ").");
    } else if (source === "stock") {
      if (!st.stock.length) return bad("Stock is empty");
      var d = st.stock.pop();
      st.hands[p].push(d);
      st.drawn = { card: d, from: "stock" };
      log(st, who(p, "draw", "draws") + " from the stock" + (p === 0 ? " (" + cardName(d) + ")." : "."));
    } else return bad("Unknown source");
    st.mustStock = false;
    st.phase = "discard";
    return OK;
  }

  function forbidden(st) { return st.drawn && st.drawn.from === "discard" ? st.drawn.card : null; }

  function discard(st, card) {
    if (st.phase !== "discard") return bad("Not the discard step");
    var p = st.turn, h = st.hands[p], i = h.indexOf(card);
    if (i < 0) return bad("Card not in hand");
    if (card === forbidden(st)) return bad("Cannot discard the card you just took from the discard pile");
    h.splice(i, 1);
    st.discard.push(card);
    st.drawn = null;
    log(st, who(p, "discard", "discards") + " " + cardName(card) + ".");
    if (st.stock.length <= 2) {
      st.phase = "handover";
      st.result = { type: "draw", knocker: -1, winner: -1, points: 0, text: "The stock is down to " + st.stock.length + " cards. The hand is a draw." };
      log(st, "Stock is down to " + st.stock.length + ". The hand is a draw.");
      return OK;
    }
    st.turn = 1 - p;
    st.phase = "draw";
    return OK;
  }

  // Can this player knock after throwing `card` (or with no throw, big gin)?
  function knockCheck(st, card) {
    var h = st.hands[st.turn];
    if (st.phase !== "discard") return bad("Not the discard step");
    if (card === null || card === undefined) {
      if (!st.options.bigGin) return bad("Big gin is off");
      if (deadwood(h) !== 0) return bad("Not every card is melded");
      return { ok: true, dw: 0, big: true };
    }
    if (h.indexOf(card) < 0) return bad("Card not in hand");
    if (card === forbidden(st)) return bad("Cannot discard the card you just took from the discard pile");
    var rest = h.filter(function (c) { return c !== card; });
    var dw = deadwood(rest);
    if (dw > KNOCK_MAX) return bad("Deadwood must be " + KNOCK_MAX + " or less to knock");
    return { ok: true, dw: dw, big: false };
  }

  function knock(st, card) {
    var chk = knockCheck(st, card);
    if (!chk.ok) return chk;
    var p = st.turn, h = st.hands[p];
    if (!chk.big) {
      h.splice(h.indexOf(card), 1);
      st.discard.push(card);   // the knock card goes face down in real play; shown on the pile here
    }
    st.drawn = null;
    var b = bestMelds(h);
    var gin = b.dw === 0;
    st.knock = {
      by: p, melds: b.melds.map(function (m) { return m.slice(); }), dead: b.deadwood.slice(),
      dw: b.dw, gin: gin, big: !!chk.big, laid: []
    };
    log(st, chk.big ? who(p, "go", "goes") + " big gin!" : gin ? who(p, "go", "goes") + " gin!" : who(p, "knock", "knocks") + " with " + b.dw + ".");
    var opp = 1 - p;
    if (gin) { finishHand(st); return OK; }
    st.phase = "layoff";
    st.turn = opp;
    return OK;
  }

  function layoff(st, card, meldIdx) {
    if (st.phase !== "layoff") return bad("Not the layoff step");
    var k = st.knock, p = st.turn, h = st.hands[p], i = h.indexOf(card);
    if (i < 0) return bad("Card not in hand");
    var m = k.melds[meldIdx];
    if (!m) return bad("No such meld");
    if (!canLayoff(m, card)) return bad("That card does not fit that meld");
    h.splice(i, 1);
    m.push(card);
    m.sort(byRank);
    k.laid.push({ card: card, meld: meldIdx });
    log(st, who(p, "lay", "lays") + " off " + cardName(card) + ".");
    return OK;
  }

  // Where could this card go? Index of the first meld that accepts it, or -1.
  function layoffTarget(st, card) {
    var ms = st.knock.melds;
    for (var i = 0; i < ms.length; i++) if (canLayoff(ms[i], card)) return i;
    return -1;
  }

  function finishLayoff(st) {
    if (st.phase !== "layoff") return bad("Not the layoff step");
    finishHand(st);
    return OK;
  }

  function finishHand(st) {
    var k = st.knock, kp = k.by, op = 1 - kp;
    var oppB = bestMelds(st.hands[op]);
    var od = oppB.dw, kd = k.dw, type, winner, pts, text;
    if (k.gin) {
      type = k.big ? "biggin" : "gin"; winner = kp;
      pts = od + (k.big ? BIG_GIN_BONUS : GIN_BONUS);
      text = NAMES[kp] + (kp === 0 ? " go" : " goes") + (k.big ? " big gin" : " gin") + ". " + od + " deadwood + " + (k.big ? BIG_GIN_BONUS : GIN_BONUS) + " bonus = " + pts + ".";
    } else if (od > kd) {
      type = "knock"; winner = kp; pts = od - kd;
      text = NAMES[kp] + (kp === 0 ? " knock" : " knocks") + " with " + kd + " against " + od + ": " + pts + " points.";
    } else {
      type = "undercut"; winner = op; pts = (kd - od) + UNDERCUT_BONUS;
      text = "Undercut! " + NAMES[op] + (op === 0 ? " have " : " has ") + od + " against " + kd + ": " + (kd - od) + " + " + UNDERCUT_BONUS + " bonus = " + pts + ".";
    }
    st.scores[winner] += pts;
    st.boxes[winner] += 1;
    st.result = {
      type: type, knocker: kp, winner: winner, points: pts, kDw: kd, oDw: od, text: text,
      oppMelds: oppB.melds, oppDead: oppB.deadwood, laid: k.laid.length
    };
    log(st, text);
    st.phase = "handover";
    if (st.scores[winner] >= GAME_TO) {
      var bonus = [0, 0];
      bonus[winner] = GAME_BONUS;
      var totals = [0, 1].map(function (i) { return st.scores[i] + bonus[i] + BOX_BONUS * st.boxes[i]; });
      st.final = { winner: winner, gameBonus: GAME_BONUS, boxBonus: [BOX_BONUS * st.boxes[0], BOX_BONUS * st.boxes[1]], totals: totals };
      st.phase = "gameover";
      log(st, NAMES[winner] + (winner === 0 ? " win" : " wins") + " the game, " + totals[0] + " to " + totals[1] + " with bonuses.");
    }
  }

  // ---------------------------------------------------------------- computer

  function unseen(st, seat) {
    var known = {};
    st.hands[seat].forEach(function (c) { known[c] = 1; });
    st.discard.forEach(function (c) { known[c] = 1; });
    return makeDeck().filter(function (c) { return !known[c]; });
  }

  // How useful is keeping `c` given the other cards in `rest`: pairs and near runs.
  function potential(c, rest) {
    var s = 0, v = rankVal(c);
    for (var i = 0; i < rest.length; i++) {
      var o = rest[i];
      if (o === c) continue;
      if (o[0] === c[0]) s += 2;
      else if (o[1] === c[1]) {
        var d = Math.abs(rankVal(o) - v);
        if (d === 1) s += 2; else if (d === 2) s += 1;
      }
    }
    return s;
  }

  // Cards the opponent likely wants: ranks and neighbours of what they took.
  function danger(c, oppTaken) {
    var s = 0;
    for (var i = 0; i < oppTaken.length; i++) {
      var o = oppTaken[i];
      if (o[0] === c[0]) s += 2;
      else if (o[1] === c[1] && Math.abs(rankVal(o) - rankVal(c)) <= 1) s += 1;
    }
    return s;
  }

  function chooseDiscard(st, seat, hand, forbid) {
    var best = null, oppTaken = st.taken[1 - seat];
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (c === forbid) continue;
      var rest = hand.slice(0, i).concat(hand.slice(i + 1));
      var dw = deadwood(rest);
      var score = dw * 1000 + potential(c, rest) * 20 + danger(c, oppTaken) * 10 - points(c);
      if (!best || score < best.score) best = { card: c, dw: dw, score: score };
    }
    return best;
  }

  function wantsDiscard(st, seat) {
    var h = st.hands[seat], top = st.discard[st.discard.length - 1];
    if (!top) return false;
    var cur = deadwood(h);
    var h11 = h.concat([top]);
    var pick = chooseDiscard(st, seat, h11, top);
    if (!pick) return false;
    if (pick.dw === 0) return true;
    if (pick.dw <= cur - 3) return true;
    if (pick.dw < cur) {
      var rest = h11.filter(function (c) { return c !== pick.card; });
      var b = bestMelds(rest);
      for (var i = 0; i < b.melds.length; i++) if (b.melds[i].indexOf(top) >= 0) return true;
    }
    return false;
  }

  // Deadwood the computer is willing to knock on, given the stock and the score.
  function knockLimit(st, seat) {
    var n = st.stock.length, lim;
    if (n >= 25) lim = 3; else if (n >= 18) lim = 5; else if (n >= 12) lim = 7; else if (n >= 8) lim = 9; else lim = 10;
    if (st.taken[1 - seat].length >= 3) lim += 2;
    if (st.scores[1 - seat] >= 80) lim += 1;
    if (st.scores[seat] >= 90) lim += 1;
    return Math.min(KNOCK_MAX, lim);
  }

  // Outs that would turn a near gin hand into gin on the next draw.
  function ginOuts(st, seat, rest10) {
    var cnt = 0, u = unseen(st, seat);
    for (var i = 0; i < u.length; i++) {
      var b = bestDiscard(rest10.concat([u[i]]));
      if (b && b.dw === 0) cnt++;
    }
    return cnt;
  }

  // One computer action for whoever's turn it is. Returns {type, text}.
  function aiStep(st) {
    var p = st.turn;
    if (st.phase === "first") {
      if (wantsDiscard(st, p)) { draw(st, "discard"); return { type: "draw", text: st.log[st.log.length - 1] }; }
      pass(st); return { type: "pass", text: st.log[st.log.length - 1] };
    }
    if (st.phase === "draw") {
      var src = (!st.mustStock && wantsDiscard(st, p)) ? "discard" : "stock";
      draw(st, src);
      return { type: "draw", text: st.log[st.log.length - 1] };
    }
    if (st.phase === "discard") {
      var h = st.hands[p];
      if (st.options.bigGin && deadwood(h) === 0) {
        knock(st, null);
        return { type: "knock", text: st.log[st.log.length - 1] };
      }
      var pick = chooseDiscard(st, p, h, forbidden(st));
      if (pick.dw === 0) {
        knock(st, pick.card);
        return { type: "knock", text: st.log[st.log.length - 2 >= 0 ? st.log.length - 1 : 0] };
      }
      if (pick.dw <= knockLimit(st, p)) {
        var go = true;
        if (pick.dw <= 3 && st.stock.length >= 15) {
          var rest = h.filter(function (c) { return c !== pick.card; });
          if (ginOuts(st, p, rest) >= 3) go = false;
        }
        if (go) {
          knock(st, pick.card);
          return { type: "knock", text: st.log[st.log.length - 1] };
        }
      }
      discard(st, pick.card);
      return { type: "discard", text: st.log[st.log.length - 1] };
    }
    if (st.phase === "layoff") {
      autoLayoff(st, p);
      finishLayoff(st);
      return { type: "layoff", text: st.result.text };
    }
    return { type: "none", text: "" };
  }

  // Lay off every card that lowers the hand's deadwood, repeating until none do.
  function autoLayoff(st, seat) {
    var changed = true;
    while (changed) {
      changed = false;
      var h = st.hands[seat], cur = deadwood(h), bestC = null, bestGain = 0, bestM = -1;
      for (var i = 0; i < h.length; i++) {
        var m = layoffTarget(st, h[i]);
        if (m < 0) continue;
        var gain = cur - deadwood(h.filter(function (c) { return c !== h[i]; }));
        if (gain > bestGain) { bestGain = gain; bestC = h[i]; bestM = m; }
      }
      if (bestC) { layoff(st, bestC, bestM); changed = true; }
    }
  }

  // ---------------------------------------------------------------- hand order

  function moveCard(st, seat, from, to) {
    var h = st.hands[seat];
    if (from < 0 || from >= h.length || to < 0 || to >= h.length) return bad("Bad position");
    var c = h.splice(from, 1)[0];
    h.splice(to, 0, c);
    return OK;
  }

  function sortHand(st, seat) { st.hands[seat] = autoSortHand(st.hands[seat]); return OK; }

  return {
    SUITS: SUITS, RANKS: RANKS, NAMES: NAMES, GAME_TO: GAME_TO, GIN_BONUS: GIN_BONUS,
    BIG_GIN_BONUS: BIG_GIN_BONUS, UNDERCUT_BONUS: UNDERCUT_BONUS, BOX_BONUS: BOX_BONUS,
    GAME_BONUS: GAME_BONUS, KNOCK_MAX: KNOCK_MAX,
    rankVal: rankVal, suitOf: suitOf, points: points, cardName: cardName, sumPoints: sumPoints,
    makeDeck: makeDeck, shuffle: shuffle, rnd: rnd,
    candidateMelds: candidateMelds, bestMelds: bestMelds, deadwood: deadwood, isSet: isSet,
    canLayoff: canLayoff, autoSortHand: autoSortHand, bestDiscard: bestDiscard,
    newGame: newGame, dealHand: dealHand, nextHand: nextHand,
    pass: pass, draw: draw, discard: discard, knockCheck: knockCheck, knock: knock,
    layoff: layoff, layoffTarget: layoffTarget, finishLayoff: finishLayoff, forbidden: forbidden,
    aiStep: aiStep, autoLayoff: autoLayoff, knockLimit: knockLimit,
    moveCard: moveCard, sortHand: sortHand
  };
});
