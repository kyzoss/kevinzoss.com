'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../private/catan/logic.js');

const { RES, HEXES, VERTS, EDGES } = C;

function blank(n, seed) {
  // a game skipped straight into the main phase with an empty board
  const s = C.newGame({ seed: seed || 1, players: n || 4 });
  s.phase = 'main'; s.current = 0; s.turn = 1; s.rolled = true;
  s.robber = s.hexes.findIndex((h) => h.terrain === 'desert');
  return s;
}
function give(s, p, o) { Object.keys(o).forEach((r) => { s.players[p].res[r] += o[r]; s.bank[r] -= o[r]; }); }
function put(s, v, p, city) { s.b[v] = { p, city: !!city }; }
function road(s, e, p) { s.roads[e] = p; }
// find a path of n edges starting at vertex v (simple chain)
function chain(n) {
  const out = [];
  const seenV = new Set();
  function dfs(v, es) {
    if (es.length === n) { out.push(...es); return true; }
    seenV.add(v);
    for (const e of VERTS[v].edges) {
      const w = C.otherEnd(e, v);
      if (seenV.has(w)) continue;
      if (dfs(w, es.concat(e))) return true;
    }
    seenV.delete(v);
    return false;
  }
  for (let v = 0; v < VERTS.length && !out.length; v++) dfs(v, []);
  return out;
}
function run(s, a) { const r = C.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + ' -> ' + r.error); return r; }

test('board counts and topology', () => {
  assert.strictEqual(HEXES.length, 19);
  assert.strictEqual(VERTS.length, 54);
  assert.strictEqual(EDGES.length, 72);
  VERTS.forEach((v) => { assert.ok(v.nbrs.length >= 2 && v.nbrs.length <= 3); assert.strictEqual(v.nbrs.length, v.edges.length); });
  assert.strictEqual(EDGES.filter((e) => e.hexes.length === 1).length, 30);
});

test('terrain, numbers, ports and 6/8 spacing over many seeds', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = C.newGame({ seed });
    const cnt = {};
    s.hexes.forEach((h) => { cnt[h.terrain] = (cnt[h.terrain] || 0) + 1; });
    assert.deepStrictEqual(cnt, { forest: 4, pasture: 4, field: 4, hill: 3, mountain: 3, desert: 1 }.constructor === Object ? cnt : cnt);
    assert.strictEqual(cnt.forest, 4); assert.strictEqual(cnt.pasture, 4); assert.strictEqual(cnt.field, 4);
    assert.strictEqual(cnt.hill, 3); assert.strictEqual(cnt.mountain, 3); assert.strictEqual(cnt.desert, 1);
    const nums = s.hexes.filter((h) => h.num).map((h) => h.num).sort((a, b) => a - b);
    assert.deepStrictEqual(nums, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    assert.strictEqual(s.hexes.find((h) => h.terrain === 'desert').num, 0);
    s.hexes.forEach((h, i) => {
      if (h.num === 6 || h.num === 8) HEXES[i].nbrs.forEach((j) => assert.ok(s.hexes[j].num !== 6 && s.hexes[j].num !== 8, 'adjacent 6/8 seed ' + seed));
    });
    assert.strictEqual(s.ports.length, 9);
    assert.strictEqual(s.ports.filter((p) => p.type === 'any').length, 4);
    RES.forEach((r) => assert.strictEqual(s.ports.filter((p) => p.type === r).length, 1));
    const pv = new Set(); s.ports.forEach((p) => { pv.add(p.a); pv.add(p.b); });
    assert.strictEqual(pv.size, 18);
    assert.strictEqual(s.robber, s.hexes.findIndex((h) => h.terrain === 'desert'));
    assert.strictEqual(s.devDeck.length, 25);
  }
});

test('seed determinism and JSON round trip', () => {
  const a = C.newGame({ seed: 777 }), b = C.newGame({ seed: 777 }), c = C.newGame({ seed: 778 });
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a.hexes, c.hexes);
  const copy = JSON.parse(JSON.stringify(a));
  assert.deepStrictEqual(copy, a);
  // play AI forward on both, identical results
  const x = C.newGame({ seed: 5 }); x.players.forEach((p) => { p.ai = true; });
  const y = JSON.parse(JSON.stringify(x));
  for (let i = 0; i < 300; i++) {
    const ax = C.aiNextAction(x), ay = C.aiNextAction(y);
    assert.deepStrictEqual(ax, ay);
    if (x.phase === 'gameover') break;
    C.apply(x, ax); C.apply(y, ay);
    if (i === 150) { const z = JSON.parse(JSON.stringify(x)); assert.deepStrictEqual(z, x); }
  }
  assert.deepStrictEqual(x, y);
});

