'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../private/guts/logic.js');

let nid = 1000;
const R = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
// 'AS' 'TH' '2D' etc.
function cards(str) {
  return str.split(' ').map((t) => {
    const r = t.slice(0, -1);
    return { id: nid++, r: R[r] || parseInt(r, 10), s: t.slice(-1) };
  });
}
const ev = (str) => L.evaluate(cards(str));
const beats = (a, b) => L.compareHands(cards(a), cards(b)) > 0;

// Rig a state: set hands and calls, then resolve.
function rig(handStrs, chips, opts) {
  const s = L.newGame(Object.assign({ seed: 3, opponents: handStrs.length - 1 }, opts || {}));
  s.players.forEach((p, i) => { p.hand = cards(handStrs[i]); p.call = null; });
  if (chips) {
    const before = L.totalChips(s);
    chips.forEach((c, i) => { s.players[i].chips = c; });
    s.pot = before - chips.reduce((a, b) => a + b, 0);
  }
  return s;
}
function run(s, calls) {
  calls.forEach((c, i) => { if (!s.players[i].bust) L.setCall(s, i, c); });
  return L.resolve(s);
}

test('deck has 52 unique cards and each player is dealt 3', () => {
  const d = L.buildDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => c.r + c.s)).size, 52);
  const s = L.newGame({ seed: 9, opponents: 3 });
  assert.equal(s.players.length, 4);
  const seen = new Set();
  for (const p of s.players) { assert.equal(p.hand.length, 3); p.hand.forEach((c) => seen.add(c.r + c.s)); }
  assert.equal(seen.size, 12);
});

test('hand categories', () => {
  assert.equal(ev('AS KS QS').cat, 5);
  assert.equal(ev('3H 2H AH').cat, 5);
  assert.equal(ev('7C 7D 7H').cat, 4);
  assert.equal(ev('9C 8D 7H').cat, 3);
  assert.equal(ev('AC 2D 3H').cat, 3);
  assert.equal(ev('AC KD QH').cat, 3);
  assert.equal(ev('9C 4C 2C').cat, 2);
  assert.equal(ev('9C 9D 2C').cat, 1);
  assert.equal(ev('9C 8D 2C').cat, 0);
});

test('ranking order across categories', () => {
  const order = ['2H 3H 4H', '2C 2D 2S', 'AC KD QH', 'AC JC 9C', 'AC AD 2H', 'AC KD 9H'];
  for (let i = 0; i < order.length - 1; i++) assert.ok(beats(order[i], order[i + 1]), order[i] + ' beats ' + order[i + 1]);
});

test('ace low and ace high straights, straight flushes', () => {
  assert.deepEqual(ev('AC 2D 3H').key, [3, 3]);
  assert.deepEqual(ev('AC KD QH').key, [3, 14]);
  assert.ok(beats('2C 3D 4H', 'AC 2D 3H'), 'A-2-3 is the lowest straight');
  assert.ok(beats('AC KD QH', 'KC QD JH'));
  assert.ok(beats('4C 5D 6H', '2C 3D 4H'));
  assert.ok(beats('AH KH QH', 'KH QH JH'));
  assert.ok(beats('2S 3S 4S', 'AD 2D 3D'));
  assert.equal(ev('AD 2D 3D').cat, 5);
  assert.match(ev('AD KD QD').name, /Royal/);
});

test('no wraparound straights', () => {
  assert.equal(ev('QC KD 2H').cat, 0);
  assert.equal(ev('KC AD 2H').cat, 0);
  assert.equal(ev('QS KS 2S').cat, 2);
  assert.equal(ev('KS AS 2S').cat, 2);
});

test('kicker tie-breaks', () => {
  assert.ok(beats('9C 9D AH', '9S 9H KD'), 'pair kicker');
  assert.ok(beats('TC TD 2H', '9S 9H AD'), 'higher pair wins regardless of kicker');
  assert.ok(beats('AC KD 5H', 'AS QD JH'), 'high card second');
  assert.ok(beats('AC KD 5H', 'AS KH 4D'), 'high card third');
  assert.ok(beats('AC 9C 5C', 'KC QC 9S'.replace('9S','9C')), 'flush by high card');
  assert.ok(beats('AC 9C 5C', 'AS 8S 7S'), 'flush by second card');
  assert.ok(beats('KC QD JH', 'QS JD TH'), 'straight by high card');
  assert.ok(beats('3C 3D 3H', '2S 2D 2H'), 'trips by rank');
});

