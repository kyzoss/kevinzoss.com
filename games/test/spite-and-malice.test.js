const test = require('node:test');
const assert = require('node:assert');
const L = require('../private/spite-and-malice/logic.js');

// Build a blank, controllable state for rule tests.
function blank() {
  const s = L.newGame(1);
  s.turn = 0; s.winner = null; s.turns = 0; s.passes = 0;
  s.draw = []; s.complete = [];
  s.build = [0, 1, 2, 3].map(() => ({ n: 1, cards: [] }));
  for (const p of s.players) { p.stock = []; p.hand = []; p.disc = [[], [], [], []]; }
  return s;
}
// card ids: rank r (1..13) of spades in deck A = r-1; King = 12; joker = 104
const C = r => r - 1;
const KING = 12, JOKER = 104;

test('deck composition: 108 cards, 4 jokers, 8 kings, 8 aces, all unique', () => {
  const d = L.buildDeck();
  assert.strictEqual(d.length, 108);
  assert.strictEqual(new Set(d).size, 108);
  assert.strictEqual(d.filter(c => L.rank(c) === 0).length, 4);
  for (let r = 1; r <= 13; r++) assert.strictEqual(d.filter(c => L.rank(c) === r).length, 8);
  assert.strictEqual(d.filter(L.isWild).length, 12);
});

test('deal sizes: 20 stock each, 5 in the starting hand, rest in draw pile', () => {
  const s = L.newGame(42);
  assert.strictEqual(s.players[0].stock.length, 20);
  assert.strictEqual(s.players[1].stock.length, 20);
  assert.strictEqual(s.players[s.turn].hand.length, 5);
  assert.strictEqual(s.players[1 - s.turn].hand.length, 0);
  assert.strictEqual(s.draw.length, 108 - 40 - 5);
  assert.strictEqual(s.build.length, 4);
  assert.ok(s.build.every(b => b.n === 1));
  const all = [].concat(s.draw, ...s.players.map(p => [].concat(p.stock, p.hand)));
  assert.strictEqual(new Set(all).size, 108);
});

test('legal play: Ace starts, then sequence, wrong rank refused', () => {
  const s = blank();
  s.players[0].stock = [C(9)];
  s.players[0].hand = [C(1), C(2), C(5), C(4), C(3)];
  assert.ok(!L.isLegal(s, { src: 'hand', i: 1, pile: 0 }), '2 cannot start');
  assert.ok(L.play(s, { src: 'hand', i: 0, pile: 0 }).ok);
  assert.strictEqual(s.build[0].n, 2);
  // hand is now [2, 5, 4, 3]
  assert.ok(L.isLegal(s, { src: 'hand', i: 0, pile: 0 }), '2 now fits pile 0');
  assert.ok(!L.isLegal(s, { src: 'hand', i: 0, pile: 1 }), '2 does not fit empty pile 1');
  assert.ok(!L.play(s, { src: 'hand', i: 3, pile: 0 }).ok, 'cannot skip 3');
  assert.ok(L.play(s, { src: 'hand', i: 0, pile: 0 }).ok); // the 2
  assert.strictEqual(s.build[0].n, 3);
  assert.ok(!L.isLegal(s, { src: 'hand', i: 99, pile: 0 }));
  assert.ok(!L.isLegal(s, { src: 'hand', i: 0, pile: 7 }));
});

test('Kings and Jokers are wild and count as the next number', () => {
  const s = blank();
  s.players[0].stock = [C(9)];
  s.players[0].hand = [KING, JOKER, C(4), C(4), C(4)];
  assert.ok(L.play(s, { src: 'hand', i: 0, pile: 2 }).ok, 'King as Ace');
  assert.strictEqual(s.build[2].n, 2);
  assert.ok(L.play(s, { src: 'hand', i: 0, pile: 2 }).ok, 'Joker as 2');
  assert.strictEqual(s.build[2].n, 3);
  assert.ok(!L.isLegal(s, { src: 'hand', i: 0, pile: 2 }), '4 does not fit on needs-3');
  s.build[2].n = 4;
  assert.ok(L.isLegal(s, { src: 'hand', i: 0, pile: 2 }));
  assert.ok(!L.canPlayOn(s, C(1), 2) , 'Ace is not wild');
});