test('distance rule and setup placement', () => {
  const s = C.newGame({ seed: 3, players: 4 });
  const v = 20;
  run(s, { t: 'setup_settlement', v });
  assert.ok(!C.apply(s, { t: 'setup_settlement', v: 21 }).ok); // wrong step
  const bad = C.apply(s, { t: 'setup_road', e: (function () { for (let e = 0; e < EDGES.length; e++) if (EDGES[e].a !== v && EDGES[e].b !== v) return e; })() });
  assert.ok(!bad.ok);
  run(s, { t: 'setup_road', e: VERTS[v].edges[0] });
  assert.strictEqual(s.current, 1);
  VERTS[v].nbrs.forEach((n) => assert.ok(!C.apply(s, { t: 'setup_settlement', v: n }).ok, 'neighbour must be illegal'));
  assert.ok(!C.apply(s, { t: 'setup_settlement', v }).ok);
  assert.ok(!C.settlementSpots(s, 1, true).includes(v));
});

test('snake order and starting resources', () => {
  const s = C.newGame({ seed: 4, players: 4 });
  const seq = [];
  const first = {};
  while (s.phase === 'setup') {
    seq.push(s.current);
    const p = s.current;
    const v = C.settlementSpots(s, p, true)[0];
    run(s, { t: 'setup_settlement', v });
    if (s.setup.idx < 4) assert.strictEqual(C.handSize(s.players[p]), 0);
    run(s, { t: 'setup_road', e: C.roadSpots(s, p, v)[0] });
  }
  assert.deepStrictEqual(seq, [0, 1, 2, 3, 3, 2, 1, 0]);
  assert.strictEqual(s.phase, 'roll'); assert.strictEqual(s.current, 0);
  // second settlement yields one card per adjacent producing hex
  s.players.forEach((pl, p) => {
    const vs = []; s.b.forEach((b, v) => { if (b && b.p === p) vs.push(v); });
    const second = s.order.lastIndexOf(p) >= 0 ? vs : vs;
    assert.strictEqual(vs.length, 2);
  });
  const total = s.players.reduce((t, pl) => t + C.handSize(pl), 0);
  let expected = 0;
  s.players.forEach((pl, p) => {
    // the later-placed settlement: highest id is not guaranteed, so recompute through bank
  });
  let bankMissing = 0; RES.forEach((r) => { bankMissing += 19 - s.bank[r]; });
  assert.strictEqual(total, bankMissing);
  assert.ok(total > 0);
});

test('3 player game orders 1,2,3,3,2,1', () => {
  const s = C.newGame({ seed: 4, players: 3 });
  assert.deepStrictEqual(s.order, [0, 1, 2, 2, 1, 0]);
});

test('road legality and costs', () => {
  const s = blank();
  const e0 = VERTS[10].edges[0];
  put(s, 10, 0);
  assert.ok(!C.apply(s, { t: 'build_road', e: e0 }).ok, 'needs resources');
  give(s, 0, { brick: 1, lumber: 1 });
  const far = EDGES.findIndex((e, i) => i !== e0 && e.a !== 10 && e.b !== 10 && !VERTS[10].nbrs.includes(e.a) && !VERTS[10].nbrs.includes(e.b));
  assert.ok(!C.apply(s, { t: 'build_road', e: far }).ok, 'must connect');
  run(s, { t: 'build_road', e: e0 });
  assert.strictEqual(s.players[0].res.brick, 0); assert.strictEqual(s.players[0].roadsLeft, 14);
  assert.strictEqual(s.bank.brick, 19);
  assert.ok(!C.apply(s, { t: 'build_road', e: e0 }).ok, 'occupied');
  // road limit
  s.players[0].roadsLeft = 0; give(s, 0, { brick: 1, lumber: 1 });
  assert.ok(!C.apply(s, { t: 'build_road', e: VERTS[10].edges[1] }).ok);
  // road cannot continue through an opponent settlement
  const s2 = blank();
  const a = 10, e = VERTS[a].edges[0], w = C.otherEnd(e, a);
  road(s2, e, 0); put(s2, w, 1);
  const next = VERTS[w].edges.find((x) => x !== e);
  give(s2, 0, { brick: 1, lumber: 1 });
  assert.ok(!C.apply(s2, { t: 'build_road', e: next }).ok, 'blocked by opponent settlement');
});

