'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../private/starship-catan/logic.js');

const { RES, VERTS, NBR, N_SEC, N_VERT } = L;
const DIR = path.join(__dirname, '..', 'private', 'starship-catan');

// a game past setup, in the main phase on player 0's turn, all hands empty
function ready(n, seed) {
  const s = L.newGame({ players: n || 3, seed: seed || 7, ai: [false, true, true, true] });
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 40) {
    const a = L.aiNextAction({ ...s, players: s.players.map((p, i) => ({ ...p, ai: true })) });
    assert.ok(L.apply(s, a).ok);
  }
  assert.strictEqual(s.phase, 'roll');
  s.phase = 'main';
  s.players.forEach((p) => RES.forEach((r) => { p.res[r] = 0; }));
  s.sites.fill(null);
  return s;
}
function give(s, p, o) { Object.keys(o).forEach((r) => { s.players[p].res[r] += o[r]; }); }
function run(s, a) { const r = L.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + ' -> ' + r.error); return r; }
function setType(s, i, type, res, num) {
  const x = s.sectors[i];
  x.type = type; x.res = res || null; x.num = num || 0; x.revealed = true;
  if (type === 'derelict') { x.loot = ['fuel', 'ore']; x.looted = false; }
  if (type === 'outpost') x.mission = { ore: 2, tech: 1, water: 1 };
}
// a vertex touching sector i and its other touching sectors
function vertexOf(i, k) { return L.SEC_VERTS[i][k || 0]; }
function cleanAround(s, i) { // make sector i and neighbours plain deep space, revealed
  [i].concat(NBR[i]).forEach((j) => setType(s, j, 'deep'));
}
function farSector(s, pi) { // a sector at least 3 away from every mothership
  for (let i = 0; i < N_SEC; i++) if (s.players.every((p) => L.sectorDist(i, p.home) >= 3) && s.sectors[i].type !== 'home') return i;
  return 0;
}

test('galaxy: counts, home spacing, numbers, over many seeds and player counts', () => {
  for (const n of [2, 3, 4]) {
    for (let seed = 1; seed <= 60; seed++) {
      const s = L.newGame({ players: n, seed });
      assert.strictEqual(s.sectors.length, 37);
      const c = {};
      s.sectors.forEach((x) => { c[x.type] = (c[x.type] || 0) + 1; });
      assert.strictEqual(c.home, n);
      assert.strictEqual(c.planet, 11);
      assert.strictEqual(c.asteroid, 5);
      assert.strictEqual(c.nebula, 5);
      assert.strictEqual(c.derelict, 3);
      assert.strictEqual(c.outpost, 3);
      assert.strictEqual(c.deep, 37 - n - 27);
      s.sectors.forEach((x, i) => {
        if (x.res) { assert.ok(x.num >= 2 && x.num <= 12 && x.num !== 7, 'number ' + x.num); } else assert.strictEqual(x.num, 0);
        if (x.type === 'asteroid') assert.strictEqual(x.res, 'ore');
        if (x.type === 'nebula') assert.strictEqual(x.res, 'fuel');
        if (x.type === 'planet') assert.ok(['water', 'carbon', 'tech'].includes(x.res));
        if (x.type === 'outpost') assert.strictEqual(L.costSum(x.mission), 4);
        if (x.type === 'derelict') assert.strictEqual(x.loot.length, 2);
        assert.strictEqual(x.revealed, s.players.some((p) => p.home === i || NBR[p.home].includes(i)));
      });
      // homes are not neighbours and each has producing neighbours
      s.players.forEach((p) => {
        assert.ok(NBR[p.home].every((j) => s.sectors[j].type !== 'home'));
        assert.ok(NBR[p.home].filter((j) => L.isProducer(s.sectors[j])).length >= 2);
      });
    }
  }
});

test('galaxy: connected graph, every home reaches every sector', () => {
  const s = L.newGame({ players: 4, seed: 11 });
  const seen = new Set([s.players[0].home]);
  const q = [s.players[0].home];
  while (q.length) { const u = q.pop(); NBR[u].forEach((v) => { if (!seen.has(v)) { seen.add(v); q.push(v); } }); }
  assert.strictEqual(seen.size, 37);
  assert.strictEqual(N_VERT, new Set(VERTS.map((v) => Math.round(v.x * 100) + ',' + Math.round(v.y * 100))).size);
  VERTS.forEach((v) => { assert.ok(v.hexes.length >= 1 && v.hexes.length <= 3); assert.ok(v.nbrs.length >= 2 && v.nbrs.length <= 3); });
});

test('galaxy: same seed same galaxy, different seeds differ', () => {
  const a = L.newGame({ players: 4, seed: 99 }), b = L.newGame({ players: 4, seed: 99 }), c = L.newGame({ players: 4, seed: 100 });
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a.sectors, c.sectors);
});

