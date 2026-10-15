/* Starship Catan, house rules edition (original rules, inspired by the Catan family).
   Pure logic: no DOM, deterministic (mulberry32 state lives in the game state),
   the state is a plain JSON object. Works via <script> (window.StarshipLogic) and require(). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StarshipLogic = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ------------------------------------------------------------------ constants
  const RES = ['fuel', 'water', 'ore', 'carbon', 'tech'];
  const RES_NAME = { fuel: 'Fuel', water: 'Water', ore: 'Ore', carbon: 'Carbon', tech: 'Tech' };
  const RES_LET = { fuel: 'F', water: 'W', ore: 'O', carbon: 'C', tech: 'T' };
  const WIN_VP = 10;
  const BASE_SPEED = 2;
  const MAX_SHIPS = 3;
  const MAX_COLONIES = 5;
  const MAX_POSTS = 4;
  const MAX_BOOST = 2;
  const RAID_LIMIT = 7;
  const SHIELD_LIMIT = 10;
  const ADMIRAL_MIN = 4;
  const BARON_MIN = 3;
  const COST = {
    ship: { ore: 1, fuel: 1, tech: 1 },
    colony: { water: 1, carbon: 1, tech: 1, fuel: 1 },
    post: { water: 1, carbon: 1, fuel: 1 },
    starbase: { ore: 3, water: 2 },
    relocate: { fuel: 2, ore: 1 },
  };
  const RESEARCH = {
    fleet: [{ ore: 1, tech: 1, fuel: 1 }, { ore: 2, tech: 1, carbon: 1 }, { ore: 2, tech: 2, fuel: 2 }],
    trade: [{ tech: 1, carbon: 1, water: 1 }, { tech: 2, carbon: 1, water: 1 }, { tech: 2, carbon: 2, fuel: 1, water: 1 }],
  };
  const TIER_NAME = {
    fleet: ['Ion engines: ships fly 3 sectors', 'Cargo holds: missions cost 1 card less', 'Deflector shields: raid limit 10, never robbed, +1 VP'],
    trade: ['Broker licence: bank rate 3:1', 'Convoys: each trade post yields +1', 'Grand exchange: bank rate 2:1, +1 VP'],
  };
  const TYPE_NAME = { home: 'Homeworld', planet: 'Planet', asteroid: 'Asteroid field', nebula: 'Nebula', derelict: 'Derelict', outpost: 'Alien outpost', deep: 'Deep space', wreck: 'Stripped derelict' };
  const AI_NAMES = ['Nova', 'Kestrel', 'Lyra'];
  const SQ3 = Math.sqrt(3);

  // ------------------------------------------------------------------ PRNG
  function rnd(s) {
    s.rs = (s.rs + 0x6d2b79f5) | 0;
    let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(s, n) { return Math.floor(rnd(s) * n); }
  function shuffle(arr, s) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rint(s, i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // a throwaway generator for AI tie-breaks: never touches the game state
  function tieRng(seedNum) {
    const o = { rs: seedNum | 0 };
    return () => rnd(o);
  }

  // ------------------------------------------------------------------ geometry (fixed 37 sector galaxy)
  const RADIUS = 3;
  const SEC = [];
  const SEC_AT = {};
  for (let r = -RADIUS; r <= RADIUS; r++) {
    for (let q = -RADIUS; q <= RADIUS; q++) {
      if (Math.abs(q + r) <= RADIUS) {
        SEC_AT[q + ',' + r] = SEC.length;
        SEC.push({ q, r, x: SQ3 * (q + r / 2), y: 1.5 * r });
      }
    }
  }
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const NBR = SEC.map((h) => DIRS.map((d) => SEC_AT[(h.q + d[0]) + ',' + (h.r + d[1])]).filter((i) => i !== undefined));
  const VERTS = [];
  (function () {
    const key = {};
    SEC.forEach((h, i) => {
      const ring = [];
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 180) * (60 * k + 30);
        const x = h.x + Math.cos(a), y = h.y + Math.sin(a);
        const kk = Math.round(x * 100) + ',' + Math.round(y * 100);
        if (key[kk] === undefined) { key[kk] = VERTS.length; VERTS.push({ x, y, hexes: [], nbrs: [] }); }
        const v = key[kk];
        if (VERTS[v].hexes.indexOf(i) < 0) VERTS[v].hexes.push(i);
        ring.push(v);
      }
      for (let k = 0; k < 6; k++) {
        const a = ring[k], b = ring[(k + 1) % 6];
        if (VERTS[a].nbrs.indexOf(b) < 0) VERTS[a].nbrs.push(b);
        if (VERTS[b].nbrs.indexOf(a) < 0) VERTS[b].nbrs.push(a);
      }
    });
  })();
  const SEC_VERTS = SEC.map((h, i) => VERTS.map((v, vi) => (v.hexes.indexOf(i) >= 0 ? vi : -1)).filter((x) => x >= 0));
  const CORNERS = [[0, 3], [-3, 3], [-3, 0], [0, -3], [3, -3], [3, 0]].map((c) => SEC_AT[c[0] + ',' + c[1]]);
  const HOME_SLOTS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };
  const N_SEC = SEC.length;
  const N_VERT = VERTS.length;

  function pipsOf(n) { return n ? 6 - Math.abs(7 - n) : 0; }

  // ------------------------------------------------------------------ generation
  function generateSectors(s, n) {
    const homeIdx = HOME_SLOTS[n].map((c) => CORNERS[c]);
    const homeRes = shuffle(['water', 'carbon', 'tech', 'water'], s).slice(0, n);
    const homeNums = shuffle([5, 6, 8, 9], s).slice(0, n);
    const pool = [];
    for (let i = 0; i < N_SEC; i++) if (homeIdx.indexOf(i) < 0) pool.push(i);
    const nPlanet = 11, nAst = 5, nNeb = 5, nDer = 3, nOut = 3;
    const types = [];
    for (let i = 0; i < nPlanet; i++) types.push('planet');
    for (let i = 0; i < nAst; i++) types.push('asteroid');
    for (let i = 0; i < nNeb; i++) types.push('nebula');
    for (let i = 0; i < nDer; i++) types.push('derelict');
    for (let i = 0; i < nOut; i++) types.push('outpost');
    while (types.length < pool.length) types.push('deep');
    const planetRes = [];
    for (let i = 0; i < nPlanet; i++) planetRes.push(['water', 'carbon', 'tech'][i % 3]);
    let layout = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const t = shuffle(types.slice(), s);
      let ok = true;
      homeIdx.forEach((h) => {
        let prod = 0, planets = 0;
        NBR[h].forEach((nb) => {
          const ty = t[pool.indexOf(nb)];
          if (ty === 'planet' || ty === 'asteroid' || ty === 'nebula') prod++;
          if (ty === 'planet') planets++;
        });
        if (prod < 2 || NBR[h].some((nb) => homeIdx.indexOf(nb) >= 0)) ok = false;
        if (planets < 1 && attempt < 40) ok = false;
      });
      layout = t;
      if (ok) break;
    }
    const secs = SEC.map(() => null);
    homeIdx.forEach((h, k) => { secs[h] = { type: 'home', res: homeRes[k], num: homeNums[k], home: k }; });
    const prs = shuffle(planetRes.slice(), s);
    pool.forEach((idx, k) => {
      const ty = layout[k];
      const o = { type: ty, res: null, num: 0, home: -1 };
      if (ty === 'planet') o.res = prs.pop();
      if (ty === 'asteroid') o.res = 'ore';
      if (ty === 'nebula') o.res = 'fuel';
      secs[idx] = o;
    });
    // number tokens
    const base = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    homeNums.forEach((hn) => { base.splice(base.indexOf(hn), 1); });
    const extras = shuffle([4, 5, 9, 10, 6, 8, 3, 11, 4, 10], s);
    const prodIdx = [];
    secs.forEach((x, i) => { if (x.res && x.type !== 'home') prodIdx.push(i); });
    let nums = base.concat(extras).slice(0, prodIdx.length);
    let best = null, bestBad = 1e9;
    for (let attempt = 0; attempt < 200; attempt++) {
      shuffle(nums, s);
      let bad = 0;
      prodIdx.forEach((i, a) => {
        if (nums[a] !== 6 && nums[a] !== 8) return;
        NBR[i].forEach((nb) => {
          const hk = secs[nb].type === 'home' ? secs[nb].num : (prodIdx.indexOf(nb) >= 0 ? nums[prodIdx.indexOf(nb)] : 0);
          if (hk === 6 || hk === 8) bad++;
        });
      });
      if (bad < bestBad) { bestBad = bad; best = nums.slice(); }
      if (bad === 0) break;
    }
    nums = best;
    prodIdx.forEach((i, a) => { secs[i].num = nums[a]; });
    secs.forEach((x, i) => {
      x.q = SEC[i].q; x.r = SEC[i].r; x.revealed = false;
      if (x.type === 'derelict') {
        x.loot = [RES[rint(s, 5)], RES[rint(s, 5)]];
        x.looted = false;
      }
      if (x.type === 'outpost') {
        const rs = shuffle(RES.slice(), s);
        x.mission = {};
        x.mission[rs[0]] = 2; x.mission[rs[1]] = 1; x.mission[rs[2]] = 1;
      }
    });
    return secs;
  }

  function blankPlayer(name, ai, home) {
    const res = {};
    RES.forEach((r) => { res[r] = 0; });
    return { name, ai, res, ships: [{ id: 1, at: home, moves: 0, acted: true, boosts: 0 }], nextShip: 2, mother: home, fleet: 0, trade: 0, friends: [], relocated: false, home };
  }

  function newGame(opts) {
    opts = opts || {};
    const n = Math.max(2, Math.min(4, opts.players || 4));
    const seed = (opts.seed === undefined ? 1 : opts.seed) | 0;
    const s = { version: 1, seed, rs: seed, nPlayers: n };
    rnd(s); rnd(s);
    s.sectors = generateSectors(s, n);
    const homes = [];
    s.sectors.forEach((x, i) => { if (x.type === 'home') homes[x.home] = i; });
    const aiFlags = opts.ai || [false, true, true, true];
    s.players = [];
    for (let i = 0; i < n; i++) s.players.push(blankPlayer(i === 0 ? 'You' : AI_NAMES[i - 1], !!aiFlags[i], homes[i]));
    s.sites = new Array(N_VERT).fill(null);
    s.pirate = -1;
    s.titles = { admiral: -1, baron: -1 };
    s.dice = null;
    s.phase = 'setup';
    s.setup = { order: [], idx: 0 };
    for (let i = 0; i < n; i++) s.setup.order.push(i);
    for (let i = n - 1; i >= 0; i--) s.setup.order.push(i);
    s.current = s.setup.order[0];
    s.turn = 0;
    s.discardQueue = [];
    s.stealOptions = [];
    s.winner = -1;
    s.aiActs = 0;
    s.lastGain = null;
    s.log = ['Welcome to Starship Catan. Place your first colony on your homeworld.'];
    s.players.forEach((p) => revealAround(s, p.home));
    return s;
  }

  // ------------------------------------------------------------------ small helpers
  function revealAround(s, i) {
    s.sectors[i].revealed = true;
    NBR[i].forEach((j) => { s.sectors[j].revealed = true; });
  }
  function cardCount(p) { return RES.reduce((a, r) => a + p.res[r], 0); }
  function canAfford(p, cost) { return Object.keys(cost).every((r) => p.res[r] >= cost[r]); }
  function pay(p, cost) { Object.keys(cost).forEach((r) => { p.res[r] -= cost[r]; }); }
  function gain(p, cost) { Object.keys(cost).forEach((r) => { p.res[r] += cost[r]; }); }
  function costSum(c) { return Object.keys(c).reduce((a, r) => a + c[r], 0); }
  function log(s, m) { s.log.push(m); if (s.log.length > 220) s.log.splice(0, s.log.length - 200); }
  function pname(s, i) { return s.players[i].name; }
  function secName(s, i) {
    const x = s.sectors[i];
    return x.revealed ? TYPE_NAME[x.type === 'derelict' && x.looted ? 'wreck' : x.type] + ' (' + SEC[i].q + ',' + SEC[i].r + ')' : 'unknown sector (' + SEC[i].q + ',' + SEC[i].r + ')';
  }
  // the only way the AI looks at a sector: face-down sectors tell nothing
  function vis(s, i) { const x = s.sectors[i]; return x.revealed ? x : null; }
  function isProducer(x) { return !!(x && x.res && x.num); }
  function sectorDist(a, b) {
    const A = SEC[a], B = SEC[b];
    return Math.max(Math.abs(A.q - B.q), Math.abs(A.r - B.r), Math.abs((A.q + A.r) - (B.q + B.r)));
  }
  function speedOf(p) { return BASE_SPEED + (p.fleet >= 1 ? 1 : 0); }
  function limitOf(p) { return p.fleet >= 3 ? SHIELD_LIMIT : RAID_LIMIT; }
  function ownSites(s, pi) {
    const out = [];
    s.sites.forEach((b, v) => { if (b && b.p === pi) out.push(v); });
    return out;
  }
  function counts(s, pi) {
    let colonies = 0, starbases = 0, posts = 0;
    s.sites.forEach((b) => {
      if (!b || b.p !== pi) return;
      if (b.kind === 'colony') colonies++; else if (b.kind === 'starbase') starbases++; else posts++;
    });
    return { colonies, starbases, posts, pieces: colonies + starbases };
  }

  // ------------------------------------------------------------------ scoring, titles
  function fleetPower(p) { return p.ships.length + p.fleet; }
  function routes(p, s, pi) { return counts(s, pi).posts + p.trade; }
  function updateTitles(s) {
    const pick = (key, score, min) => {
      const sc = s.players.map((p, i) => score(p, i));
      const hold = s.titles[key];
      const holdVal = hold >= 0 ? sc[hold] : min - 1;
      let top = -1, topVal = holdVal, tie = false;
      sc.forEach((v, i) => {
        if (i === hold) return;
        if (v > topVal) { top = i; topVal = v; tie = false; } else if (v === topVal && top >= 0) tie = true;
      });
      if (top >= 0 && !tie && topVal >= min) {
        s.titles[key] = top;
        log(s, pname(s, top) + (key === 'admiral' ? ' is now the Admiral (+2 VP)' : ' is now the Trade Baron (+2 VP)') + '.');
      }
    };
    pick('admiral', (p) => fleetPower(p), ADMIRAL_MIN);
    pick('baron', (p, i) => routes(p, s, i), BARON_MIN);
  }
  function vpBreakdown(s, pi) {
    const p = s.players[pi];
    const c = counts(s, pi);
    return {
      colonies: c.colonies, starbases: c.starbases * 2, friends: p.friends.length,
      research: (p.fleet >= 3 ? 1 : 0) + (p.trade >= 3 ? 1 : 0),
      admiral: s.titles.admiral === pi ? 2 : 0, baron: s.titles.baron === pi ? 2 : 0,
    };
  }
  function vp(s, pi) {
    const b = vpBreakdown(s, pi);
    return b.colonies + b.starbases + b.friends + b.research + b.admiral + b.baron;
  }
  function checkWin(s) {
    if (s.phase === 'gameover' || s.phase === 'setup') return;
    if (vp(s, s.current) >= WIN_VP) {
      s.phase = 'gameover'; s.winner = s.current;
      log(s, pname(s, s.current) + ' reaches ' + vp(s, s.current) + ' VP and wins the game!');
    }
  }

  // ------------------------------------------------------------------ trading rates
  function ownsPost(s, pi) { return s.sites.some((b) => b && b.p === pi && b.kind === 'post'); }
  function rateFor(s, pi, res) {
    const p = s.players[pi];
    let rate = 4;
    if (p.trade >= 1) rate = 3;
    if (ownsPost(s, pi)) rate = Math.min(rate, 3);
    if (s.sites.some((b) => b && b.p === pi && b.kind === 'post' && b.spec === res)) rate = Math.min(rate, 2);
    if (p.trade >= 3) rate = Math.min(rate, 2);
    return rate;
  }

  // ------------------------------------------------------------------ movement
  function stepCost(s, to) {
    const x = s.sectors[to];
    return 1 + (x.revealed && x.type === 'asteroid' ? 1 : 0) + (s.pirate === to ? 1 : 0);
  }
  function findShip(p, id) { return p.ships.find((x) => x.id === id) || null; }
  // best remaining moves per sector (-1 unreachable); face-down sectors are assumed to cost 1
  function reach(s, ship) {
    const rem = new Array(N_SEC).fill(-1), prev = new Array(N_SEC).fill(-1);
    rem[ship.at] = ship.moves;
    const queue = [ship.at];
    while (queue.length) {
      queue.sort((a, b) => rem[b] - rem[a]);
      const u = queue.shift();
      if (rem[u] < 1) continue;
      NBR[u].forEach((v) => {
        const nr = Math.max(0, rem[u] - stepCost(s, v));
        if (nr > rem[v] && v !== ship.at) { rem[v] = nr; prev[v] = u; queue.push(v); }
      });
    }
    return { rem, prev };
  }
  function pathTo(r, to) {
    const out = [];
    let c = to;
    while (c >= 0 && r.prev[c] >= 0) { out.unshift(c); c = r.prev[c]; }
    return out;
  }
  // full-cost distances ignoring the move budget (planning)
  function distMap(s, from) {
    const dist = new Array(N_SEC).fill(1e9), prev = new Array(N_SEC).fill(-1);
    dist[from] = 0;
    const q = [from];
    while (q.length) {
      q.sort((a, b) => dist[b] - dist[a]);
      const u = q.pop();
      NBR[u].forEach((v) => {
        const d = dist[u] + stepCost(s, v);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; q.push(v); }
      });
    }
    return { dist, prev };
  }

  // ------------------------------------------------------------------ building rules
  function siteFree(s, v) {
    if (s.sites[v]) return false;
    return VERTS[v].nbrs.every((w) => !s.sites[w]);
  }
  function touchesPlanet(s, v) {
    return VERTS[v].hexes.some((h) => { const x = vis(s, h); return x && (x.type === 'planet' || x.type === 'home'); });
  }
  function builderShips(s, pi, v) {
    const p = s.players[pi];
    return p.ships.filter((sh) => !sh.acted && VERTS[v].hexes.indexOf(sh.at) >= 0);
  }
  // legal colony / trade post vertices for a player in the main phase
  function sitesFor(s, pi, kind) {
    const c = counts(s, pi);
    if (kind === 'colony' && c.pieces >= MAX_COLONIES) return [];
    if (kind === 'post' && c.posts >= MAX_POSTS) return [];
    const out = [];
    for (let v = 0; v < N_VERT; v++) {
      if (siteFree(s, v) && touchesPlanet(s, v) && builderShips(s, pi, v).length) out.push(v);
    }
    return out;
  }
  function postSpecs(s, v) {
    const out = [];
    VERTS[v].hexes.forEach((h) => { const x = vis(s, h); if (x && x.res && out.indexOf(x.res) < 0) out.push(x.res); });
    return out;
  }
  function upgradeSites(s, pi) {
    return ownSites(s, pi).filter((v) => s.sites[v].kind === 'colony');
  }
  function missionCost(s, pi, sec) {
    const p = s.players[pi];
    const c = Object.assign({}, s.sectors[sec].mission);
    if (p.fleet >= 2) {
      const top = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
      c[top]--; if (c[top] <= 0) delete c[top];
    }
    return c;
  }
  function researchCost(s, pi, track) {
    const t = s.players[pi][track];
    return t >= 3 ? null : RESEARCH[track][t];
  }
  function missionAvailable(s, pi, ship) {
    const x = s.sectors[ship.at];
    return x.revealed && x.type === 'outpost' && s.players[pi].friends.indexOf(ship.at) < 0;
  }

  // ------------------------------------------------------------------ production
  function produce(s, sum) {
    const got = s.players.map(() => ({}));
    s.sites.forEach((b, v) => {
      if (!b) return;
      const pl = s.players[b.p];
      VERTS[v].hexes.forEach((h) => {
        const x = s.sectors[h];
        if (!isProducer(x) || x.num !== sum || s.pirate === h) return;
        let amt = b.kind === 'starbase' ? 2 : 1;
        if (b.kind === 'post' && pl.trade >= 2) amt = 2;
        pl.res[x.res] += amt;
        got[b.p][x.res] = (got[b.p][x.res] || 0) + amt;
      });
    });
    s.lastGain = got;
    got.forEach((g, i) => {
      const t = Object.keys(g);
      if (t.length) log(s, pname(s, i) + ' gains ' + t.map((r) => g[r] + ' ' + RES_NAME[r]).join(', ') + '.');
    });
    if (!got.some((g) => Object.keys(g).length)) log(s, 'Nobody produced anything.');
  }

  // ------------------------------------------------------------------ turn flow
  function beginTurn(s) {
    const p = s.players[s.current];
    p.ships.forEach((sh) => { sh.moves = speedOf(p); sh.acted = false; sh.boosts = 0; });
    p.relocated = false;
    s.phase = 'roll';
    s.dice = null;
    s.aiActs = 0;
    s.turn++;
    s.lastGain = null;
    checkWin(s);
  }
  function victimsAt(s, pi, sec) {
    const out = [];
    s.players.forEach((pl, i) => {
      if (i === pi || cardCount(pl) < 1 || pl.fleet >= 3) return;
      const near = s.sites.some((b, v) => b && b.p === i && VERTS[v].hexes.indexOf(sec) >= 0) || pl.ships.some((sh) => sh.at === sec);
      if (near) out.push(i);
    });
    return out;
  }
  function stealCard(s, thief, victim) {
    const v = s.players[victim];
    const pool = [];
    RES.forEach((r) => { for (let k = 0; k < v.res[r]; k++) pool.push(r); });
    if (!pool.length) return;
    const r = pool[rint(s, pool.length)];
    v.res[r]--; s.players[thief].res[r]++;
    log(s, pname(s, thief) + ' steals a card from ' + pname(s, victim) + '.');
    s.lastSteal = { thief, victim, res: r };
  }
  function pirateSectors(s) {
    const out = [];
    const motherSecs = s.players.map((p) => p.mother);
    for (let i = 0; i < N_SEC; i++) {
      if (!s.sectors[i].revealed || i === s.pirate || motherSecs.indexOf(i) >= 0) continue;
      out.push(i);
    }
    return out;
  }

  // ------------------------------------------------------------------ apply
  function err(m) { return { ok: false, error: m }; }
  const OK = { ok: true };

  function apply(s, a) {
    if (!a || !a.t) return err('Bad action.');
    if (s.phase === 'gameover') return err('The game is over.');
    const ph = s.phase;
    if (ph === 'setup') return applySetup(s, a);
    if (ph === 'discard') return applyDiscard(s, a);
    if (ph === 'roll') {
      if (a.t !== 'roll') return err('Roll the dice first.');
      return doRoll(s);
    }
    if (ph === 'pirate_move') {
      if (a.t !== 'move_pirate') return err('Move the pirate first.');
      if (pirateSectors(s).indexOf(a.sector) < 0) return err('The pirate cannot go there.');
      s.pirate = a.sector;
      log(s, pname(s, s.current) + ' sends the pirate to ' + secName(s, a.sector) + '.');
      const vs = victimsAt(s, s.current, a.sector);
      s.stealOptions = vs;
      if (vs.length === 0) s.phase = 'main';
      else if (vs.length === 1) { stealCard(s, s.current, vs[0]); s.stealOptions = []; s.phase = 'main'; }
      else s.phase = 'pirate_steal';
      return OK;
    }
    if (ph === 'pirate_steal') {
      if (a.t !== 'steal' || s.stealOptions.indexOf(a.p) < 0) return err('Pick a player next to the pirate.');
      stealCard(s, s.current, a.p);
      s.stealOptions = []; s.phase = 'main';
      return OK;
    }
    return applyMain(s, a);
  }

  function doRoll(s) {
    const d1 = 1 + rint(s, 6), d2 = 1 + rint(s, 6);
    s.dice = [d1, d2];
    const sum = d1 + d2;
    log(s, pname(s, s.current) + ' rolls ' + d1 + ' + ' + d2 + ' = ' + sum + '.');
    if (sum === 7) {
      log(s, 'Pirate raid! Anyone holding more than their limit discards half.');
      s.lastGain = null;
      s.discardQueue = [];
      s.players.forEach((pl, i) => {
        const n = cardCount(pl);
        if (n > limitOf(pl)) s.discardQueue.push({ p: i, n: Math.floor(n / 2) });
      });
      s.phase = s.discardQueue.length ? 'discard' : 'pirate_move';
    } else {
      produce(s, sum);
      s.phase = 'main';
    }
    return { ok: true, dice: s.dice };
  }

  function applyDiscard(s, a) {
    if (a.t !== 'discard') return err('Discard first.');
    const qi = s.discardQueue.findIndex((q) => q.p === a.p);
    if (qi < 0) return err('That player does not need to discard.');
    const q = s.discardQueue[qi], pl = s.players[a.p];
    const cards = a.cards || {};
    let tot = 0;
    for (const r of Object.keys(cards)) {
      if (RES.indexOf(r) < 0 || !(cards[r] >= 0) || cards[r] !== Math.floor(cards[r])) return err('Bad card list.');
      if (cards[r] > pl.res[r]) return err('You do not have those cards.');
      tot += cards[r];
    }
    if (tot !== q.n) return err('Discard exactly ' + q.n + ' cards.');
    pay(pl, cards);
    s.discardQueue.splice(qi, 1);
    log(s, pl.name + ' discards ' + q.n + ' cards.');
    if (!s.discardQueue.length) s.phase = 'pirate_move';
    return OK;
  }

  function applySetup(s, a) {
    if (a.t !== 'setup_colony') return err('Place a colony.');
    const pi = s.current, pl = s.players[pi];
    const v = a.v;
    if (!(v >= 0 && v < N_VERT)) return err('Bad site.');
    if (VERTS[v].hexes.indexOf(pl.home) < 0) return err('Your starting colonies go on your homeworld.');
    if (!siteFree(s, v)) return err('Too close to another colony.');
    s.sites[v] = { p: pi, kind: 'colony' };
    const second = s.setup.idx >= s.nPlayers;
    log(s, pl.name + ' founds a colony' + (second ? ' and collects starting supplies.' : '.'));
    if (second) {
      VERTS[v].hexes.forEach((h) => { const x = s.sectors[h]; if (isProducer(x)) pl.res[x.res]++; });
    }
    s.setup.idx++;
    if (s.setup.idx >= s.setup.order.length) {
      s.current = 0;
      s.setup = { order: s.setup.order, idx: s.setup.idx };
      beginTurn(s);
      log(s, 'Setup done. ' + pname(s, 0) + ' goes first.');
    } else {
      s.current = s.setup.order[s.setup.idx];
    }
    return OK;
  }

  function applyMain(s, a) {
    const pi = s.current, p = s.players[pi];
    switch (a.t) {
      case 'move': {
        const sh = findShip(p, a.ship);
        if (!sh) return err('No such ship.');
        if (sh.moves < 1) return err('That ship has no moves left. Boost it with 1 Fuel.');
        if (NBR[sh.at].indexOf(a.to) < 0) return err('Ships move one adjacent sector at a time.');
        const x = s.sectors[a.to];
        const was = x.revealed;
        sh.at = a.to;
        revealAround(s, a.to);
        const c = stepCost(s, a.to);
        sh.moves = Math.max(0, sh.moves - c);
        if (!was) log(s, pname(s, pi) + ' explores ' + secName(s, a.to) + '.');
        if (x.type === 'derelict' && !x.looted) {
          x.looted = true;
          x.loot.forEach((r) => { p.res[r]++; });
          log(s, pname(s, pi) + ' salvages a derelict: ' + x.loot.map((r) => RES_NAME[r]).join(' and ') + '.');
          s.salvage = { p: pi, loot: x.loot.slice() };
        }
        if (x.type === 'asteroid' && c > 1) log(s, pname(s, pi) + "'s ship threads an asteroid field.");
        break;
      }
      case 'boost': {
        const sh = findShip(p, a.ship);
        if (!sh) return err('No such ship.');
        if (sh.boosts >= MAX_BOOST) return err('A ship can be boosted twice per turn.');
        if (p.res.fuel < 1) return err('Boosting costs 1 Fuel.');
        p.res.fuel--; sh.moves++; sh.boosts++;
        break;
      }
      case 'colony':
      case 'post': {
        const kind = a.t;
        const v = a.v;
        if (!(v >= 0 && v < N_VERT)) return err('Bad site.');
        const c = counts(s, pi);
        if (kind === 'colony' && c.pieces >= MAX_COLONIES) return err('You have used all 5 colony pieces.');
        if (kind === 'post' && c.posts >= MAX_POSTS) return err('You have used all 4 trade posts.');
        if (!siteFree(s, v)) return err('That site is taken or too close to another colony or post.');
        if (!touchesPlanet(s, v)) return err('Sites must touch a revealed planet.');
        const bs = builderShips(s, pi, v);
        if (!bs.length) return err('One of your ships that has not built yet must be in a sector touching that site.');
        if (!canAfford(p, COST[kind])) return err('Not enough resources.');
        let spec = null;
        if (kind === 'post') {
          const specs = postSpecs(s, v);
          spec = a.spec || specs[0];
          if (specs.indexOf(spec) < 0) return err('Pick a resource produced next to the post.');
        }
        pay(p, COST[kind]);
        bs.sort((x, y) => x.moves - y.moves);
        bs[0].acted = true; bs[0].moves = 0;
        s.sites[v] = { p: pi, kind: kind === 'colony' ? 'colony' : 'post', spec };
        VERTS[v].hexes.forEach((h) => { revealAround(s, h); });
        log(s, pname(s, pi) + (kind === 'colony' ? ' founds a colony.' : ' opens a trade post (2:1 on ' + RES_NAME[spec] + ').'));
        updateTitles(s);
        break;
      }
      case 'upgrade': {
        const b = s.sites[a.v];
        if (!b || b.p !== pi || b.kind !== 'colony') return err('Pick one of your colonies.');
        if (!canAfford(p, COST.starbase)) return err('A starbase costs 3 Ore and 2 Water.');
        pay(p, COST.starbase);
        b.kind = 'starbase';
        log(s, pname(s, pi) + ' upgrades a colony to a starbase.');
        break;
      }
      case 'ship': {
        if (p.ships.length >= MAX_SHIPS) return err('You already have 3 ships.');
        if (!canAfford(p, COST.ship)) return err('A ship costs Ore, Fuel and Tech.');
        pay(p, COST.ship);
        p.ships.push({ id: p.nextShip++, at: p.mother, moves: 0, acted: true, boosts: 0 });
        log(s, pname(s, pi) + ' launches a new ship from the mothership.');
        updateTitles(s);
        break;
      }
      case 'relocate': {
        const sh = findShip(p, a.ship);
        if (!sh) return err('Pick a ship.');
        if (p.relocated) return err('The mothership already moved this turn.');
        if (sh.at === p.mother) return err('The mothership is already there.');
        if (!canAfford(p, COST.relocate)) return err('Relocating costs 2 Fuel and 1 Ore.');
        pay(p, COST.relocate);
        p.mother = sh.at; p.relocated = true;
        log(s, pname(s, pi) + ' relocates the mothership to ' + secName(s, sh.at) + '.');
        break;
      }
      case 'research': {
        if (a.track !== 'fleet' && a.track !== 'trade') return err('Pick Fleet or Trade.');
        const c = researchCost(s, pi, a.track);
        if (!c) return err('That track is complete.');
        if (!canAfford(p, c)) return err('Not enough resources.');
        pay(p, c);
        p[a.track]++;
        log(s, pname(s, pi) + ' completes ' + a.track + ' research tier ' + p[a.track] + '.');
        updateTitles(s);
        break;
      }
      case 'mission': {
        const sh = findShip(p, a.ship);
        if (!sh) return err('Pick a ship at an Alien outpost.');
        if (!missionAvailable(s, pi, sh)) return err('That ship is not at an outpost you have not befriended.');
        const c = missionCost(s, pi, sh.at);
        if (!canAfford(p, c)) return err('Not enough cargo for this mission.');
        pay(p, c);
        p.friends.push(sh.at);
        log(s, pname(s, pi) + ' delivers cargo and earns an alien Friendship card (+1 VP).');
        break;
      }
      case 'bank': {
        if (RES.indexOf(a.give) < 0 || RES.indexOf(a.get) < 0 || a.give === a.get) return err('Pick two different resources.');
        const n = a.n || 1;
        const rate = rateFor(s, pi, a.give);
        if (p.res[a.give] < rate * n) return err('You need ' + rate * n + ' ' + RES_NAME[a.give] + ' (rate ' + rate + ':1).');
        p.res[a.give] -= rate * n; p.res[a.get] += n;
        log(s, pname(s, pi) + ' trades ' + rate * n + ' ' + RES_NAME[a.give] + ' for ' + n + ' ' + RES_NAME[a.get] + '.');
        break;
      }
      case 'ptrade': return playerTrade(s, a);
      case 'end_turn': {
        s.current = (s.current + 1) % s.nPlayers;
        beginTurn(s);
        return OK;
      }
      default: return err('Unknown action.');
    }
    checkWin(s);
    return OK;
  }

  function playerTrade(s, a) {
    const pi = s.current, p = s.players[pi];
    const give = a.give || {}, get = a.get || {};
    if (!costSum(give) || !costSum(get)) return err('Offer something and ask for something.');
    for (const r of RES) {
      if ((give[r] || 0) > 0 && (get[r] || 0) > 0) return err('Do not offer and ask for the same resource.');
      if ((give[r] || 0) > p.res[r]) return err('You do not have those cards.');
    }
    const targets = a.with === undefined || a.with < 0 ? s.players.map((x, i) => i).filter((i) => i !== pi) : [a.with];
    for (const t of targets) {
      const o = s.players[t];
      if (!o || t === pi || !canAfford(o, get)) continue;
      if (o.ai ? aiAcceptsOffer(s, t, give, get) : true) {
        if (!o.ai) continue; // humans other than seat 0 are not supported here
        pay(p, give); gain(o, give); pay(o, get); gain(p, get);
        log(s, pname(s, t) + ' accepts a trade with ' + pname(s, pi) + '.');
        return { ok: true, accepted: true, by: t };
      }
    }
    log(s, 'Nobody accepts that offer.');
    return { ok: true, accepted: false };
  }

  // ------------------------------------------------------------------ AI
  // Everything below reads sectors through vis() only, and other players only by card count and public pieces.
  function aiGoalCosts(s, pi) {
    const p = s.players[pi], c = counts(s, pi);
    const goals = [];
    const open = aiOpenSites(s, pi);
    if (open.length && c.pieces < MAX_COLONIES) goals.push({ kind: 'colony', cost: COST.colony, score: 0.30 });
    p.ships.forEach((sh) => {
      if (missionAvailable(s, pi, sh)) goals.push({ kind: 'mission', cost: missionCost(s, pi, sh.at), score: 0.35, ship: sh.id });
    });
    if (upgradeSites(s, pi).length) goals.push({ kind: 'starbase', cost: COST.starbase, score: 0.22 });
    if (p.ships.length < 2) goals.push({ kind: 'ship', cost: COST.ship, score: 0.32 });
    else if (p.ships.length < MAX_SHIPS) goals.push({ kind: 'ship', cost: COST.ship, score: c.pieces >= 3 ? 0.15 : 0.08 });
    ['fleet', 'trade'].forEach((tr) => {
      const rc = researchCost(s, pi, tr);
      if (rc) goals.push({ kind: 'research', track: tr, cost: rc, score: p[tr] === 2 ? 0.2 : 0.12 + (tr === 'fleet' && p.fleet === 0 && p.ships.length > 1 ? 0.04 : 0) });
    });
    if (c.posts < 2 && c.pieces >= 2 && open.length) goals.push({ kind: 'post', cost: COST.post, score: 0.1 });
    goals.sort((a, b) => b.score - a.score);
    return goals;
  }
  function producedKinds(s, pi) {
    const out = {};
    s.sites.forEach((b, v) => {
      if (!b || b.p !== pi) return;
      VERTS[v].hexes.forEach((h) => { const x = vis(s, h); if (x && x.res) out[x.res] = true; });
    });
    return out;
  }
  function siteValue(s, v, pi, kinds) {
    let val = 0;
    const seen = {};
    VERTS[v].hexes.forEach((h) => {
      const x = vis(s, h);
      if (!x || !x.res) return;
      let w = pipsOf(x.num);
      if (s.pirate === h) w *= 0.3;
      val += w;
      if (!kinds[x.res] && !seen[x.res]) { val += 1.3; seen[x.res] = true; }
    });
    return val;
  }
  function aiOpenSites(s, pi) {
    const kinds = producedKinds(s, pi);
    const out = [];
    for (let v = 0; v < N_VERT; v++) {
      if (!siteFree(s, v) || !touchesPlanet(s, v)) continue;
      const val = siteValue(s, v, pi, kinds);
      if (val >= 3) out.push({ v, val });
    }
    return out;
  }
  function aiBestBuildSite(s, pi, kind) {
    const kinds = producedKinds(s, pi);
    let best = null, bv = -1;
    sitesFor(s, pi, kind).forEach((v) => {
      const val = siteValue(s, v, pi, kinds);
      if (val >= 3 && val > bv) { bv = val; best = v; }
    });
    return best;
  }
  function aiWanted(s, pi) {
    // resources the AI would like to hold: the cost of its top goals
    const goals = aiGoalCosts(s, pi);
    const w = {};
    RES.forEach((r) => { w[r] = 0; });
    goals.slice(0, 2).forEach((g, k) => { Object.keys(g.cost).forEach((r) => { w[r] = Math.max(w[r], g.cost[r]); }); void k; });
    return w;
  }
  function aiDiscard(s, q) {
    const pl = s.players[q.p];
    const want = aiWanted(s, q.p);
    const left = Object.assign({}, pl.res);
    const out = {};
    for (let i = 0; i < q.n; i++) {
      let bestR = null, bestScore = -1e9;
      RES.forEach((r) => {
        if (left[r] < 1) return;
        const sc = left[r] - want[r] * 1.5 + (r === 'fuel' ? -0.2 : 0);
        if (sc > bestScore) { bestScore = sc; bestR = r; }
      });
      left[bestR]--; out[bestR] = (out[bestR] || 0) + 1;
    }
    return { t: 'discard', p: q.p, cards: out };
  }
  function aiAcceptsOffer(s, ai, give, get) {
    // give: what the AI would receive; get: what the AI would hand over
    const pl = s.players[ai];
    const proposer = s.current;
    if (vp(s, proposer) >= 8 && vp(s, proposer) >= vp(s, ai)) return false;
    const want = aiWanted(s, ai);
    let recv = 0, cost = 0;
    RES.forEach((r) => {
      const g = give[r] || 0;
      for (let k = 0; k < g; k++) recv += (pl.res[r] + k < want[r]) ? 2.6 : 0.6;
      const t = get[r] || 0;
      for (let k = 0; k < t; k++) {
        const left = pl.res[r] - k - 1;
        cost += left < want[r] ? 3 : 0.9;
      }
    });
    return recv >= cost + 0.5 && costSum(give) >= costSum(get);
  }
  function aiPirateSector(s, pi) {
    const secs = pirateSectors(s);
    let best = secs[0], bv = -1e9;
    secs.forEach((i) => {
      let v = 0;
      s.sites.forEach((b, vx) => {
        if (!b || VERTS[vx].hexes.indexOf(i) < 0) return;
        const x = vis(s, i);
        const pips = x ? pipsOf(x.num) : 0;
        const amt = b.kind === 'starbase' ? 2 : 1;
        if (b.p === pi) v -= pips * amt * 1.8;
        else v += pips * amt * (1 + vp(s, b.p) / 6);
      });
      s.players.forEach((pl, j) => { if (j !== pi && pl.ships.some((sh) => sh.at === i)) v += 0.3; });
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }
  function aiShipPlan(s, pi, ship, claimed, dm) {
    const p = s.players[pi];
    const c = counts(s, pi);
    const kinds = producedKinds(s, pi);
    let best = { sector: ship.at, score: -1e9, why: 'stay' };
    const consider = (sector, score, why) => { if (score > best.score) best = { sector, score, why }; };
    if (c.pieces < MAX_COLONIES) {
      for (let v = 0; v < N_VERT; v++) {
        if (!siteFree(s, v) || !touchesPlanet(s, v)) continue;
        const val = siteValue(s, v, pi, kinds);
        if (val < 3) continue;
        let bt = -1, bd = 1e9;
        VERTS[v].hexes.forEach((h) => { if (dm.dist[h] < bd) { bd = dm.dist[h]; bt = h; } });
        if (bt < 0 || bd > 50) continue;
        consider(bt, val * 2.2 - bd * 1.5 - (claimed['v' + v] ? 8 : 0), 'site');
      }
    }
    for (let i = 0; i < N_SEC; i++) {
      const x = s.sectors[i];
      const d = dm.dist[i];
      if (d > 50) continue;
      if (!x.revealed) {
        const adj = NBR[i].some((j) => s.sectors[j].revealed);
        if (!adj) continue;
        const central = 3 - sectorDist(i, 18) * 0.7;
        consider(i, 4.5 + central - d * 1.2 - (claimed['s' + i] ? 5 : 0), 'explore');
      } else if (x.type === 'derelict' && !x.looted) {
        consider(i, 6.5 - d * 1.3 - (claimed['s' + i] ? 5 : 0), 'salvage');
      } else if (x.type === 'outpost' && p.friends.indexOf(i) < 0) {
        const cardsNow = cardCount(p);
        consider(i, (cardsNow >= 3 ? 7 : 3.5) - d * 1.2 - (claimed['s' + i] ? 4 : 0), 'mission');
      }
    }
    if (best.why === 'stay') best.score = 0;
    // do not wander away from a site we are standing next to when it is the best spot
    return best;
  }
  function aiMain(s, pi) {
    const p = s.players[pi];
    const c = counts(s, pi);
    const goals = aiGoalCosts(s, pi);
    // 1) completed missions, starbase, colony, ship, research, post
    const mi = p.ships.find((sh) => missionAvailable(s, pi, sh) && canAfford(p, missionCost(s, pi, sh.at)));
    if (mi) return { t: 'mission', ship: mi.id };
    const colV = c.pieces < MAX_COLONIES ? aiBestBuildSite(s, pi, 'colony') : null;
    if (colV !== null && canAfford(p, COST.colony)) return { t: 'colony', v: colV };
    if (canAfford(p, COST.starbase) && upgradeSites(s, pi).length && (colV === null || !goals.some((g) => g.kind === 'colony') || c.pieces >= MAX_COLONIES)) {
      let bv = upgradeSites(s, pi)[0], bs = -1;
      upgradeSites(s, pi).forEach((v) => {
        const sc = VERTS[v].hexes.reduce((a, h) => { const x = vis(s, h); return a + (x ? pipsOf(x.num) : 0); }, 0);
        if (sc > bs) { bs = sc; bv = v; }
      });
      return { t: 'upgrade', v: bv };
    }
    if (p.ships.length < 2 && canAfford(p, COST.ship)) return { t: 'ship' };
    const topCol = goals.find((g) => g.kind === 'colony');
    if (!(topCol && cardCount(p) - 3 < costSum(COST.colony))) {
      if (p.ships.length < MAX_SHIPS && canAfford(p, COST.ship) && (c.pieces >= 3 || cardCount(p) >= 8)) return { t: 'ship' };
      for (const tr of ['fleet', 'trade']) {
        const rc = researchCost(s, pi, tr);
        if (!rc || !canAfford(p, rc)) continue;
        const pri = tr === 'fleet' ? p.fleet <= p.trade : p.trade < p.fleet;
        if (pri || !researchCost(s, pi, tr === 'fleet' ? 'trade' : 'fleet')) return { t: 'research', track: tr };
      }
      if (c.posts < 2 && c.pieces >= 2 && canAfford(p, COST.post)) {
        const pv = aiBestBuildSite(s, pi, 'post');
        if (pv !== null) {
          const specs = postSpecs(s, pv);
          let spec = specs[0], sv = -1;
          specs.forEach((r) => { const k = RES.indexOf(r); const sc = (p.res[r] >= 2 ? 1 : 0) + (r === 'ore' ? 0.5 : 0) + k * 0.01; if (sc > sv) { sv = sc; spec = r; } });
          return { t: 'post', v: pv, spec };
        }
      }
    }
    // 2) fly ships
    const claimed = {};
    const plans = [];
    for (const sh of p.ships) {
      const dm = distMap(s, sh.at);
      const plan = aiShipPlan(s, pi, sh, claimed, dm);
      plans.push({ sh, plan, dm });
      if (plan.why === 'site') {
        const vv = bestVertexNear(s, pi, plan.sector);
        if (vv >= 0) claimed['v' + vv] = true;
      } else if (plan.why !== 'stay') claimed['s' + plan.sector] = true;
    }
    for (const it of plans) {
      const { sh, plan, dm } = it;
      if (plan.sector === sh.at) continue;
      if (sh.acted && sh.moves < 1) continue;
      if (sh.moves < 1) {
        const reserve = (goals[0] ? (goals[0].cost.fuel || 0) : 0) + 1;
        if (dm.dist[plan.sector] <= 2 && sh.boosts < MAX_BOOST && p.res.fuel > reserve) return { t: 'boost', ship: sh.id };
        continue;
      }
      // first step along the cheapest path
      let cur = plan.sector, step = -1;
      while (cur >= 0 && dm.prev[cur] >= 0) { if (dm.prev[cur] === sh.at) { step = cur; break; } cur = dm.prev[cur]; }
      if (step >= 0) return { t: 'move', ship: sh.id, to: step };
    }
    // 3) bank trades towards the best reachable goal, or to shed cards before a raid
    const tr = aiBankTrade(s, pi, goals);
    if (tr) return tr;
    return { t: 'end_turn' };
  }
  function bestVertexNear(s, pi, sec) {
    const kinds = producedKinds(s, pi);
    let best = -1, bv = -1;
    SEC_VERTS[sec].forEach((v) => {
      if (!siteFree(s, v) || !touchesPlanet(s, v)) return;
      const val = siteValue(s, v, pi, kinds);
      if (val > bv) { bv = val; best = v; }
    });
    return best;
  }
  function aiBankTrade(s, pi, goals) {
    const p = s.players[pi];
    const total = cardCount(p);
    for (const g of goals) {
      const need = {};
      let deficit = 0;
      RES.forEach((r) => { need[r] = Math.max(0, (g.cost[r] || 0) - p.res[r]); deficit += need[r]; });
      if (!deficit) continue;
      const tradable = [];
      RES.forEach((r) => {
        const spare = p.res[r] - (g.cost[r] || 0);
        const rate = rateFor(s, pi, r);
        if (spare >= rate) tradable.push({ r, spare, rate });
      });
      let canGet = 0;
      tradable.forEach((t) => { canGet += Math.floor(t.spare / t.rate); });
      if (canGet < deficit) continue;
      tradable.sort((a, b) => b.spare - a.spare);
      const want = RES.filter((r) => need[r] > 0).sort((a, b) => need[b] - need[a])[0];
      if (want && tradable.length) return { t: 'bank', give: tradable[0].r, get: want, n: 1 };
    }
    if (total >= 8) {
      const want = aiWanted(s, pi);
      let g = null, gs = -1;
      RES.forEach((r) => {
        const spare = p.res[r] - want[r];
        if (spare >= rateFor(s, pi, r) && spare > gs) { gs = spare; g = r; }
      });
      if (g) {
        const low = RES.filter((r) => r !== g).sort((a, b) => (p.res[a] - want[a]) - (p.res[b] - want[b]))[0];
        return { t: 'bank', give: g, get: low, n: 1 };
      }
    }
    return null;
  }
  function aiSetup(s, pi) {
    const pl = s.players[pi];
    const kinds = producedKinds(s, pi);
    let best = -1, bv = -1e9;
    SEC_VERTS[pl.home].forEach((v) => {
      if (!siteFree(s, v)) return;
      const val = siteValue(s, v, pi, kinds) + VERTS[v].hexes.length * 0.5;
      if (val > bv) { bv = val; best = v; }
    });
    return { t: 'setup_colony', v: best };
  }

  // The action the computer would take now, or null when a human has to act.
  // Pure: it never changes the state.
  function aiNextAction(s) {
    if (s.phase === 'gameover') return null;
    if (s.phase === 'discard') {
      const q = s.discardQueue.find((x) => s.players[x.p].ai);
      return q ? aiDiscard(s, q) : null;
    }
    const cur = s.players[s.current];
    if (!cur.ai) return null;
    switch (s.phase) {
      case 'setup': return aiSetup(s, s.current);
      case 'roll': return { t: 'roll' };
      case 'pirate_move': return { t: 'move_pirate', sector: aiPirateSector(s, s.current) };
      case 'pirate_steal': {
        const r = tieRng(s.rs + s.turn * 31);
        const opts = s.stealOptions.slice().sort((a, b) => (vp(s, b) - vp(s, a)) || (cardCount(s.players[b]) - cardCount(s.players[a])) || (r() - 0.5));
        return { t: 'steal', p: opts[0] };
      }
      case 'main':
        if (s.aiActs > 70) return { t: 'end_turn' };
        return aiMain(s, s.current);
      default: return null;
    }
  }

  // Run one computer action. Returns the apply result (used by the UI and by tests).
  function aiStep(s) {
    const a = aiNextAction(s);
    if (!a) return null;
    let r = apply(s, a);
    if (!r.ok) {
      if (s.phase === 'main') { r = apply(s, { t: 'end_turn' }); }
      return { ok: false, error: r.error, action: a };
    }
    if (s.phase === 'main' || s.phase === 'roll') s.aiActs++;
    return { ok: true, action: a };
  }

  return {
    RES, RES_NAME, RES_LET, WIN_VP, COST, RESEARCH, TIER_NAME, TYPE_NAME, BASE_SPEED, MAX_SHIPS, MAX_COLONIES, MAX_POSTS, MAX_BOOST,
    ADMIRAL_MIN, BARON_MIN, RAID_LIMIT, SHIELD_LIMIT,
    SEC, NBR, VERTS, SEC_VERTS, CORNERS, N_SEC, N_VERT, HOME_SLOTS,
    newGame, apply, aiNextAction, aiStep, aiAcceptsOffer, rnd, rint, tieRng,
    vp, vpBreakdown, fleetPower, routes, counts, cardCount, canAfford, rateFor, speedOf, limitOf, stepCost,
    reach, pathTo, distMap, siteFree, touchesPlanet, sitesFor, postSpecs, upgradeSites, builderShips, missionCost, missionAvailable,
    researchCost, victimsAt, pirateSectors, pipsOf, findShip, secName, vis, sectorDist, isProducer, updateTitles, ownSites, costSum,
  };
});