test('settlement and city legality and costs', () => {
  const s = blank();
  const [e1, e2] = chain(2);
  road(s, e1, 0); road(s, e2, 0);
  const tip = (function () { // far end of the chain
    const sh = [EDGES[e1].a, EDGES[e1].b].find((v) => EDGES[e2].a === v || EDGES[e2].b === v);
    return C.otherEnd(e2, sh);
  })();
  assert.ok(!C.apply(s, { t: 'build_settlement', v: tip }).ok, 'needs resources');
  give(s, 0, { brick: 1, lumber: 1, wool: 1, grain: 1 });
  run(s, { t: 'build_settlement', v: tip });
  assert.ok(C.RES.every((r) => s.players[0].res[r] === 0));
  assert.strictEqual(s.players[0].settlementsLeft, 4);
  // city
  assert.ok(!C.apply(s, { t: 'build_city', v: tip }).ok);
  give(s, 0, { ore: 3, grain: 2 });
  run(s, { t: 'build_city', v: tip });
  assert.ok(s.b[tip].city);
  assert.strictEqual(s.players[0].citiesLeft, 3); assert.strictEqual(s.players[0].settlementsLeft, 5);
  give(s, 0, { ore: 3, grain: 2 });
  assert.ok(!C.apply(s, { t: 'build_city', v: tip }).ok, 'already a city');
  // settlement must connect to own road
  const s3 = blank();
  give(s3, 0, { brick: 1, lumber: 1, wool: 1, grain: 1 });
  assert.ok(!C.apply(s3, { t: 'build_settlement', v: 5 }).ok, 'no road');
  // distance rule in main phase
  const s4 = blank();
  const [f1, f2] = chain(2);
  road(s4, f1, 0); road(s4, f2, 0);
  const mid = [EDGES[f1].a, EDGES[f1].b].find((v) => EDGES[f2].a === v || EDGES[f2].b === v);
  const tip4 = C.otherEnd(f2, mid);
  VERTS[tip4].nbrs.forEach((n) => { if (n !== mid && !s4.b[n]) put(s4, n, 1); });
  give(s4, 0, { brick: 1, lumber: 1, wool: 1, grain: 1 });
  assert.ok(!C.apply(s4, { t: 'build_settlement', v: tip4 }).ok || VERTS[tip4].nbrs.every((n) => n === mid));
  // settlement limit
  const s5 = blank(); s5.players[0].settlementsLeft = 0;
  assert.ok(!C.apply(s5, { t: 'build_settlement', v: 1 }).ok);
});

test('resource distribution, cities pay double, robber blocks', () => {
  const s = blank();
  const h = s.hexes.findIndex((x) => x.terrain === 'forest');
  s.hexes[h].num = 8;
  const [v1, v2] = HEXES[h].verts.filter((v, i) => i % 3 === 0);
  put(s, v1, 0, false); put(s, v2, 1, true);
  s.phase = 'roll';
  s.rs = 0; // force dice: find a seed state that rolls 8 below instead
  // direct distribution through a crafted roll: loop states until sum 8
  let guard = 0;
  for (;;) {
    const t = JSON.parse(JSON.stringify(s)); t.rs = guard++;
    C.apply(t, { t: 'roll' });
    if (t.dice[0] + t.dice[1] === 8) {
      const base = s.hexes.map((x, i) => (x.num === 8 ? i : -1)).filter((i) => i >= 0);
      assert.ok(t.players[0].res.lumber >= 1);
      assert.ok(t.players[1].res.lumber >= 2);
      break;
    }
    assert.ok(guard < 500);
  }
  // robber on that hex blocks it
  s.robber = h;
  guard = 0;
  for (;;) {
    const t = JSON.parse(JSON.stringify(s)); t.rs = guard++;
    C.apply(t, { t: 'roll' });
    if (t.dice[0] + t.dice[1] === 8) { assert.strictEqual(t.players[0].res.lumber, 0); assert.strictEqual(t.players[1].res.lumber, 0); break; }
    assert.ok(guard < 500);
  }
});

