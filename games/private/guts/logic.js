/* Guts: pure rules and AI. No DOM access. Works via <script> (window.GutsLogic) and require().
   The whole game state is plain JSON (the PRNG state is a number in s.rs). Player 0 is the human.
   Chip conservation: sum of all stacks plus the pot is constant for the whole game. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GutsLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const NAMES = ['You', 'Ada', 'Ben', 'Cleo', 'Dev', 'Eli'];
  const CAT_NAMES = ['High card', 'Pair', 'Flush', 'Straight', 'Three of a kind', 'Straight flush'];
  const START_CHIPS = 100;

  // mulberry32 with the generator state kept in s.rs
  function rand(s) {
    let a = s.rs | 0;
    a = (a + 0x6d2b79f5) | 0;
    s.rs = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function buildDeck() {
    const d = [];
    let id = 0;
    for (const su of SUITS) for (const r of RANKS) d.push({ id: id++, r, s: su });
    return d;
  }

  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function rankName(r) { return ({ 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' })[r] || String(r); }
  function rankPlural(r) { return r === 6 ? 'Sixes' : rankName(r) + 's'; }

  // ---- hand ranking (exactly three cards)
  // Returns { cat 0..5, key [numbers, compare lexicographically], name }
  function evaluate(hand) {
    if (!hand || hand.length !== 3) throw new Error('hand must have 3 cards');
    const rs = hand.map((c) => c.r).sort((a, b) => b - a);
    const flush = hand[0].s === hand[1].s && hand[1].s === hand[2].s;
    let straightHigh = 0;
    if (rs[0] - 1 === rs[1] && rs[1] - 1 === rs[2]) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) straightHigh = 3; // ace low
    let cat, key, name;
    if (straightHigh && flush) {
      cat = 5; key = [5, straightHigh];
      name = straightHigh === 14 ? 'Royal straight flush' : 'Straight flush, ' + rankName(straightHigh) + ' high';
    } else if (rs[0] === rs[1] && rs[1] === rs[2]) {
      cat = 4; key = [4, rs[0]]; name = 'Three ' + rankPlural(rs[0]);
    } else if (straightHigh) {
      cat = 3; key = [3, straightHigh]; name = 'Straight, ' + rankName(straightHigh) + ' high';
    } else if (flush) {
      cat = 2; key = [2, rs[0], rs[1], rs[2]]; name = 'Flush, ' + rankName(rs[0]) + ' high';
    } else if (rs[0] === rs[1] || rs[1] === rs[2]) {
      const pr = rs[1];
      const kick = rs[0] === rs[1] ? rs[2] : rs[0];
      cat = 1; key = [1, pr, kick]; name = 'Pair of ' + rankPlural(pr);
    } else {
      cat = 0; key = [0, rs[0], rs[1], rs[2]]; name = rankName(rs[0]) + ' high';
    }
    return { cat, key, name };
  }

  function compareKeys(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  function compareHands(h1, h2) { return compareKeys(evaluate(h1).key, evaluate(h2).key); }

  // ---- game setup
  function newGame(opts) {
    opts = opts || {};
    const opponents = Math.max(2, Math.min(5, (opts.opponents | 0) || 3));
    const ante = opts.ante === 5 ? 5 : 1;
    const seed = opts.seed === undefined ? 1 : opts.seed | 0;
    const s = {
      v: 1, seed, rs: seed, ante, handNo: 0, pot: 0, phase: 'call', over: false, winner: null,
      players: [], last: null, stats: { humanHands: 0, humanFolds: 0 },
    };
    for (let i = 0; i <= opponents; i++) {
      s.players.push({
        name: NAMES[i], human: i === 0, chips: START_CHIPS, bust: false, hand: [], call: null,
        style: i === 0 ? 0 : Math.round((rand(s) - 0.5) * 100) / 1000, // -0.05..0.05 looseness
      });
    }
    startHand(s);
    return s;
  }

  function active(s) { return s.players.map((p, i) => (p.bust ? -1 : i)).filter((i) => i >= 0); }
  function totalChips(s) { return s.pot + s.players.reduce((a, p) => a + p.chips, 0); }

  function checkOver(s) {
    const act = active(s);
    if (s.players[0].bust) {
      s.over = true; s.phase = 'over'; s.winner = act.length === 1 ? act[0] : null;
      return true;
    }
    if (act.length <= 1) {
      s.over = true; s.phase = 'over'; s.winner = act[0];
      if (s.pot > 0) { s.players[act[0]].chips += s.pot; s.pot = 0; }
      return true;
    }
    return false;
  }

  // Collect antes, deal. A player who cannot cover the ante pays what they have into the pot and goes bust.
  function startHand(s) {
    s.handNo++;
    const busted = [];
    for (const p of s.players) {
      p.hand = []; p.call = null;
      if (p.bust) continue;
      if (p.chips < s.ante) {
        s.pot += p.chips; p.chips = 0; p.bust = true; busted.push(p.name);
      } else { p.chips -= s.ante; s.pot += s.ante; }
    }
    s.anteBust = busted;
    if (checkOver(s)) return s;
    const deck = shuffle(s, buildDeck());
    for (let k = 0; k < 3; k++) for (const p of s.players) if (!p.bust) p.hand.push(deck.pop());
    s.phase = 'call';
    s.last = null;
    return s;
  }

  // ---- AI
  // Uses only the player's own hand, the pot, stacks, how many are still in the game and the human's fold record.
  function humanFoldRate(s) {
    const h = s.stats.humanHands;
    return h >= 5 ? s.stats.humanFolds / h : 0.4;
  }

  function aiInProb(s, i) {
    const p = s.players[i];
    const ev = evaluate(p.hand);
    const rs = p.hand.map((c) => c.r).sort((a, b) => b - a);
    const others = active(s).length - 1;
    const pot = s.pot;
    const potUnits = pot / s.ante;
    const attract = Math.min(1, potUnits / 40); // 0..1, bigger pot is more tempting
    const stackRisk = Math.max(0, pot / Math.max(1, p.chips) - 0.3); // match penalty vs my stack
    const crowd = 0.05 * Math.max(0, others - 1); // more opponents in the game, more caution
    const f = humanFoldRate(s);
    const bluff = Math.max(0, (f - 0.4) / 0.6) * 0.2; // human folds a lot: stay in lighter
    let pr;
    if (ev.cat >= 3) return 1;
    if (ev.cat === 2) {
      pr = 0.92 - crowd * 0.5 - 0.5 * stackRisk;
    } else if (ev.cat === 1) {
      const pr0 = ev.key[1];
      const base = 0.5 + (pr0 - 2) / 12 * 0.32; // 0.50 .. 0.82
      pr = base + 0.14 * attract - crowd - 0.7 * stackRisk + bluff * 0.5;
    } else {
      const top = rs[0], second = rs[1];
      let base = 0.02;
      if (top === 14 && second >= 10) base = 0.34;
      else if (top === 14) base = 0.12;
      else if (top === 13 && second >= 10) base = 0.2;
      const smallPot = potUnits <= 6 || others <= 2;
      pr = smallPot ? base - crowd - 0.8 * stackRisk : base * 0.25 - crowd;
      pr += bluff;
    }
    pr += p.style;
    if (pr < 0.01) pr = 0.01;
    if (pr > 0.97) pr = 0.97;
    return pr;
  }

  function aiDecide(s, i) { return rand(s) < aiInProb(s, i) ? 'in' : 'out'; }

  // ---- play
  function setCall(s, i, call) {
    if (s.phase !== 'call') throw new Error('not in call phase');
    const p = s.players[i];
    if (p.bust) throw new Error('player is out of the game');
    if (call !== 'in' && call !== 'out') throw new Error('bad call');
    if (p.call) throw new Error('already called');
    p.call = call;
    return s;
  }

  function aiCalls(s) {
    for (let i = 1; i < s.players.length; i++) {
      const p = s.players[i];
      if (!p.bust && !p.call) p.call = aiDecide(s, i);
    }
    return s;
  }

  function resolve(s) {
    if (s.phase !== 'call') throw new Error('not in call phase');
    for (const p of s.players) if (!p.bust && !p.call) throw new Error('calls missing');
    const ins = active(s).filter((i) => s.players[i].call === 'in');
    s.stats.humanHands++;
    if (s.players[0].call === 'out') s.stats.humanFolds++;
    const potBefore = s.pot;
    const res = { hand: s.handNo, potBefore, ins, winners: [], evals: {}, matches: [], type: '', share: 0, odd: 0, potAfter: 0 };
    if (ins.length === 0) {
      res.type = 'carry';
    } else if (ins.length === 1) {
      res.type = 'solo'; res.winners = [ins[0]]; res.share = s.pot;
      s.players[ins[0]].chips += s.pot; s.pot = 0;
    } else {
      res.type = 'showdown';
      let best = null;
      for (const i of ins) {
        const ev = evaluate(s.players[i].hand);
        res.evals[i] = { name: ev.name, cat: ev.cat, key: ev.key };
        if (best === null || compareKeys(ev.key, best) > 0) best = ev.key;
      }
      res.winners = ins.filter((i) => compareKeys(res.evals[i].key, best) === 0);
      const P = s.pot;
      const share = Math.floor(P / res.winners.length);
      const odd = P - share * res.winners.length;
      for (const w of res.winners) s.players[w].chips += share;
      res.share = share; res.odd = odd;
      let newPot = odd;
      for (const i of ins) {
        if (res.winners.indexOf(i) >= 0) continue;
        const p = s.players[i];
        const pay = Math.min(p.chips, P);
        p.chips -= pay; newPot += pay;
        const bust = p.chips === 0;
        if (bust) p.bust = true;
        res.matches.push({ i, owed: P, paid: pay, bust });
      }
      s.pot = newPot;
    }
    res.potAfter = s.pot;
    s.last = res;
    s.phase = 'result';
    return s;
  }

  // From the result screen to the next hand (or game over).
  function nextHand(s) {
    if (s.phase !== 'result') throw new Error('hand not finished');
    if (checkOver(s)) return s;
    return startHand(s);
  }

  // Convenience for tests and simulations: play one whole hand with a human call.
  function playHand(s, humanCall) {
    setCall(s, 0, humanCall);
    aiCalls(s);
    resolve(s);
    return s;
  }

  return {
    START_CHIPS, CAT_NAMES, NAMES, rand, buildDeck, shuffle, evaluate, compareKeys, compareHands,
    newGame, startHand, active, totalChips, setCall, aiCalls, aiInProb, aiDecide, resolve, nextHand, playHand,
    humanFoldRate, rankName,
  };
});