test('setup: snake order, home-only legal placement, spacing, second colony collects', () => {
  const s = L.newGame({ players: 3, seed: 5 });
  assert.deepStrictEqual(s.setup.order, [0, 1, 2, 2, 1, 0]);
  const home = s.players[0].home;
  const far = VERTS.findIndex((v) => !v.hexes.includes(home));
  assert.ok(!L.apply(s, { t: 'setup_colony', v: far }).ok);
  assert.ok(!L.apply(s, { t: 'roll' }).ok);
  const hv = L.SEC_VERTS[home];
  run(s, { t: 'setup_colony', v: hv[0] });
  assert.strictEqual(s.current, 1);
  // gets nothing for the first colony
  assert.strictEqual(L.cardCount(s.players[0]), 0);
  // finish others, then check player 0 second colony
  let g = 0;
  while (s.current !== 0 && g++ < 20) run(s, L.aiNextAction({ ...s, players: s.players.map((p) => ({ ...p, ai: true })) }));
  assert.strictEqual(s.current, 0);
  assert.strictEqual(s.setup.idx, 5);
  // adjacent vertex of the first colony is illegal
  const adj = VERTS[hv[0]].nbrs.find((w) => VERTS[w].hexes.includes(home));
  assert.ok(!L.apply(s, { t: 'setup_colony', v: adj }).ok);
  const ok = hv.find((v) => L.siteFree(s, v));
  const expect = VERTS[ok].hexes.filter((h) => L.isProducer(s.sectors[h])).length;
  run(s, { t: 'setup_colony', v: ok });
  assert.strictEqual(L.cardCount(s.players[0]), expect);
  assert.strictEqual(s.phase, 'roll');
  assert.strictEqual(s.current, 0);
  assert.strictEqual(L.counts(s, 0).colonies, 2);
});

test('movement: cost 1, asteroid 2, pirate +1, budget, adjacency, boost', () => {
  const s = ready(3, 7);
  const p = s.players[0];
  const start = farSector(s, 0);
  cleanAround(s, start);
  const sh = p.ships[0];
  sh.at = start; sh.moves = 2; sh.acted = false;
  const [a, b] = NBR[start];
  assert.ok(!L.apply(s, { t: 'move', ship: 1, to: farSector(s, 0) === start ? 0 : (NBR[start].includes(0) ? 1 : 0) }).ok || NBR[start].includes(0));
  run(s, { t: 'move', ship: 1, to: a });
  assert.strictEqual(sh.moves, 1);
  assert.strictEqual(sh.at, a);
  // asteroid costs 2, a ship with 1 move may still enter and ends at 0
  setType(s, b, 'asteroid', 'ore', 6);
  sh.at = start; sh.moves = 1;
  run(s, { t: 'move', ship: 1, to: b });
  assert.strictEqual(sh.moves, 0);
  assert.ok(!L.apply(s, { t: 'move', ship: 1, to: start }).ok, 'no moves left');
  // boost costs fuel
  assert.ok(!L.apply(s, { t: 'boost', ship: 1 }).ok);
  give(s, 0, { fuel: 3 });
  run(s, { t: 'boost', ship: 1 }); run(s, { t: 'boost', ship: 1 });
  assert.ok(!L.apply(s, { t: 'boost', ship: 1 }).ok, 'max two boosts');
  assert.strictEqual(p.res.fuel, 1);
  assert.strictEqual(sh.moves, 2);
  // moving into the pirate costs +1, asteroid plus pirate costs 3
  sh.at = start; sh.moves = 3; s.pirate = a;
  run(s, { t: 'move', ship: 1, to: a });
  assert.strictEqual(sh.moves, 1);
  // not adjacent is rejected
  const notAdj = [...Array(N_SEC).keys()].find((i) => i !== a && !NBR[a].includes(i));
  sh.moves = 3;
  assert.ok(!L.apply(s, { t: 'move', ship: 1, to: notAdj }).ok);
  // speed upgrade
  assert.strictEqual(L.speedOf(p), 2);
  p.fleet = 1;
  assert.strictEqual(L.speedOf(p), 3);
});

test('reach: budget and asteroid cost are reflected in reachable sectors', () => {
  const s = ready(2, 3);
  const start = farSector(s, 0);
  cleanAround(s, start);
  const sh = s.players[0].ships[0];
  sh.at = start; sh.moves = 2;
  const n1 = NBR[start][0];
  setType(s, n1, 'asteroid', 'ore', 4);
  const r = L.reach(s, sh);
  assert.strictEqual(r.rem[n1], 0);
  const free = NBR[start].find((j) => j !== n1);
  assert.strictEqual(r.rem[free], 1);
  // can go two steps through plain space
  const two = NBR[free].find((j) => j !== start && !NBR[start].includes(j));
  if (two !== undefined) assert.strictEqual(r.rem[two], 0);
  assert.deepStrictEqual(L.pathTo(r, free), [free]);
});

test('revealing: flying in or next to a face-down sector turns it over; salvage is once', () => {
  const s = ready(3, 21);
  const start = farSector(s, 0);
  const sh = s.players[0].ships[0];
  sh.at = start; sh.moves = 2; sh.acted = false;
  s.sectors.forEach((x, i) => { if (x.type !== 'home') x.revealed = false; });
  s.players.forEach((p) => L.NBR[p.home].forEach((j) => { s.sectors[j].revealed = true; }));
  // pick a hidden neighbour and make it a derelict
  const t = NBR[start].find((j) => !s.sectors[j].revealed);
  assert.ok(t !== undefined);
  setType(s, t, 'derelict'); s.sectors[t].revealed = false;
  const others = NBR[t].filter((j) => j !== start);
  others.forEach((j) => { if (s.sectors[j].type !== 'home') s.sectors[j].revealed = false; });
  run(s, { t: 'move', ship: 1, to: t });
  assert.ok(s.sectors[t].revealed);
  NBR[t].forEach((j) => assert.ok(s.sectors[j].revealed, 'neighbour revealed'));
  assert.strictEqual(s.players[0].res.fuel, 1);
  assert.strictEqual(s.players[0].res.ore, 1);
  assert.ok(s.sectors[t].looted);
  // second ship entering gets nothing
  const before = L.cardCount(s.players[1]);
  s.current = 1; s.players[1].ships[0].at = start; s.players[1].ships[0].moves = 2;
  run(s, { t: 'move', ship: 1, to: t });
  assert.strictEqual(L.cardCount(s.players[1]), before);
});