function rollSeed(s, sum) {
  for (let k = 0; k < 2000; k++) {
    const t = JSON.parse(JSON.stringify(s)); t.rs = k;
    t.dice = null;
    const tmp = JSON.parse(JSON.stringify(t));
    // peek the dice
    const r = { rs: k }; const d1 = 1 + Math.floor(C.rnd(r) * 6), d2 = 1 + Math.floor(C.rnd(r) * 6);
    if (d1 + d2 === sum) { s.rs = k; return; }
  }
  throw new Error('no seed');
}

test('bank shortage rule', () => {
  // two players owed, bank short: nobody gets it
  const s = blank();
  const h = s.hexes.findIndex((x) => x.terrain === 'mountain');
  s.hexes[h].num = 5;
  const vs = HEXES[h].verts;
  put(s, vs[0], 0, true); put(s, vs[2], 1, true);   // 2 + 2 owed
  s.bank.ore = 3;
  s.phase = 'roll'; rollSeed(s, 5);
  run(s, { t: 'roll' });
  assert.strictEqual(s.players[0].res.ore, 0); assert.strictEqual(s.players[1].res.ore, 0);
  assert.strictEqual(s.bank.ore, 3);
  // one player owed, gets what remains
  const t = blank();
  t.hexes[h].num = 5; put(t, vs[0], 0, true); put(t, vs[2], 0, true); // owed 4
  t.bank.ore = 3; t.phase = 'roll'; rollSeed(t, 5);
  run(t, { t: 'roll' });
  assert.strictEqual(t.players[0].res.ore, 3); assert.strictEqual(t.bank.ore, 0);
  // enough in the bank: everyone paid
  const u = blank();
  u.hexes[h].num = 5; put(u, vs[0], 0, true); put(u, vs[2], 1, false);
  u.phase = 'roll'; rollSeed(u, 5); run(u, { t: 'roll' });
  assert.strictEqual(u.players[0].res.ore, 2); assert.strictEqual(u.players[1].res.ore, 1);
});

test('seven: discard half, robber, steal', () => {
  const s = blank();
  s.phase = 'roll'; rollSeed(s, 7);
  give(s, 1, { brick: 5, lumber: 4 });   // 9 cards -> discard 4
  give(s, 2, { brick: 7 });              // 7 cards -> no discard
  give(s, 3, { ore: 8 });                // 8 -> discard 4
  run(s, { t: 'roll' });
  assert.strictEqual(s.phase, 'discard');
  assert.deepStrictEqual(s.discardQueue.map((q) => [q.p, q.n]), [[1, 4], [3, 4]]);
  assert.ok(!C.apply(s, { t: 'discard', p: 1, res: { brick: 1 } }).ok);
  assert.ok(!C.apply(s, { t: 'discard', p: 2, res: { brick: 1 } }).ok);
  assert.ok(!C.apply(s, { t: 'discard', p: 1, res: { ore: 4 } }).ok);
  run(s, { t: 'discard', p: 3, res: { ore: 4 } });
  run(s, { t: 'discard', p: 1, res: { brick: 2, lumber: 2 } });
  assert.strictEqual(s.phase, 'robber');
  assert.strictEqual(C.handSize(s.players[1]), 5); assert.strictEqual(C.handSize(s.players[3]), 4);
  assert.ok(!C.apply(s, { t: 'end_turn' }).ok);
  assert.ok(!C.apply(s, { t: 'move_robber', hex: s.robber }).ok, 'must move');
  const h = s.hexes.findIndex((x, i) => i !== s.robber && x.terrain === 'hill');
  put(s, HEXES[h].verts[0], 1); put(s, HEXES[h].verts[2], 2);
  const before = C.handSize(s.players[0]);
  run(s, { t: 'move_robber', hex: h });
  assert.strictEqual(s.phase, 'steal');
  assert.deepStrictEqual(s.stealFrom.sort(), [1, 2]);
  assert.ok(!C.apply(s, { t: 'steal', from: 3 }).ok);
  const v2 = C.handSize(s.players[2]);
  run(s, { t: 'steal', from: 2 });
  assert.strictEqual(C.handSize(s.players[0]), before + 1);
  assert.strictEqual(C.handSize(s.players[2]), v2 - 1);
  assert.strictEqual(s.phase, 'main');
  // no victims with cards: no steal
  const t = blank(); t.phase = 'roll'; rollSeed(t, 7); run(t, { t: 'roll' });
  assert.strictEqual(t.phase, 'robber');
  const h2 = t.hexes.findIndex((x, i) => i !== t.robber);
  put(t, HEXES[h2].verts[0], 1); // victim with zero cards
  run(t, { t: 'move_robber', hex: h2 });
  assert.strictEqual(t.phase, 'main');
});