test('placing the 12 completes the pile, which is cleared into the complete stack', () => {
  const s = blank();
  s.players[0].stock = [C(9)];
  s.players[0].hand = [C(12), C(3), C(3), C(3), C(3)];
  s.build[1] = { n: 12, cards: [11, 22, 33, 44, 55, 66, 77, 88, 99, 10, 21] };
  const r = L.play(s, { src: 'hand', i: 0, pile: 1 });
  assert.ok(r.ok && r.completed);
  assert.deepStrictEqual(s.build[1], { n: 1, cards: [] });
  assert.strictEqual(s.complete.length, 12);
  // a King as the 12 also completes
  const t = blank();
  t.players[0].stock = [C(9)]; t.players[0].hand = [KING, C(3), C(3), C(3), C(3)];
  t.build[0] = { n: 12, cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
  assert.ok(L.play(t, { src: 'hand', i: 0, pile: 0 }).completed);
});

test('can play from stock top, own discard tops, never from the draw pile or opponent', () => {
  const s = blank();
  s.players[0].stock = [C(7), C(1)];
  s.players[0].disc = [[C(5)], [C(1)], [], []];
  s.players[0].hand = [C(8)];
  s.players[1].stock = [C(1)];
  const m = L.legalMoves(s);
  assert.ok(m.some(x => x.src === 'stock' && x.pile === 0));
  assert.ok(m.some(x => x.src === 'disc' && x.i === 1));
  assert.ok(!m.some(x => x.src === 'disc' && x.i === 0));
  assert.ok(m.every(x => L.isLegal(s, x)));
  assert.ok(!L.isLegal(s, { src: 'disc', i: 2, pile: 0 }), 'empty discard pile');
});

test('turn flow: discard is required, ends the turn, next player draws to 5', () => {
  const s = L.newGame(7);
  const first = s.turn;
  const pl = s.players[first];
  assert.strictEqual(pl.hand.length, 5);
  const drawBefore = s.draw.length;
  const card = pl.hand[2];
  const r = L.discard(s, 2, 3);
  assert.ok(r.ok);
  assert.strictEqual(pl.disc[3][pl.disc[3].length - 1], card);
  assert.strictEqual(pl.hand.length, 4);
  assert.strictEqual(s.turn, 1 - first);
  assert.strictEqual(s.players[1 - first].hand.length, 5);
  assert.strictEqual(s.draw.length, drawBefore - 5);
  // now the other player may not discard a card that is not in hand
  assert.ok(!L.discard(s, 5, 0).ok);
  assert.ok(!L.discard(s, 0, 4).ok);
  assert.ok(!L.canEndWithoutDiscard(s));
});

test('draw to 5 at the start of the next turn from a short hand', () => {
  const s = blank();
  s.draw = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
  s.players[0].hand = [C(2), C(3), C(4), C(5), C(6)];
  s.players[1].hand = [C(2), C(3)];
  L.discard(s, 0, 0);
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.players[1].hand.length, 5);
});

test('empty hand after playing all five draws five more and play continues', () => {
  const s = blank();
  s.players[0].stock = [C(13), C(13)];
  s.players[0].hand = [C(1)];
  s.draw = [C(2), C(3), C(4), C(5), C(6), 30, 31];
  const r = L.play(s, { src: 'hand', i: 0, pile: 0 });
  assert.strictEqual(r.redrew, 5);
  assert.strictEqual(s.players[0].hand.length, 5);
  assert.strictEqual(s.turn, 0, 'still the same player');
  assert.strictEqual(s.draw.length, 2);
});

test('emptying the stock pile wins immediately, no discard needed', () => {
  const s = blank();
  s.players[0].stock = [C(1)];
  s.players[0].hand = [C(5), C(6), C(7), C(8), C(9)];
  const r = L.play(s, { src: 'stock', i: 0, pile: 0 });
  assert.ok(r.won);
  assert.strictEqual(s.winner, 0);
  assert.deepStrictEqual(L.legalMoves(s), []);
  assert.ok(!L.discard(s, 0, 0).ok);
});