test('colony: legality, cost, ship requirement, spacing, planet requirement, piece limit', () => {
  const s = ready(3, 4);
  const p = s.players[0];
  const sec = farSector(s, 0);
  cleanAround(s, sec);
  const nb = NBR[sec][0];
  setType(s, nb, 'planet', 'carbon', 5);
  const sh = p.ships[0]; sh.at = sec; sh.moves = 2; sh.acted = false;
  const v = L.SEC_VERTS[sec].find((x) => VERTS[x].hexes.includes(nb));
  assert.ok(!L.apply(s, { t: 'colony', v }).ok, 'cannot afford');
  give(s, 0, { water: 1, carbon: 1, tech: 1, fuel: 1 });
  assert.ok(L.sitesFor(s, 0, 'colony').includes(v));
  run(s, { t: 'colony', v });
  assert.deepStrictEqual(s.sites[v], { p: 0, kind: 'colony', spec: null });
  assert.strictEqual(L.cardCount(p), 0);
  assert.strictEqual(sh.acted, true);
  assert.strictEqual(sh.moves, 0);
  // the builder is spent: a second colony elsewhere this turn is refused even if affordable
  give(s, 0, { water: 1, carbon: 1, tech: 1, fuel: 1 });
  const v2 = L.SEC_VERTS[sec].find((x) => L.siteFree(s, x) && L.touchesPlanet(s, x));
  if (v2 !== undefined) assert.ok(!L.apply(s, { t: 'colony', v: v2 }).ok);
  // adjacent vertex is blocked by the spacing rule
  const adj = VERTS[v].nbrs[0];
  assert.ok(!L.siteFree(s, adj));
  // no ship in a touching sector
  sh.acted = false; sh.at = farSector(s, 0) === sec ? NBR[sec][1] : farSector(s, 0);
  const far = VERTS.findIndex((x, i) => L.siteFree(s, i) && L.touchesPlanet(s, i) && !x.hexes.includes(sh.at));
  const r = L.apply(s, { t: 'colony', v: far });
  assert.ok(!r.ok);
  // a vertex touching no planet is refused
  const sec2 = NBR[sec][1];
  setType(s, sec2, 'deep');
  const dv = L.SEC_VERTS[sec2].find((x) => VERTS[x].hexes.every((h) => s.sectors[h].type !== 'planet' && s.sectors[h].type !== 'home') && L.siteFree(s, x));
  if (dv !== undefined) { sh.at = sec2; assert.ok(!L.apply(s, { t: 'colony', v: dv }).ok); }
  // piece limit
  const t = ready(2, 4);
  let placed = 0;
  for (let i = 0; i < N_VERT && placed < 5; i++) if (L.siteFree(t, i)) { t.sites[i] = { p: 0, kind: 'colony' }; placed++; }
  t.players[0].ships[0].acted = false;
  assert.deepStrictEqual(L.sitesFor(t, 0, 'colony'), []);
});

test('trade post: cheaper, 0 VP, needs an adjacent resource as specialty, 4 max', () => {
  const s = ready(3, 4);
  const p = s.players[0];
  const sec = farSector(s, 0);
  cleanAround(s, sec);
  const nb = NBR[sec][0];
  setType(s, nb, 'planet', 'tech', 8);
  const nb2 = NBR[sec].find((j) => j !== nb && NBR[nb].includes(j));
  setType(s, nb2, 'nebula', 'fuel', 9);
  const sh = p.ships[0]; sh.at = sec; sh.moves = 2; sh.acted = false;
  const v = L.SEC_VERTS[sec].find((x) => VERTS[x].hexes.includes(nb) && VERTS[x].hexes.includes(nb2));
  give(s, 0, { water: 1, carbon: 1, fuel: 1 });
  assert.ok(!L.apply(s, { t: 'post', v, spec: 'ore' }).ok, 'ore is not produced next to it');
  assert.deepStrictEqual(L.postSpecs(s, v).sort(), ['fuel', 'tech']);
  const vp0 = L.vp(s, 0);
  run(s, { t: 'post', v, spec: 'tech' });
  assert.strictEqual(s.sites[v].kind, 'post');
  assert.strictEqual(L.vp(s, 0), vp0);
  assert.strictEqual(L.cardCount(p), 0);
  assert.strictEqual(L.rateFor(s, 0, 'tech'), 2);
  assert.strictEqual(L.rateFor(s, 0, 'ore'), 3);
});

test('starbase upgrade costs 3 ore and 2 water and is worth 2 VP', () => {
  const s = ready(3, 4);
  const v = L.SEC_VERTS[s.players[0].home][0];
  s.sites[v] = { p: 0, kind: 'colony' };
  assert.strictEqual(L.vp(s, 0), 1);
  assert.ok(!L.apply(s, { t: 'upgrade', v }).ok);
  give(s, 0, { ore: 3, water: 2 });
  run(s, { t: 'upgrade', v });
  assert.strictEqual(s.sites[v].kind, 'starbase');
  assert.strictEqual(L.vp(s, 0), 2);
  assert.ok(!L.apply(s, { t: 'upgrade', v }).ok);
});

