'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../private/uno/logic.js');

let nid = 1000;
const C = (c, v) => ({ id: nid++, c, v });

// Build a controlled state: hands as arrays of [color, value], top discard and color.
function rig(hands, top, opts) {
  const s = L.newGame(Object.assign({ seed: 5, players: hands.length }, opts || {}));
  s.players.forEach((p, i) => { p.hand = hands[i].map(([c, v]) => C(c, v)); p.uno = false; });
  s.discard = [C(top[0], top[1])];
  s.color = top[0];
  s.dir = 1; s.cur = 0; s.phase = 'play'; s.pendingDraw = 0; s.pending = null;
  s.catchable = null; s.stall = 0; s.winner = null;
  s.draw = L.shuffle(s, L.buildDeck().filter((c) => c.v !== 'd4' && c.v !== 'wild')).map((c) => C(c.c, c.v));
  return s;
}
const total = (s) => s.draw.length + s.discard.length + s.players.reduce((a, p) => a + p.hand.length, 0);
const idOf = (s, i, c, v) => s.players[i].hand.find((x) => x.c === c && x.v === v).id;

test('deck composition', () => {
  const d = L.buildDeck();
  assert.equal(d.length, 108);
  assert.equal(new Set(d.map((c) => c.id)).size, 108);
  const count = (c, v) => d.filter((x) => x.c === c && x.v === v).length;
  for (const c of L.COLORS) {
    assert.equal(count(c, '0'), 1);
    for (let n = 1; n <= 9; n++) assert.equal(count(c, String(n)), 2);
    for (const v of ['skip', 'rev', 'd2']) assert.equal(count(c, v), 2);
  }
  assert.equal(d.filter((x) => x.v === 'wild').length, 4);
  assert.equal(d.filter((x) => x.v === 'd4').length, 4);
});

test('deal: 7 each, one top card, 108 total, never starts on wild draw four', () => {
  for (let seed = 1; seed < 300; seed++) {
    const n = 2 + (seed % 3);
    const s = L.newGame({ seed, players: n });
    assert.equal(total(s), 108);
    assert.notEqual(L.topCard(s).v, 'd4');
    const extra = s.ev.filter((e) => e.t === 'draw').reduce((a, e) => a + e.n, 0);
    s.players.forEach((p) => assert.equal(p.hand.length, 7 + (extra && p === s.players[s.first] ? extra : 0)));
  }
});