test('exact ties ignore suits', () => {
  assert.equal(L.compareHands(cards('AC KD 5H'), cards('AS KH 5D')), 0);
  assert.equal(L.compareHands(cards('9C 9D AH'), cards('9S 9H AD')), 0);
  assert.equal(L.compareHands(cards('AC 2D 3H'), cards('AS 2H 3D')), 0);
});

test('antes and pot arithmetic', () => {
  const s = L.newGame({ seed: 4, opponents: 3, ante: 5 });
  assert.equal(s.pot, 20);
  s.players.forEach((p) => assert.equal(p.chips, 95));
  const s1 = L.newGame({ seed: 4, opponents: 2 });
  assert.equal(s1.pot, 3);
  assert.equal(s1.players[0].chips, 99);
  assert.equal(L.totalChips(s1), 300);
});

test('nobody in: pot carries and antes add', () => {
  const s = rig(['AS KD 2H', '7C 8D 2S', '4C 9D JS', '3H 5D 9S']);
  run(s, ['out', 'out', 'out', 'out']);
  assert.equal(s.last.type, 'carry');
  assert.equal(s.pot, 4);
  L.nextHand(s);
  assert.equal(s.pot, 8);
  assert.equal(s.players[1].chips, 98);
  assert.equal(s.phase, 'call');
  assert.equal(L.totalChips(s), 400);
});

test('one player in wins the pot, nobody matches', () => {
  const s = rig(['2S 5D 9H', '7C 8D 2D', '4C 9D JS', '3H 5D 9S']);
  run(s, ['out', 'in', 'out', 'out']);
  assert.equal(s.last.type, 'solo');
  assert.equal(s.players[1].chips, 99 + 4);
  assert.equal(s.pot, 0);
  assert.equal(s.players[0].chips, 99);
  assert.equal(L.totalChips(s), 400);
});

test('showdown: winner takes pot, other in-players match the pot into next pot', () => {
  const s = rig(['AS AD 2H', '7C 8D 2S', 'KC KD JS', '3H 5D 9S'], null, { ante: 5 });
  assert.equal(s.pot, 20);
  run(s, ['in', 'in', 'in', 'out']);
  assert.deepEqual(s.last.winners, [0]);
  assert.equal(s.players[0].chips, 95 + 20);
  assert.equal(s.players[1].chips, 95 - 20);
  assert.equal(s.players[2].chips, 95 - 20);
  assert.equal(s.players[3].chips, 95, 'folded player pays nothing');
  assert.equal(s.pot, 40);
  assert.equal(L.totalChips(s), 400);
  L.nextHand(s);
  assert.equal(s.pot, 60, 'matches plus new antes');
  assert.equal(L.totalChips(s), 400);
});

test('tie split with odd chip carried to next pot', () => {
  // 3 players, ante 1: pot 3, two tie, one loser. share 1 each, odd 1 stays in pot, plus loser match 3
  const s = rig(['AC KD 5H', 'AS KH 5D', '7C 8D 2S']);
  run(s, ['in', 'in', 'in']);
  assert.deepEqual(s.last.winners, [0, 1]);
  assert.equal(s.last.share, 1);
  assert.equal(s.last.odd, 1);
  assert.equal(s.players[0].chips, 99 + 1);
  assert.equal(s.players[1].chips, 99 + 1);
  assert.equal(s.players[2].chips, 99 - 3);
  assert.equal(s.pot, 1 + 3);
  assert.equal(L.totalChips(s), 300);
});

test('even tie splits fully and nobody matches', () => {
  const s = rig(['AC KD 5H', 'AS KH 5D', '7C 8D 2S', '3C 4D 9S'], null, { ante: 5 });
  run(s, ['in', 'in', 'out', 'out']);
  assert.equal(s.last.matches.length, 0);
  assert.equal(s.players[0].chips, 95 + 10);
  assert.equal(s.players[1].chips, 95 + 10);
  assert.equal(s.pot, 0);
});