test('production: several pieces, starbase doubles, post bonus at Trade 2, pirate blocks', () => {
  const s = ready(3, 4);
  const sec = farSector(s, 0);
  cleanAround(s, sec);
  setType(s, sec, 'planet', 'water', 6);
  const [n1, n2] = NBR[sec];
  setType(s, n1, 'asteroid', 'ore', 6);
  setType(s, n2, 'nebula', 'fuel', 5);
  const vs = L.SEC_VERTS[sec];
  const v1 = vs.find((x) => VERTS[x].hexes.includes(n1));
  const v2 = vs.find((x) => VERTS[x].hexes.includes(n2) && !VERTS[x].hexes.includes(n1) && L.siteFree(s, x));
  s.sites[v1] = { p: 0, kind: 'colony' };
  if (v2 !== undefined) s.sites[v2] = { p: 1, kind: 'starbase' };
  s.players.forEach((p) => RES.forEach((r) => { p.res[r] = 0; }));
  s.phase = 'roll';
  s.rs = 12345;
  // force a 6 by calling the producer through apply with a patched die roll
  const realRint = s.rs;
  void realRint;
  const prod = (sum) => { // use the real code path: set dice by retrying seeds until the sum matches
    for (let k = 0; k < 5000; k++) {
      const t = JSON.parse(JSON.stringify(s)); t.rs = k;
      const r = L.apply(t, { t: 'roll' });
      if (r.dice[0] + r.dice[1] === sum) return t;
    }
    throw new Error('no seed');
  };
  let t = prod(6);
  // v1 touches planet (6) and asteroid (6): two pieces of one colony
  assert.strictEqual(t.players[0].res.water, 1);
  assert.strictEqual(t.players[0].res.ore, 1);
  if (v2 !== undefined) assert.strictEqual(t.players[1].res.water, 2, 'starbase doubles');
  // blocked by the pirate
  const u = JSON.parse(JSON.stringify(s)); u.pirate = n1;
  for (let k = 0; k < 5000; k++) {
    const w = JSON.parse(JSON.stringify(u)); w.rs = k;
    const r = L.apply(w, { t: 'roll' });
    if (r.dice[0] + r.dice[1] === 6) { assert.strictEqual(w.players[0].res.ore, 0); assert.strictEqual(w.players[0].res.water, 1); break; }
  }
  // post bonus
  const pv = vs.find((x) => L.siteFree(s, x) && VERTS[x].hexes.includes(n2));
  if (pv !== undefined) {
    const z = JSON.parse(JSON.stringify(s));
    z.sites = z.sites.map(() => null);
    z.sites[pv] = { p: 2, kind: 'post', spec: 'fuel' };
    z.players[2].trade = 2;
    for (let k = 0; k < 5000; k++) {
      const w = JSON.parse(JSON.stringify(z)); w.rs = k;
      const r = L.apply(w, { t: 'roll' });
      if (r.dice[0] + r.dice[1] === 5) { assert.strictEqual(w.players[2].res.fuel, 2); break; }
    }
  }
});

test('production: nothing happens when the number is not on the board', () => {
  const s = ready(2, 4);
  s.sectors.forEach((x) => { x.num = x.num === 4 ? 3 : x.num; });
  const v = L.SEC_VERTS[s.players[0].home][0];
  s.sites[v] = { p: 0, kind: 'colony' };
  s.phase = 'roll';
  for (let k = 0; k < 500; k++) {
    const w = JSON.parse(JSON.stringify(s)); w.rs = k;
    const r = L.apply(w, { t: 'roll' });
    if (r.dice[0] + r.dice[1] === 4) { assert.strictEqual(L.cardCount(w.players[0]), 0); break; }
  }
});

function raidState(sc) {
  const s = ready(3, 8);
  s.phase = 'roll';
  sc(s);
  for (let k = 0; k < 5000; k++) {
    const w = JSON.parse(JSON.stringify(s)); w.rs = k;
    const r = L.apply(w, { t: 'roll' });
    if (r.dice[0] + r.dice[1] === 7) return w;
  }
  throw new Error('no 7');
}

test('raid on a 7: discard half above 7, shields raise the limit, then move pirate and steal', () => {
  const s = raidState((w) => {
    give(w, 0, { fuel: 4, ore: 4 }); // 8 cards: discard 4
    give(w, 1, { fuel: 7 });          // 7 cards: safe
    give(w, 2, { fuel: 10, tech: 1 }); w.players[2].fleet = 3; // 11 cards but shields (limit 10): discard 5
  });
  assert.strictEqual(s.phase, 'discard');
  assert.deepStrictEqual(s.discardQueue.map((q) => [q.p, q.n]), [[0, 4], [2, 5]]);
  assert.ok(!L.apply(s, { t: 'discard', p: 0, cards: { fuel: 1 } }).ok, 'wrong count');
  assert.ok(!L.apply(s, { t: 'discard', p: 0, cards: { tech: 4 } }).ok, 'not held');
  run(s, { t: 'discard', p: 0, cards: { fuel: 2, ore: 2 } });
  assert.strictEqual(L.cardCount(s.players[0]), 4);
  assert.strictEqual(s.phase, 'discard');
  run(s, { t: 'discard', p: 2, cards: { fuel: 5 } });
  assert.strictEqual(s.phase, 'pirate_move');
});