test('seed determinism', () => {
  const a = L.newGame({ seed: 77, players: 3 });
  const b = L.newGame({ seed: 77, players: 3 });
  const c = L.newGame({ seed: 78, players: 3 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.players[0].hand, c.players[0].hand);
  for (let k = 0; k < 40 && a.phase !== 'roundover'; k++) {
    if (a.cur === 0) { L.draw(a, 0); if (a.phase === 'drawn') L.pass(a, 0); if (a.phase === 'unowin') L.endTurn(a, 0); } else L.aiStep(a);
    if (b.cur === 0) { L.draw(b, 0); if (b.phase === 'drawn') L.pass(b, 0); if (b.phase === 'unowin') L.endTurn(b, 0); } else L.aiStep(b);
  }
  assert.deepEqual(a, b);
  const saved = JSON.parse(JSON.stringify(a));
  L.aiStep(saved); L.aiStep(a);
  assert.deepEqual(saved, a); // state round-trips through JSON
});

test('legality of normal cards and wilds', () => {
  const s = rig([[['red', '5'], ['blue', '5'], ['blue', '3'], ['green', 'skip'], [null, 'wild']], [['red', '1']]], ['red', '7']);
  const h = s.players[0].hand;
  assert.ok(L.isLegal(s, h[0], h)); // same color
  assert.ok(!L.isLegal(s, h[1], h)); // blue 5 on red 7
  assert.ok(!L.isLegal(s, h[2], h));
  assert.ok(!L.isLegal(s, h[3], h));
  assert.ok(L.isLegal(s, h[4], h));
  s.discard = [C('blue', '5')]; s.color = 'blue';
  assert.ok(L.isLegal(s, h[0], h)); // same number
  assert.ok(L.isLegal(s, h[2], h)); // same color
  s.discard = [C('red', 'skip')]; s.color = 'red';
  assert.ok(L.isLegal(s, h[3], h)); // same symbol, other color
  s.discard = [C(null, 'wild')]; s.color = 'green';
  assert.ok(L.isLegal(s, h[3], h)); // matches chosen color
  assert.ok(!L.isLegal(s, h[1], h));
  for (const v of ['rev', 'd2']) {
    s.discard = [C('yellow', v)]; s.color = 'yellow';
    assert.ok(L.isLegal(s, C('green', v), h));
    assert.ok(!L.isLegal(s, C('green', '4'), h));
  }
});

test('wild draw four only when holding no card of the current color', () => {
  const s = rig([[['red', '5'], [null, 'd4']], [['green', '1'], ['green', '2']]], ['red', '7']);
  const h = s.players[0].hand;
  assert.ok(!L.isLegal(s, h[1], h));
  assert.equal(L.play(s, 0, h[1].id, { color: 'blue' }).ok, false);
  h.shift(); // no red left
  assert.ok(L.isLegal(s, h[0], h));
  // wild cards of other colors do not count, only the current color
  const t = rig([[['blue', '5'], [null, 'd4']], [['green', '1'], ['green', '2']]], ['red', '7']);
  assert.ok(L.isLegal(t, t.players[0].hand[1], t.players[0].hand));
});

test('play requires a color for wilds and rejects illegal cards', () => {
  const s = rig([[['blue', '2'], [null, 'wild'], ['red', '1']], [['green', '1']]], ['red', '7']);
  assert.equal(L.play(s, 0, idOf(s, 0, 'blue', '2')).err, 'illegal');
  assert.equal(L.play(s, 0, idOf(s, 0, null, 'wild')).err, 'color');
  assert.equal(L.play(s, 1, s.players[1].hand[0].id).err, 'turn');
  const r = L.play(s, 0, idOf(s, 0, null, 'wild'), { color: 'green' });
  assert.ok(r.ok);
  assert.equal(s.color, 'green');
  assert.equal(s.cur, 1);
});

test('skip and reverse with 3 players', () => {
  const s = rig([[['red', 'skip'], ['red', '1'], ['red', '2']], [['red', '3']], [['red', '4']]], ['red', '7']);
  L.play(s, 0, idOf(s, 0, 'red', 'skip'));
  assert.equal(s.cur, 2);
  const t = rig([[['red', 'rev'], ['red', '1'], ['red', '2']], [['red', '3']], [['red', '4']]], ['red', '7']);
  L.play(t, 0, idOf(t, 0, 'red', 'rev'));
  assert.equal(t.dir, -1);
  assert.equal(t.cur, 2);
});

test('skip and reverse with 2 players give the same player another turn', () => {
  const s = rig([[['red', 'skip'], ['red', 'rev'], ['red', '2']], [['red', '3']]], ['red', '7']);
  L.play(s, 0, idOf(s, 0, 'red', 'skip'));
  assert.equal(s.cur, 0);
  L.play(s, 0, idOf(s, 0, 'red', 'rev'));
  assert.equal(s.cur, 0);
  assert.equal(s.players[0].hand.length, 1);
});

test('draw two: next player draws two and is skipped', () => {
  const s = rig([[['red', 'd2'], ['red', '1'], ['red', '2']], [['red', '3']], [['red', '4']]], ['red', '7']);
  const before = total(s);
  L.play(s, 0, idOf(s, 0, 'red', 'd2'));
  assert.equal(s.players[1].hand.length, 3);
  assert.equal(s.cur, 2);
  assert.equal(total(s), before);
});

test('house rule: stacking +2 on +2', () => {
  const s = rig([[['red', 'd2'], ['red', '1']], [['blue', 'd2'], ['red', '3']], [['red', '4']]], ['red', '7'], { rules: { stack2: true } });
  L.callUno(s, 0);
  L.play(s, 0, idOf(s, 0, 'red', 'd2'));
  assert.equal(s.pendingDraw, 2);
  assert.equal(s.cur, 1);
  assert.deepEqual(L.legalMoves(s, 1).map((c) => c.v), ['d2']);
  L.play(s, 1, idOf(s, 1, 'blue', 'd2'));
  assert.equal(s.pendingDraw, 4);
  assert.equal(s.cur, 2);
  L.draw(s, 2);
  assert.equal(s.players[2].hand.length, 5);
  assert.equal(s.pendingDraw, 0);
  assert.equal(s.cur, 0);
});

test('house rule: 7 swaps hands, 0 rotates hands', () => {
  const s = rig([[['red', '7'], ['red', '1'], ['red', '2']], [['red', '3']], [['red', '4'], ['red', '5']]], ['red', '9'], { rules: { sevenZero: true } });
  L.play(s, 0, idOf(s, 0, 'red', '7'), { swapWith: 1 });
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[1].hand.length, 2);
  const z = rig([[['red', '0'], ['red', '1'], ['red', '2']], [['red', '3']], [['red', '4'], ['red', '5']]], ['red', '9'], { rules: { sevenZero: true } });
  L.play(z, 0, idOf(z, 0, 'red', '0'));
  assert.deepEqual(z.players.map((p) => p.hand.length), [2, 2, 1]);
  const off = rig([[['red', '7'], ['red', '1'], ['red', '2']], [['red', '3']], [['red', '4']]], ['red', '9']);
  L.play(off, 0, idOf(off, 0, 'red', '7'), { swapWith: 1 });
  assert.equal(off.players[1].hand.length, 1);
  assert.equal(off.players[0].hand.length, 2);
});