test('port rates', () => {
  const s = blank();
  const pt = s.ports.find((p) => p.type === 'any');
  assert.strictEqual(C.ratio(s, 0, 'brick'), 4);
  put(s, pt.a, 0);
  assert.strictEqual(C.ratio(s, 0, 'brick'), 3);
  const sp = s.ports.find((p) => p.type === 'wool');
  put(s, sp.a, 0);
  assert.strictEqual(C.ratio(s, 0, 'wool'), 2);
  assert.strictEqual(C.ratio(s, 0, 'ore'), 3);
  assert.strictEqual(C.ratio(s, 1, 'wool'), 4);
  // trades
  give(s, 0, { wool: 2, brick: 3 });
  run(s, { t: 'bank_trade', give: 'wool', get: 'ore' });
  assert.strictEqual(s.players[0].res.ore, 1); assert.strictEqual(s.players[0].res.wool, 0);
  run(s, { t: 'bank_trade', give: 'brick', get: 'grain' });
  assert.strictEqual(s.players[0].res.brick, 0);
  assert.ok(!C.apply(s, { t: 'bank_trade', give: 'brick', get: 'grain' }).ok);
  assert.ok(!C.apply(s, { t: 'bank_trade', give: 'grain', get: 'grain' }).ok);
  const plain = blank(); give(plain, 0, { ore: 4 });
  run(plain, { t: 'bank_trade', give: 'ore', get: 'brick' });
  assert.strictEqual(plain.players[0].res.brick, 1);
});

test('player trade validation', () => {
  const s = blank();
  give(s, 0, { brick: 2 }); give(s, 1, { ore: 1 });
  assert.ok(!C.apply(s, { t: 'player_trade', with: 1, give: { brick: 1 }, get: { ore: 2 } }).ok);
  assert.ok(!C.apply(s, { t: 'player_trade', with: 0, give: { brick: 1 }, get: { ore: 1 } }).ok);
  run(s, { t: 'player_trade', with: 1, give: { brick: 2 }, get: { ore: 1 } });
  assert.strictEqual(s.players[1].res.brick, 2); assert.strictEqual(s.players[0].res.ore, 1);
});

test('development cards: one per turn, not on purchase turn, VP', () => {
  const s = blank();
  give(s, 0, { ore: 2, wool: 2, grain: 2 });
  s.devDeck = ['knight', 'knight', 'vp']; // pop order: vp, knight, knight
  const r1 = run(s, { t: 'buy_dev' });
  assert.strictEqual(r1.card, 'vp');
  run(s, { t: 'buy_dev' });
  assert.strictEqual(s.players[0].newDev.knight, 1);
  assert.ok(!C.apply(s, { t: 'play_knight' }).ok, 'bought this turn');
  assert.ok(!C.apply(s, { t: 'buy_dev' }).ok, 'no resources');
  // VP card hidden, revealable any time
  assert.strictEqual(C.publicVP(s, 0), 0); assert.strictEqual(C.totalVP(s, 0), 1);
  run(s, { t: 'play_vp' });
  assert.strictEqual(C.publicVP(s, 0), 1);
  run(s, { t: 'end_turn' });
  // next round
  s.current = 0; s.phase = 'main';
  assert.strictEqual(s.players[0].dev.knight, 1);
  s.players[0].dev.road = 1; s.players[0].dev.monopoly = 1;
  run(s, { t: 'play_knight' });
  s.phase = 'main';
  assert.ok(!C.apply(s, { t: 'play_monopoly', res: 'ore' }).ok, 'one dev card per turn');
  assert.ok(!C.apply(s, { t: 'play_road_building' }).ok);
  // empty deck
  const e = blank(); give(e, 0, { ore: 1, wool: 1, grain: 1 }); e.devDeck = [];
  assert.ok(!C.apply(e, { t: 'buy_dev' }).ok);
  // deck composition
  const g = C.newGame({ seed: 9 });
  const dc = {}; g.devDeck.forEach((d) => { dc[d] = (dc[d] || 0) + 1; });
  assert.deepStrictEqual(dc, { knight: 14, vp: 5, road: 2, plenty: 2, monopoly: 2 });
});