test('raid: pirate must go to a revealed sector, not a mothership, blocks it, steals one card', () => {
  const s = raidState(() => {});
  assert.strictEqual(s.phase, 'pirate_move');
  const hidden = s.sectors.findIndex((x) => !x.revealed);
  assert.ok(!L.apply(s, { t: 'move_pirate', sector: hidden }).ok);
  assert.ok(!L.apply(s, { t: 'move_pirate', sector: s.players[1].mother }).ok);
  // put a victim's colony next to a revealed non-home sector
  const target = NBR[s.players[1].home].find((j) => s.sectors[j].type !== 'home');
  const v = L.SEC_VERTS[target].find((x) => L.siteFree(s, x));
  s.sites[v] = { p: 1, kind: 'colony' };
  give(s, 1, { fuel: 2 });
  const w = JSON.parse(JSON.stringify(s));
  run(w, { t: 'move_pirate', sector: target });
  assert.strictEqual(w.pirate, target);
  assert.strictEqual(w.phase, 'main');
  assert.strictEqual(w.players[1].res.fuel, 1);
  assert.strictEqual(w.players[0].res.fuel, 1);
  // two victims means a choice
  const x = JSON.parse(JSON.stringify(s));
  const v2 = L.SEC_VERTS[target].find((q) => L.siteFree(x, q) && !L.VERTS[q].nbrs.includes(v) && q !== v);
  if (v2 !== undefined) {
    x.sites[v2] = { p: 2, kind: 'colony' }; give(x, 2, { ore: 1 });
    run(x, { t: 'move_pirate', sector: target });
    assert.strictEqual(x.phase, 'pirate_steal');
    assert.ok(!L.apply(x, { t: 'steal', p: 0 }).ok);
    run(x, { t: 'steal', p: 2 });
    assert.strictEqual(x.players[2].res.ore, 0);
    assert.strictEqual(x.phase, 'main');
  }
  // shields stop the theft
  const y = JSON.parse(JSON.stringify(s)); y.players[1].fleet = 3;
  run(y, { t: 'move_pirate', sector: target });
  assert.strictEqual(y.players[1].res.fuel, 2);
});

test('bank trading rates: 4:1, broker 3:1, post 3:1 and 2:1 specialty, grand exchange 2:1', () => {
  const s = ready(3, 4);
  const p = s.players[0];
  assert.strictEqual(L.rateFor(s, 0, 'fuel'), 4);
  give(s, 0, { fuel: 5 });
  assert.ok(!L.apply(s, { t: 'bank', give: 'fuel', get: 'fuel' }).ok);
  run(s, { t: 'bank', give: 'fuel', get: 'ore' });
  assert.strictEqual(p.res.fuel, 1); assert.strictEqual(p.res.ore, 1);
  assert.ok(!L.apply(s, { t: 'bank', give: 'fuel', get: 'ore' }).ok);
  p.trade = 1; assert.strictEqual(L.rateFor(s, 0, 'fuel'), 3);
  p.trade = 0;
  s.sites[L.SEC_VERTS[p.home][0]] = { p: 0, kind: 'post', spec: 'ore' };
  assert.strictEqual(L.rateFor(s, 0, 'fuel'), 3);
  assert.strictEqual(L.rateFor(s, 0, 'ore'), 2);
  assert.strictEqual(L.rateFor(s, 1, 'ore'), 4);
  p.trade = 3; assert.strictEqual(L.rateFor(s, 0, 'fuel'), 2);
  give(s, 0, { tech: 4 });
  run(s, { t: 'bank', give: 'tech', get: 'water', n: 2 });
  assert.strictEqual(p.res.water, 2);
});

test('player trade: the computer answers by value and refuses leaders near victory', () => {
  const s = ready(3, 4);
  give(s, 0, { fuel: 2 });
  give(s, 1, { ore: 3 });
  give(s, 2, { ore: 3 });
  // human offers 2 fuel for 1 ore: surplus ore for the AI
  const r = L.apply(s, { t: 'ptrade', with: -1, give: { fuel: 2 }, get: { ore: 1 } });
  assert.ok(r.ok);
  if (r.accepted) { assert.strictEqual(s.players[0].res.ore, 1); assert.strictEqual(s.players[0].res.fuel, 0); }
  // lopsided: asking for far more than offered is refused
  const t = ready(3, 4);
  give(t, 0, { fuel: 1 }); give(t, 1, { ore: 3 });
  const r2 = L.apply(t, { t: 'ptrade', with: 1, give: { fuel: 1 }, get: { ore: 3 } });
  assert.ok(r2.ok && !r2.accepted);
  assert.strictEqual(t.players[0].res.fuel, 1);
  // invalid offers
  assert.ok(!L.apply(t, { t: 'ptrade', with: 1, give: { fuel: 5 }, get: { ore: 1 } }).ok);
  assert.ok(!L.apply(t, { t: 'ptrade', with: 1, give: { fuel: 1 }, get: { fuel: 1 } }).ok);
  // a leader about to win is refused
  const u = ready(3, 4);
  give(u, 0, { fuel: 3 }); give(u, 1, { ore: 3 });
  u.players[0].friends = [1, 2, 3, 4, 5, 6, 7, 8];
  const r3 = L.apply(u, { t: 'ptrade', with: 1, give: { fuel: 3 }, get: { ore: 1 } });
  assert.ok(r3.ok && !r3.accepted);
});