test('loser who cannot afford the match goes bust and pays everything', () => {
  const s = rig(['AS AD 2H', '7C 8D 2S', 'KC KD JS', '3H 5D 9S'], [50, 8, 60, 50], { ante: 5 });
  const total = L.totalChips(s);
  const pot = s.pot;
  run(s, ['in', 'in', 'in', 'out']);
  assert.deepEqual(s.last.winners, [0]);
  const b = s.last.matches.find((m) => m.i === 1);
  assert.equal(b.paid, 8);
  assert.equal(b.bust, true);
  assert.equal(s.players[1].chips, 0);
  assert.equal(s.players[1].bust, true);
  assert.ok(pot > 60);
  assert.equal(s.pot, 8 + 60, 'all-in 8 plus the other loser paying all 60 (also short of the pot)');
  assert.equal(s.players[2].bust, true);
  assert.equal(L.totalChips(s), total);
  L.nextHand(s);
  assert.equal(s.players[1].hand.length, 0, 'busted player sits out');
  assert.equal(s.players[0].hand.length, 3);
});

test('ante bust: short stack sits out and chips are conserved', () => {
  const s = L.newGame({ seed: 8, opponents: 3, ante: 5 });
  const total = L.totalChips(s);
  s.players[2].chips = 3;
  s.pot += 92; // the 92 chips lost to stack 2 sit in the pot so the total stays constant
  s.players.forEach((p) => { p.call = null; });
  run(s, ['out', 'out', 'out', 'out']);
  L.nextHand(s);
  assert.equal(s.players[2].bust, true);
  assert.equal(s.players[2].chips, 0);
  assert.equal(s.players[2].hand.length, 0);
  assert.equal(L.totalChips(s), total);
});

test('game ends when the human busts', () => {
  const s = rig(['2S 3D 9H', 'AC AD 2S', 'KC KD JS'], [30, 60, 100]);
  run(s, ['in', 'in', 'in']);
  // pot was 3, human owes 3, has plenty. Force a bust by lowering chips first
  const t = rig(['2S 3D 9H', 'AC AD 2S', 'KC KD JS'], [2, 100, 100]);
  run(t, ['in', 'in', 'in']);
  assert.equal(t.players[0].bust, true);
  L.nextHand(t);
  assert.equal(t.over, true);
  assert.equal(t.phase, 'over');
  assert.equal(L.totalChips(t), 300);
});

test('game ends when the human is last player standing and gets the pot', () => {
  const s = rig(['AS AD 2H', '7C 8D 2S', '3H 5D 9S'], [100, 2, 2]);
  run(s, ['in', 'in', 'in']);
  assert.equal(s.players[1].bust, true);
  assert.equal(s.players[2].bust, true);
  L.nextHand(s);
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  assert.equal(s.players[0].chips, 300);
  assert.equal(s.pot, 0);
});

test('seed determinism and different seeds differ', () => {
  const a = L.newGame({ seed: 77, opponents: 3 });
  const b = L.newGame({ seed: 77, opponents: 3 });
  const c = L.newGame({ seed: 78, opponents: 3 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.players[0].hand, c.players[0].hand);
  L.playHand(a, 'in'); L.playHand(b, 'in');
  assert.deepEqual(a, b);
});

test('state survives a JSON round trip mid-game', () => {
  const a = L.newGame({ seed: 12, opponents: 4 });
  L.playHand(a, 'in'); L.nextHand(a);
  const b = JSON.parse(JSON.stringify(a));
  L.playHand(a, 'in'); L.playHand(b, 'in');
  assert.deepEqual(a, b);
  L.nextHand(a); L.nextHand(b);
  assert.deepEqual(a, b);
});

test('chip conservation and AI legality over hundreds of seeded games', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const opp = 2 + (seed % 4);
    const s = L.newGame({ seed, opponents: opp, ante: seed % 2 ? 1 : 5 });
    const total = L.totalChips(s);
    assert.equal(total, 100 * (opp + 1));
    let hands = 0;
    while (!s.over) {
      assert.ok(++hands < 20000, 'infinite loop, seed ' + seed);
      assert.equal(s.phase, 'call');
      const humanCall = (seed + hands) % 3 === 0 ? 'out' : (hands % 2 ? 'in' : 'out');
      L.playHand(s, humanCall);
      assert.equal(L.totalChips(s), total, 'conservation seed ' + seed);
      for (const p of s.players) {
        assert.ok(p.chips >= 0 && Number.isInteger(p.chips));
        assert.equal(p.bust, p.chips === 0 && p.bust);
      }
      assert.ok(Number.isInteger(s.pot) && s.pot >= 0);
      L.nextHand(s);
      assert.equal(L.totalChips(s), total);
    }
    assert.equal(L.totalChips(s), total);
    assert.ok(s.players[0].bust || L.active(s).length === 1);
  }
});