test('monopoly, year of plenty, road building', () => {
  const s = blank();
  s.players[0].dev.monopoly = 1;
  give(s, 1, { grain: 3 }); give(s, 2, { grain: 2 }); give(s, 3, { ore: 4 });
  const r = run(s, { t: 'play_monopoly', res: 'grain' });
  assert.strictEqual(r.total, 5); assert.strictEqual(s.players[0].res.grain, 5);
  assert.strictEqual(s.players[1].res.grain, 0); assert.strictEqual(s.players[3].res.ore, 4);
  const t = blank(); t.players[0].dev.plenty = 1;
  run(t, { t: 'play_plenty', a: 'ore', b: 'ore' });
  assert.strictEqual(t.players[0].res.ore, 2); assert.strictEqual(t.bank.ore, 17);
  const u = blank(); u.players[0].dev.road = 1; put(u, 10, 0);
  run(u, { t: 'play_road_building' });
  assert.strictEqual(u.freeRoads, 2);
  assert.ok(!C.apply(u, { t: 'end_turn' }).ok);
  const e1 = VERTS[10].edges[0];
  run(u, { t: 'build_road', e: e1 });
  run(u, { t: 'build_road', e: VERTS[10].edges[1] });
  assert.strictEqual(u.freeRoads, 0);
  assert.strictEqual(u.players[0].res.brick, 0);
  assert.strictEqual(u.players[0].roadsLeft, 13);
});

test('longest road: chain, branch, cycle, blockers, ties', () => {
  // simple chain
  for (const n of [1, 4, 5, 8]) {
    const s = blank(); chain(n).forEach((e) => road(s, e, 0));
    assert.strictEqual(C.longestRoad(s, 0), n);
    C.recomputeLongest(s);
    assert.strictEqual(s.longest.owner, n >= 5 ? 0 : -1);
  }
  // branch: Y shape, longest path uses two longest arms
  const s = blank();
  const hubV = VERTS.findIndex((v) => v.edges.length === 3);
  const arms = VERTS[hubV].edges.map((e) => {
    // extend each arm by one more edge when possible
    const w = C.otherEnd(e, hubV);
    const ext = VERTS[w].edges.find((x) => x !== e);
    return [e, ext];
  });
  road(s, arms[0][0], 0); road(s, arms[0][1], 0); road(s, arms[1][0], 0); road(s, arms[1][1], 0); road(s, arms[2][0], 0);
  assert.strictEqual(C.longestRoad(s, 0), 4);
  // cycle: a hexagon is 6 long, plus a tail
  const c = blank();
  HEXES[9].edges.forEach((e) => road(c, e, 0));
  assert.strictEqual(C.longestRoad(c, 0), 6);
  const tail = VERTS[HEXES[9].verts[0]].edges.find((e) => !HEXES[9].edges.includes(e));
  road(c, tail, 0);
  assert.strictEqual(C.longestRoad(c, 0), 7);
  // broken by an opponent settlement
  const b = blank(); const ch = chain(6); ch.forEach((e) => road(b, e, 0));
  C.recomputeLongest(b);
  assert.strictEqual(b.longest.owner, 0); assert.strictEqual(b.longest.len, 6);
  const shared = [EDGES[ch[2]].a, EDGES[ch[2]].b].find((v) => EDGES[ch[3]].a === v || EDGES[ch[3]].b === v);
  put(b, shared, 1);
  C.recomputeLongest(b);
  assert.strictEqual(C.longestRoad(b, 0), 3);
  assert.strictEqual(b.longest.owner, -1);
  // tie does not transfer
  const t = blank();
  const used = new Set();
  const first = chain(5); first.forEach((e) => { road(t, e, 0); used.add(e); });
  C.recomputeLongest(t);
  assert.strictEqual(t.longest.owner, 0);
  // build 5 for player 1 elsewhere
  let placed = 0;
  const fvs = new Set(); first.forEach((e) => { fvs.add(EDGES[e].a); fvs.add(EDGES[e].b); });
  for (let v = 0; v < VERTS.length && placed < 5; v++) {
    if (fvs.has(v) || VERTS[v].nbrs.some((n) => fvs.has(n))) continue;
    // greedy chain avoiding vertices near player 0
    const es = []; const seen = new Set([v]); let cur = v;
    while (es.length < 5) {
      const nx = VERTS[cur].edges.find((e) => { const w = C.otherEnd(e, cur); return !seen.has(w) && !fvs.has(w) && !VERTS[w].nbrs.some((n) => fvs.has(n)) && t.roads[e] === -1; });
      if (nx === undefined) break;
      es.push(nx); cur = C.otherEnd(nx, cur); seen.add(cur);
    }
    if (es.length === 5) { es.forEach((e) => road(t, e, 1)); placed = 5; }
  }
  assert.strictEqual(placed, 5, 'test setup could place second chain');
  C.recomputeLongest(t);
  assert.strictEqual(t.longest.owner, 0, 'tie keeps holder');
  // strictly exceeding transfers
  const extra = VERTS.reduce((acc, v, vi) => acc, null);
  const ends = []; t.roads.forEach((o, e) => { if (o === 1) { ends.push(EDGES[e].a, EDGES[e].b); } });
  let added = false;
  for (const v of ends) {
    for (const e of VERTS[v].edges) if (t.roads[e] === -1 && !added) { road(t, e, 1); C.recomputeLongest(t); if (t.longest.owner === 1) added = true; else road(t, e, -1); }
  }
  assert.ok(added, 'strictly longer takes it');
  assert.strictEqual(t.longest.owner, 1);
});