test('research tiers: costs, effects, completion', () => {
  const s = ready(3, 4);
  const p = s.players[0];
  assert.ok(!L.apply(s, { t: 'research', track: 'fleet' }).ok);
  give(s, 0, { ore: 1, tech: 1, fuel: 1 });
  run(s, { t: 'research', track: 'fleet' });
  assert.strictEqual(p.fleet, 1); assert.strictEqual(L.speedOf(p), 3);
  assert.deepStrictEqual(L.researchCost(s, 0, 'fleet'), L.RESEARCH.fleet[1]);
  give(s, 0, { ore: 2, tech: 1, carbon: 1 });
  run(s, { t: 'research', track: 'fleet' });
  give(s, 0, { ore: 2, tech: 2, fuel: 2 });
  run(s, { t: 'research', track: 'fleet' });
  assert.strictEqual(p.fleet, 3);
  assert.strictEqual(L.limitOf(p), 10);
  assert.strictEqual(L.researchCost(s, 0, 'fleet'), null);
  give(s, 0, { ore: 9, tech: 9, fuel: 9, carbon: 9, water: 9 });
  assert.ok(!L.apply(s, { t: 'research', track: 'fleet' }).ok);
  assert.strictEqual(L.vpBreakdown(s, 0).research, 1);
  // trade track: broker, convoys, exchange
  run(s, { t: 'research', track: 'trade' }); assert.strictEqual(L.rateFor(s, 0, 'fuel'), 3);
  run(s, { t: 'research', track: 'trade' });
  run(s, { t: 'research', track: 'trade' }); assert.strictEqual(L.rateFor(s, 0, 'fuel'), 2);
  assert.strictEqual(L.vpBreakdown(s, 0).research, 2);
});

test('alien missions: ship must be at the outpost, pays cargo, Friendship card gives 1 VP once', () => {
  const s = ready(3, 4);
  const p = s.players[0];
  const sec = farSector(s, 0);
  setType(s, sec, 'outpost');
  const sh = p.ships[0]; sh.at = sec;
  assert.ok(!L.apply(s, { t: 'mission', ship: 1 }).ok, 'no cargo');
  give(s, 0, { ore: 2, tech: 1, water: 1, fuel: 1 });
  const other = NBR[sec][0]; sh.at = other;
  assert.ok(!L.apply(s, { t: 'mission', ship: 1 }).ok, 'not at the outpost');
  sh.at = sec;
  const v0 = L.vp(s, 0);
  run(s, { t: 'mission', ship: 1 });
  assert.strictEqual(L.vp(s, 0), v0 + 1);
  assert.strictEqual(p.res.fuel, 1); assert.strictEqual(L.cardCount(p), 1);
  give(s, 0, { ore: 2, tech: 1, water: 1 });
  assert.ok(!L.apply(s, { t: 'mission', ship: 1 }).ok, 'once per outpost');
  // another player can still befriend the same outpost
  s.current = 1;
  s.players[1].ships[0].at = sec;
  give(s, 1, { ore: 2, tech: 1, water: 1 });
  run(s, { t: 'mission', ship: 1 });
  assert.strictEqual(L.vp(s, 1), 1);
  // Cargo holds (fleet 2) cuts one card
  const t = ready(3, 4);
  setType(t, sec, 'outpost');
  t.players[0].ships[0].at = sec; t.players[0].fleet = 2;
  assert.strictEqual(L.costSum(L.missionCost(t, 0, sec)), 3);
  give(t, 0, { ore: 1, tech: 1, water: 1 });
  run(t, { t: 'mission', ship: 1 });
  assert.strictEqual(t.players[0].friends.length, 1);
});

test('titles: Admiral and Trade Baron need a strict exceed, ties do not transfer', () => {
  const s = ready(4, 6);
  const ship = (id) => ({ id, at: 0, moves: 0, acted: true, boosts: 0 });
  // below the minimum nobody claims
  s.players[0].fleet = 1; L.updateTitles(s);
  assert.strictEqual(s.titles.admiral, -1);
  // player 0: 1 ship + tier 3 = 4 claims
  s.players[0].fleet = 3; L.updateTitles(s);
  assert.strictEqual(s.titles.admiral, 0);
  assert.strictEqual(L.vpBreakdown(s, 0).admiral, 2);
  // player 1 ties at 4: the holder keeps it
  s.players[1].fleet = 1; s.players[1].ships.push(ship(2), ship(3)); L.updateTitles(s);
  assert.strictEqual(L.fleetPower(s.players[1]), 4);
  assert.strictEqual(s.titles.admiral, 0, 'tie does not transfer');
  // player 1 exceeds: transfers
  s.players[1].fleet = 2; L.updateTitles(s);
  assert.strictEqual(s.titles.admiral, 1);
  // two challengers tying above the holder: nobody takes it
  s.players[2].fleet = 3; s.players[2].ships.push(ship(2), ship(3));
  s.players[3].fleet = 3; s.players[3].ships.push(ship(2), ship(3));
  L.updateTitles(s);
  assert.strictEqual(s.titles.admiral, 1, 'tied challengers do not take it');
  s.players[3].ships.pop(); L.updateTitles(s);
  assert.strictEqual(s.titles.admiral, 2);
  // baron: routes = posts + trade tier, min 3
  const t = ready(3, 6);
  t.players[0].trade = 2; L.updateTitles(t);
  assert.strictEqual(t.titles.baron, -1);
  t.sites[L.SEC_VERTS[t.players[0].home][0]] = { p: 0, kind: 'post', spec: 'fuel' };
  L.updateTitles(t);
  assert.strictEqual(L.routes(t.players[0], t, 0), 3);
  assert.strictEqual(t.titles.baron, 0);
  t.players[1].trade = 3; L.updateTitles(t);
  assert.strictEqual(t.titles.baron, 0, 'tie keeps holder');
  t.sites[L.SEC_VERTS[t.players[1].home][2]] = { p: 1, kind: 'post', spec: 'fuel' };
  L.updateTitles(t);
  assert.strictEqual(t.titles.baron, 1);
});