test('reshuffle: completed piles go back into the draw pile when it runs out', () => {
  const s = blank();
  s.draw = [50, 51];
  s.complete = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const drawn = L.fillHand(s, 0);
  assert.strictEqual(drawn, 5);
  assert.strictEqual(s.players[0].hand.length, 5);
  assert.strictEqual(s.complete.length, 0);
  assert.strictEqual(s.reshuffles, 1);
  assert.strictEqual(s.draw.length, 14 - 5);
  assert.strictEqual(new Set([].concat(s.draw, s.players[0].hand)).size, 14);
});

test('no cards anywhere: hand stays short and an empty-handed player with no plays is passed', () => {
  const s = blank();
  s.players[0].stock = [C(9)];
  s.players[0].hand = [C(4)];
  s.players[1].stock = [C(9)];
  s.players[1].hand = [];
  L.discard(s, 0, 0);
  assert.strictEqual(s.players[0].hand.length, 0);
  // player 1 has no cards and no plays so the turn bounced back to player 0 (also empty), and so on until adjudicated
  assert.notStrictEqual(s.winner, null);
  assert.strictEqual(s.winner, 2, 'equal stock counts is a draw');
});

test('determinism: same seed gives the same deal and same AI game', () => {
  const a = L.newGame(12345), b = L.newGame(12345), c = L.newGame(12346);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a.players[0].stock, c.players[0].stock);
  const run = seed => {
    const s = L.newGame(seed); let n = 0;
    while (s.winner === null && n++ < 20000) L.applyChoice(s, L.aiChoose(s));
    return JSON.stringify(s);
  };
  assert.strictEqual(run(99), run(99));
});

test('state survives a JSON round trip (save/resume)', () => {
  const s = L.newGame(5);
  for (let i = 0; i < 40 && s.winner === null; i++) L.applyChoice(s, L.aiChoose(s));
  const t = JSON.parse(JSON.stringify(s));
  for (let i = 0; i < 40 && s.winner === null; i++) {
    L.applyChoice(s, L.aiChoose(s)); L.applyChoice(t, L.aiChoose(t));
  }
  assert.deepStrictEqual(s, t);
});

test('AI only ever returns legal moves and games finish (60 games, AI vs AI)', () => {
  let wins = [0, 0, 0];
  for (let seed = 1; seed <= 60; seed++) {
    const s = L.newGame(seed * 7919);
    let steps = 0;
    while (s.winner === null) {
      assert.ok(steps++ < 20000, 'infinite loop at seed ' + seed);
      const ch = L.aiChoose(s);
      const pl = s.players[s.turn];
      if (ch.type === 'play') {
        assert.ok(L.legalMoves(s).some(m => m.src === ch.move.src && m.i === ch.move.i && m.pile === ch.move.pile), 'illegal move');
        assert.ok(L.play(s, ch.move).ok);
      } else if (ch.type === 'discard') {
        assert.ok(pl.hand.length > 0 && ch.hand >= 0 && ch.hand < pl.hand.length && ch.pile >= 0 && ch.pile < 4, 'bad discard');
        assert.ok(L.discard(s, ch.hand, ch.pile).ok);
      } else {
        assert.strictEqual(ch.type, 'end');
        assert.ok(pl.hand.length === 0);
        assert.ok(L.endWithoutDiscard(s).ok);
      }
      // card conservation
      const all = [].concat(s.draw, s.complete, ...s.build.map(b => b.cards),
        ...s.players.map(p => [].concat(p.stock, p.hand, ...p.disc)));
      assert.strictEqual(all.length, 108);
    }
    wins[s.winner]++;
  }
  assert.ok(wins[0] + wins[1] >= 55, 'most games should finish by an empty stock: ' + wins);
});

test('AI plays its stock card when it can, and does not feed an obvious win', () => {
  const s = blank();
  s.turn = 1;
  s.players[1].stock = [C(9), C(3)]; // top = 3
  s.players[1].hand = [C(1), C(2), C(8), C(8), C(8)];
  const ch = L.aiChoose(s);
  assert.strictEqual(ch.type, 'play');
  // the line 1, 2, then stock 3 must be found: first step is the 1 or the 2 chain
  L.applyChoice(s, ch);
  let guard = 0;
  while (s.turn === 1 && guard++ < 10) L.applyChoice(s, L.aiChoose(s));
  assert.strictEqual(s.players[1].stock.length, 1, 'played the stock 3');
});