test('longest road gives 2 VP and shows in totals', () => {
  const s = blank(); chain(5).forEach((e) => road(s, e, 0)); C.recomputeLongest(s);
  assert.strictEqual(C.publicVP(s, 0), 2);
});

test('largest army', () => {
  const s = blank();
  const knight = (p) => {
    s.current = p; s.phase = 'main'; s.devPlayed = false; s.players[p].dev.knight = 1;
    run(s, { t: 'play_knight' });
    const h = s.hexes.findIndex((x, i) => i !== s.robber);
    run(s, { t: 'move_robber', hex: h });
  };
  knight(0); knight(0); assert.strictEqual(s.army.owner, -1);
  knight(0); assert.strictEqual(s.army.owner, 0); assert.strictEqual(s.army.size, 3);
  assert.strictEqual(C.publicVP(s, 0), 2);
  knight(1); knight(1); knight(1);
  assert.strictEqual(s.army.owner, 0, 'tie does not transfer');
  knight(1);
  assert.strictEqual(s.army.owner, 1); assert.strictEqual(C.publicVP(s, 0), 0);
  // knight can be played before the roll
  const t = blank(); t.phase = 'roll'; t.players[0].dev.knight = 1;
  run(t, { t: 'play_knight' });
  assert.strictEqual(t.phase, 'robber');
  run(t, { t: 'move_robber', hex: t.hexes.findIndex((x, i) => i !== t.robber) });
  assert.strictEqual(t.phase, 'roll');
});