test('win: 10 VP on your own turn ends the game', () => {
  const s = ready(3, 6);
  s.players[0].friends = [1, 2, 3];
  let k = 0;
  for (let v = 0; v < N_VERT && k < 3; v++) if (L.siteFree(s, v)) { s.sites[v] = { p: 0, kind: 'starbase' }; k++; }
  assert.strictEqual(L.vp(s, 0), 9);
  assert.strictEqual(s.phase, 'main');
  give(s, 0, { fuel: 4 });
  run(s, { t: 'bank', give: 'fuel', get: 'ore' }); // any action re-checks; still 9
  assert.strictEqual(s.phase, 'main');
  give(s, 0, { ore: 1, tech: 1, fuel: 1 });
  run(s, { t: 'research', track: 'fleet' }); // fleet tier 1 only: 9 VP
  assert.strictEqual(s.phase, 'main');
  s.players[0].fleet = 2;
  give(s, 0, { ore: 2, tech: 2, fuel: 2 });
  run(s, { t: 'research', track: 'fleet' }); // tier 3: +1 VP = 10
  assert.strictEqual(s.phase, 'gameover');
  assert.strictEqual(s.winner, 0);
  assert.ok(!L.apply(s, { t: 'end_turn' }).ok);
});

test('win: VP gained on someone else turn is claimed when your turn comes', () => {
  const s = ready(2, 6);
  s.players[1].friends = [1, 2, 3];
  let k = 0;
  for (let v = 0; v < N_VERT && k < 3; v++) if (L.siteFree(s, v)) { s.sites[v] = { p: 1, kind: 'starbase' }; k++; }
  s.players[1].fleet = 3; s.players[1].trade = 3; // 11 VP but it is player 0's turn
  run(s, { t: 'end_turn' });
  assert.strictEqual(s.current, 1);
  assert.strictEqual(s.phase, 'gameover');
  assert.strictEqual(s.winner, 1);
});

// ---------------------------------------------------------------- hidden information
function scramble(s, seed) {
  const w = JSON.parse(JSON.stringify(s));
  const r = L.tieRng(seed);
  const types = ['planet', 'asteroid', 'nebula', 'derelict', 'outpost', 'deep'];
  w.sectors.forEach((x) => {
    if (x.revealed || x.type === 'home') return;
    x.type = types[Math.floor(r() * types.length)];
    x.res = x.type === 'planet' ? RES[Math.floor(r() * 5)] : x.type === 'asteroid' ? 'ore' : x.type === 'nebula' ? 'fuel' : null;
    x.num = x.res ? 2 + Math.floor(r() * 11) : 0; if (x.num === 7) x.num = 8;
    x.loot = [RES[Math.floor(r() * 5)], RES[Math.floor(r() * 5)]];
    x.mission = { fuel: 4 };
  });
  return w;
}

test('no peeking: the computer picks the same action when only face-down sectors differ', () => {
  let compared = 0, hiddenSeen = 0, differing = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = L.newGame({ players: 4, seed, ai: [true, true, true, true] });
    let steps = 0;
    while (s.phase !== 'gameover' && s.turn < 60 && steps++ < 6000) {
      const a = L.aiNextAction(s);
      if (steps % 3 === 0 || s.phase !== 'main') {
        const w = scramble(s, seed * 1000 + steps);
        if (w.sectors.some((x, i) => JSON.stringify(x) !== JSON.stringify(s.sectors[i]))) differing++;
        hiddenSeen += s.sectors.filter((x) => !x.revealed).length;
        assert.deepStrictEqual(L.aiNextAction(w), a, 'seed ' + seed + ' step ' + steps + ' phase ' + s.phase);
        compared++;
      }
      assert.ok(L.apply(s, a).ok);
      if (s.phase === 'main' || s.phase === 'roll') s.aiActs++;
    }
  }
  assert.ok(compared > 500, 'compared ' + compared);
  assert.ok(differing > 300, 'differing ' + differing);
  assert.ok(hiddenSeen > 5000);
});

test('no peeking: the pure AI never mutates the state', () => {
  const s = L.newGame({ players: 3, seed: 3, ai: [true, true, true] });
  for (let i = 0; i < 400 && s.phase !== 'gameover'; i++) {
    const before = JSON.stringify(s);
    const a = L.aiNextAction(s);
    assert.strictEqual(JSON.stringify(s), before);
    L.apply(s, a); if (s.phase === 'main') s.aiActs++;
  }
});

test('moving into a face-down sector does reveal it (the gamble is real)', () => {
  const s = ready(3, 5);
  const start = farSector(s, 0);
  cleanAround(s, start);
  const t = NBR[start][0];
  s.sectors[t].revealed = false; s.sectors[t].type = 'asteroid'; s.sectors[t].res = 'ore'; s.sectors[t].num = 5;
  const sh = s.players[0].ships[0]; sh.at = start; sh.moves = 2;
  // the planning cost of a face-down sector is 1 whatever it is
  assert.strictEqual(L.stepCost(s, t), 1);
  run(s, { t: 'move', ship: 1, to: t });
  assert.strictEqual(sh.moves, 0, 'it was an asteroid field: 2 moves');
  assert.ok(s.sectors[t].revealed);
});

test('state survives a JSON round trip mid-game and play continues identically', () => {
  const a = L.newGame({ players: 4, seed: 42, ai: [true, true, true, true] });
  for (let i = 0; i < 250; i++) L.aiStep(a);
  const b = JSON.parse(JSON.stringify(a));
  assert.deepStrictEqual(a, b);
  for (let i = 0; i < 250; i++) { L.aiStep(a); L.aiStep(b); }
  assert.deepStrictEqual(a, b);
});