test('wild draw four: no challenge', () => {
  const s = rig([[['blue', '5'], [null, 'd4'], ['blue', '1']], [['red', '1']], [['red', '2']]], ['red', '7']);
  const r = L.play(s, 0, idOf(s, 0, null, 'd4'), { color: 'green' });
  assert.ok(r.ok);
  assert.equal(s.phase, 'challenge');
  assert.equal(s.cur, 1);
  assert.equal(L.challenge(s, 2, false).ok, false); // wrong player
  L.challenge(s, 1, false);
  assert.equal(s.players[1].hand.length, 5);
  assert.equal(s.cur, 2);
  assert.equal(s.color, 'green');
});

test('wild draw four: successful challenge (player held the color)', () => {
  const s = rig([[['red', '5'], [null, 'd4'], ['blue', '1']], [['red', '1']], [['red', '2']]], ['red', '7']);
  assert.equal(L.play(s, 0, idOf(s, 0, null, 'd4'), { color: 'green' }).err, 'illegal');
  L.play(s, 0, idOf(s, 0, null, 'd4'), { color: 'green', bluff: true });
  L.challenge(s, 1, true);
  assert.equal(s.players[0].hand.length, 2 + 4);
  assert.equal(s.players[1].hand.length, 1);
  assert.equal(s.cur, 1); // challenger still plays
});

test('wild draw four: failed challenge (player held no such color) costs challenger 6', () => {
  const s = rig([[['blue', '5'], [null, 'd4'], ['blue', '1']], [['red', '1']], [['red', '2']]], ['red', '7']);
  L.play(s, 0, idOf(s, 0, null, 'd4'), { color: 'green' });
  L.challenge(s, 1, true);
  assert.equal(s.players[1].hand.length, 7);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.cur, 2);
});

test('UNO: human who does not call draws 2 when the turn ends', () => {
  const s = rig([[['red', '5'], ['red', '6']], [['red', '3'], ['red', '4']]], ['red', '7']);
  L.play(s, 0, idOf(s, 0, 'red', '5'));
  assert.equal(s.phase, 'unowin');
  L.endTurn(s, 0);
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.phase, 'play');
  assert.equal(s.cur, 1);
});

