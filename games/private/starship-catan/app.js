/* Starship Catan UI: canvas galaxy, HUD, save and resume, paced computer turns. */
(function () {
  'use strict';
  const C = window.StarshipLogic;
  const $ = (id) => document.getElementById(id);
  const RES = C.RES;
  const SEC = C.SEC, VERTS = C.VERTS, NBR = C.NBR;
  const RCOL = { fuel: '#F29A4B', water: '#5BB4E6', ore: '#C29C6E', carbon: '#A3A9B8', tech: '#C49BEE' };
  const PCOL = ['#4FD18B', '#FF7A59', '#5AA9FF', '#E8C440'];
  const SAVE_KEY = 'starship-catan.save.v1';
  const TALLY_KEY = 'starship-catan.tally.v1';
  const PREF_KEY = 'starship-catan.pref.v1';
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let G = null;
  const ui = { sel: null, mode: null, view: { z: 1, tx: 0, ty: 0 }, dirty: true, modal: null, busy: false, inspect: null, trade: null, pendingPost: null };
  let timer = null;
  let fast = false;
  const urlParams = new URLSearchParams(window.location.search);

  // ------------------------------------------------------------ storage (every access guarded)
  function store(op, key, val) {
    try {
      if (op === 'get') return window.localStorage.getItem(key);
      if (op === 'set') window.localStorage.setItem(key, val);
      if (op === 'del') window.localStorage.removeItem(key);
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function saveGame() {
    if (!G) return;
    if (G.phase === 'gameover') store('del', SAVE_KEY);
    else store('set', SAVE_KEY, JSON.stringify(G));
  }
  function loadSave() {
    const raw = store('get', SAVE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && s.players && s.sectors && s.sectors.length === C.N_SEC && s.phase !== 'gameover') return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function tally() {
    try { const t = JSON.parse(store('get', TALLY_KEY)); if (t && typeof t.wins === 'number') return t; } catch (e) { /* none */ }
    return { wins: 0, losses: 0 };
  }
  function recordResult() {
    if (!G || G.phase !== 'gameover' || G.tallied) return;
    G.tallied = true;
    const t = tally();
    if (G.winner === 0) t.wins++; else t.losses++;
    store('set', TALLY_KEY, JSON.stringify(t));
  }
  function loadPref() {
    try { const p = JSON.parse(store('get', PREF_KEY)); if (p) { fast = !!p.fast; return p; } } catch (e) { /* none */ }
    return {};
  }
  function savePref(p) { store('set', PREF_KEY, JSON.stringify(p)); }

  // ------------------------------------------------------------ helpers
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function chip(r, n) { return '<span class="lt r-' + r + '">' + C.RES_LET[r] + (n !== undefined ? n : '') + '</span>'; }
  function costHtml(cost) { return Object.keys(cost).map((r) => chip(r, cost[r] > 1 ? cost[r] : undefined)).join(''); }
  function costText(cost) { return Object.keys(cost).map((r) => cost[r] + ' ' + C.RES_NAME[r]).join(', '); }
  let toastT = null;
  function toast(msg) {
    const el = $('toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 3200);
  }
  const me = () => G.players[0];
  const myTurn = () => G.current === 0;
  const myMain = () => G && myTurn() && G.phase === 'main' && !ui.busy;
  function secLabel(i) {
    const x = G.sectors[i];
    if (!x.revealed) return 'Unexplored sector. Fly a ship in or next to it to turn it over.';
    const t = x.type === 'derelict' && x.looted ? 'wreck' : x.type;
    let s = '<b>' + C.TYPE_NAME[t] + '</b>';
    if (x.res && x.num) s += ': produces <b>' + C.RES_NAME[x.res] + '</b> on <b>' + x.num + '</b>';
    if (t === 'asteroid') s += ' (costs 2 moves to enter)';
    if (t === 'derelict') s += ': first ship in salvages 2 cards';
    if (t === 'wreck') s += ': already salvaged';
    if (t === 'outpost') {
      const done = me().friends.indexOf(i) >= 0;
      s += done ? ': you are friends' : ': deliver ' + costText(C.missionCost(G, 0, i)) + ' with a ship here for +1 VP';
    }
    if (t === 'deep') s += ': empty and safe';
    if (G.pirate === i) s += ' <b>Pirate here</b> (production blocked, +1 move to enter)';
    return s;
  }

  // ------------------------------------------------------------ game flow
  function startNew(opp, seed) {
    clearTimeout(timer);
    const n = Math.max(2, Math.min(4, opp + 1));
    G = C.newGame({ players: n, seed });
    ui.sel = null; ui.mode = null; ui.inspect = null; ui.busy = false;
    focusHome();
    saveGame();
    closeModal();
    render();
    pump();
  }
  function afterAction() {
    if (G.phase === 'gameover') recordResult();
    saveGame();
    render();
    pump();
  }
  function act(a) {
    const r = C.apply(G, a);
    if (!r.ok) { toast(r.error); render(); return r; }
    ui.mode = null;
    if (a.t === 'move' && G.salvage && G.salvage.p === 0) { toast('Salvaged ' + G.salvage.loot.map((x) => C.RES_NAME[x]).join(' and ') + '.'); G.salvage = null; }
    if (a.t === 'end_turn') { ui.sel = null; ui.inspect = null; }
    afterAction();
    return r;
  }
  function pump() {
    clearTimeout(timer);
    if (!G || G.phase === 'gameover' || ui.modal === 'start') return;
    const a = C.aiNextAction(G);
    if (!a) return;
    let d = a.t === 'roll' ? 800 : a.t === 'end_turn' ? 650 : a.t === 'move' ? 520 : G.phase === 'setup' ? 450 : 700;
    if (fast) d = Math.round(d * 0.4);
    else if (reduceMotion) d = Math.round(d * 0.7);
    timer = setTimeout(() => {
      const r = C.aiStep(G);
      if (r && !r.ok) console.error('AI action rejected', r.action, r.error);
      afterAction();
    }, d);
  }

  // ------------------------------------------------------------ targets on the galaxy
  function selShip() { return ui.sel ? C.findShip(me(), ui.sel) : null; }
  function targets() {
    if (!G || G.phase === 'gameover') return { kind: null, list: [] };
    if (G.phase === 'setup' && myTurn()) {
      return { kind: 'v', list: C.SEC_VERTS[me().home].filter((v) => C.siteFree(G, v)) };
    }
    if (!myTurn() || ui.busy) return { kind: null, list: [] };
    if (G.phase === 'pirate_move') return { kind: 'h', list: C.pirateSectors(G) };
    if (G.phase !== 'main') return { kind: null, list: [] };
    if (ui.mode === 'colony' || ui.mode === 'post') return { kind: 'v', list: C.sitesFor(G, 0, ui.mode) };
    if (ui.mode === 'starbase') return { kind: 'v', list: C.upgradeSites(G, 0) };
    const sh = selShip();
    if (sh && sh.moves > 0) {
      const r = C.reach(G, sh);
      const list = [];
      r.rem.forEach((m, i) => { if (m >= 0 && i !== sh.at) list.push(i); });
      return { kind: 'h', list, reach: r, move: true };
    }
    return { kind: null, list: [] };
  }
  function onVertex(id) {
    if (G.phase === 'setup') return act({ t: 'setup_colony', v: id });
    if (ui.mode === 'starbase') return act({ t: 'upgrade', v: id });
    if (ui.mode === 'colony') return act({ t: 'colony', v: id });
    if (ui.mode === 'post') {
      const specs = C.postSpecs(G, id);
      if (specs.length === 1) return act({ t: 'post', v: id, spec: specs[0] });
      ui.pendingPost = id; openPostSpec(specs);
    }
  }
  function moveAlong(path) {
    const sh = selShip();
    if (!sh || !path.length) return;
    const id = sh.id;
    ui.busy = true;
    let i = 0;
    const step = () => {
      const s2 = C.findShip(me(), id);
      if (i >= path.length || !s2 || s2.moves < 1 || G.phase !== 'main') { ui.busy = false; afterAction(); return; }
      const r = C.apply(G, { t: 'move', ship: id, to: path[i++] });
      if (!r.ok) { toast(r.error); ui.busy = false; afterAction(); return; }
      if (G.salvage && G.salvage.p === 0) { toast('Salvaged ' + G.salvage.loot.map((x) => C.RES_NAME[x]).join(' and ') + '.'); G.salvage = null; }
      saveGame(); render();
      if (reduceMotion || fast) step(); else setTimeout(step, 170);
    };
    step();
  }

  // ------------------------------------------------------------ canvas
  const cv = $('board');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, S = 30;
  const STARS = [];
  (function () { let x = 12345; const r = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; for (let i = 0; i < 110; i++) STARS.push({ x: r(), y: r(), r: 0.4 + r() * 1.2, a: 0.25 + r() * 0.6 }); })();
  function resize() {
    const r = $('galaxy').getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(100, Math.round(r.width)); H = Math.max(100, Math.round(r.height));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    S = Math.min(W / 12.6, H / 11.4);
    ui.dirty = true;
  }
  function fitView() { ui.view = { z: 1, tx: 0, ty: 0 }; ui.dirty = true; }
  function focusHome() {
    if (!G) return;
    const h = SEC[G.players[0].home];
    ui.view.z = 1.9;
    ui.view.tx = -h.x * S * ui.view.z; ui.view.ty = -h.y * S * ui.view.z;
    clampView(); ui.dirty = true;
  }
  const sx = (x) => W / 2 + x * S * ui.view.z + ui.view.tx;
  const sy = (y) => H / 2 + y * S * ui.view.z + ui.view.ty;
  function clampView() {
    const v = ui.view;
    v.z = Math.max(0.8, Math.min(4, v.z));
    const limX = 6.4 * S * v.z + W * 0.2 - W * 0.5 + 40, limY = 5.8 * S * v.z + H * 0.2 - H * 0.5 + 40;
    v.tx = Math.max(-Math.max(0, limX), Math.min(Math.max(0, limX), v.tx));
    v.ty = Math.max(-Math.max(0, limY), Math.min(Math.max(0, limY), v.ty));
  }
  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  function hexPts(i, shrink) {
    const c = SEC[i], k = S * ui.view.z * (shrink || 1);
    const out = [];
    for (let j = 0; j < 6; j++) { const a = Math.PI / 180 * (60 * j + 30); out.push([sx(c.x) + Math.cos(a) * k, sy(c.y) + Math.sin(a) * k]); }
    return out;
  }
  function font(px, w) { return (w || 500) + ' ' + Math.max(7, Math.round(px)) + 'px Jost, system-ui, sans-serif'; }

  function drawBackdrop(now) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#16204A'); g.addColorStop(1, '#070A1C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    STARS.forEach((s, i) => {
      const tw = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(now / 900 + i);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = '#EDE9FF';
      const px = (s.x * W + ui.view.tx * 0.08 + W * 4) % W, py = (s.y * H + ui.view.ty * 0.08 + H * 4) % H;
      ctx.beginPath(); ctx.arc(px, py, s.r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawSectorIcon(x, cx, cy, k, idx) {
    const t = x.type === 'derelict' && x.looted ? 'wreck' : x.type;
    const col = x.res ? RCOL[x.res] : '#9aa0b8';
    ctx.save();
    ctx.lineWidth = Math.max(1, k * 0.05);
    if (t === 'planet' || t === 'home') {
      ctx.beginPath(); ctx.arc(cx, cy - 0.1 * k, 0.4 * k, 0, 7); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.1 * k, 0.62 * k, 0.17 * k, -0.35, 0, 7); ctx.stroke();
      if (t === 'home') {
        const pl = G.players[x.home];
        ctx.strokeStyle = PCOL[x.home] || '#fff'; ctx.lineWidth = Math.max(2, k * 0.09);
        ctx.beginPath(); ctx.arc(cx, cy - 0.1 * k, 0.5 * k, 0, 7); ctx.stroke();
        void pl;
      }
    } else if (t === 'asteroid') {
      ctx.fillStyle = col;
      [[-0.32, -0.05, 0.22], [0.12, -0.28, 0.26], [0.28, 0.12, 0.2], [-0.05, 0.14, 0.17]].forEach((a) => {
        ctx.beginPath();
        for (let j = 0; j < 7; j++) { const ang = j * Math.PI * 2 / 7, rr = a[2] * k * (j % 2 ? 0.8 : 1.05); const px = cx + a[0] * k + Math.cos(ang) * rr, py = cy + a[1] * k + Math.sin(ang) * rr; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath(); ctx.fill();
      });
    } else if (t === 'nebula') {
      [[-0.25, 0.05, 0.3, 'rgba(242,154,75,.75)'], [0.2, -0.12, 0.34, 'rgba(231,120,170,.65)'], [0.15, 0.17, 0.27, 'rgba(160,120,230,.6)']].forEach((a) => {
        ctx.beginPath(); ctx.arc(cx + a[0] * k, cy + a[1] * k, a[2] * k, 0, 7); ctx.fillStyle = a[3]; ctx.fill();
      });
    } else if (t === 'derelict' || t === 'wreck') {
      ctx.globalAlpha = t === 'wreck' ? 0.4 : 1;
      ctx.strokeStyle = '#E8E4D8'; ctx.fillStyle = '#E8E4D8';
      poly([[cx - 0.45 * k, cy + 0.2 * k], [cx - 0.05 * k, cy - 0.35 * k], [cx + 0.05 * k, cy + 0.2 * k]]); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + 0.12 * k, cy - 0.3 * k); ctx.lineTo(cx + 0.25 * k, cy - 0.05 * k); ctx.lineTo(cx + 0.15 * k, cy + 0.05 * k); ctx.lineTo(cx + 0.45 * k, cy + 0.3 * k); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (t === 'outpost') {
      const done = G.players[0].friends.indexOf(idx) >= 0;
      ctx.strokeStyle = done ? '#7be0a2' : '#8CF0B0'; ctx.fillStyle = done ? '#7be0a2' : '#8CF0B0';
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.08 * k, 0.5 * k, 0.28 * k, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 0.08 * k, 0.15 * k, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy + 0.2 * k); ctx.lineTo(cx, cy + 0.42 * k); ctx.stroke();
      if (done) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, k * 0.08); ctx.beginPath(); ctx.moveTo(cx + 0.28 * k, cy - 0.38 * k); ctx.lineTo(cx + 0.38 * k, cy - 0.28 * k); ctx.lineTo(cx + 0.58 * k, cy - 0.52 * k); ctx.stroke(); }
    } else {
      ctx.fillStyle = 'rgba(180,190,230,.55)';
      [[-0.3, 0.1], [0.05, -0.2], [0.3, 0.15]].forEach((a) => { ctx.beginPath(); ctx.arc(cx + a[0] * k, cy + a[1] * k, 0.05 * k + 0.6, 0, 7); ctx.fill(); });
    }
    ctx.restore();
  }

  function drawSectors() {
    const k = S * ui.view.z;
    const sum = G.dice ? G.dice[0] + G.dice[1] : 0;
    for (let i = 0; i < C.N_SEC; i++) {
      const x = G.sectors[i];
      const pts = hexPts(i, 0.985);
      const cx = sx(SEC[i].x), cy = sy(SEC[i].y);
      if (cx < -2 * k || cx > W + 2 * k || cy < -2 * k || cy > H + 2 * k) continue;
      poly(pts);
      if (!x.revealed) {
        ctx.fillStyle = '#0f1534'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#2a3468'; ctx.stroke();
        ctx.fillStyle = 'rgba(150,160,220,.55)'; ctx.font = font(k * 0.55, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, cy);
        continue;
      }
      const tint = x.type === 'planet' || x.type === 'home' ? 'rgba(40,70,120,.55)' : x.type === 'asteroid' ? 'rgba(110,86,60,.45)' : x.type === 'nebula' ? 'rgba(110,50,110,.42)' : x.type === 'outpost' ? 'rgba(30,100,70,.45)' : x.type === 'derelict' ? 'rgba(80,80,100,.45)' : 'rgba(20,28,64,.6)';
      ctx.fillStyle = '#121a3f'; ctx.fill();
      ctx.fillStyle = tint; ctx.fill();
      const hot = sum && x.num === sum && sum !== 7;
      ctx.lineWidth = hot ? 3 : 1; ctx.strokeStyle = hot ? '#F6D36B' : '#34407a'; ctx.stroke();
      drawSectorIcon(x, cx, cy - 0.3 * k, k * 0.74, i);
      if (x.res) {
        ctx.fillStyle = '#10152e'; ctx.font = font(k * 0.34, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // letter badge in a pale disc, top left of the sector
        ctx.beginPath(); ctx.arc(cx - 0.55 * k, cy - 0.5 * k, 0.2 * k + 0.5, 0, 7); ctx.fillStyle = RCOL[x.res]; ctx.fill();
        ctx.fillStyle = '#10152e'; ctx.fillText(C.RES_LET[x.res], cx - 0.55 * k, cy - 0.5 * k + 0.5);
      }
      if (x.num) {
        const ty = cy + 0.58 * k;
        ctx.beginPath(); ctx.arc(cx, ty, 0.27 * k, 0, 7); ctx.fillStyle = '#F3EDE3'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#2B2622'; ctx.stroke();
        ctx.fillStyle = x.num === 6 || x.num === 8 ? '#C0391B' : '#2B2622';
        ctx.font = font(k * 0.34, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(x.num), cx, ty - 0.01 * k);
      }
      if (k > 60) {
        ctx.fillStyle = 'rgba(235,238,255,.85)'; ctx.font = font(k * 0.2, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const nm = x.type === 'derelict' && x.looted ? 'WRECK' : x.type === 'home' ? 'HOME' : x.type === 'asteroid' ? 'ASTEROIDS' : x.type === 'outpost' ? 'ALIEN OUTPOST' : x.type.toUpperCase();
        ctx.fillText(nm, cx, cy + 0.22 * k);
      }
      if (G.pirate === i) {
        poly(pts); ctx.fillStyle = 'rgba(200,40,40,.25)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#E04A3C'; ctx.stroke();
      }
    }
  }

  function drawPirate() {
    if (G.pirate < 0) return;
    const k = S * ui.view.z;
    const x = sx(SEC[G.pirate].x), y = sy(SEC[G.pirate].y) - 0.1 * k;
    ctx.save(); ctx.translate(x, y); ctx.scale(k * 0.55, k * 0.55);
    ctx.fillStyle = '#1a0f12'; ctx.strokeStyle = '#E04A3C'; ctx.lineWidth = 0.1;
    poly([[0, -0.9], [0.8, 0.5], [-0.8, 0.5]]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F3EDE3';
    ctx.beginPath(); ctx.arc(0, -0.05, 0.27, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a0f12'; ctx.beginPath(); ctx.arc(-0.1, -0.08, 0.06, 0, 7); ctx.arc(0.1, -0.08, 0.06, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawSites() {
    const k = S * ui.view.z;
    G.sites.forEach((b, v) => {
      if (!b) return;
      const x = sx(VERTS[v].x), y = sy(VERTS[v].y);
      const r = Math.max(7, 0.26 * k);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = PCOL[b.p]; ctx.strokeStyle = '#0B1026'; ctx.lineWidth = Math.max(1.5, r * 0.18);
      if (b.kind === 'colony') {
        poly([[-r * 0.85, r * 0.7], [r * 0.85, r * 0.7], [r * 0.85, -r * 0.1], [0, -r * 0.95], [-r * 0.85, -r * 0.1]]); ctx.fill(); ctx.stroke();
      } else if (b.kind === 'starbase') {
        const pts = [];
        for (let j = 0; j < 10; j++) { const a = Math.PI / 5 * j - Math.PI / 2, rr = j % 2 ? r * 0.62 : r * 1.25; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        poly(pts); ctx.fill(); ctx.stroke();
      } else {
        poly([[0, -r * 1.05], [r * 1.05, 0], [0, r * 1.05], [-r * 1.05, 0]]); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0B1026'; ctx.font = font(r * 1.15, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.spec ? C.RES_LET[b.spec] : 'T', 0, r * 0.06);
      }
      ctx.restore();
    });
  }

  function shipPos(sec, p, idx, total) {
    const k = S * ui.view.z;
    const cx = sx(SEC[sec].x), cy = sy(SEC[sec].y);
    const gap = Math.max(14, 0.42 * k);
    return { x: cx + (idx - (total - 1) / 2) * gap, y: cy + 0.1 * k };
  }
  // all ships by sector so overlapping ones fan out; own ships are listed first
  function shipLayout() {
    const bySec = {};
    G.players.forEach((pl, pi) => pl.ships.forEach((sh) => { (bySec[sh.at] = bySec[sh.at] || []).push({ pi, sh }); }));
    const out = [];
    Object.keys(bySec).forEach((sec) => {
      const list = bySec[sec].sort((a, b) => (a.pi === 0 ? -1 : 0) - (b.pi === 0 ? -1 : 0) || a.pi - b.pi);
      list.forEach((it, i) => { const pos = shipPos(+sec, it.pi, i, list.length); out.push({ pi: it.pi, sh: it.sh, x: pos.x, y: pos.y, sec: +sec }); });
    });
    return out;
  }
  function drawShips(lay, now) {
    const k = S * ui.view.z;
    const r = Math.max(9, 0.3 * k);
    lay.forEach((it) => {
      ctx.save(); ctx.translate(it.x, it.y);
      const spent = it.sh.moves < 1;
      ctx.globalAlpha = it.pi === 0 && !spent ? 1 : it.pi === 0 ? 0.7 : 0.85;
      if (it.pi === 0 && ui.sel === it.sh.id) {
        const pulse = reduceMotion ? 0 : (Math.sin(now / 240) + 1) / 2;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5 + pulse * 2, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.fillStyle = PCOL[it.pi]; ctx.strokeStyle = '#0B1026'; ctx.lineWidth = Math.max(1.5, r * 0.16);
      poly([[0, -r * 1.1], [r * 0.85, r * 0.85], [0, r * 0.45], [-r * 0.85, r * 0.85]]); ctx.fill(); ctx.stroke();
      if (it.pi === 0 && it.sh.moves > 0) {
        ctx.fillStyle = '#0B1026'; ctx.font = font(r * 0.9, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(it.sh.moves), 0, r * 0.25);
      }
      ctx.restore();
    });
  }
  function drawMothers() {
    const k = S * ui.view.z;
    const r = Math.max(7, 0.2 * k);
    G.players.forEach((pl, pi) => {
      const x = sx(SEC[pl.mother].x) - 0.55 * k + (pi % 2) * 0.2 * k, y = sy(SEC[pl.mother].y) + 0.12 * k + Math.floor(pi / 2) * 0.2 * k;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#0B1026'; ctx.strokeStyle = PCOL[pi]; ctx.lineWidth = Math.max(2, r * 0.3);
      const pts = []; for (let j = 0; j < 6; j++) { const a = Math.PI / 3 * j; pts.push([Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2]); }
      poly(pts); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PCOL[pi]; ctx.font = font(r * 1.3, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('M', 0, r * 0.08);
      ctx.restore();
    });
  }

  function drawTargets(t, now) {
    if (!t.kind) return;
    const k = S * ui.view.z;
    const pulse = reduceMotion ? 0.5 : (Math.sin(now / 260) + 1) / 2;
    if (t.kind === 'v') {
      t.list.forEach((id) => {
        const x = sx(VERTS[id].x), y = sy(VERTS[id].y);
        const r = Math.max(11, 0.3 * k) + pulse * 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = 'rgba(246,211,107,.32)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#F6D36B'; ctx.stroke();
        ctx.fillStyle = '#F6D36B'; ctx.font = font(r * 1.1, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', x, y + 1);
      });
    } else if (t.kind === 'h') {
      t.list.forEach((id) => {
        poly(hexPts(id, 0.93));
        const move = !!t.move;
        ctx.fillStyle = move ? 'rgba(79,209,139,' + (0.12 + pulse * 0.1) + ')' : 'rgba(224,74,60,' + (0.14 + pulse * 0.1) + ')';
        ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = move ? '#4FD18B' : '#E04A3C'; ctx.stroke();
        if (move) {
          const rem = t.reach.rem[id];
          const cx = sx(SEC[id].x), cy = sy(SEC[id].y);
          ctx.fillStyle = '#4FD18B'; ctx.font = font(k * 0.3, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(rem + ' left', cx + 0.0 * k, cy - 0.78 * k + 2);
        }
      });
    }
  }

  let lastLay = [];
  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackdrop(now);
    if (!G) return;
    drawSectors();
    drawTargets(targets(), now);
    drawMothers(); drawSites(); drawPirate();
    lastLay = shipLayout();
    drawShips(lastLay, now);
  }
  function loop(now) {
    const t = G ? targets() : { kind: null };
    if (ui.dirty || (t.kind && !reduceMotion) || (!reduceMotion && ui.sel)) { draw(now); ui.dirty = false; }
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ pointer: tap, drag to pan, pinch / wheel to zoom
  const ptrs = new Map();
  let gesture = { moved: 0, pinch: 0 };
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs.set(e.pointerId, pos(e));
    if (ptrs.size === 1) gesture = { moved: 0, pinch: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y); gesture.moved = 99; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), cur = pos(e);
    ptrs.set(e.pointerId, cur);
    const v = ui.view;
    if (ptrs.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      gesture.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.moved > 9) { v.tx += dx; v.ty += dy; clampView(); ui.dirty = true; }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / gesture.pinch);
      gesture.pinch = d;
    }
  });
  function endPtr(e) {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (p && e.type === 'pointerup' && ptrs.size === 0 && gesture.moved <= 9) tap(p.x, p.y);
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  function zoomAt(px, py, f) {
    const v = ui.view; const old = v.z;
    v.z = Math.max(0.8, Math.min(4, v.z * f));
    const r = v.z / old;
    v.tx = (px - W / 2) - ((px - W / 2) - v.tx) * r;
    v.ty = (py - H / 2) - ((py - H / 2) - v.ty) * r;
    clampView(); ui.dirty = true;
  }
  $('zin').onclick = () => zoomAt(W / 2, H / 2, 1.3);
  $('zout').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.3);
  $('zfit').onclick = fitView;
  $('zhome').onclick = focusHome;

  function sectorAt(x, y) {
    let best = -1, bd = 1e9;
    const lim = S * ui.view.z * 0.98;
    for (let i = 0; i < C.N_SEC; i++) {
      const d = Math.hypot(sx(SEC[i].x) - x, sy(SEC[i].y) - y);
      if (d < bd && d <= lim) { bd = d; best = i; }
    }
    return best;
  }
  function tap(x, y) {
    if (!G || G.phase === 'gameover' || ui.busy) return;
    const t = targets();
    const k = S * ui.view.z;
    // 1) vertex targets (setup and build modes)
    if (t.kind === 'v') {
      let best = null, bd = Infinity;
      t.list.forEach((id) => { const d = Math.hypot(sx(VERTS[id].x) - x, sy(VERTS[id].y) - y); if (d < bd && d <= Math.max(26, k * 0.5)) { bd = d; best = id; } });
      if (best !== null) onVertex(best);
      else toast('Tap one of the glowing sites.');
      return;
    }
    // 2) pirate placement
    if (t.kind === 'h' && !t.move) {
      const i = sectorAt(x, y);
      if (i >= 0 && t.list.indexOf(i) >= 0) act({ t: 'move_pirate', sector: i });
      else toast('Pick a highlighted sector.');
      return;
    }
    if (G.phase !== 'main' || !myTurn()) { const i = sectorAt(x, y); if (i >= 0) { ui.inspect = i; render(); } return; }
    // 3) select an own ship (nearest within 26px)
    let bs = null, bd2 = 1e9;
    lastLay.forEach((it) => { if (it.pi !== 0) return; const d = Math.hypot(it.x - x, it.y - y); if (d < bd2 && d <= Math.max(26, k * 0.45)) { bd2 = d; bs = it; } });
    if (bs) {
      // tapping the selected ship again cycles to another own ship in that sector
      const here = lastLay.filter((it) => it.pi === 0 && it.sec === bs.sec);
      if (ui.sel === bs.sh.id && here.length > 1) bs = here[(here.findIndex((h) => h.sh.id === bs.sh.id) + 1) % here.length];
      ui.sel = bs.sh.id; ui.inspect = bs.sec; ui.mode = null;
      render();
      return;
    }
    // 4) fly the selected ship
    const i = sectorAt(x, y);
    if (i < 0) return;
    if (t.move && t.list.indexOf(i) >= 0) { moveAlong(C.pathTo(t.reach, i)); ui.inspect = i; return; }
    ui.inspect = i;
    render();
  }

  // ------------------------------------------------------------ HUD
  function playersHtml() {
    return G.players.map((pl, i) => {
      const b = [];
      if (G.titles.admiral === i) b.push('<span class="badge" title="Admiral: strongest fleet, +2 VP">ADMIRAL</span>');
      if (G.titles.baron === i) b.push('<span class="badge b2" title="Trade Baron: most trade routes, +2 VP">BARON</span>');
      if (pl.friends.length) b.push('<span class="badge b3" title="Alien friendships">FRIEND ' + pl.friends.length + '</span>');
      return '<div class="pcard' + (G.current === i && G.phase !== 'gameover' ? ' active' : '') + '" style="--pc:' + PCOL[i] + '">' +
        '<div class="nm">' + esc(pl.name) + '</div>' +
        '<div class="vp">' + C.vp(G, i) + '<small>VP</small></div>' +
        '<div class="st"><span>Ships <b>' + pl.ships.length + '</b></span><span>Cards <b>' + C.cardCount(pl) + '</b></span></div>' +
        '<div class="st" title="Fleet research tier, Trade research tier"><span>Fleet <b>' + pl.fleet + '</b></span><span>Trade <b>' + pl.trade + '</b></span></div>' +
        '<div>' + (b.join('') || '&nbsp;') + '</div></div>';
    }).join('');
  }
  function handHtml() {
    return RES.map((r) => '<div class="chip r-' + r + (me().res[r] ? '' : ' dim') + '" title="' + C.RES_NAME[r] + ' (bank rate ' + C.rateFor(G, 0, r) + ':1)">' + C.RES_NAME[r] + '<b>' + me().res[r] + '</b><small>' + C.RES_LET[r] + ' &middot; ' + C.rateFor(G, 0, r) + ':1</small></div>').join('');
  }
  function reasonCant(kind) {
    const pl = me();
    if (!myTurn()) return 'Not your turn.';
    if (G.phase !== 'main') return 'Not available right now.';
    const c = C.counts(G, 0);
    if (kind === 'colony') {
      if (c.pieces >= C.MAX_COLONIES) return 'You have used all 5 colony pieces.';
      if (!C.canAfford(pl, C.COST.colony)) return 'A colony costs ' + costText(C.COST.colony) + '.';
      if (!C.sitesFor(G, 0, 'colony').length) return 'No legal site. A ship that has not built yet must sit in a sector touching a free site next to a planet, two steps from other colonies.';
    } else if (kind === 'post') {
      if (c.posts >= C.MAX_POSTS) return 'You have used all 4 trade posts.';
      if (!C.canAfford(pl, C.COST.post)) return 'A trade post costs ' + costText(C.COST.post) + '.';
      if (!C.sitesFor(G, 0, 'post').length) return 'No legal site. Fly a ship next to a free site beside a planet.';
    } else if (kind === 'starbase') {
      if (!C.upgradeSites(G, 0).length) return 'You have no colony to upgrade.';
      if (!C.canAfford(pl, C.COST.starbase)) return 'A starbase costs ' + costText(C.COST.starbase) + '.';
    } else if (kind === 'ship') {
      if (pl.ships.length >= C.MAX_SHIPS) return 'You already have 3 ships.';
      if (!C.canAfford(pl, C.COST.ship)) return 'A ship costs ' + costText(C.COST.ship) + '.';
    }
    return '';
  }

  function actionsHtml() {
    if (G.phase === 'gameover') return '<button class="btn primary full" data-a="menu">New game</button>';
    if (G.phase === 'setup') {
      return '<div class="hint">' + (myTurn() ? 'Tap a glowing site on your homeworld to found a colony.' : esc(G.players[G.current].name) + ' is founding a colony...') + '</div>';
    }
    if (G.phase === 'discard') return G.discardQueue.some((q) => q.p === 0) ? '<button class="btn primary full" data-a="discard">Discard cards</button>' : '<div class="hint">Waiting for others to discard...</div>';
    if (!myTurn()) return '<div class="hint">' + esc(G.players[G.current].name) + ' is playing...</div>';
    if (G.phase === 'pirate_move') return '<div class="hint">Tap a highlighted sector to send the pirate there.</div>';
    if (G.phase === 'pirate_steal') return '<div class="hint">Choose who to rob.</div>';
    if (G.phase === 'roll') return '<button class="btn primary full" data-a="roll">Roll dice</button>';
    const dis = (k) => (reasonCant(k) ? ' aria-disabled="true"' : '');
    const on = (m) => (ui.mode === m ? ' on' : '');
    return '<button class="btn' + on('colony') + '" data-a="colony"' + dis('colony') + '>Colony<small>' + costHtml(C.COST.colony) + '</small></button>' +
      '<button class="btn' + on('post') + '" data-a="post"' + dis('post') + '>Trade post<small>' + costHtml(C.COST.post) + '</small></button>' +
      '<button class="btn' + on('starbase') + '" data-a="starbase"' + dis('starbase') + '>Starbase<small>' + costHtml(C.COST.starbase) + '</small></button>' +
      '<button class="btn" data-a="ship"' + dis('ship') + '>New ship<small>' + costHtml(C.COST.ship) + '</small></button>' +
      '<button class="btn" data-a="research">Research<small>F' + me().fleet + ' T' + me().trade + '</small></button>' +
      '<button class="btn" data-a="trade">Trade<small>bank / players</small></button>' +
      '<button class="btn primary span2" data-a="end">End turn</button>';
  }

  function statusHtml() {
    const dice = G.dice ? '<div class="dice"><div class="die">' + G.dice[0] + '</div><div class="die">' + G.dice[1] + '</div></div>' : '';
    const last = G.log[G.log.length - 1] || '';
    const who = G.players[G.current];
    let msg;
    if (G.phase === 'gameover') msg = esc(G.players[G.winner].name) + (G.winner === 0 ? ' win the game!' : ' won the game');
    else if (G.phase === 'setup') msg = 'Setup: ' + esc(who.name) + ' (' + (G.setup.idx < G.nPlayers ? 'first' : 'second') + ' colony)';
    else if (G.phase === 'roll') msg = (myTurn() ? 'Your turn' : esc(who.name) + "'s turn") + ': roll the dice';
    else if (G.phase === 'discard') msg = 'Pirate raid: discard half if you hold more than your limit';
    else if (G.phase === 'pirate_move') msg = myTurn() ? 'Move the pirate' : esc(who.name) + ' moves the pirate';
    else if (G.phase === 'pirate_steal') msg = 'Choose a victim';
    else msg = (myTurn() ? 'Your turn' : esc(who.name) + "'s turn") + ' (turn ' + G.turn + ')';
    return dice + '<div class="msg">' + msg + '<em>' + esc(last) + '</em></div>';
  }

  function ctxHtml() {
    if (!G || G.phase === 'gameover') return '';
    const pl = me();
    let h = '<div class="shiprow">';
    pl.ships.forEach((sh) => {
      h += '<button type="button" class="shipbtn' + (ui.sel === sh.id ? ' sel' : '') + (sh.moves < 1 ? ' spent' : '') + '" style="--pc:' + PCOL[0] + '" data-ship="' + sh.id + '"><span class="dot"></span>Ship ' + sh.id + ' &middot; ' + sh.moves + '</button>';
    });
    const sh = selShip();
    if (myMain() && sh) {
      if (sh.boosts < C.MAX_BOOST) h += '<button type="button" class="shipbtn" data-a="boost"' + (pl.res.fuel < 1 ? ' aria-disabled="true"' : '') + '>Boost (1 Fuel)</button>';
      if (C.missionAvailable(G, 0, sh)) h += '<button type="button" class="shipbtn" data-a="mission">Deliver cargo</button>';
      if (sh.at !== pl.mother && !pl.relocated) h += '<button type="button" class="shipbtn" data-a="relocate">Mothership here</button>';
    }
    h += '</div>';
    const where = ui.inspect !== null ? ui.inspect : (sh ? sh.at : null);
    let info = where !== null ? secLabel(where) : 'Tap a ship, then a green sector to fly. Tap any sector for details.';
    if (sh && myMain() && ui.inspect === sh.at) info = 'Ship ' + sh.id + ' has ' + sh.moves + ' move' + (sh.moves === 1 ? '' : 's') + ' left. ' + info;
    if (sh && myMain() && C.missionAvailable(G, 0, sh)) info += ' Cargo bill: ' + costText(C.missionCost(G, 0, sh.at)) + '.';
    if (sh && myMain() && sh.at !== me().mother && !me().relocated) info += ' (Mothership here costs 2 Fuel, 1 Ore.)';
    if (G.phase === 'main' && myTurn() && ui.mode) info = { colony: 'Tap a glowing site to found a colony (uses up that ship for the turn).', post: 'Tap a glowing site to open a trade post.', starbase: 'Tap one of your colonies to upgrade it.' }[ui.mode];
    return h + '<div class="info">' + info + '</div>';
  }

  function bannerText() {
    if (!G || G.phase === 'gameover') return '';
    if (G.phase === 'setup' && myTurn()) return 'Found a colony on your homeworld';
    if (!myTurn()) return '';
    if (G.phase === 'pirate_move') return 'Tap a sector for the pirate';
    if (G.phase === 'main' && ui.mode) return { colony: 'Pick a site for the colony', post: 'Pick a site for the trade post', starbase: 'Pick a colony to upgrade' }[ui.mode];
    if (G.phase === 'main' && selShip() && selShip().moves > 0) return 'Tap a green sector to fly';
    return '';
  }

  function render() {
    if (!G) return;
    if (ui.sel !== null && !selShip()) ui.sel = null;
    if (G.phase === 'main' && myTurn() && ui.sel === null) {
      const s1 = me().ships.find((s) => s.moves > 0) || me().ships[0];
      if (s1) ui.sel = s1.id;
    }
    $('players').style.setProperty('--np', G.nPlayers);
    $('players').innerHTML = playersHtml();
    $('status').innerHTML = statusHtml();
    $('hand').innerHTML = handHtml();
    $('ctx').innerHTML = ctxHtml();
    $('actions').innerHTML = actionsHtml();
    const bt = bannerText();
    $('banner').innerHTML = bt ? '<span>' + esc(bt) + '</span>' : '';
    const lg = $('log');
    lg.innerHTML = G.log.slice(-90).map((m) => '<li>' + esc(m) + '</li>').join('');
    lg.parentElement.scrollTop = lg.parentElement.scrollHeight;
    ui.dirty = true;
    maybeModals();
    if (ui.modal === 'trade') renderTrade();
    if (ui.modal === 'research') renderResearch();
    if (ui.modal === 'log') renderLogModal();
  }

  // ------------------------------------------------------------ button handling
  $('actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; handleAction(b.getAttribute('data-a'), b);
  });
  $('ctx').addEventListener('click', (e) => {
    const sb = e.target.closest('[data-ship]');
    if (sb && myMain()) { ui.sel = +sb.getAttribute('data-ship'); ui.mode = null; const sh = selShip(); if (sh) { ui.inspect = sh.at; } render(); return; }
    const b = e.target.closest('[data-a]'); if (b) handleAction(b.getAttribute('data-a'), b);
  });
  function handleAction(a, el) {
    if (!G) return;
    if (el && el.getAttribute('aria-disabled') === 'true') {
      if (a === 'boost') return toast('Boosting costs 1 Fuel.');
      const why = reasonCant(a); if (why) toast(why);
      return;
    }
    if (a === 'roll') return act({ t: 'roll' });
    if (a === 'end') {
      const sh = me().ships.some((s) => s.moves > 0);
      void sh;
      return act({ t: 'end_turn' });
    }
    if (a === 'menu') return openMenu();
    if (a === 'discard') return openDiscard();
    if (a === 'trade') return openTrade();
    if (a === 'research') return openResearch();
    if (a === 'ship') return act({ t: 'ship' });
    if (a === 'colony' || a === 'post' || a === 'starbase') {
      const why = reasonCant(a);
      if (why) return toast(why);
      ui.mode = ui.mode === a ? null : a;
      render();
      return;
    }
    if (a === 'boost') { const sh = selShip(); if (sh) act({ t: 'boost', ship: sh.id }); return; }
    if (a === 'mission') { const sh = selShip(); if (sh) act({ t: 'mission', ship: sh.id }); return; }
    if (a === 'relocate') { const sh = selShip(); if (sh) act({ t: 'relocate', ship: sh.id }); return; }
  }

  // ------------------------------------------------------------ modals
  function openModal(html, key) {
    ui.modal = key || 'x';
    $('modalBody').innerHTML = html;
    $('modal').hidden = false;
  }
  function closeModal() { ui.modal = null; $('modal').hidden = true; $('modalBody').innerHTML = ''; ui.pendingPost = null; }
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal') && ui.modal !== 'discard' && ui.modal !== 'steal' && ui.modal !== 'gameover' && ui.modal !== 'start') { closeModal(); pump(); }
  });
  $('modalBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    modalAction(b.getAttribute('data-m'), b);
  });

  function maybeModals() {
    if (G.phase === 'gameover') { if (ui.modal !== 'gameover') showGameOver(); return; }
    if (ui.modal === 'discard') { if (!G.discardQueue.some((q) => q.p === 0)) closeModal(); else return; }
    if (G.phase === 'discard' && G.discardQueue.some((q) => q.p === 0) && !ui.modal) openDiscard();
    if (G.phase === 'pirate_steal' && myTurn() && ui.modal !== 'steal') openSteal();
    if (ui.modal === 'steal' && G.phase !== 'pirate_steal') closeModal();
  }

  // discard
  let discardSel = {};
  function openDiscard() {
    const q = G.discardQueue.find((x) => x.p === 0);
    if (!q) return;
    discardSel = {};
    RES.forEach((r) => { discardSel[r] = 0; });
    openModal('', 'discard');
    renderDiscard();
  }
  function renderDiscard() {
    const q = G.discardQueue.find((x) => x.p === 0);
    if (!q) return;
    const tot = RES.reduce((a, r) => a + discardSel[r], 0);
    let h = '<h2 class="big">Pirate raid</h2><p>You hold ' + C.cardCount(me()) + ' cards, over your limit of ' + C.limitOf(me()) + '. Discard <b>' + q.n + '</b>.</p>';
    RES.forEach((r) => {
      h += '<div class="stepper"><div class="lab">' + chip(r) + ' ' + C.RES_NAME[r] + ' <span class="own">have ' + me().res[r] + '</span></div>' +
        '<button type="button" data-m="dmin" data-r="' + r + '" aria-label="Fewer ' + C.RES_NAME[r] + '">&minus;</button><div class="n">' + discardSel[r] + '</div>' +
        '<button type="button" data-m="dplus" data-r="' + r + '" aria-label="More ' + C.RES_NAME[r] + '">+</button></div>';
    });
    h += '<button type="button" class="btn primary close" data-m="dgo"' + (tot === q.n ? '' : ' aria-disabled="true"') + '>Discard ' + tot + ' of ' + q.n + '</button>';
    $('modalBody').innerHTML = h;
  }
  function openSteal() {
    let h = '<h2 class="big">Rob a player</h2><p>Take one random card from a player next to the pirate.</p><div class="row">';
    G.stealOptions.forEach((i) => { h += '<button type="button" class="btn" data-m="steal" data-p="' + i + '">' + esc(G.players[i].name) + '<small>' + C.cardCount(G.players[i]) + ' cards</small></button>'; });
    openModal(h + '</div>', 'steal');
  }
  function openPostSpec(specs) {
    let h = '<h2 class="big">Trade post</h2><p>Pick the resource this post trades at <b>2:1</b>. It also gives 3:1 on everything.</p><div class="pick">';
    specs.forEach((r) => { h += '<button type="button" class="chip r-' + r + '" data-m="spec" data-r="' + r + '">' + C.RES_NAME[r] + '<small>2:1</small></button>'; });
    h += '</div><button type="button" class="btn close" data-m="close">Cancel</button>';
    openModal(h, 'spec');
  }

  // trade
  function openTrade() {
    ui.trade = { tab: 'bank', give: null, get: null, pg: {}, pt: {}, with: -1 };
    RES.forEach((r) => { ui.trade.pg[r] = 0; ui.trade.pt[r] = 0; });
    openModal('', 'trade');
    renderTrade();
  }
  function renderTrade() {
    const t = ui.trade; if (!t) return;
    let h = '<h2 class="big">Trade</h2><div class="seg"><button type="button" class="btn' + (t.tab === 'bank' ? ' sel' : '') + '" data-m="tab" data-t="bank">Bank</button><button type="button" class="btn' + (t.tab === 'players' ? ' sel' : '') + '" data-m="tab" data-t="players">Players</button></div>';
    if (t.tab === 'bank') {
      h += '<p>Pick what to give, then what to get. Each trade swaps your rate in cards for 1.</p><h3>Give</h3><div class="pick">';
      RES.forEach((r) => { const rate = C.rateFor(G, 0, r); h += '<button type="button" class="chip r-' + r + (t.give === r ? ' sel' : '') + '"' + (me().res[r] < rate ? ' aria-disabled="true"' : '') + ' data-m="bgive" data-r="' + r + '">' + C.RES_NAME[r] + '<small>' + rate + ':1 &middot; have ' + me().res[r] + '</small></button>'; });
      h += '</div><h3>Get</h3><div class="pick">';
      RES.forEach((r) => { h += '<button type="button" class="chip r-' + r + (t.get === r ? ' sel' : '') + '"' + (t.give === r ? ' aria-disabled="true"' : '') + ' data-m="bget" data-r="' + r + '">' + C.RES_NAME[r] + '<small>+1</small></button>'; });
      const ok = t.give && t.get && t.give !== t.get && me().res[t.give] >= C.rateFor(G, 0, t.give);
      h += '</div><button type="button" class="btn primary close" data-m="bgo"' + (ok ? '' : ' aria-disabled="true"') + '>' + (t.give && t.get ? 'Trade ' + C.rateFor(G, 0, t.give) + ' ' + C.RES_NAME[t.give] + ' for 1 ' + C.RES_NAME[t.get] : 'Pick two resources') + '</button>';
    } else {
      h += '<p>Offer cards to the computer players. They accept when it helps them.</p><h3>You give</h3>';
      RES.forEach((r) => {
        h += '<div class="stepper"><div class="lab">' + chip(r) + ' ' + C.RES_NAME[r] + ' <span class="own">have ' + me().res[r] + '</span></div><button type="button" data-m="pgm" data-r="' + r + '">&minus;</button><div class="n">' + t.pg[r] + '</div><button type="button" data-m="pgp" data-r="' + r + '">+</button></div>';
      });
      h += '<h3>You get</h3>';
      RES.forEach((r) => {
        h += '<div class="stepper"><div class="lab">' + chip(r) + ' ' + C.RES_NAME[r] + '</div><button type="button" data-m="ptm" data-r="' + r + '">&minus;</button><div class="n">' + t.pt[r] + '</div><button type="button" data-m="ptp" data-r="' + r + '">+</button></div>';
      });
      h += '<h3>Offer to</h3><div class="seg" style="flex-wrap:wrap"><button type="button" class="btn' + (t.with === -1 ? ' sel' : '') + '" data-m="pwith" data-p="-1">Anyone</button>';
      G.players.forEach((pl, i) => { if (i) h += '<button type="button" class="btn' + (t.with === i ? ' sel' : '') + '" data-m="pwith" data-p="' + i + '">' + esc(pl.name) + '</button>'; });
      h += '</div><button type="button" class="btn primary close" data-m="pgo">Make offer</button>';
    }
    h += '<button type="button" class="btn close" data-m="close">Done</button>';
    $('modalBody').innerHTML = h;
  }

  // research
  function openResearch() { openModal('', 'research'); renderResearch(); }
  function renderResearch() {
    let h = '<h2 class="big">Research</h2><p>Each track has three tiers, bought in order. Finishing tier 3 of a track is worth 1 VP.</p>';
    [['fleet', 'Fleet'], ['trade', 'Trade']].forEach((tr) => {
      h += '<h3>' + tr[1] + ' track</h3>';
      for (let i = 0; i < 3; i++) {
        const have = me()[tr[0]];
        const cost = C.RESEARCH[tr[0]][i];
        h += '<div class="tier"><div><b>Tier ' + (i + 1) + '</b> ' + esc(C.TIER_NAME[tr[0]][i]) + '<br>' + costHtml(cost) + '</div>';
        if (i < have) h += '<span class="done">Done</span>';
        else if (i === have) h += '<button type="button" class="btn" data-m="research" data-tr="' + tr[0] + '"' + (C.canAfford(me(), cost) && myMain() ? '' : ' aria-disabled="true"') + '>Research</button>';
        else h += '<span class="own" style="color:var(--muted)">Locked</span>';
        h += '</div>';
      }
    });
    h += '<button type="button" class="btn close" data-m="close">Done</button>';
    $('modalBody').innerHTML = h;
  }

  function renderLogModal() { $('modalBody').innerHTML = '<h2 class="big">Action log</h2><ol class="biglog">' + G.log.slice(-120).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ol><button type="button" class="btn close" data-m="close">Close</button>'; }

  function modalAction(m, el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    const r = el.getAttribute('data-r');
    const t = ui.trade;
    switch (m) {
      case 'close': closeModal(); render(); pump(); break;
      case 'dplus': { const q = G.discardQueue.find((x) => x.p === 0); if (RES.reduce((a, k) => a + discardSel[k], 0) < q.n && discardSel[r] < me().res[r]) discardSel[r]++; renderDiscard(); break; }
      case 'dmin': if (discardSel[r] > 0) discardSel[r]--; renderDiscard(); break;
      case 'dgo': { const cards = {}; RES.forEach((k) => { if (discardSel[k]) cards[k] = discardSel[k]; }); closeModal(); act({ t: 'discard', p: 0, cards }); break; }
      case 'steal': closeModal(); act({ t: 'steal', p: +el.getAttribute('data-p') }); break;
      case 'spec': { const v = ui.pendingPost; closeModal(); act({ t: 'post', v, spec: r }); break; }
      case 'tab': t.tab = el.getAttribute('data-t'); renderTrade(); break;
      case 'bgive': t.give = r; if (t.get === r) t.get = null; renderTrade(); break;
      case 'bget': t.get = r; renderTrade(); break;
      case 'bgo': { const res = act({ t: 'bank', give: t.give, get: t.get }); void res; renderTrade(); break; }
      case 'pgp': if (t.pg[r] < me().res[r]) { t.pg[r]++; t.pt[r] = 0; } renderTrade(); break;
      case 'pgm': if (t.pg[r] > 0) t.pg[r]--; renderTrade(); break;
      case 'ptp': if (t.pt[r] < 9) { t.pt[r]++; t.pg[r] = 0; } renderTrade(); break;
      case 'ptm': if (t.pt[r] > 0) t.pt[r]--; renderTrade(); break;
      case 'pwith': t.with = +el.getAttribute('data-p'); renderTrade(); break;
      case 'pgo': {
        const give = {}, get = {};
        RES.forEach((k) => { if (t.pg[k]) give[k] = t.pg[k]; if (t.pt[k]) get[k] = t.pt[k]; });
        const res = act({ t: 'ptrade', with: t.with, give, get });
        if (res.ok) { toast(res.accepted ? G.players[res.by].name + ' accepts the trade.' : 'Nobody accepts that offer. Try sweetening it.'); RES.forEach((k) => { t.pg[k] = 0; t.pt[k] = 0; }); }
        renderTrade();
        break;
      }
      case 'research': { act({ t: 'research', track: el.getAttribute('data-tr') }); break; }
      case 'newgame': startNew(+el.getAttribute('data-opp'), newSeed()); break;
      case 'resume': closeModal(); render(); pump(); break;
      case 'fast': fast = !fast; savePref({ fast }); openMenu(ui.modal === 'start'); break;
      case 'opp': menuOpp = +el.getAttribute('data-opp'); openMenu(ui.modal === 'start'); break;
      case 'again': startNew(G.nPlayers - 1, newSeed()); break;
      default: break;
    }
  }
  function newSeed() { return (Date.now() ^ Math.floor(Math.random() * 1e9)) & 0x7fffffff; }

  // menu, start, game over, rules
  let menuOpp = 3;
  function openMenu(startScreen) {
    const t = tally();
    let h = '<h2 class="big">' + (startScreen ? 'Starship Catan' : 'Menu') + '</h2>';
    if (startScreen) h += '<p>You have a game in progress.</p><button type="button" class="btn primary close" data-m="resume">Resume game</button>';
    h += '<h3>New game</h3><p>Computer opponents:</p><div class="seg">';
    [1, 2, 3].forEach((n) => { h += '<button type="button" class="btn' + (menuOpp === n ? ' sel' : '') + '" data-m="opp" data-opp="' + n + '">' + n + '</button>'; });
    h += '</div><button type="button" class="btn primary close" data-m="newgame" data-opp="' + menuOpp + '">Start new game</button>';
    h += '<h3>Computer speed</h3><div class="seg"><button type="button" class="btn' + (!fast ? ' sel' : '') + '" data-m="fast">' + (fast ? 'Normal' : 'Normal (on)') + '</button><button type="button" class="btn' + (fast ? ' sel' : '') + '" data-m="fast">' + (fast ? 'Fast (on)' : 'Fast') + '</button></div>';
    h += '<p class="tally">Your record: ' + t.wins + ' won, ' + t.losses + ' lost. Seed of this galaxy: ' + (G ? G.seed : '-') + ' (add ?seed=' + (G ? G.seed : 'N') + ' to the address to replay it).</p>';
    if (!startScreen) h += '<button type="button" class="btn close" data-m="close">Back to the game</button>';
    openModal(h, startScreen ? 'start' : 'menu');
  }
  function showGameOver() {
    const t = tally();
    let h = '<h2 class="big">' + (G.winner === 0 ? 'You win!' : esc(G.players[G.winner].name) + ' wins') + '</h2><table><tr><th>Player</th><th>VP</th><th>Colonies</th><th>Starbases</th><th>Aliens</th><th>Research</th><th>Titles</th></tr>';
    G.players.forEach((pl, i) => {
      const b = C.vpBreakdown(G, i);
      h += '<tr><td>' + esc(pl.name) + '</td><td><b>' + C.vp(G, i) + '</b></td><td>' + b.colonies + '</td><td>' + b.starbases + '</td><td>' + b.friends + '</td><td>' + b.research + '</td><td>' + (b.admiral + b.baron) + '</td></tr>';
    });
    h += '</table><p class="tally">Your record: ' + t.wins + ' won, ' + t.losses + ' lost.</p><button type="button" class="btn primary close" data-m="again">Play again</button>';
    openModal(h, 'gameover');
  }
  const RULES = '' +
    '<h2 class="big">How to play</h2>' +
    '<p><b>Original house rules.</b> These rules were written for this page. They are inspired by the Catan family of games but are not the official rules of any Catan or Starship Catan product, and nothing here is copied from one.</p>' +
    '<h3>Goal</h3><p>Be the first to reach <b>10 victory points (VP)</b> on your own turn.</p>' +
    '<h3>The galaxy</h3><p>37 hexagonal sectors. Each sector is <b>face down</b> (shown with ?) until any ship flies into it or next to it, or a colony is founded beside it. Types (each has a shape and, where it produces, a letter):</p>' +
    '<ul><li><b>Planet</b> (11, ringed disc): produces Water (W), Carbon (C) or Tech (T). Colonies are founded next to planets.</li>' +
    '<li><b>Asteroid field</b> (5, rocks): produces Ore (O). Costs 2 moves to enter.</li>' +
    '<li><b>Nebula</b> (5, clouds): produces Fuel (F).</li>' +
    '<li><b>Derelict</b> (3, broken ship): the first ship to enter salvages 2 resource cards, then it is a stripped wreck.</li>' +
    '<li><b>Alien outpost</b> (3, eye): deliver cargo here for a Friendship card.</li>' +
    '<li><b>Deep space</b>: empty and safe. <b>Homeworld</b>: a planet that is your start, shown with your colour ring.</li></ul>' +
    '<p>Every producing sector carries a dice number (2 to 12, never 7). 6 and 8 are red because they roll most often.</p>' +
    '<h3>Setup</h3><p>Each player starts with a mothership and one ship on their homeworld. In order 1, 2, 3, 4, then back 4, 3, 2, 1, each places a free colony on a corner (site) of their own homeworld, at least two steps from any other colony. Your second colony collects 1 card from each producing sector it touches.</p>' +
    '<h3>Your turn</h3><ol><li>Roll two dice. Everyone produces (below), or on a 7 the pirates raid.</li><li>In any order: fly ships, build, research, trade, deliver cargo.</li><li>End your turn.</li></ol>' +
    '<h3>Production</h3><p>For every sector showing the rolled number, each of your pieces that touches it gains cards of that sector\'s resource: <b>colony 1, starbase 2, trade post 1</b> (2 once you own the Trade tier 2 research). A sector holding the pirate produces nothing. The bank never runs out.</p>' +
    '<h3>Pirate raid (rolling a 7)</h3><ul><li>Anyone with <b>more than 7 cards</b> discards half, rounded down (limit 10 with Fleet tier 3).</li><li>The roller moves the pirate to any revealed sector except one holding a mothership. That sector is blocked, and flying into it costs 1 extra move.</li><li>The roller steals one random card from a player with a colony, starbase or trade post touching that sector or a ship in it (not from players with Fleet tier 3).</li></ul>' +
    '<h3>Ships and flying</h3><ul><li>Each ship has <b>2 moves</b> per turn (3 after Fleet tier 1). One move flies to an adjacent sector. Entering an asteroid field or the pirate sector costs 1 extra. A ship may enter with at least 1 move left, even if the cost is higher; it then ends at 0.</li><li><b>Boost:</b> pay 1 Fuel for +1 move, twice per ship per turn.</li><li>You may own up to <b>3 ships</b> (cost Ore, Fuel, Tech). A new ship appears at your mothership and cannot move that turn.</li><li>Flying into a face-down sector is a gamble: you only learn what it is when you arrive.</li><li><b>Mothership:</b> stays put and is where new ships appear. Pay 2 Fuel and 1 Ore to relocate it to the sector of one of your ships (once per turn). The pirate can never be sent to a mothership.</li></ul>' +
    '<h3>Colonies, trade posts, starbases</h3><ul><li>A <b>site</b> is a corner where up to three sectors meet. To build on a site: it is free, no neighbouring corner holds a colony or post, it touches at least one revealed planet or homeworld, and one of your ships that has not built this turn is in a sector touching it. Building uses up that ship\'s remaining moves.</li>' +
    '<li><b>Colony</b>: Water, Carbon, Tech, Fuel. 1 VP. Up to 5 colonies or starbases.</li>' +
    '<li><b>Starbase</b>: upgrade a colony for 3 Ore and 2 Water. 2 VP in total, produces double.</li>' +
    '<li><b>Trade post</b>: Water, Carbon, Fuel. 0 VP, produces like a colony, and gives you a 3:1 bank rate on everything plus <b>2:1 on one resource</b> you pick from the sectors it touches. Up to 4 posts.</li></ul>' +
    '<h3>Trading</h3><ul><li><b>Bank</b>: 4:1 normally, 3:1 with a trade post or Trade tier 1, 2:1 on a post\'s chosen resource, 2:1 on everything with Trade tier 3.</li><li><b>Players</b>: offer cards to the computer players. They answer by how much it helps them, and refuse to feed a leader close to winning. Computers do not start offers.</li></ul>' +
    '<h3>Research</h3><table><tr><th>Tier</th><th>Fleet</th><th>Trade</th></tr><tr><td>1</td><td>Ships fly 3 sectors (O, T, F)</td><td>Bank rate 3:1 (T, C, W)</td></tr><tr><td>2</td><td>Missions cost 1 card less (O2, T, C)</td><td>Trade posts yield +1 (T2, C, W)</td></tr><tr><td>3</td><td>Raid limit 10, immune to theft, +1 VP (O2, T2, F2)</td><td>Bank rate 2:1, +1 VP (T2, C2, F, W)</td></tr></table>' +
    '<h3>Alien missions</h3><p>Each outpost shows a cargo bill of 4 cards (reduced by Fleet tier 2). Park a ship there and pay it: you gain a <b>Friendship card, 1 VP</b>. Each player can befriend each outpost once, so all three can pay off.</p>' +
    '<h3>Titles</h3><ul><li><b>Admiral</b> (2 VP): fleet power = ships plus Fleet tier. You need at least 4.</li><li><b>Trade Baron</b> (2 VP): trade routes = trade posts plus Trade tier. You need at least 3.</li><li>A title only changes hands when someone <b>strictly exceeds</b> the holder. Ties keep it where it is, and if two challengers tie above the holder nobody takes it.</li></ul>' +
    '<h3>Victory points</h3><table><tr><td>Colony</td><td>1</td></tr><tr><td>Starbase</td><td>2</td></tr><tr><td>Trade post</td><td>0</td></tr><tr><td>Friendship card</td><td>1 each</td></tr><tr><td>Fleet tier 3, Trade tier 3</td><td>1 each</td></tr><tr><td>Admiral, Trade Baron</td><td>2 each</td></tr></table>' +
    '<h3>Computer players</h3><p>They only use what a person at their seat could see: face-down sectors are unknown to them, and they know your card count but not your cards. They explore, grab the best sites, trade with the bank, build research when rich, run alien missions, discard the cards they need least and send the pirate at the leader.</p>' +
    '<h3>Controls</h3><p>Drag to pan, pinch or the + and minus buttons to zoom, All to see everything, Home to jump to your homeworld. Tap a ship to select it, then a green sector to fly there. Build buttons light up legal sites in gold.</p>' +
    '<button type="button" class="btn primary close" data-m="close">Close</button>';

  $('btnRules').onclick = () => { openModal(RULES, 'rules'); };
  $('btnMenu').onclick = () => { openMenu(false); };
  $('btnLog').onclick = () => { openModal('', 'log'); renderLogModal(); };

  // ------------------------------------------------------------ boot
  function boot() {
    loadPref();
    resize();
    new (window.ResizeObserver || function () { return { observe() {} }; })(() => { resize(); }).observe($('galaxy'));
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
    const saved = urlParams.get('seed') ? null : loadSave();
    if (saved) {
      G = saved;
      resize(); focusHome(); render();
      openMenu(true);
      return;
    }
    const sp = urlParams.get('seed');
    const seed = sp !== null && /^-?\d+$/.test(sp) ? parseInt(sp, 10) : newSeed();
    const opp = Math.max(1, Math.min(3, parseInt(urlParams.get('opp') || '3', 10) || 3));
    menuOpp = opp;
    resize();
    startNew(opp, seed);
  }
  window.addEventListener('load', boot);
  window.__starship = { get state() { return G; }, ui, act, startNew, render, project: (x, y) => { const r = cv.getBoundingClientRect(); return { x: r.left + sx(x), y: r.top + sy(y) }; } };
})();