test('?seed reproduces galaxy, dice and AI play', () => {
  const play = (seed) => { const s = L.newGame({ players: 3, seed, ai: [true, true, true] }); for (let i = 0; i < 300; i++) L.aiStep(s); return JSON.stringify(s); };
  assert.strictEqual(play(77), play(77));
  assert.notStrictEqual(play(77), play(78));
});

// ---------------------------------------------------------------- AI play
test('AI legality: every AI action is accepted, over many seeded games', () => {
  let actions = 0, bad = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const n of [2, 3, 4]) {
      const s = L.newGame({ players: n, seed: seed * 7 + n, ai: [true, true, true, true] });
      let g = 0;
      while (s.phase !== 'gameover' && s.turn < 200 && g++ < 20000) {
        const r = L.aiStep(s);
        assert.ok(r, 'AI had no action in phase ' + s.phase);
        actions++;
        if (!r.ok) { bad++; assert.fail('illegal AI action ' + JSON.stringify(r.action) + ': ' + r.error); }
        // invariants
        s.players.forEach((p) => {
          RES.forEach((x) => assert.ok(p.res[x] >= 0));
          assert.ok(p.ships.length <= 3);
          p.ships.forEach((sh) => assert.ok(sh.moves >= 0 && sh.at >= 0 && sh.at < N_SEC));
        });
      }
    }
  }
  assert.strictEqual(bad, 0);
  assert.ok(actions > 5000);
});

test('AI finish rate: at least 95 percent of 3 and 4 player AI-only games finish within the turn cap', () => {
  const CAP = 400;
  const out = {};
  for (const n of [3, 4]) {
    let done = 0, total = 40, turns = 0;
    for (let seed = 1; seed <= total; seed++) {
      const s = L.newGame({ players: n, seed: 1000 + seed, ai: [true, true, true, true] });
      let g = 0;
      while (s.phase !== 'gameover' && s.turn <= CAP && g++ < 100000) L.aiStep(s);
      if (s.phase === 'gameover') { done++; turns += s.turn; assert.ok(L.vp(s, s.winner) >= 10); }
    }
    out[n] = { finished: done + '/' + total, avgTurns: Math.round(turns / Math.max(1, done)) };
    assert.ok(done / total >= 0.95, n + ' players: ' + done + '/' + total);
  }
  console.log('AI-only finish rate (turn cap ' + CAP + '): ' + JSON.stringify(out));
});

test('computer plays a full game against a stand-in human who only ends turns', () => {
  const s = L.newGame({ players: 4, seed: 5 });
  let g = 0;
  while (s.phase !== 'gameover' && s.turn < 500 && g++ < 50000) {
    if (s.phase === 'setup' && s.current === 0) { run(s, { t: 'setup_colony', v: L.SEC_VERTS[s.players[0].home].find((v) => L.siteFree(s, v)) }); continue; }
    if (s.current === 0 && s.phase === 'roll') { run(s, { t: 'roll' }); continue; }
    if (s.phase === 'discard' && s.discardQueue.some((q) => q.p === 0)) {
      const q = s.discardQueue.find((x) => x.p === 0); const c = {}; let left = q.n;
      RES.forEach((r) => { const k = Math.min(left, s.players[0].res[r]); if (k) { c[r] = k; left -= k; } });
      run(s, { t: 'discard', p: 0, cards: c }); continue;
    }
    if (s.current === 0 && s.phase === 'pirate_move') { run(s, { t: 'move_pirate', sector: L.pirateSectors(s)[0] }); continue; }
    if (s.current === 0 && s.phase === 'pirate_steal') { run(s, { t: 'steal', p: s.stealOptions[0] }); continue; }
    if (s.current === 0 && s.phase === 'main') { run(s, { t: 'end_turn' }); continue; }
    const r = L.aiStep(s);
    assert.ok(r && r.ok, JSON.stringify(r));
  }
  assert.strictEqual(s.phase, 'gameover');
  assert.notStrictEqual(s.winner, 0);
});

// ---------------------------------------------------------------- page contract
test('page contract: base href first, noindex, relative assets, no em dash, no network', () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  assert.ok(/<head>\s*<meta charset[^>]*>\s*<base href="\/play\/starship-catan\/"/.test(html));
  assert.ok(html.includes('name="robots" content="noindex'));
  assert.ok(html.includes('name="theme-color" content="#F3EDE3"'));
  assert.ok(html.includes('<title>Starship Catan</title>'));
  assert.ok(html.includes('House rules edition, inspired by the Catan family'));
  assert.ok(html.includes('href="/play/"'));
  assert.ok(!/<use\b/.test(html));
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (u === '/play/' || u === '/play/starship-catan/' || u.startsWith('#')) continue;
    assert.ok(!/^(https?:)?\/\//.test(u) && !u.startsWith('/'), 'asset must be relative: ' + u);
  }
  for (const f of fs.readdirSync(DIR)) {
    const txt = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.ok(!txt.includes('\u2014'), f + ' contains an em dash');
    if (f.endsWith('.js')) assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(txt), f + ' touches the network');
  }
  assert.ok(!fs.readFileSync(__filename, 'utf8').includes('\u2014'));
  const css = fs.readFileSync(path.join(DIR, 'style.css'), 'utf8');
  assert.ok(css.includes('/fonts/marcellus.woff2') && css.includes('/fonts/jost-400.woff2') && css.includes('/fonts/jost-500.woff2'));
  assert.ok(css.includes('prefers-reduced-motion'));
});
