/* Uno: pure rules and AI. No DOM access. Works via <script> (window.UnoLogic) and require().
   The whole game state is plain JSON (the PRNG state is a number in s.rs), so it can be saved
   and restored. Player 0 is always the human. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UnoLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLORS = ['red', 'yellow', 'green', 'blue'];
  const NAMES = ['You', 'Ada', 'Ben', 'Cleo'];

  // mulberry32, with the generator state kept in s.rs so a save can resume mid-game.
  function rand(s) {
    let a = s.rs | 0;
    a = (a + 0x6d2b79f5) | 0;
    s.rs = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildDeck() {
    const d = [];
    let id = 0;
    for (const c of COLORS) {
      d.push({ id: id++, c, v: '0' });
      for (let k = 0; k < 2; k++) {
        for (let n = 1; n <= 9; n++) d.push({ id: id++, c, v: String(n) });
        for (const v of ['skip', 'rev', 'd2']) d.push({ id: id++, c, v });
      }
    }
    for (let k = 0; k < 4; k++) d.push({ id: id++, c: null, v: 'wild' });
    for (let k = 0; k < 4; k++) d.push({ id: id++, c: null, v: 'd4' });
    return d;
  }

  function cardPoints(card) {
    if (card.v === 'wild' || card.v === 'd4') return 50;
    if (card.v === 'skip' || card.v === 'rev' || card.v === 'd2') return 20;
    return parseInt(card.v, 10);
  }
  function handPoints(hand) { return hand.reduce((a, c) => a + cardPoints(c), 0); }

  function emit(s, ev) { if (s.ev) s.ev.push(ev); return ev; }
  function topCard(s) { return s.discard[s.discard.length - 1]; }
  function nextIdx(s, from, k) {
    const n = s.players.length;
    return (((from + s.dir * (k === undefined ? 1 : k)) % n) + n) % n;
  }

  function newGame(opts) {
    opts = opts || {};
    const count = Math.max(2, Math.min(4, (opts.players | 0) || 4));
    const r = opts.rules || {};
    const s = {
      v: 1,
      seed: (opts.seed === undefined ? 1 : opts.seed) | 0,
      rs: 0,
      rules: { stack2: !!r.stack2, sevenZero: !!r.sevenZero, target: r.target ? 500 : 0 },
      players: [],
      round: 0,
      over: false,
      ev: [],
    };
    s.rs = s.seed;
    for (let i = 0; i < count; i++) {
      s.players.push({ name: i === 0 ? 'You' : NAMES[i], human: i === 0, hand: [], score: 0, uno: false });
    }
    startRound(s);
    return s;
  }

  function startRound(s) {
    s.ev = [];
    s.round++;
    s.over = false;
    s.winner = null;
    s.roundPoints = 0;
    s.first = (s.round - 1) % s.players.length;
    s.dir = 1;
    s.pendingDraw = 0;
    s.pending = null;
    s.catchable = null;
    s.drawnId = null;
    s.pendingCard = null;
    s.pendingInfo = null;
    s.unoWho = null;
    s.stall = 0;
    for (const p of s.players) { p.hand = []; p.uno = false; }
    let deck = shuffle(s, buildDeck());
    for (let k = 0; k < 7; k++) for (const p of s.players) p.hand.push(deck.pop());
    let top = deck.pop();
    while (top.v === 'd4') { // put it back and reshuffle
      deck.push(top);
      shuffle(s, deck);
      top = deck.pop();
    }
    s.draw = deck;
    s.discard = [top];
    s.color = top.c;
    s.phase = 'play';
    const n = s.players.length;
    const first = s.first;
    s.cur = first;
    emit(s, { t: 'start', card: top });
    if (top.v === 'wild') {
      s.phase = 'firstcolor';
    } else if (top.v === 'skip') {
      emit(s, { t: 'skip', p: first });
      s.cur = (first + 1) % n;
    } else if (top.v === 'rev') {
      s.dir = -1;
      emit(s, { t: 'reverse' });
      s.cur = nextIdx(s, first); // with 2 players this is the same as a skip
      if (n === 2) emit(s, { t: 'skip', p: first });
    } else if (top.v === 'd2') {
      give(s, first, 2);
      emit(s, { t: 'draw', p: first, n: 2, forced: true });
      s.cur = (first + 1) % n;
    }
    return s;
  }

  function reshuffleIfNeeded(s) {
    if (s.draw.length === 0 && s.discard.length > 1) {
      const top = s.discard.pop();
      const rest = s.discard;
      s.discard = [top];
      s.draw = shuffle(s, rest);
      emit(s, { t: 'reshuffle' });
    }
  }
  function drawCard(s) {
    reshuffleIfNeeded(s);
    return s.draw.length ? s.draw.pop() : null;
  }
  function give(s, i, n) {
    let got = 0;
    const p = s.players[i];
    for (let k = 0; k < n; k++) {
      const c = drawCard(s);
      if (!c) break;
      p.hand.push(c);
      got++;
    }
    p.uno = false;
    return got;
  }

  function isLegal(s, card, hand) {
    if (s.pendingDraw > 0) return card.v === 'd2';
    if (card.v === 'd4') return !hand.some((x) => x.c === s.color);
    if (card.v === 'wild') return true;
    const top = topCard(s);
    return card.c === s.color || card.v === top.v;
  }

  function legalMoves(s, i) {
    if (s.phase === 'roundover' || s.cur !== i) return [];
    const hand = s.players[i].hand;
    if (s.phase === 'play') return hand.filter((c) => isLegal(s, c, hand));
    if (s.phase === 'drawn') return hand.filter((c) => c.id === s.drawnId && isLegal(s, c, hand));
    return [];
  }

  function act(s, fn) {
    s.ev = [];
    const r = fn();
    if (r && r.ok === false) return { ok: false, err: r.err, events: [] };
    return Object.assign({ ok: true, events: s.ev }, r || {});
  }
  function err(e) { return { ok: false, err: e }; }
  function clearCatch(s, i) { if (s.catchable !== null && s.catchable !== i) s.catchable = null; }

  function endRound(s, w) {
    s.phase = 'roundover';
    s.winner = w;
    let pts = 0;
    s.players.forEach((p, i) => { if (i !== w) pts += handPoints(p.hand); });
    s.roundPoints = pts;
    s.players[w].score += pts;
    s.over = s.rules.target ? s.players[w].score >= s.rules.target : true;
    s.catchable = null;
    emit(s, { t: 'roundover', p: w, points: pts });
  }

  function play(s, i, cardId, o) {
    o = o || {};
    return act(s, () => {
      if (s.phase !== 'play' && s.phase !== 'drawn') return err('phase');
      if (s.cur !== i) return err('turn');
      const p = s.players[i];
      const idx = p.hand.findIndex((c) => c.id === cardId);
      if (idx < 0) return err('nocard');
      const card = p.hand[idx];
      if (s.phase === 'drawn' && card.id !== s.drawnId) return err('drawnonly');
      const legal = isLegal(s, card, p.hand);
      const bluff = !legal && o.bluff && card.v === 'd4' && s.pendingDraw === 0;
      if (!legal && !bluff) return err('illegal');
      const wild = card.c === null;
      if (wild && COLORS.indexOf(o.color) < 0) return err('color');
      clearCatch(s, i);
      const prevColor = s.color;
      const hadColor = card.v === 'd4' && p.hand.some((x) => x.c === prevColor);
      p.hand.splice(idx, 1);
      s.discard.push(card);
      s.color = wild ? o.color : card.c;
      s.drawnId = null;
      s.phase = 'play';
      s.stall = 0;
      emit(s, { t: 'play', p: i, card, color: s.color });
      if (p.hand.length === 0) { endRound(s, i); return {}; }
      if (s.rules.sevenZero && card.v === '7') {
        let t = o.swapWith;
        if (!(t >= 0 && t < s.players.length) || t === i) t = bestSwapTarget(s, i);
        const mine = p.hand;
        p.hand = s.players[t].hand;
        s.players[t].hand = mine;
        p.uno = false; s.players[t].uno = false;
        emit(s, { t: 'swap', p: i, with: t });
      } else if (s.rules.sevenZero && card.v === '0') {
        const hands = s.players.map((x) => x.hand);
        s.players.forEach((x, k) => { s.players[nextIdx(s, k)].hand = hands[k]; x.uno = false; });
        emit(s, { t: 'rotate' });
      }
      if (p.hand.length === 1 && !p.uno) {
        if (p.human) {
          s.phase = 'unowin';
          s.unoWho = i;
          s.pendingCard = card;
          s.pendingInfo = { hadColor, prevColor };
          return {};
        }
        if (rand(s) < 0.1) { s.catchable = i; } else { p.uno = true; emit(s, { t: 'uno', p: i }); }
      } else if (p.hand.length === 1) {
        emit(s, { t: 'uno', p: i });
      }
      finishPlay(s, i, card, { hadColor, prevColor });
      return {};
    });
  }

  function finishPlay(s, i, card, info) {
    s.phase = 'play';
    s.unoWho = null;
    s.pendingCard = null;
    const n = s.players.length;
    switch (card.v) {
      case 'skip':
        emit(s, { t: 'skip', p: nextIdx(s, i) });
        s.cur = nextIdx(s, i, 2);
        break;
      case 'rev':
        s.dir *= -1;
        emit(s, { t: 'reverse' });
        if (n === 2) { emit(s, { t: 'skip', p: nextIdx(s, i) }); s.cur = i; } else s.cur = nextIdx(s, i);
        break;
      case 'd2': {
        const nxt = nextIdx(s, i);
        if (s.rules.stack2) {
          s.pendingDraw += 2;
          s.cur = nxt;
        } else {
          const got = give(s, nxt, 2);
          emit(s, { t: 'draw', p: nxt, n: got, forced: true });
          s.cur = nextIdx(s, i, 2);
        }
        break;
      }
      case 'd4': {
        const target = nextIdx(s, i);
        s.pending = { by: i, target, hadColor: !!(info && info.hadColor), prevColor: info ? info.prevColor : null };
        s.phase = 'challenge';
        s.cur = target;
        break;
      }
      default:
        s.cur = nextIdx(s, i);
    }
  }

  function challenge(s, i, yes) {
    return act(s, () => {
      if (s.phase !== 'challenge' || s.cur !== i || !s.pending) return err('phase');
      const p = s.pending;
      s.pending = null;
      s.phase = 'play';
      clearCatch(s, i);
      if (!yes) {
        const got = give(s, p.target, 4);
        emit(s, { t: 'draw', p: p.target, n: got, forced: true });
        s.cur = nextIdx(s, p.target);
      } else if (p.hadColor) {
        const got = give(s, p.by, 4);
        emit(s, { t: 'challenge', by: p.target, who: p.by, won: true, n: got });
        s.cur = p.target;
      } else {
        const got = give(s, p.target, 6);
        emit(s, { t: 'challenge', by: p.target, who: p.by, won: false, n: got });
        s.cur = nextIdx(s, p.target);
      }
      return {};
    });
  }

  function draw(s, i) {
    return act(s, () => {
      if (s.phase !== 'play' || s.cur !== i) return err('phase');
      clearCatch(s, i);
      const p = s.players[i];
      if (s.pendingDraw > 0) {
        const got = give(s, i, s.pendingDraw);
        s.pendingDraw = 0;
        emit(s, { t: 'draw', p: i, n: got, forced: true });
        s.cur = nextIdx(s, i);
        bumpStall(s);
        return {};
      }
      const c = drawCard(s);
      if (!c) {
        emit(s, { t: 'pass', p: i, empty: true });
        s.cur = nextIdx(s, i);
        bumpStall(s);
        return {};
      }
      p.hand.push(c);
      p.uno = false;
      if (isLegal(s, c, p.hand)) {
        s.phase = 'drawn';
        s.drawnId = c.id;
        emit(s, { t: 'draw', p: i, n: 1, playable: true, card: c });
      } else {
        emit(s, { t: 'draw', p: i, n: 1, playable: false, card: c });
        emit(s, { t: 'pass', p: i });
        s.cur = nextIdx(s, i);
        bumpStall(s);
      }
      return {};
    });
  }

  function bumpStall(s) {
    s.stall = (s.stall || 0) + 1;
    if (s.stall > s.players.length * 4 && s.phase !== 'roundover') {
      // nobody can move and nothing is left to draw: fewest cards wins
      let w = 0;
      s.players.forEach((p, k) => { if (p.hand.length < s.players[w].hand.length) w = k; });
      endRound(s, w);
    }
  }

  function pass(s, i) {
    return act(s, () => {
      if (s.phase !== 'drawn' || s.cur !== i) return err('phase');
      s.drawnId = null;
      s.phase = 'play';
      emit(s, { t: 'pass', p: i });
      s.cur = nextIdx(s, i);
      bumpStall(s);
      return {};
    });
  }

  function setColor(s, i, color) {
    return act(s, () => {
      if (s.phase !== 'firstcolor' || s.cur !== i || COLORS.indexOf(color) < 0) return err('phase');
      s.color = color;
      s.phase = 'play';
      emit(s, { t: 'color', p: i, color });
      return {};
    });
  }

  function callUno(s, i) {
    return act(s, () => {
      const p = s.players[i];
      const inWindow = s.phase === 'unowin' && s.unoWho === i;
      const onTurn = s.cur === i && (s.phase === 'play' || s.phase === 'drawn');
      if (!(inWindow || onTurn) || p.hand.length > 2) return err('nouno');
      p.uno = true;
      emit(s, { t: 'uno', p: i });
      if (inWindow) finishPlay(s, i, s.pendingCard, null2(s));
      return {};
    });
  }
  // The d4 challenge info saved when the UNO window opened.
  function null2(s) { return s.pendingInfo || { hadColor: false, prevColor: null }; }

  function endTurn(s, i) {
    return act(s, () => {
      if (s.phase !== 'unowin' || s.unoWho !== i) return err('phase');
      const p = s.players[i];
      if (!p.uno) {
        const got = give(s, i, 2);
        emit(s, { t: 'unopenalty', p: i, n: got });
      }
      finishPlay(s, i, s.pendingCard, null2(s));
      return {};
    });
  }

  function catchUno(s, by) {
    return act(s, () => {
      const w = s.catchable;
      if (w === null || w === undefined || w === by || s.phase === 'roundover') return err('nocatch');
      const p = s.players[w];
      s.catchable = null;
      if (p.hand.length !== 1 || p.uno) return err('nocatch');
      const got = give(s, w, 2);
      emit(s, { t: 'catch', by, who: w, n: got });
      return {};
    });
  }

  // ---------------------------------------------------------------- AI

  function bestSwapTarget(s, i) {
    let best = -1;
    s.players.forEach((p, k) => {
      if (k === i) return;
      if (best < 0 || p.hand.length < s.players[best].hand.length) best = k;
    });
    return best;
  }

  function colorCounts(hand) {
    const cnt = { red: 0, yellow: 0, green: 0, blue: 0 };
    hand.forEach((x) => { if (x.c) cnt[x.c]++; });
    return cnt;
  }

  function chooseColor(s, hand) {
    const cnt = colorCounts(hand);
    let bestN = -1, best = [];
    for (const c of COLORS) {
      if (cnt[c] > bestN) { bestN = cnt[c]; best = [c]; } else if (cnt[c] === bestN) best.push(c);
    }
    return best[Math.floor(rand(s) * best.length)];
  }

  function scoreMove(s, i, card, hand) {
    const n = s.players.length;
    const nxt = nextIdx(s, i);
    const nl = s.players[nxt].hand.length;
    const prev = nextIdx(s, i, -1);
    const pl = s.players[prev].hand.length;
    const rest = hand.filter((x) => x.id !== card.id);
    const cnt = colorCounts(rest);
    let sc = 0;
    if (card.c === null) {
      sc = -40; // save wilds
      if (rest.length <= 1) sc += 60;
      if (card.v === 'd4') { if (nl <= 2) sc += 45; else if (nl <= 3) sc += 20; }
      else if (nl <= 2) sc += 10;
      return sc;
    }
    sc = 10 + cnt[card.c] * 2 + cardPoints(card) / 5;
    const hurt = (low) => (low <= 3 ? 30 : 4);
    if (card.v === 'skip') sc += hurt(n === 2 ? s.players[nxt].hand.length : nl);
    else if (card.v === 'd2') sc += hurt(nl) + 5;
    else if (card.v === 'rev') sc += n === 2 ? hurt(nl) : (pl <= 3 && nl > 3 ? 25 : 2);
    if (s.rules.sevenZero) {
      if (card.v === '7') {
        const t = bestSwapTarget(s, i);
        sc += s.players[t].hand.length + 1 < rest.length ? 35 : -8;
      } else if (card.v === '0') {
        sc += nl < rest.length ? -4 : 6;
      }
    }
    if (s.pendingDraw > 0) sc += 50;
    return sc;
  }

  function pickMove(s, i) {
    const p = s.players[i];
    const moves = legalMoves(s, i);
    let best = null, bestScore = -Infinity;
    for (const c of moves) {
      const sc = scoreMove(s, i, c, p.hand) + rand(s) * 2;
      if (sc > bestScore) { bestScore = sc; best = { card: c, bluff: false }; }
    }
    // occasional bluff: Wild Draw Four against a player about to win
    if (s.phase === 'play' && s.pendingDraw === 0) {
      const d4 = p.hand.find((c) => c.v === 'd4');
      const nl = s.players[nextIdx(s, i)].hand.length;
      if (d4 && !moves.some((c) => c.id === d4.id) && nl <= 2 && rand(s) < 0.15) {
        return { card: d4, bluff: true };
      }
    }
    return best;
  }

  function playAI(s, i, move) {
    const p = s.players[i];
    const o = { bluff: move.bluff };
    if (move.card.c === null) o.color = chooseColor(s, p.hand.filter((x) => x.id !== move.card.id));
    if (move.card.v === '7') o.swapWith = bestSwapTarget(s, i);
    return play(s, i, move.card.id, o);
  }

  // Performs exactly one AI action for the current player. Returns null when nothing to do
  // (human to move, or the round is over).
  function aiStep(s) {
    if (s.phase === 'roundover') return null;
    const i = s.cur;
    const p = s.players[i];
    if (p.human) return null;
    if (s.phase === 'firstcolor') return setColor(s, i, chooseColor(s, p.hand));
    if (s.phase === 'challenge') return challenge(s, i, rand(s) < 0.3);
    if (s.phase === 'drawn') {
      const c = p.hand.find((x) => x.id === s.drawnId);
      if (c && c.c === null && p.hand.length > 3 && s.pendingDraw === 0) return pass(s, i);
      return playAI(s, i, { card: c, bluff: false });
    }
    if (s.phase === 'play') {
      const m = pickMove(s, i);
      if (!m) return draw(s, i);
      return playAI(s, i, m);
    }
    return null;
  }

  return {
    COLORS, NAMES, rand, shuffle, buildDeck, cardPoints, handPoints,
    newGame, startRound, isLegal, legalMoves, play, draw, pass, challenge, setColor,
    callUno, endTurn, catchUno, aiStep, chooseColor, topCard, nextIdx, bestSwapTarget,
  };
});
