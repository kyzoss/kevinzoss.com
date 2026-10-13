/* Spite and Malice: pure rules + computer player. No DOM access.
   Works as a browser <script> (window.SpiteLogic) and via require() in node.
   All randomness comes from a seeded mulberry32 whose state lives in the game state. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpiteLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HAND_SIZE = 5;
  const STOCK_SIZE = 20;
  const DECK_SIZE = 108; // two 52-card decks + 4 jokers
  const TURN_CAP = 600;  // safety net: total player turns before the game is adjudicated
  const PILE_TOP = 12;   // Queen; a build pile is complete when the 12 is placed

  // ---- cards: integers 0..107. 0-51 deck A, 52-103 deck B, 104-107 jokers.
  function rank(c) { return c >= 104 ? 0 : (c % 52) % 13 + 1; } // 1..13, 0 = joker
  function suit(c) { return c >= 104 ? 4 : Math.floor((c % 52) / 13); } // 0 S,1 H,2 D,3 C,4 joker
  function isWild(c) { const r = rank(c); return r === 0 || r === 13; }

  // ---- seeded PRNG (mulberry32). The state is s.rs so a save game resumes exactly.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rnd(s) {
    s.rs = (s.rs + 0x6d2b79f5) | 0;
    let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(arr, s) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd(s) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildDeck() {
    const d = [];
    for (let i = 0; i < DECK_SIZE; i++) d.push(i);
    return d;
  }

  function newPlayer() { return { stock: [], hand: [], disc: [[], [], [], []] }; }

  // ---- setup. Stock top is the LAST element of p.stock. Draw pile top is the last element of s.draw.
  function newGame(seed) {
    seed = seed | 0;
    const s = {
      v: 1, seed: seed, rs: seed,
      draw: buildDeck(), complete: [],
      build: [0, 1, 2, 3].map(() => ({ n: 1, cards: [] })), // n = value the pile needs next (1..12)
      players: [newPlayer(), newPlayer()],
      turn: 0, winner: null, turns: 0, passes: 0, reshuffles: 0, capped: false
    };
    shuffle(s.draw, s);
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < STOCK_SIZE; i++) s.players[p].stock.push(s.draw.pop());
    }
    s.turn = rnd(s) < 0.5 ? 0 : 1;
    fillHand(s, s.turn);
    if (s.players[s.turn].hand.length === 0 && legalMoves(s).length === 0) endTurn(s);
    return s;
  }

  function cloneState(s) { return JSON.parse(JSON.stringify(s)); }

  // ---- drawing
  function drawOne(s, p) {
    if (s.draw.length === 0 && s.complete.length > 0) {
      s.draw = shuffle(s.complete, s);
      s.complete = [];
      s.reshuffles++;
    }
    if (s.draw.length === 0) return false;
    s.players[p].hand.push(s.draw.pop());
    return true;
  }
  function fillHand(s, p) {
    let n = 0;
    while (s.players[p].hand.length < HAND_SIZE && drawOne(s, p)) n++;
    return n;
  }

  // ---- rules
  function canPlayOn(s, card, pile) {
    if (pile < 0 || pile > 3) return false;
    return isWild(card) || rank(card) === s.build[pile].n;
  }
  function cardAt(s, p, src, i) {
    const pl = s.players[p];
    if (src === 'stock') return pl.stock.length ? pl.stock[pl.stock.length - 1] : undefined;
    if (src === 'hand') return pl.hand[i];
    if (src === 'disc') { const d = pl.disc[i]; return d && d.length ? d[d.length - 1] : undefined; }
    return undefined;
  }
  function legalMoves(s, p) {
    if (p === undefined) p = s.turn;
    const out = [];
    if (s.winner !== null) return out;
    const pl = s.players[p];
    const srcs = [];
    if (pl.stock.length) srcs.push(['stock', 0]);
    for (let j = 0; j < 4; j++) if (pl.disc[j].length) srcs.push(['disc', j]);
    for (let h = 0; h < pl.hand.length; h++) srcs.push(['hand', h]);
    for (const [src, i] of srcs) {
      const c = cardAt(s, p, src, i);
      for (let k = 0; k < 4; k++) if (canPlayOn(s, c, k)) out.push({ src: src, i: i, pile: k });
    }
    return out;
  }
  function isLegal(s, m) {
    if (!m || s.winner !== null) return false;
    if (m.src !== 'stock' && m.src !== 'hand' && m.src !== 'disc') return false;
    const c = cardAt(s, s.turn, m.src, m.i);
    return c !== undefined && canPlayOn(s, c, m.pile);
  }

  // Play one card. Returns {ok, card, completed, won, redrew, turnEnded}
  function play(s, m) {
    if (!isLegal(s, m)) return { ok: false };
    const p = s.turn, pl = s.players[p];
    let card;
    if (m.src === 'stock') card = pl.stock.pop();
    else if (m.src === 'hand') card = pl.hand.splice(m.i, 1)[0];
    else card = pl.disc[m.i].pop();
    const b = s.build[m.pile];
    b.cards.push(card);
    b.n++;
    s.passes = 0;
    const res = { ok: true, card: card, pile: m.pile, completed: false, won: false, redrew: 0, turnEnded: false };
    if (b.n > PILE_TOP) {
      res.completed = true;
      for (const c of b.cards) s.complete.push(c);
      s.build[m.pile] = { n: 1, cards: [] };
    }
    if (pl.stock.length === 0) {
      s.winner = p; res.won = true;
      return res;
    }
    if (m.src === 'hand' && pl.hand.length === 0) res.redrew = fillHand(s, p);
    if (pl.hand.length === 0 && legalMoves(s).length === 0) { endTurn(s); res.turnEnded = true; }
    return res;
  }

  // Discard ends the turn.
  function discard(s, handIdx, pile) {
    if (s.winner !== null) return { ok: false };
    const pl = s.players[s.turn];
    if (handIdx < 0 || handIdx >= pl.hand.length || pile < 0 || pile > 3) return { ok: false };
    const card = pl.hand.splice(handIdx, 1)[0];
    pl.disc[pile].push(card);
    s.passes = 0;
    endTurn(s);
    return { ok: true, card: card, pile: pile, turnEnded: true };
  }

  function canEndWithoutDiscard(s) {
    return s.winner === null && s.players[s.turn].hand.length === 0;
  }
  function endWithoutDiscard(s) {
    if (!canEndWithoutDiscard(s)) return { ok: false };
    endTurn(s);
    return { ok: true, turnEnded: true };
  }

  function adjudicate(s) {
    const a = s.players[0].stock.length, b = s.players[1].stock.length;
    s.winner = a < b ? 0 : b < a ? 1 : 2; // 2 = draw
    s.capped = true;
  }
  function endTurn(s) {
    for (;;) {
      s.turns++;
      if (s.turns >= TURN_CAP) { adjudicate(s); return; }
      s.turn = 1 - s.turn;
      fillHand(s, s.turn);
      if (s.players[s.turn].hand.length === 0 && legalMoves(s).length === 0) {
        s.passes++;
        if (s.passes >= 6) { adjudicate(s); return; }
        continue;
      }
      return;
    }
  }

  // =====================================================================
  // Computer player. Searches every sequence of plays from hand, discard
  // tops and stock top (depth-limited, memoised), scores the position it
  // would leave behind, and returns the first step of the best line.
  // It never looks at the draw pile, the opponent's hand, or its own
  // face-down stock cards.
  // =====================================================================
  function discardCost(c, ns, disc, myNeed) {
    const r = rank(c), wild = r === 0 || r === 13;
    let best = Infinity, bestPile = 0;
    for (let k = 0; k < 4; k++) {
      let cost = 0;
      const pile = disc[k];
      if (wild) cost += 60;
      else cost += (12 - r) * 0.8;
      if (pile.length === 0) cost += 3;
      else {
        const t = pile[pile.length - 1], tr = rank(t);
        if (tr === 0 || tr === 13) cost += 25;
        else if (!wild) {
          if (r === tr) cost += 0.5;
          else if (r < tr) cost += (tr - r - 1) * 0.7;
          else cost += 9 + (r - tr) * 0.5;
        }
        // burying a card that is playable right now
        for (let b = 0; b < 4; b++) if (ns[b] === tr) { cost += 10; break; }
        cost += pile.length * 0.15;
      }
      if (!wild && myNeed > 0) {
        for (let b = 0; b < 4; b++) if (ns[b] <= r && r < myNeed) { cost += 8; break; }
      }
      if (cost < best) { best = cost; bestPile = k; }
    }
    return { cost: best, pile: bestPile };
  }

  function aiChoose(s) {
    const p = s.turn, me = s.players[p], opp = s.players[1 - p];
    const oppTop = opp.stock.length ? opp.stock[opp.stock.length - 1] : undefined;
    const oppNeed = oppTop === undefined || isWild(oppTop) ? -1 : rank(oppTop);
    const myTop0 = me.stock.length ? me.stock[me.stock.length - 1] : undefined;
    const myNeed0 = myTop0 === undefined || isWild(myTop0) ? -1 : rank(myTop0);

    const rootNode = {
      ns: s.build.map(b => b.n),
      hand: me.hand.slice(),
      disc: me.disc.map(d => d.slice()),
      stockTop: myTop0, stockLeft: me.stock.length,
      handPlayed: 0, discPlayed: 0, stockPlayed: 0, wilds: 0, comps: 0,
      first: null
    };

    function evaluate(n) {
      if (n.stockLeft === 0) return { score: 1e6 + n.handPlayed, disc: null };
      let score = n.stockPlayed * 1000 + n.handPlayed * 12 + n.discPlayed * 10 + n.comps * 6 - n.wilds * 25;
      const myNeed = n.stockTop === undefined || n.stockTop === null || isWild(n.stockTop) ? -1 : rank(n.stockTop);
      for (let k = 0; k < 4; k++) {
        if (oppNeed > 0) {
          const d = oppNeed - n.ns[k];
          if (d === 0) score -= 150;
          else if (d > 0 && d <= 4) score -= (5 - d) * 3;
        }
      }
      if (myNeed > 0) {
        let bonus = 0;
        for (let k = 0; k < 4; k++) {
          const d = myNeed - n.ns[k];
          if (d > 0 && d <= 5) bonus = Math.max(bonus, (6 - d) * 3);
        }
        score += bonus;
      }
      let disc = null;
      if (n.hand.length === 0) score += 45;
      else {
        let best = Infinity;
        const seen = {};
        for (let h = 0; h < n.hand.length; h++) {
          const key = isWild(n.hand[h]) ? 'w' : rank(n.hand[h]);
          if (seen[key]) continue; seen[key] = 1;
          const dc = discardCost(n.hand[h], n.ns, n.disc, myNeed);
          if (dc.cost < best) { best = dc.cost; disc = { hand: h, pile: dc.pile }; }
        }
        score -= best;
      }
      return { score: score, disc: disc };
    }

    let best = null, bestScore = -Infinity;
    const visited = new Set();
    let nodes = 0;

    function key(n) {
      const h = n.hand.map(c => (isWild(c) ? 'w' : rank(c))).sort().join('.');
      return n.ns.join(',') + '|' + h + '|' + n.disc.map(d => d.length).join(',') + '|' + n.stockLeft;
    }

    function visit(n) {
      if (nodes++ > 5000) return;
      const k = key(n);
      if (visited.has(k)) return;
      visited.add(k);
      const ev = evaluate(n);
      if (ev.score > bestScore) { bestScore = ev.score; best = { node: n, disc: ev.disc }; }
      if (n.stockLeft === 0 || (n.hand.length === 0 && n.first)) return;
      const srcs = [];
      if (n.stockTop !== undefined && n.stockTop !== null) srcs.push(['stock', 0, n.stockTop]);
      for (let j = 0; j < 4; j++) if (n.disc[j].length) srcs.push(['disc', j, n.disc[j][n.disc[j].length - 1]]);
      const seenHand = {};
      for (let h = 0; h < n.hand.length; h++) {
        const kk = isWild(n.hand[h]) ? 'w' : rank(n.hand[h]);
        if (seenHand[kk]) continue; seenHand[kk] = 1;
        srcs.push(['hand', h, n.hand[h]]);
      }
      for (const [src, i, card] of srcs) {
        const seenN = {};
        for (let k2 = 0; k2 < 4; k2++) {
          if (seenN[n.ns[k2]]) continue;
          if (!(isWild(card) || rank(card) === n.ns[k2])) continue;
          seenN[n.ns[k2]] = 1;
          const c = {
            ns: n.ns.slice(), hand: n.hand.slice(), disc: n.disc.map(d => d.slice()),
            stockTop: n.stockTop, stockLeft: n.stockLeft,
            handPlayed: n.handPlayed, discPlayed: n.discPlayed, stockPlayed: n.stockPlayed,
            wilds: n.wilds, comps: n.comps, first: n.first || { src: src, i: i, pile: k2 }
          };
          if (src === 'stock') {
            c.stockLeft--; c.stockPlayed++; c.stockTop = null; // next stock card is unknown
          } else if (src === 'disc') {
            c.disc[i].pop(); c.discPlayed++;
          } else {
            c.hand.splice(i, 1); c.handPlayed++;
            if (isWild(card)) c.wilds++;
          }
          c.ns[k2]++;
          if (c.ns[k2] > PILE_TOP) { c.ns[k2] = 1; c.comps++; }
          visit(c);
        }
      }
    }
    visit(rootNode);

    if (best && best.node.first) return { type: 'play', move: best.node.first };
    if (me.hand.length === 0) return { type: 'end' };
    const ev = best && best.disc ? best.disc : { hand: 0, pile: 0 };
    return { type: 'discard', hand: ev.hand, pile: ev.pile };
  }

  // Apply a choice from aiChoose to the state. Returns the result object.
  function applyChoice(s, ch) {
    if (ch.type === 'play') return play(s, ch.move);
    if (ch.type === 'discard') return discard(s, ch.hand, ch.pile);
    return endWithoutDiscard(s);
  }

  return {
    HAND_SIZE, STOCK_SIZE, DECK_SIZE, TURN_CAP, PILE_TOP,
    rank, suit, isWild, mulberry32, shuffle, buildDeck,
    newGame, cloneState, fillHand, canPlayOn, cardAt, legalMoves, isLegal,
    play, discard, canEndWithoutDiscard, endWithoutDiscard, endTurn,
    aiChoose, applyChoice
  };
});