test('UNO: calling before playing or in the window avoids the penalty', () => {
  const s = rig([[['red', '5'], ['red', '6']], [['red', '3'], ['red', '4']]], ['red', '7']);
  assert.ok(L.callUno(s, 0).ok);
  L.play(s, 0, idOf(s, 0, 'red', '5'));
  assert.equal(s.phase, 'play');
  assert.equal(s.players[0].hand.length, 1);
  const t = rig([[['red', '5'], ['red', '6']], [['red', '3'], ['red', '4']]], ['red', '7']);
  L.play(t, 0, idOf(t, 0, 'red', '5'));
  assert.ok(L.callUno(t, 0).ok);
  assert.equal(t.players[0].hand.length, 1);
  assert.equal(t.cur, 1);
  assert.equal(L.callUno(rig([[['red', '1'], ['red', '2'], ['red', '3']], [['red', '1']]], ['red', '7']), 0).ok, false);
});

test('UNO: catching an AI that forgot gives it 2 cards, only before the next move', () => {
  let found = 0;
  for (let seed = 1; seed < 400 && found < 2; seed++) {
    const s = rig([[['red', '1'], ['red', '2']], [['red', '5'], ['red', '6']], [['red', '3'], ['red', '4']]], ['red', '7'], { seed });
    s.cur = 1;
    L.play(s, 1, idOf(s, 1, 'red', '5'));
    if (s.catchable === 1) {
      found++;
      if (found === 1) {
        const r = L.catchUno(s, 0);
        assert.ok(r.ok);
        assert.equal(s.players[1].hand.length, 3);
        assert.equal(L.catchUno(s, 0).ok, false);
      } else {
        L.play(s, 2, idOf(s, 2, 'red', '3'));
        assert.equal(s.catchable, null);
        assert.equal(L.catchUno(s, 0).ok, false);
        assert.equal(s.players[1].hand.length, 1);
      }
    } else {
      assert.ok(s.players[1].uno);
    }
  }
  assert.equal(found, 2, 'AI should sometimes forget');
});

test('drawing: playable card may be played, otherwise turn passes', () => {
  const s = rig([[['blue', '1']], [['red', '3']]], ['red', '7']);
  s.draw = [C('red', '2')];
  L.draw(s, 0);
  assert.equal(s.phase, 'drawn');
  assert.equal(L.play(s, 0, idOf(s, 0, 'blue', '1')).err, 'drawnonly');
  assert.ok(L.pass(s, 0).ok);
  assert.equal(s.cur, 1);
  const t = rig([[['blue', '1']], [['red', '3']]], ['red', '7']);
  t.draw = [C('green', '2')];
  L.draw(t, 0);
  assert.equal(t.phase, 'play');
  assert.equal(t.cur, 1);
  assert.equal(t.players[0].hand.length, 2);
});

test('reshuffle of the discard pile under the top card when the draw pile empties', () => {
  const s = rig([[['blue', '1']], [['red', '3']]], ['red', '7']);
  s.draw = [];
  const old = [C('green', '1'), C('green', '2'), C('green', '3'), C('yellow', '4')];
  s.discard = old.concat([C('red', '7')]);
  const top = s.discard[s.discard.length - 1];
  const before = total(s);
  L.draw(s, 0);
  assert.equal(s.discard.length, 1);
  assert.equal(s.discard[0], top);
  assert.equal(s.draw.length, 3);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(total(s), before);
  // nothing to draw at all: passes without crashing
  const t = rig([[['blue', '1']], [['red', '3']]], ['red', '7']);
  t.draw = []; t.discard = [C('red', '7')];
  assert.ok(L.draw(t, 0).ok);
  assert.equal(t.cur, 1);
});

