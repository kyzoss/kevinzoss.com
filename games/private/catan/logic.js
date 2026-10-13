/* Settlers of Catan (base game) rules engine and computer opponents.
   Pure logic: no DOM, deterministic, state is a plain JSON object.
   Works via <script> (window.Catan) and require() in node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Catan = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const RES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
  const RES_NAME = { brick: 'Brick', lumber: 'Lumber', wool: 'Wool', grain: 'Grain', ore: 'Ore' };
  const TERRAIN_RES = { hill: 'brick', forest: 'lumber', pasture: 'wool', field: 'grain', mountain: 'ore', desert: null };
  const TERRAIN_LIST = [].concat(
    Array(4).fill('forest'), Array(4).fill('pasture'), Array(4).fill('field'),
    Array(3).fill('hill'), Array(3).fill('mountain'), ['desert']);
  const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const COST = {
    road: { brick: 1, lumber: 1 },
    settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
    city: { ore: 3, grain: 2 },
    dev: { ore: 1, wool: 1, grain: 1 },
  };
  const DEV_TYPES = ['knight', 'vp', 'road', 'plenty', 'monopoly'];
  const DEV_NAME = { knight: 'Knight', vp: 'Victory Point', road: 'Road Building', plenty: 'Year of Plenty', monopoly: 'Monopoly' };
  const WIN_VP = 10;
  const DEFAULT_NAMES = ['You', 'Ember', 'Tide', 'Moss'];

  // ---------------------------------------------------------------- PRNG (mulberry32, state kept in the game state)
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

  // ---------------------------------------------------------------- static board topology
  const SQ3 = Math.sqrt(3);
  const HEXES = [];
  for (let r = -2; r <= 2; r++) {
    for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
      HEXES.push({ q, r, x: SQ3 * (q + r / 2), y: 1.5 * r, verts: [], edges: [], nbrs: [] });
    }
  }
  const VERTS = [];
  const EDGES = [];
  (function buildTopology() {
    const vkey = new Map();
    const ekey = new Map();
    HEXES.forEach((h, hi) => {
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i - 30);
        const x = h.x + Math.cos(ang), y = h.y + Math.sin(ang);
        const k = Math.round(x * 100) + ',' + Math.round(y * 100);
        let id = vkey.get(k);
        if (id === undefined) {
          id = VERTS.length; vkey.set(k, id);
          VERTS.push({ x, y, hexes: [], nbrs: [], edges: [] });
        }
        h.verts.push(id);
        VERTS[id].hexes.push(hi);
      }
      for (let i = 0; i < 6; i++) {
        const a = h.verts[i], b = h.verts[(i + 1) % 6];
        const k = Math.min(a, b) + '-' + Math.max(a, b);
        let id = ekey.get(k);
        if (id === undefined) {
          id = EDGES.length; ekey.set(k, id);
          EDGES.push({ a, b, hexes: [] });
          VERTS[a].edges.push(id); VERTS[b].edges.push(id);
          VERTS[a].nbrs.push(b); VERTS[b].nbrs.push(a);
        }
        EDGES[id].hexes.push(hi);
        h.edges.push(id);
      }
    });
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    HEXES.forEach((h, hi) => {
      dirs.forEach(([dq, dr]) => {
        const j = HEXES.findIndex((o) => o.q === h.q + dq && o.r === h.r + dr);
        if (j >= 0) h.nbrs.push(j);
      });
    });
  })();
  function otherEnd(e, v) { return EDGES[e].a === v ? EDGES[e].b : EDGES[e].a; }

  // coastal edges in order around the board; ports sit on fixed slots
  const COAST = EDGES.map((e, i) => i).filter((i) => EDGES[i].hexes.length === 1).sort((i, j) => {
    const ang = (k) => Math.atan2((VERTS[EDGES[k].a].y + VERTS[EDGES[k].b].y) / 2, (VERTS[EDGES[k].a].x + VERTS[EDGES[k].b].x) / 2);
    return ang(i) - ang(j);
  });
  const PORT_SLOTS = [0, 3, 7, 10, 13, 17, 20, 23, 27];

  function pipsOf(n) { return n ? 6 - Math.abs(7 - n) : 0; }

  // ---------------------------------------------------------------- game creation
  function generateBoard(s) {
    let tries = 0;
    for (;;) {
      const terr = shuffle(TERRAIN_LIST.slice(), s);
      const nums = shuffle(NUMBERS.slice(), s);
      let ni = 0;
      const hexes = terr.map((t) => ({ terrain: t, num: t === 'desert' ? 0 : nums[ni++] }));
      let ok = true;
      for (let i = 0; i < hexes.length && ok; i++) {
        if (hexes[i].num !== 6 && hexes[i].num !== 8) continue;
        for (const j of HEXES[i].nbrs) if (hexes[j].num === 6 || hexes[j].num === 8) { ok = false; break; }
      }
      if (ok || ++tries > 500) return hexes;
    }
  }

  function newGame(opts) {
    opts = opts || {};
    const n = opts.players === 3 ? 3 : 4;
    const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    const s = { version: 1, seed, rs: seed, nPlayers: n };
    s.hexes = generateBoard(s);
    const types = shuffle(['any', 'any', 'any', 'any'].concat(RES), s);
    s.ports = PORT_SLOTS.map((slot, i) => {
      const e = COAST[slot];
      return { edge: e, a: EDGES[e].a, b: EDGES[e].b, type: types[i] };
    });
    s.portAt = Array(VERTS.length).fill(null);
    s.ports.forEach((p) => { s.portAt[p.a] = p.type; s.portAt[p.b] = p.type; });
    s.robber = s.hexes.findIndex((h) => h.terrain === 'desert');
    s.b = Array(VERTS.length).fill(null);
    s.roads = Array(EDGES.length).fill(-1);
    s.bank = {}; RES.forEach((r) => { s.bank[r] = 19; });
    s.devDeck = shuffle([].concat(Array(14).fill('knight'), Array(5).fill('vp'), Array(2).fill('road'), Array(2).fill('plenty'), Array(2).fill('monopoly')), s);
    const names = opts.names || DEFAULT_NAMES;
    s.players = [];
    for (let i = 0; i < n; i++) {
      const res = {}, dev = {}, nd = {};
      RES.forEach((r) => { res[r] = 0; });
      DEV_TYPES.forEach((d) => { dev[d] = 0; nd[d] = 0; });
      s.players.push({
        id: i, name: names[i] || ('Player ' + (i + 1)), ai: i !== 0,
        res, dev, newDev: nd, revealedVp: 0, knights: 0,
        roadsLeft: 15, settlementsLeft: 5, citiesLeft: 4,
      });
    }
    s.order = []; for (let i = 0; i < n; i++) s.order.push(i); for (let i = n - 1; i >= 0; i--) s.order.push(i);
    s.setup = { idx: 0, step: 'settlement', last: null };
    s.phase = 'setup';
    s.current = 0;
    s.turn = 0;
    s.dice = null;
    s.rolled = false;
    s.devPlayed = false;
    s.freeRoads = 0;
    s.afterRobber = 'main';
    s.discardQueue = [];
    s.stealFrom = [];
    s.longest = { owner: -1, len: 0 };
    s.army = { owner: -1, size: 0 };
    s.roadLen = Array(n).fill(0);
    s.winner = -1;
    s.turnActions = 0;
    s.lastDrawn = null;
    s.log = [];
    logMsg(s, 'Game start. Seed ' + seed + '. Place your first settlement.');
    return s;
  }

  function logMsg(s, msg) {
    // first person grammar for the human player named "You"
    msg = msg.replace(/^You (\w+)/, (m, w) => (w !== 'must' && /s$/.test(w) ? 'You ' + w.replace(/(ch|sh|ss|x)es$/, '$1').replace(/s$/, '') : m));
    s.log.push(msg);
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
  }
  const pname = (s, p) => s.players[p].name;

  // ---------------------------------------------------------------- helpers
  function handSize(pl) { let t = 0; RES.forEach((r) => { t += pl.res[r]; }); return t; }
  function canAfford(pl, cost) { return Object.keys(cost).every((r) => pl.res[r] >= cost[r]); }
  function pay(s, pl, cost) { Object.keys(cost).forEach((r) => { pl.res[r] -= cost[r]; s.bank[r] += cost[r]; }); }
  function counts(s, p) {
    let st = 0, ci = 0;
    s.b.forEach((b) => { if (b && b.p === p) { if (b.city) ci++; else st++; } });
    return { settlements: st, cities: ci };
  }
  function devCount(pl) { let t = 0; DEV_TYPES.forEach((d) => { t += pl.dev[d] + pl.newDev[d]; }); return t; }
  function hiddenVp(pl) { return pl.dev.vp + pl.newDev.vp; }
  function publicVP(s, p) {
    const c = counts(s, p);
    return c.settlements + 2 * c.cities + (s.longest.owner === p ? 2 : 0) + (s.army.owner === p ? 2 : 0) + s.players[p].revealedVp;
  }
  function totalVP(s, p) { return publicVP(s, p) + hiddenVp(s.players[p]); }

  // port rate for a player trading away a resource
  function ratio(s, p, res) {
    let best = 4;
    for (let v = 0; v < VERTS.length; v++) {
      const b = s.b[v];
      if (!b || b.p !== p) continue;
      const t = s.portAt[v];
      if (t === 'any') best = Math.min(best, 3);
      else if (t === res) best = Math.min(best, 2);
    }
    return best;
  }

  // ---------------------------------------------------------------- legality queries
  function distanceOk(s, v) { return !s.b[v] && VERTS[v].nbrs.every((n) => !s.b[n]); }
  function settlementSpots(s, p, setup) {
    const out = [];
    for (let v = 0; v < VERTS.length; v++) {
      if (!distanceOk(s, v)) continue;
      if (setup || VERTS[v].edges.some((e) => s.roads[e] === p)) out.push(v);
    }
    return out;
  }
  function roadConnects(s, p, e) {
    const ed = EDGES[e];
    return [ed.a, ed.b].some((v) => {
      const b = s.b[v];
      if (b) return b.p === p;
      return VERTS[v].edges.some((e2) => e2 !== e && s.roads[e2] === p);
    });
  }
  function roadSpots(s, p, fromVertex) {
    const out = [];
    if (fromVertex !== undefined && fromVertex !== null) {
      VERTS[fromVertex].edges.forEach((e) => { if (s.roads[e] === -1) out.push(e); });
      return out;
    }
    for (let e = 0; e < EDGES.length; e++) if (s.roads[e] === -1 && roadConnects(s, p, e)) out.push(e);
    return out;
  }
  function cityVertices(s, p) {
    const out = [];
    for (let v = 0; v < VERTS.length; v++) if (s.b[v] && s.b[v].p === p && !s.b[v].city) out.push(v);
    return out;
  }

  // ---------------------------------------------------------------- longest road
  function longestRoad(s, p) {
    const own = [];
    for (let e = 0; e < EDGES.length; e++) if (s.roads[e] === p) own.push(e);
    if (!own.length) return 0;
    const at = {};
    own.forEach((e) => {
      [EDGES[e].a, EDGES[e].b].forEach((v) => { (at[v] = at[v] || []).push(e); });
    });
    const used = {};
    let best = 0;
    function dfs(v, len, start) {
      if (len > best) best = len;
      if (!start && s.b[v] && s.b[v].p !== p) return; // an opponent settlement cuts the road
      const list = at[v] || [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (used[e]) continue;
        used[e] = true;
        dfs(otherEnd(e, v), len + 1, false);
        used[e] = false;
      }
    }
    Object.keys(at).forEach((v) => dfs(+v, 0, true));
    return best;
  }

  function recomputeLongest(s) {
    const lens = s.players.map((pl) => longestRoad(s, pl.id));
    s.roadLen = lens;
    const max = Math.max.apply(null, lens);
    const prev = s.longest.owner;
    let owner = -1;
    if (max >= 5) {
      if (prev >= 0 && lens[prev] === max) owner = prev;
      else {
        const c = [];
        lens.forEach((l, i) => { if (l === max) c.push(i); });
        owner = c.length === 1 ? c[0] : -1;
      }
    }
    if (owner !== prev) {
      if (owner >= 0) logMsg(s, pname(s, owner) + ' takes Longest Road (' + max + ').');
      else if (prev >= 0) logMsg(s, pname(s, prev) + ' loses Longest Road.');
    }
    s.longest = { owner, len: owner >= 0 ? max : 0 };
  }

  function checkWin(s) {
    if (s.phase === 'setup' || s.phase === 'gameover') return;
    if (totalVP(s, s.current) >= WIN_VP) {
      s.winner = s.current;
      s.phase = 'gameover';
      logMsg(s, pname(s, s.current) + ' wins with ' + totalVP(s, s.current) + ' victory points!');
    }
  }

  // ---------------------------------------------------------------- dice and distribution
  function distribute(s, n) {
    const owed = s.players.map(() => ({}));
    HEXES.forEach((h, hi) => {
      const hx = s.hexes[hi];
      if (hx.num !== n || hi === s.robber) return;
      const res = TERRAIN_RES[hx.terrain];
      h.verts.forEach((v) => {
        const b = s.b[v];
        if (b) owed[b.p][res] = (owed[b.p][res] || 0) + (b.city ? 2 : 1);
      });
    });
    const got = s.players.map(() => ({}));
    RES.forEach((r) => {
      let total = 0, claimants = 0, who = -1;
      owed.forEach((o, p) => { if (o[r]) { total += o[r]; claimants++; who = p; } });
      if (!total) return;
      if (total <= s.bank[r]) {
        owed.forEach((o, p) => { if (o[r]) { s.players[p].res[r] += o[r]; s.bank[r] -= o[r]; got[p][r] = o[r]; } });
      } else if (claimants === 1) {
        const g = s.bank[r];
        if (g > 0) { s.players[who].res[r] += g; s.bank[r] = 0; got[who][r] = g; }
        logMsg(s, 'Bank is short of ' + RES_NAME[r] + '; ' + pname(s, who) + ' gets what is left.');
      } else {
        logMsg(s, 'Bank is short of ' + RES_NAME[r] + '; nobody receives it.');
      }
    });
    return got;
  }
  function fmtRes(o) {
    const parts = [];
    RES.forEach((r) => { if (o[r]) parts.push(o[r] + ' ' + RES_NAME[r]); });
    return parts.join(', ');
  }

  // ---------------------------------------------------------------- actions
  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const err = (m) => ({ ok: false, error: m });

  function robberVictims(s, hex) {
    const set = [];
    HEXES[hex].verts.forEach((v) => {
      const b = s.b[v];
      if (b && b.p !== s.current && handSize(s.players[b.p]) > 0 && set.indexOf(b.p) < 0) set.push(b.p);
    });
    return set;
  }
  function doSteal(s, from) {
    const victim = s.players[from], me = s.players[s.current];
    const total = handSize(victim);
    let k = rint(s, total), res = null;
    for (const r of RES) { if (k < victim.res[r]) { res = r; break; } k -= victim.res[r]; }
    victim.res[res]--; me.res[res]++;
    logMsg(s, pname(s, s.current) + ' steals a card from ' + pname(s, from) + '.');
    s.lastSteal = { by: s.current, from, res };
    s.phase = s.afterRobber;
    s.stealFrom = [];
  }
  function checkArmy(s) {
    const pl = s.players[s.current];
    if (pl.knights >= 3 && pl.knights > s.army.size) {
      if (s.army.owner !== s.current) logMsg(s, pname(s, s.current) + ' takes Largest Army (' + pl.knights + ' knights).');
      s.army = { owner: s.current, size: pl.knights };
    }
  }
  function startRobber(s, after) {
    s.afterRobber = after;
    s.phase = 'robber';
  }
  function mainPhase(s) { return s.phase === 'main' && s.freeRoads === 0; }

  const ACTIONS = {
    setup_settlement(s, a) {
      if (s.phase !== 'setup' || s.setup.step !== 'settlement') return err('Not placing a settlement now.');
      if (!settlementSpots(s, s.current, true).includes(a.v)) return err('Illegal settlement spot.');
      const pl = s.players[s.current];
      s.b[a.v] = { p: s.current, city: false };
      pl.settlementsLeft--;
      s.setup.last = a.v; s.setup.step = 'road';
      logMsg(s, pname(s, s.current) + ' places a settlement.');
      if (s.setup.idx >= s.nPlayers) {
        const got = {};
        VERTS[a.v].hexes.forEach((h) => {
          const r = TERRAIN_RES[s.hexes[h].terrain];
          if (r && s.bank[r] > 0) { pl.res[r]++; s.bank[r]--; got[r] = (got[r] || 0) + 1; }
        });
        if (Object.keys(got).length) logMsg(s, pname(s, s.current) + ' collects ' + fmtRes(got) + '.');
      }
      return ok();
    },
    setup_road(s, a) {
      if (s.phase !== 'setup' || s.setup.step !== 'road') return err('Not placing a road now.');
      if (!roadSpots(s, s.current, s.setup.last).includes(a.e)) return err('Road must touch your new settlement.');
      s.roads[a.e] = s.current;
      s.players[s.current].roadsLeft--;
      logMsg(s, pname(s, s.current) + ' places a road.');
      s.setup.idx++; s.setup.step = 'settlement'; s.setup.last = null;
      if (s.setup.idx >= s.order.length) {
        s.phase = 'roll'; s.current = 0; s.turn = 1;
        logMsg(s, 'Setup done. ' + pname(s, 0) + ' rolls first.');
      } else s.current = s.order[s.setup.idx];
      recomputeLongest(s);
      return ok();
    },
    roll(s) {
      if (s.phase !== 'roll') return err('Cannot roll now.');
      const d1 = 1 + rint(s, 6), d2 = 1 + rint(s, 6), sum = d1 + d2;
      s.dice = [d1, d2]; s.rolled = true;
      logMsg(s, pname(s, s.current) + ' rolls ' + sum + ' (' + d1 + '+' + d2 + ').');
      if (sum === 7) {
        s.discardQueue = [];
        for (let k = 0; k < s.nPlayers; k++) {
          const p = (s.current + k) % s.nPlayers;
          const h = handSize(s.players[p]);
          if (h > 7) s.discardQueue.push({ p, n: Math.floor(h / 2) });
        }
        s.afterRobber = 'main';
        s.phase = s.discardQueue.length ? 'discard' : 'robber';
        if (s.phase === 'robber') logMsg(s, pname(s, s.current) + ' must move the robber.');
      } else {
        const got = distribute(s, sum);
        let any = false;
        got.forEach((g, p) => { if (Object.keys(g).length) { any = true; logMsg(s, pname(s, p) + ' gets ' + fmtRes(g) + '.'); } });
        if (!any) logMsg(s, 'No one collects anything.');
        s.phase = 'main';
      }
      return ok();
    },
    discard(s, a) {
      if (s.phase !== 'discard') return err('No discard needed.');
      const q = s.discardQueue.find((x) => x.p === a.p);
      if (!q) return err('That player does not discard.');
      const pl = s.players[a.p];
      let sum = 0;
      for (const r of RES) {
        const c = (a.res && a.res[r]) || 0;
        if (c < 0 || c > pl.res[r] || Math.floor(c) !== c) return err('Bad discard.');
        sum += c;
      }
      if (sum !== q.n) return err('Discard exactly ' + q.n + ' cards.');
      RES.forEach((r) => { const c = (a.res && a.res[r]) || 0; pl.res[r] -= c; s.bank[r] += c; });
      s.discardQueue = s.discardQueue.filter((x) => x !== q);
      logMsg(s, pname(s, a.p) + ' discards ' + q.n + ' cards.');
      if (!s.discardQueue.length) {
        s.phase = 'robber';
        logMsg(s, pname(s, s.current) + ' must move the robber.');
      }
      return ok();
    },
    move_robber(s, a) {
      if (s.phase !== 'robber') return err('Not moving the robber now.');
      if (!(a.hex >= 0 && a.hex < HEXES.length) || a.hex === s.robber) return err('Robber must move to a different hex.');
      s.robber = a.hex;
      logMsg(s, pname(s, s.current) + ' moves the robber to ' + hexLabel(s, a.hex) + '.');
      const vic = robberVictims(s, a.hex);
      if (vic.length === 0) s.phase = s.afterRobber;
      else if (vic.length === 1) doSteal(s, vic[0]);
      else { s.phase = 'steal'; s.stealFrom = vic; }
      return ok();
    },
    steal(s, a) {
      if (s.phase !== 'steal') return err('Not stealing now.');
      if (!s.stealFrom.includes(a.from)) return err('Cannot steal from that player.');
      doSteal(s, a.from);
      return ok();
    },
    build_road(s, a) {
      const free = s.freeRoads > 0;
      if (!free && !mainPhase(s)) return err('Cannot build now.');
      const pl = s.players[s.current];
      if (pl.roadsLeft <= 0) return err('No roads left.');
      if (!free && !canAfford(pl, COST.road)) return err('Not enough resources.');
      if (!roadSpots(s, s.current).includes(a.e)) return err('Illegal road spot.');
      if (free) { s.freeRoads--; } else pay(s, pl, COST.road);
      s.roads[a.e] = s.current; pl.roadsLeft--;
      logMsg(s, pname(s, s.current) + (free ? ' places a free road.' : ' builds a road.'));
      if (s.freeRoads > 0 && (pl.roadsLeft <= 0 || roadSpots(s, s.current).length === 0)) s.freeRoads = 0;
      recomputeLongest(s);
      return ok();
    },
    build_settlement(s, a) {
      if (!mainPhase(s)) return err('Cannot build now.');
      const pl = s.players[s.current];
      if (pl.settlementsLeft <= 0) return err('No settlements left.');
      if (!canAfford(pl, COST.settlement)) return err('Not enough resources.');
      if (!settlementSpots(s, s.current, false).includes(a.v)) return err('Illegal settlement spot.');
      pay(s, pl, COST.settlement);
      s.b[a.v] = { p: s.current, city: false }; pl.settlementsLeft--;
      logMsg(s, pname(s, s.current) + ' builds a settlement.');
      recomputeLongest(s);
      return ok();
    },
    build_city(s, a) {
      if (!mainPhase(s)) return err('Cannot build now.');
      const pl = s.players[s.current];
      if (pl.citiesLeft <= 0) return err('No cities left.');
      if (!canAfford(pl, COST.city)) return err('Not enough resources.');
      if (!cityVertices(s, s.current).includes(a.v)) return err('Pick one of your settlements.');
      pay(s, pl, COST.city);
      s.b[a.v].city = true; pl.citiesLeft--; pl.settlementsLeft++;
      logMsg(s, pname(s, s.current) + ' upgrades a settlement to a city.');
      return ok();
    },
    buy_dev(s) {
      if (!mainPhase(s)) return err('Cannot buy now.');
      const pl = s.players[s.current];
      if (!s.devDeck.length) return err('No development cards left.');
      if (!canAfford(pl, COST.dev)) return err('Not enough resources.');
      pay(s, pl, COST.dev);
      const t = s.devDeck.pop();
      pl.newDev[t]++;
      s.lastDrawn = { p: s.current, type: t };
      logMsg(s, pname(s, s.current) + ' buys a development card.');
      return ok({ card: t });
    },
    play_knight(s) {
      if (!(s.phase === 'roll' || mainPhase(s))) return err('Cannot play a card now.');
      const pl = s.players[s.current];
      if (s.devPlayed) return err('Only one development card per turn.');
      if (pl.dev.knight < 1) return err('No playable Knight.');
      pl.dev.knight--; pl.knights++; s.devPlayed = true;
      logMsg(s, pname(s, s.current) + ' plays a Knight.');
      checkArmy(s);
      startRobber(s, s.phase);
      return ok();
    },
    play_road_building(s) {
      if (!mainPhase(s)) return err('Play it after rolling.');
      const pl = s.players[s.current];
      if (s.devPlayed) return err('Only one development card per turn.');
      if (pl.dev.road < 1) return err('No playable Road Building card.');
      pl.dev.road--; s.devPlayed = true;
      logMsg(s, pname(s, s.current) + ' plays Road Building.');
      s.freeRoads = Math.min(2, pl.roadsLeft);
      if (s.freeRoads > 0 && roadSpots(s, s.current).length === 0) s.freeRoads = 0;
      return ok();
    },
    play_plenty(s, a) {
      if (!mainPhase(s)) return err('Play it after rolling.');
      const pl = s.players[s.current];
      if (s.devPlayed) return err('Only one development card per turn.');
      if (pl.dev.plenty < 1) return err('No playable Year of Plenty.');
      if (!RES.includes(a.a) || !RES.includes(a.b)) return err('Pick two resources.');
      const need = {}; need[a.a] = (need[a.a] || 0) + 1; need[a.b] = (need[a.b] || 0) + 1;
      if (Object.keys(need).some((r) => s.bank[r] < need[r])) return err('The bank does not have that.');
      pl.dev.plenty--; s.devPlayed = true;
      pl.res[a.a]++; pl.res[a.b]++; s.bank[a.a]--; s.bank[a.b]--;
      logMsg(s, pname(s, s.current) + ' plays Year of Plenty and takes ' + RES_NAME[a.a] + ' and ' + RES_NAME[a.b] + '.');
      return ok();
    },
    play_monopoly(s, a) {
      if (!mainPhase(s)) return err('Play it after rolling.');
      const pl = s.players[s.current];
      if (s.devPlayed) return err('Only one development card per turn.');
      if (pl.dev.monopoly < 1) return err('No playable Monopoly.');
      if (!RES.includes(a.res)) return err('Pick a resource.');
      pl.dev.monopoly--; s.devPlayed = true;
      let total = 0;
      s.players.forEach((o) => { if (o !== pl) { total += o.res[a.res]; pl.res[a.res] += o.res[a.res]; o.res[a.res] = 0; } });
      logMsg(s, pname(s, s.current) + ' plays Monopoly on ' + RES_NAME[a.res] + ' and collects ' + total + '.');
      return ok({ total });
    },
    play_vp(s) {
      if (s.phase === 'setup' || s.phase === 'gameover') return err('Not now.');
      const pl = s.players[s.current];
      if (hiddenVp(pl) < 1) return err('No Victory Point card.');
      if (pl.dev.vp > 0) pl.dev.vp--; else pl.newDev.vp--;
      pl.revealedVp++;
      logMsg(s, pname(s, s.current) + ' reveals a Victory Point card.');
      return ok();
    },
    bank_trade(s, a) {
      if (!mainPhase(s)) return err('Trade after rolling.');
      if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get) return err('Pick two different resources.');
      const pl = s.players[s.current];
      const rt = ratio(s, s.current, a.give);
      if (pl.res[a.give] < rt) return err('You need ' + rt + ' ' + RES_NAME[a.give] + '.');
      if (s.bank[a.get] < 1) return err('The bank is out of ' + RES_NAME[a.get] + '.');
      pl.res[a.give] -= rt; s.bank[a.give] += rt;
      pl.res[a.get]++; s.bank[a.get]--;
      logMsg(s, pname(s, s.current) + ' trades ' + rt + ' ' + RES_NAME[a.give] + ' for 1 ' + RES_NAME[a.get] + ' (' + rt + ':1).');
      return ok({ rate: rt });
    },
    player_trade(s, a) {
      if (!mainPhase(s)) return err('Trade after rolling.');
      if (!(a.with >= 0 && a.with < s.nPlayers) || a.with === s.current) return err('Pick another player.');
      const me = s.players[s.current], other = s.players[a.with];
      let gs = 0, ts = 0;
      for (const r of RES) {
        const g = (a.give && a.give[r]) || 0, t = (a.get && a.get[r]) || 0;
        if (g < 0 || t < 0 || Math.floor(g) !== g || Math.floor(t) !== t) return err('Bad amounts.');
        if (g > 0 && t > 0) return err('Cannot trade a resource for itself.');
        if (me.res[r] < g) return err('You do not have that.');
        if (other.res[r] < t) return err(other.name + ' does not have that.');
        gs += g; ts += t;
      }
      if (!gs || !ts) return err('Offer something and ask for something.');
      RES.forEach((r) => {
        const g = (a.give && a.give[r]) || 0, t = (a.get && a.get[r]) || 0;
        me.res[r] += t - g; other.res[r] += g - t;
      });
      logMsg(s, pname(s, s.current) + ' trades ' + fmtRes(a.give) + ' to ' + other.name + ' for ' + fmtRes(a.get) + '.');
      return ok();
    },
    end_turn(s) {
      if (!mainPhase(s)) return err('Cannot end the turn now.');
      const pl = s.players[s.current];
      DEV_TYPES.forEach((d) => { pl.dev[d] += pl.newDev[d]; pl.newDev[d] = 0; });
      s.devPlayed = false; s.rolled = false; s.dice = s.dice;
      s.current = (s.current + 1) % s.nPlayers;
      s.phase = 'roll'; s.turn++; s.turnActions = -1;
      return ok();
    },
  };

  function hexLabel(s, h) {
    const x = s.hexes[h];
    return x.terrain + (x.num ? ' ' + x.num : '');
  }

  function apply(s, a) {
    if (s.phase === 'gameover') return err('The game is over.');
    const fn = ACTIONS[a && a.t];
    if (!fn) return err('Unknown action.');
    const r = fn(s, a);
    if (r.ok) { s.turnActions++; checkWin(s); }
    return r;
  }

  // ================================================================= COMPUTER OPPONENTS
  function hexHas(s, v) { return VERTS[v].hexes.filter((h) => TERRAIN_RES[s.hexes[h].terrain]); }
  function resWeight(r) { return r === 'ore' || r === 'grain' ? 1.1 : r === 'wool' ? 0.9 : 1; }

  function producedPips(s, p) {
    const o = {}; RES.forEach((r) => { o[r] = 0; });
    s.b.forEach((b, v) => {
      if (!b || b.p !== p) return;
      VERTS[v].hexes.forEach((h) => {
        const r = TERRAIN_RES[s.hexes[h].terrain];
        if (r) o[r] += pipsOf(s.hexes[h].num) * (b.city ? 2 : 1);
      });
    });
    return o;
  }

  function vertexScore(s, p, v) {
    const mine = producedPips(s, p);
    let pips = 0;
    const kinds = {};
    VERTS[v].hexes.forEach((h) => {
      const r = TERRAIN_RES[s.hexes[h].terrain];
      if (!r) return;
      const pp = pipsOf(s.hexes[h].num);
      pips += pp * resWeight(r);
      kinds[r] = (kinds[r] || 0) + pp;
    });
    let sc = pips;
    const ks = Object.keys(kinds);
    sc += ks.length * 0.9;
    ks.forEach((r) => { if (mine[r] === 0) sc += 2.2; });
    const port = s.portAt[v];
    if (port === 'any') sc += 1.4;
    else if (port) sc += 0.8 + ((kinds[port] || 0) + mine[port]) * 0.3;
    return sc;
  }

  // cheapest way (in new roads) to reach each settlement spot from the player's network
  function expansion(s, p, startVertex) {
    const dist = Array(VERTS.length).fill(Infinity);
    const first = Array(VERTS.length).fill(-1);
    if (startVertex !== undefined && startVertex !== null) dist[startVertex] = 0;
    else {
      for (let v = 0; v < VERTS.length; v++) {
        if ((s.b[v] && s.b[v].p === p) || VERTS[v].edges.some((e) => s.roads[e] === p)) dist[v] = 0;
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let v = 0; v < VERTS.length; v++) {
        if (dist[v] === Infinity) continue;
        if (s.b[v] && s.b[v].p !== p) continue; // cannot pass through an opponent
        for (const e of VERTS[v].edges) {
          const w = otherEnd(e, v);
          let c;
          if (s.roads[e] === p) c = 0; else if (s.roads[e] === -1) c = 1; else continue;
          if (dist[v] + c < dist[w]) {
            dist[w] = dist[v] + c;
            first[w] = c === 1 && first[v] === -1 ? e : first[v];
            changed = true;
          }
        }
      }
    }
    let best = null;
    const pl = s.players[p];
    for (let v = 0; v < VERTS.length; v++) {
      if (dist[v] === Infinity || dist[v] > Math.min(3, Math.max(pl.roadsLeft, 0)) || !distanceOk(s, v)) continue;
      if (startVertex !== undefined && startVertex !== null && v === startVertex) continue;
      const sc = vertexScore(s, p, v) - 1.8 * dist[v];
      if (!best || sc > best.score) best = { v, cost: dist[v], firstEdge: first[v], score: sc };
    }
    return best;
  }

  function bestLongestRoadSpot(s, p) {
    const spots = roadSpots(s, p);
    let best = null, bl = -1;
    spots.forEach((e) => {
      s.roads[e] = p;
      const l = longestRoad(s, p);
      const far = vertexScore(s, p, EDGES[e].a) + vertexScore(s, p, EDGES[e].b);
      s.roads[e] = -1;
      const sc = l * 100 + far * 0.01;
      if (sc > bl) { bl = sc; best = e; }
    });
    return best;
  }

  function robberHexScore(s, me, hex) {
    const hx = s.hexes[hex];
    if (hex === s.robber || !hx.num) return -1000;
    const maxVp = Math.max.apply(null, s.players.filter((x) => x.id !== me).map((x) => publicVP(s, x.id)));
    let sc = 0;
    HEXES[hex].verts.forEach((v) => {
      const b = s.b[v];
      if (!b) return;
      const val = pipsOf(hx.num) * (b.city ? 2 : 1);
      if (b.p === me) sc -= val * 2.5;
      else {
        sc += val * (1 + 0.18 * publicVP(s, b.p));
        if (publicVP(s, b.p) >= maxVp) sc += val * 0.6;
        if (handSize(s.players[b.p]) === 0) sc -= val * 0.6;
      }
    });
    return sc;
  }

  function missing(pl, cost) {
    let m = 0;
    Object.keys(cost).forEach((r) => { m += Math.max(0, cost[r] - pl.res[r]); });
    return m;
  }

  function aiGoal(s, p) {
    const pl = s.players[p];
    const exp = expansion(s, p);
    const opts = [];
    const c = counts(s, p);
    if (c.settlements > 0 && pl.citiesLeft > 0) opts.push({ g: 'city', cost: COST.city, bias: 2.2 });
    if (pl.settlementsLeft > 0 && exp && exp.cost === 0) opts.push({ g: 'settlement', cost: COST.settlement, bias: 2.4, exp });
    if (pl.roadsLeft > 0 && pl.settlementsLeft > 0 && exp && exp.cost > 0) opts.push({ g: 'road', cost: COST.road, bias: 0.3, exp });
    if (s.devDeck.length > 0) opts.push({ g: 'dev', cost: COST.dev, bias: 0.6 });
    if (!exp && pl.roadsLeft > 0 && s.roads.filter((x) => x === p).length < 13 && roadSpots(s, p).length) {
      opts.push({ g: 'road', cost: COST.road, bias: 0.1, chase: true });
    }
    let best = null;
    opts.forEach((o) => {
      o.missing = missing(pl, o.cost);
      o.score = o.missing - o.bias;
      if (!best || o.score < best.score) best = o;
    });
    return best;
  }

  function planBankTrade(s, p, goal) {
    const pl = s.players[p];
    const short = {}; let totalShort = 0;
    const surplus = {};
    RES.forEach((r) => {
      const need = goal ? (goal.cost[r] || 0) : 0;
      short[r] = Math.max(0, need - pl.res[r]);
      surplus[r] = Math.max(0, pl.res[r] - need);
      totalShort += short[r];
    });
    const hand = handSize(pl);
    let cap = 0;
    RES.forEach((r) => { cap += Math.floor(surplus[r] / ratio(s, p, r)); });
    if (totalShort === 0) return null;
    if (cap < totalShort && hand <= 7) return null;
    // choose what to buy: the resource we are most short of
    const want = RES.filter((r) => short[r] > 0).sort((x, y) => short[y] - short[x])[0];
    const give = RES.filter((r) => r !== want && surplus[r] >= ratio(s, p, r) && s.bank[want] > 0)
      .sort((x, y) => (surplus[y] / ratio(s, p, y)) - (surplus[x] / ratio(s, p, x)))[0];
    if (!give) return null;
    return { t: 'bank_trade', give, get: want };
  }

  function aiDiscard(s, p, n) {
    const pl = s.players[p];
    const goal = aiGoal(s, p);
    const have = Object.assign({}, pl.res);
    const out = {}; RES.forEach((r) => { out[r] = 0; });
    for (let i = 0; i < n; i++) {
      let pick = null, ps = -1e9;
      RES.forEach((r) => {
        if (have[r] <= 0) return;
        const need = goal ? (goal.cost[r] || 0) : 0;
        const sc = (have[r] - need) * 10 + have[r];
        if (sc > ps) { ps = sc; pick = r; }
      });
      have[pick]--; out[pick]++;
    }
    return out;
  }

  function pickBest(s, list, scoreFn) {
    let best = null, bs = -Infinity;
    list.forEach((x) => {
      const sc = scoreFn(x) + rnd(s) * 0.05;
      if (sc > bs) { bs = sc; best = x; }
    });
    return best;
  }

  function aiMonopolyChoice(s, p) {
    const pl = s.players[p];
    const goal = aiGoal(s, p);
    let best = null, bs = -1;
    RES.forEach((r) => {
      const need = goal ? Math.max(0, (goal.cost[r] || 0) - pl.res[r]) : 0;
      const sc = need * 3 + (r === 'ore' || r === 'grain' ? 1 : 0);
      if (sc > bs) { bs = sc; best = r; }
    });
    return best;
  }

  // Returns the next action for whoever must act and is a computer, or null if a human must act.
  function aiNextAction(s) {
    if (s.phase === 'gameover') return null;
    if (s.phase === 'discard') {
      const q = s.discardQueue[0];
      if (!q || !s.players[q.p].ai) return null;
      return { t: 'discard', p: q.p, res: aiDiscard(s, q.p, q.n) };
    }
    const p = s.current;
    const pl = s.players[p];
    if (!pl.ai) return null;
    if (s.turnActions > 40 && s.phase === 'main' && s.freeRoads === 0) return { t: 'end_turn' };

    if (s.phase === 'setup') {
      if (s.setup.step === 'settlement') {
        const spots = settlementSpots(s, p, true);
        const v = pickBest(s, spots, (x) => vertexScore(s, p, x));
        return { t: 'setup_settlement', v };
      }
      const last = s.setup.last;
      const exp = expansion(s, p, last);
      const spots = roadSpots(s, p, last);
      let e = exp && exp.firstEdge >= 0 && spots.includes(exp.firstEdge) ? exp.firstEdge : null;
      if (e === null) e = pickBest(s, spots, (x) => vertexScore(s, p, otherEnd(x, last)));
      return { t: 'setup_road', e };
    }
    if (s.phase === 'roll') {
      if (!s.devPlayed && pl.dev.knight > 0) {
        const mine = HEXES[s.robber].verts.some((v) => s.b[v] && s.b[v].p === p) && pipsOf(s.hexes[s.robber].num) >= 3;
        if (mine) return { t: 'play_knight' };
      }
      return { t: 'roll' };
    }
    if (s.phase === 'robber') {
      const hex = pickBest(s, HEXES.map((h, i) => i), (h) => robberHexScore(s, p, h));
      return { t: 'move_robber', hex };
    }
    if (s.phase === 'steal') {
      const from = pickBest(s, s.stealFrom, (x) => publicVP(s, x) * 10 + handSize(s.players[x]));
      return { t: 'steal', from };
    }
    if (s.phase !== 'main') return null;

    // free roads from Road Building
    if (s.freeRoads > 0) {
      const spots = roadSpots(s, p);
      const exp = expansion(s, p);
      if (exp && exp.firstEdge >= 0 && spots.includes(exp.firstEdge)) return { t: 'build_road', e: exp.firstEdge };
      const e = bestLongestRoadSpot(s, p);
      return { t: 'build_road', e: e === null ? spots[0] : e };
    }

    const goal = aiGoal(s, p);

    // development cards
    if (!s.devPlayed) {
      if (pl.dev.knight > 0) {
        const onMe = HEXES[s.robber].verts.some((v) => s.b[v] && s.b[v].p === p);
        const armyChase = pl.knights + 1 >= 3 && pl.knights + 1 > s.army.size;
        if (onMe || armyChase) return { t: 'play_knight' };
      }
      if (pl.dev.monopoly > 0 && goal && goal.missing > 0) return { t: 'play_monopoly', res: aiMonopolyChoice(s, p) };
      if (pl.dev.plenty > 0 && goal && goal.missing > 0 && goal.missing <= 4) {
        const need = [];
        RES.forEach((r) => { for (let i = 0; i < Math.max(0, (goal.cost[r] || 0) - pl.res[r]); i++) need.push(r); });
        const a = need[0], b = need[1] || need[0];
        const bn = {}; bn[a] = 1; bn[b] = (bn[b] || 0) + 1;
        if (Object.keys(bn).every((r) => s.bank[r] >= bn[r])) return { t: 'play_plenty', a, b };
      }
      if (pl.dev.road > 0 && pl.roadsLeft >= 2 && roadSpots(s, p).length >= 2) {
        const exp = expansion(s, p);
        if (exp && exp.cost >= 1) return { t: 'play_road_building' };
      }
    }

    if (goal && goal.missing === 0) {
      if (goal.g === 'city') {
        const v = pickBest(s, cityVertices(s, p), (x) => {
          let t = 0; VERTS[x].hexes.forEach((h) => { t += pipsOf(s.hexes[h].num) * resWeight(TERRAIN_RES[s.hexes[h].terrain]); }); return t;
        });
        return { t: 'build_city', v };
      }
      if (goal.g === 'settlement') return { t: 'build_settlement', v: goal.exp.v };
      if (goal.g === 'dev') return { t: 'buy_dev' };
      if (goal.g === 'road') {
        const spots = roadSpots(s, p);
        let e = goal.exp && goal.exp.firstEdge >= 0 && spots.includes(goal.exp.firstEdge) ? goal.exp.firstEdge : null;
        if (e === null) e = bestLongestRoadSpot(s, p);
        if (e !== null) return { t: 'build_road', e };
      }
    }
    const tr = planBankTrade(s, p, goal);
    if (tr) return tr;
    // hand too big and nothing to buy: do not hold more than 7 if a trade helps
    if (handSize(pl) > 7) {
      const t2 = planBankTrade(s, p, goal && goal.missing > 0 ? goal : { cost: COST.city });
      if (t2) return t2;
    }
    return { t: 'end_turn' };
  }

  // Would a computer player accept this offer from `offer.from`?
  // offer.give = what the proposer hands over, offer.get = what the proposer asks for.
  function aiRespondTrade(s, pid, offer) {
    const pl = s.players[pid];
    const goal = aiGoal(s, pid);
    let giveN = 0, getN = 0;
    for (const r of RES) {
      const out = offer.get[r] || 0; // leaves the computer player
      if (out > pl.res[r]) return { accept: false, reason: 'does not have that' };
      giveN += out;
      getN += offer.give[r] || 0;
    }
    if (!giveN || !getN) return { accept: false, reason: 'not a real offer' };
    if (totalVP(s, offer.from) >= 8 || publicVP(s, offer.from) >= 8) return { accept: false, reason: 'will not help the leader' };
    if (getN < giveN) return { accept: false, reason: 'unfair offer' };
    let helps = false;
    for (const r of RES) {
      const need = goal ? (goal.cost[r] || 0) : 0;
      const out = offer.get[r] || 0;
      if (out > 0 && pl.res[r] - out < need) return { accept: false, reason: 'needs those cards' };
      if ((offer.give[r] || 0) > 0 && pl.res[r] < need) helps = true;
    }
    if (!helps && getN <= giveN) return { accept: false, reason: 'no use for that' };
    return { accept: true };
  }

  return {
    RES, RES_NAME, TERRAIN_RES, COST, DEV_TYPES, DEV_NAME, WIN_VP, HEXES, VERTS, EDGES, COAST, PORT_SLOTS,
    rnd, shuffle, pipsOf, newGame, apply, generateBoard,
    handSize, canAfford, counts, devCount, hiddenVp, publicVP, totalVP, ratio, otherEnd,
    distanceOk, settlementSpots, roadSpots, roadConnects, cityVertices, longestRoad, recomputeLongest,
    robberVictims, expansion, vertexScore, aiNextAction, aiRespondTrade, aiGoal,
  };
});