test('an always-out human still reaches game over (antes drain)', () => {
  const s = L.newGame({ seed: 5, opponents: 3, ante: 5 });
  let n = 0;
  while (!s.over && n++ < 5000) { L.playHand(s, 'out'); L.nextHand(s); }
  assert.ok(s.over);
});

test('AI IN rate rises with hand strength', () => {
  function rate(handStr, trials) {
    let ins = 0;
    for (let k = 0; k < trials; k++) {
      const s = L.newGame({ seed: 1000 + k, opponents: 3 });
      s.players[1].hand = cards(handStr);
      s.players[1].style = 0;
      if (L.aiDecide(s, 1) === 'in') ins++;
    }
    return ins / trials;
  }
  const junk = rate('9C 5D 2H', 400);
  const aceKing = rate('AC KD QH'.replace('QH', '9H'), 400);
  const lowPair = rate('3C 3D 9H', 400);
  const highPair = rate('KC KD 9H', 400);
  const flush = rate('AC 9C 5C', 400);
  const straight = rate('5C 6D 7H', 400);
  const trips = rate('4C 4D 4H', 400);
  assert.ok(junk < aceKing, 'junk ' + junk + ' < ace king ' + aceKing);
  assert.ok(aceKing < lowPair, 'ace king < low pair');
  assert.ok(lowPair < highPair);
  assert.ok(highPair < flush);
  assert.ok(flush < straight);
  assert.equal(straight, 1);
  assert.equal(trips, 1);
  assert.ok(junk < 0.1);
});

test('AI is more cautious with a huge pot relative to its stack and with more players', () => {
  const mk = (opp, pot) => {
    const s = L.newGame({ seed: 2, opponents: opp });
    s.players[1].hand = cards('9C 9D 4H'); s.players[1].style = 0;
    s.pot = pot; return L.aiInProb(s, 1);
  };
  assert.ok(mk(2, 10) > mk(5, 10));
  assert.ok(mk(3, 20) > mk(3, 90));
});

test('AI bluffs a little more when the human folds often', () => {
  const mk = (folds) => {
    const s = L.newGame({ seed: 2, opponents: 3 });
    s.players[1].hand = cards('9C 5D 2H'); s.players[1].style = 0;
    s.stats = { humanHands: 20, humanFolds: folds };
    return L.aiInProb(s, 1);
  };
  assert.ok(mk(19) > mk(2));
});

test('AI probability does not depend on other players hands', () => {
  const s = L.newGame({ seed: 21, opponents: 3 });
  const before = L.aiInProb(s, 1);
  s.players[0].hand = cards('AS AD AH');
  s.players[2].hand = cards('2S 3D 5H');
  assert.equal(L.aiInProb(s, 1), before);
});

test('illegal actions are rejected', () => {
  const s = L.newGame({ seed: 6, opponents: 2 });
  L.setCall(s, 0, 'in');
  assert.throws(() => L.setCall(s, 0, 'out'));
  assert.throws(() => L.setCall(s, 1, 'maybe'));
  assert.throws(() => L.resolve(s), /missing/);
  assert.throws(() => L.nextHand(s));
});