test('round end and scoring', () => {
  assert.equal(L.cardPoints(C('red', '7')), 7);
  assert.equal(L.cardPoints(C('red', '0')), 0);
  assert.equal(L.cardPoints(C('red', 'skip')), 20);
  assert.equal(L.cardPoints(C('red', 'rev')), 20);
  assert.equal(L.cardPoints(C('red', 'd2')), 20);
  assert.equal(L.cardPoints(C(null, 'wild')), 50);
  assert.equal(L.cardPoints(C(null, 'd4')), 50);
  const s = rig([[['red', '5']], [['blue', '9'], ['red', 'skip']], [[null, 'wild'], ['green', '3']]], ['red', '7']);
  L.play(s, 0, idOf(s, 0, 'red', '5'));
  assert.equal(s.phase, 'roundover');
  assert.equal(s.winner, 0);
  assert.equal(s.roundPoints, 9 + 20 + 50 + 3);
  assert.equal(s.players[0].score, 82);
  assert.ok(s.over); // single round
  const m = rig([[['red', '5']], [['blue', '9']]], ['red', '7'], { rules: { target: 500 } });
  L.play(m, 0, idOf(m, 0, 'red', '5'));
  assert.equal(m.over, false);
  m.players[0].score = 495;
  m.players[0].hand = [C('red', '1')];
  m.phase = 'play'; m.cur = 0;
  L.play(m, 0, m.players[0].hand[0].id);
  assert.ok(m.over);
  L.startRound(L.newGame({ seed: 1, players: 2, rules: { target: 500 } }));
});

test('match mode keeps scores across rounds and re-deals', () => {
  const s = L.newGame({ seed: 3, players: 3, rules: { target: 500 } });
  s.players[0].score = 40;
  L.startRound(s);
  assert.equal(s.round, 2);
  assert.equal(s.players[0].score, 40);
  assert.equal(total(s), 108);
  assert.notEqual(s.first, 0);
});

test('starting card effects', () => {
  const kinds = {};
  for (let seed = 1; seed < 600; seed++) {
    const s = L.newGame({ seed, players: 3 });
    const t = L.topCard(s);
    kinds[t.v] = true;
    if (t.v === 'wild') { assert.equal(s.phase, 'firstcolor'); assert.ok(L.setColor(s, s.cur, 'red').ok); assert.equal(s.phase, 'play'); }
    if (t.v === 'skip') assert.equal(s.cur, 1);
    if (t.v === 'rev') { assert.equal(s.dir, -1); assert.equal(s.cur, 2); }
    if (t.v === 'd2') { assert.equal(s.players[0].hand.length, 9); assert.equal(s.cur, 1); }
  }
  for (const k of ['wild', 'skip', 'rev', 'd2']) assert.ok(kinds[k], k + ' seen as start card');
});

test('AI only plays legal moves across hundreds of complete games', () => {
  let finished = 0;
  for (let g = 0; g < 400; g++) {
    const players = 2 + (g % 3);
    const rules = { stack2: g % 2 === 0, sevenZero: g % 3 === 0 };
    const s = L.newGame({ seed: g * 7 + 1, players, rules });
    // the human seat is driven by the same AI, with the UNO window handled
    let steps = 0;
    while (s.phase !== 'roundover') {
      assert.ok(++steps < 6000, 'no infinite loop');
      const before = total(s);
      const p = s.players[s.cur];
      if (s.phase === 'unowin') { (steps % 2 ? L.callUno(s, s.cur) : L.endTurn(s, s.cur)); continue; }
      const wasHuman = p.human;
      if (wasHuman) p.human = false; // let the AI drive the human seat
      const phase = s.phase, cur = s.cur;
      const legal = L.legalMoves(s, cur).map((c) => c.id);
      const hand = s.players[cur].hand.slice();
      const r = L.aiStep(s);
      if (wasHuman) p.human = true;
      assert.ok(r && r.ok, 'ai step ok: ' + JSON.stringify(r));
      const pl = r.events.find((e) => e.t === 'play' && e.p === cur);
      if (pl && phase !== 'firstcolor') {
        const bluff = pl.card.v === 'd4' && !legal.includes(pl.card.id);
        if (!bluff) assert.ok(legal.includes(pl.card.id), 'played card was legal');
        else assert.ok(hand.some((x) => x.c === undefined || x.id === pl.card.id));
        assert.ok(['red', 'yellow', 'green', 'blue'].includes(s.color));
      }
      if (s.phase !== 'roundover') assert.equal(total(s), before, 'cards conserved');
      if (s.catchable !== null && g % 5 === 0) L.catchUno(s, 0);
    }
    assert.ok(s.winner >= 0);
    finished++;
  }
  assert.equal(finished, 400);
});