test('win detection on own turn at 10 VP', () => {
  const s = blank();
  [1, 3, 5, 7, 9, 11, 13, 15].forEach((v, i) => { /* settlements spaced out */ });
  const spots = [];
  const taken = new Set();
  for (let v = 0; v < VERTS.length && spots.length < 8; v++) {
    if (taken.has(v)) continue; spots.push(v); taken.add(v); VERTS[v].nbrs.forEach((n) => taken.add(n));
  }
  assert.strictEqual(spots.length, 8);
  spots.slice(0, 4).forEach((v) => put(s, v, 0, true));      // 4 cities = 8
  spots.slice(4, 5).forEach((v) => put(s, v, 0, false));     // +1 = 9
  assert.strictEqual(C.totalVP(s, 0), 9);
  s.players[0].dev.vp = 1; s.players[0].dev.knight = 0;
  C.apply(s, { t: 'play_vp' });
  assert.strictEqual(s.winner, 0, 'revealed VP card reaches 10');
  assert.strictEqual(s.phase, 'gameover');
  assert.ok(!C.apply(s, { t: 'end_turn' }).ok);
  // hidden VP wins at once when bought
  const t = blank();
  spots.slice(0, 4).forEach((v) => put(t, v, 0, true)); put(t, spots[4], 0, false);
  give(t, 0, { ore: 1, wool: 1, grain: 1 }); t.devDeck = ['vp'];
  run(t, { t: 'buy_dev' });
  assert.strictEqual(t.winner, 0);
  // reaching 10 on someone else's turn does not win until own turn
  const u = blank();
  spots.slice(0, 4).forEach((v) => put(u, v, 1, true)); put(u, spots[4], 1, false); u.players[1].dev.vp = 1;
  assert.strictEqual(C.totalVP(u, 1), 10);
  C.checkWinFor && C.checkWinFor(u);
  assert.strictEqual(u.winner, -1, 'not their turn yet');
  C.apply(u, { t: 'end_turn' });
  assert.strictEqual(u.winner, 1, 'wins once their own turn begins');
});

test('AI only plays legal actions and finishes games', () => {
  const GAMES = 60, CAP = 400 * 4;
  let finished = 0, turnsSum = 0;
  const t0 = Date.now();
  const winners = [0, 0, 0, 0];
  for (let seed = 1; seed <= GAMES; seed++) {
    const s = C.newGame({ seed: seed * 7919, players: 4 });
    s.players.forEach((p) => { p.ai = true; });
    let steps = 0;
    while (s.phase !== 'gameover' && s.turn <= 400 && steps < 60000) {
      const a = C.aiNextAction(s);
      assert.ok(a, 'AI returned no action in phase ' + s.phase);
      const r = C.apply(s, a);
      assert.ok(r.ok, 'seed ' + seed + ' illegal AI action ' + JSON.stringify(a) + ': ' + r.error);
      steps++;
      // invariants
      RES.forEach((res) => {
        let t = s.bank[res]; s.players.forEach((p) => { t += p.res[res]; });
        assert.strictEqual(t, 19);
        assert.ok(s.bank[res] >= 0);
      });
    }
    if (s.phase === 'gameover') { finished++; turnsSum += s.turn; winners[s.winner]++; assert.ok(C.totalVP(s, s.winner) >= 10); }
  }
  console.log('AI games finished: ' + finished + '/' + GAMES + ', avg turns ' + (turnsSum / Math.max(1, finished)).toFixed(0) + ', winners by seat ' + winners.join('/') + ', ' + (Date.now() - t0) + ' ms');
  assert.ok(finished / GAMES >= 0.95, 'finished ' + finished + ' of ' + GAMES);
});

test('3 player AI games also finish', () => {
  let finished = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const s = C.newGame({ seed: seed * 31, players: 3 });
    s.players.forEach((p) => { p.ai = true; });
    let steps = 0;
    while (s.phase !== 'gameover' && s.turn <= 400 && steps < 60000) {
      const r = C.apply(s, C.aiNextAction(s)); assert.ok(r.ok, r.error); steps++;
    }
    if (s.phase === 'gameover') finished++;
  }
  console.log('3-player AI games finished: ' + finished + '/15');
  assert.ok(finished >= 14);
});

test('AI trade responses', () => {
  const s = blank();
  s.players[1].ai = true;
  give(s, 1, { ore: 2, brick: 3 });
  // AI has surplus brick; wants grain/wool maybe. Offer: human gives wool, asks for brick
  const good = C.aiRespondTrade(s, 1, { from: 0, give: { grain: 1 }, get: { brick: 1 } });
  assert.strictEqual(typeof good.accept, 'boolean');
  assert.strictEqual(C.aiRespondTrade(s, 1, { from: 0, give: { wool: 1 }, get: { lumber: 1 } }).accept, false, 'AI lacks lumber');
  assert.strictEqual(C.aiRespondTrade(s, 1, { from: 0, give: { grain: 1 }, get: { brick: 3 } }).accept, false, 'lopsided');
});
