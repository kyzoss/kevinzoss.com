/* Settlers of Catan UI: canvas board, HUD, save/resume, computer turn pacing. */
(function () {
  'use strict';
  const C = window.Catan;
  const $ = (id) => document.getElementById(id);
  const RES = C.RES;
  const LET = { brick: 'B', lumber: 'L', wool: 'W', grain: 'G', ore: 'O' };
  const RCOL = { brick: '#C9694A', lumber: '#4E9F5E', wool: '#9CCB63', grain: '#E3C34F', ore: '#8D95A3' };
  const TCOL = { hill: '#C9694A', forest: '#4E9F5E', pasture: '#9CCB63', field: '#E3C34F', mountain: '#8D95A3', desert: '#D9C9A0' };
  const TWORD = { hill: 'BRICK', forest: 'LUMBER', pasture: 'WOOL', field: 'GRAIN', mountain: 'ORE', desert: 'DESERT' };
  const PCOL = ['#FF3B2F', '#4DA3FF', '#F2F2F2', '#B07CFF'];
  const SAVE_KEY = 'catan.save.v1';
  const TALLY_KEY = 'catan.tally.v1';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HEX = C.HEXES, VERT = C.VERTS, EDGE = C.EDGES;

  let G = null;
  const ui = { mode: null, tr: null, dirty: true, view: { z: 1, tx: 0, ty: 0 }, modal: null, pickDev: null };
  let timer = null;

  // ------------------------------------------------------------ storage
  function store(op, key, val) {
    try {
      if (op === 'get') return window.localStorage.getItem(key);
      if (op === 'set') window.localStorage.setItem(key, val);
      if (op === 'del') window.localStorage.removeItem(key);
    } catch (e) { /* storage unavailable */ }
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
      if (s && s.version === 1 && s.players && s.hexes && s.phase !== 'gameover') return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function tally() {
    try { const t = JSON.parse(store('get', TALLY_KEY)); if (t && typeof t.wins === 'number') return t; } catch (e) { /* */ }
    return { wins: 0, losses: 0 };
  }
  function recordResult() {
    if (!G || G.phase !== 'gameover' || G.tallied) return;
    G.tallied = true;
    const t = tally();
    if (G.winner === 0) t.wins++; else t.losses++;
    store('set', TALLY_KEY, JSON.stringify(t));
  }

  // ------------------------------------------------------------ game flow
  function startNew(players, seed) {
    clearTimeout(timer);
    G = C.newGame({ players, seed });
    ui.mode = null; ui.tr = null;
    fitView();
    saveGame();
    closeModal();
    render();
    pump();
  }
  function act(a) {
    const r = C.apply(G, a);
    if (!r.ok) { toast(r.error); render(); return r; }
    ui.mode = null;
    if (G.phase === 'gameover') recordResult();
    saveGame();
    render();
    pump();
    return r;
  }
  function pump() {
    clearTimeout(timer);
    if (!G || G.phase === 'gameover') { if (G && G.phase === 'gameover') showGameOver(); return; }
    const a = C.aiNextAction(G);
    if (!a) return;
    let d = a.t === 'roll' ? 900 : a.t === 'end_turn' ? 700 : G.phase === 'setup' ? 500 : 800;
    if (reduceMotion) d = Math.round(d * 0.6);
    timer = setTimeout(() => {
      const b = C.aiNextAction(G);
      if (!b) return;
      let r = C.apply(G, b);
      if (!r.ok) {
        console.error('AI action rejected', b, r.error);
        r = C.apply(G, { t: 'end_turn' });
        if (!r.ok) return;
      }
      if (G.phase === 'gameover') recordResult();
      saveGame();
      render();
      pump();
    }, d);
  }

  // ------------------------------------------------------------ helpers
  function chip(r, n) { return '<span class="lt r-' + r + '">' + LET[r] + (n !== undefined ? n : '') + '</span>'; }
  function costHtml(cost) {
    return Object.keys(cost).map((r) => chip(r, cost[r] > 1 ? cost[r] : undefined)).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  let toastT = null;
  function toast(msg) {
    const el = $('toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }
  const me = () => G.players[0];
  const myTurn = () => G.current === 0;

  // ------------------------------------------------------------ targets on the board
  function targets() {
    if (!G || G.phase === 'gameover') return { kind: null, list: [] };
    if (G.phase === 'setup' && myTurn()) {
      if (G.setup.step === 'settlement') return { kind: 'v', list: C.settlementSpots(G, 0, true) };
      return { kind: 'e', list: C.roadSpots(G, 0, G.setup.last) };
    }
    if (!myTurn()) return { kind: null, list: [] };
    if (G.phase === 'robber') return { kind: 'h', list: HEX.map((h, i) => i).filter((i) => i !== G.robber) };
    if (G.phase === 'main' && G.freeRoads > 0) return { kind: 'e', list: C.roadSpots(G, 0) };
    if (G.phase === 'main' && ui.mode === 'road') return { kind: 'e', list: C.roadSpots(G, 0) };
    if (G.phase === 'main' && ui.mode === 'settlement') return { kind: 'v', list: C.settlementSpots(G, 0, false) };
    if (G.phase === 'main' && ui.mode === 'city') return { kind: 'v', list: C.cityVertices(G, 0) };
    return { kind: null, list: [] };
  }
  function onTarget(kind, id) {
    if (G.phase === 'setup') {
      return act(G.setup.step === 'settlement' ? { t: 'setup_settlement', v: id } : { t: 'setup_road', e: id });
    }
    if (kind === 'h') return act({ t: 'move_robber', hex: id });
    if (kind === 'e') return act({ t: 'build_road', e: id });
    if (kind === 'v') return act({ t: ui.mode === 'city' ? 'build_city' : 'build_settlement', v: id });
  }

  // ------------------------------------------------------------ canvas
  const cv = $('board');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, S = 40;
  function resize() {
    const r = $('boardwrap').getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(100, Math.round(r.width)); H = Math.max(100, Math.round(r.height));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    S = Math.min(W / 10.8, H / 10.2);
    ui.dirty = true;
  }
  function fitView() { ui.view = { z: 1, tx: 0, ty: 0 }; ui.dirty = true; }
  function sx(x) { return W / 2 + x * S * ui.view.z + ui.view.tx; }
  function sy(y) { return H / 2 + y * S * ui.view.z + ui.view.ty; }
  function clampView() {
    const v = ui.view;
    v.z = Math.max(0.7, Math.min(3.2, v.z));
    const lim = (n) => n * 0.5 * v.z + n * 0.15;
    v.tx = Math.max(-lim(W), Math.min(lim(W), v.tx));
    v.ty = Math.max(-lim(H), Math.min(lim(H), v.ty));
  }

  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }

  function drawIcon(kind, x, y, k) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = 'rgba(12,16,20,.82)'; ctx.strokeStyle = 'rgba(12,16,20,.82)'; ctx.lineWidth = 0.1;
    if (kind === 'forest') {
      poly([[0, -1], [0.62, -0.1], [-0.62, -0.1]]); ctx.fill();
      poly([[0, -0.55], [0.8, 0.5], [-0.8, 0.5]]); ctx.fill();
      ctx.fillRect(-0.12, 0.5, 0.24, 0.4);
    } else if (kind === 'hill') {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) ctx.fillRect(-0.9 + c * 0.95 + (r % 2 ? 0.45 : 0), -0.7 + r * 0.5, 0.85, 0.4);
    } else if (kind === 'pasture') {
      ctx.beginPath(); ctx.arc(-0.35, 0, 0.42, 0, 7); ctx.arc(0.1, -0.2, 0.46, 0, 7); ctx.arc(0.5, 0.05, 0.4, 0, 7); ctx.arc(0.1, 0.25, 0.4, 0, 7); ctx.fill();
      ctx.fillRect(-0.45, 0.4, 0.14, 0.45); ctx.fillRect(0.3, 0.4, 0.14, 0.45);
    } else if (kind === 'field') {
      ctx.beginPath(); ctx.moveTo(0, 0.9); ctx.lineTo(0, -0.8); ctx.stroke();
      ctx.lineWidth = 0.14;
      for (let i = 0; i < 3; i++) {
        const yy = -0.55 + i * 0.4;
        ctx.beginPath(); ctx.moveTo(0, yy + 0.25); ctx.lineTo(-0.5, yy - 0.15); ctx.moveTo(0, yy + 0.25); ctx.lineTo(0.5, yy - 0.15); ctx.stroke();
      }
    } else if (kind === 'mountain') {
      poly([[-1, 0.8], [-0.3, -0.7], [0.35, 0.8]]); ctx.fill();
      poly([[-0.1, 0.8], [0.45, -0.25], [1, 0.8]]); ctx.fill();
    } else if (kind === 'desert') {
      ctx.beginPath(); ctx.arc(0, -0.1, 0.4, 0, 7); ctx.fill();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.6, -0.1 + Math.sin(a) * 0.6); ctx.lineTo(Math.cos(a) * 0.9, -0.1 + Math.sin(a) * 0.9); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawHexes() {
    HEX.forEach((h, i) => {
      const hx = G.hexes[i];
      poly(h.verts.map((v) => [sx(VERT[v].x), sy(VERT[v].y)]));
      ctx.fillStyle = TCOL[hx.terrain]; ctx.fill();
      ctx.lineWidth = Math.max(1.5, S * 0.05); ctx.strokeStyle = '#0B0B0E'; ctx.stroke();
    });
    const sum = G.dice ? G.dice[0] + G.dice[1] : 0;
    HEX.forEach((h, i) => {
      const hx = G.hexes[i];
      const cx = sx(h.x), cy = sy(h.y), k = S * ui.view.z;
      drawIcon(hx.terrain, cx, cy - 0.5 * k, 0.25 * k);
      ctx.font = '800 ' + Math.max(7, Math.round(0.19 * k)) + 'px Inter, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(12,16,20,.85)';
      ctx.fillText(TWORD[hx.terrain], cx, cy - 0.17 * k);
      if (hx.num) {
        const ty = cy + 0.28 * k;
        ctx.beginPath(); ctx.arc(cx, ty, 0.33 * k, 0, 7); ctx.fillStyle = '#F4EBD2'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = sum && sum === hx.num && sum !== 7 ? '#FF3B2F' : '#2a2a2a';
        if (sum && sum === hx.num) ctx.lineWidth = 3;
        ctx.stroke();
        const hot = hx.num === 6 || hx.num === 8;
        ctx.fillStyle = hot ? '#C4161C' : '#151515';
        ctx.font = '900 ' + Math.round(0.3 * k) + 'px Inter, Arial, sans-serif';
        ctx.fillText(String(hx.num), cx, ty - 0.04 * k);
        const pips = C.pipsOf(hx.num);
        for (let p = 0; p < pips; p++) {
          ctx.beginPath(); ctx.arc(cx + (p - (pips - 1) / 2) * 0.075 * k, ty + 0.19 * k, 0.026 * k + 0.4, 0, 7); ctx.fill();
        }
      }
    });
  }

  function drawPorts() {
    const k = S * ui.view.z;
    G.ports.forEach((p) => {
      const a = VERT[p.a], b = VERT[p.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const d = Math.hypot(mx, my) || 1;
      const px = mx + (mx / d) * 0.78, py = my + (my / d) * 0.78;
      ctx.strokeStyle = '#d8d2b8'; ctx.lineWidth = Math.max(2, k * 0.06);
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(px), sy(py)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx(px), sy(py), 0.4 * k, 0, 7);
      ctx.fillStyle = p.type === 'any' ? '#EDE6CF' : RCOL[p.type]; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#0B0B0E'; ctx.stroke();
      ctx.fillStyle = '#0B0B0E'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.max(8, Math.round(0.24 * k)) + 'px Inter, Arial, sans-serif';
      ctx.fillText(p.type === 'any' ? '3:1' : '2:1', sx(px), sy(py) - (p.type === 'any' ? 0.07 : 0.1) * k);
      ctx.font = '800 ' + Math.max(7, Math.round(0.2 * k)) + 'px Inter, Arial, sans-serif';
      ctx.fillText(p.type === 'any' ? 'ANY' : LET[p.type], sx(px), sy(py) + 0.17 * k);
    });
  }

  function drawRoads() {
    const k = S * ui.view.z;
    G.roads.forEach((o, e) => {
      if (o < 0) return;
      const a = VERT[EDGE[e].a], b = VERT[EDGE[e].b];
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0B0B0E'; ctx.lineWidth = k * 0.3;
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
      ctx.strokeStyle = PCOL[o]; ctx.lineWidth = k * 0.17;
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    });
    ctx.lineCap = 'butt';
  }

  function drawBuildings() {
    const k = S * ui.view.z;
    G.b.forEach((b, v) => {
      if (!b) return;
      const x = sx(VERT[v].x), y = sy(VERT[v].y);
      ctx.save(); ctx.translate(x, y); ctx.scale(k * 1.05, k * 1.05);
      if (b.city) poly([[-0.32, 0.2], [0.32, 0.2], [0.32, -0.04], [0.1, -0.04], [0.1, -0.2], [-0.08, -0.36], [-0.26, -0.2], [-0.26, -0.04], [-0.32, -0.04]]);
      else poly([[-0.22, 0.18], [0.22, 0.18], [0.22, -0.06], [0, -0.28], [-0.22, -0.06]]);
      ctx.fillStyle = PCOL[b.p]; ctx.fill();
      ctx.lineWidth = 0.07; ctx.strokeStyle = '#0B0B0E'; ctx.stroke();
      ctx.restore();
    });
  }

  function drawRobber() {
    const h = HEX[G.robber];
    const k = S * ui.view.z;
    const x = sx(h.x) + 0.5 * k, y = sy(h.y) + 0.25 * k;
    ctx.save(); ctx.translate(x, y); ctx.scale(k * 0.5, k * 0.5);
    ctx.fillStyle = '#17171b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.08;
    poly([[-0.5, 0.7], [0.5, 0.7], [0.28, -0.2], [-0.28, -0.2]]); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -0.45, 0.32, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawTargets(t, now) {
    if (!t.kind) return;
    const k = S * ui.view.z;
    const pulse = reduceMotion ? 0 : (Math.sin(now / 260) + 1) / 2;
    ctx.lineWidth = 3;
    t.list.forEach((id) => {
      if (t.kind === 'v') {
        const x = sx(VERT[id].x), y = sy(VERT[id].y);
        const r = Math.max(9, 0.24 * k) + pulse * 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = 'rgba(255,59,47,.35)'; ctx.fill(); ctx.strokeStyle = '#FF3B2F'; ctx.stroke();
      } else if (t.kind === 'e') {
        const a = VERT[EDGE[id].a], b = VERT[EDGE[id].b];
        const x = sx((a.x + b.x) / 2), y = sy((a.y + b.y) / 2);
        ctx.strokeStyle = 'rgba(255,59,47,.55)'; ctx.lineWidth = Math.max(6, k * 0.17); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx(a.x) + (b.x - a.x) * k * 0.2, sy(a.y) + (b.y - a.y) * k * 0.2); ctx.lineTo(sx(b.x) - (b.x - a.x) * k * 0.2, sy(b.y) - (b.y - a.y) * k * 0.2); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, Math.max(9, 0.22 * k) + pulse * 2, 0, 7); ctx.fillStyle = 'rgba(255,59,47,.4)'; ctx.fill(); ctx.strokeStyle = '#FF3B2F'; ctx.stroke();
      } else if (t.kind === 'h') {
        const h = HEX[id];
        poly(h.verts.map((v) => [sx(VERT[v].x), sy(VERT[v].y)]));
        ctx.fillStyle = 'rgba(255,59,47,' + (0.18 + pulse * 0.12) + ')'; ctx.fill();
        ctx.strokeStyle = '#FF3B2F'; ctx.stroke();
      }
    });
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1620'; ctx.fillRect(0, 0, W, H);
    if (!G) return;
    // sea
    const k = S * ui.view.z;
    ctx.beginPath(); ctx.arc(sx(0), sy(0), 5.45 * k, 0, 7); ctx.fillStyle = '#143049'; ctx.fill();
    drawHexes(); drawPorts(); drawRoads(); drawBuildings(); drawRobber();
    drawTargets(targets(), now);
  }
  let lastKey = '';
  function loop(now) {
    const t = G ? targets() : { kind: null };
    if (ui.dirty || (t.kind && !reduceMotion)) { draw(now); ui.dirty = false; }
    requestAnimationFrame(loop);
  }

  // pointer: tap, drag to pan, pinch / wheel to zoom
  const ptrs = new Map();
  let gesture = { moved: 0, pinch: 0, id: null };
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, pos(e));
    if (ptrs.size === 1) gesture = { moved: 0, pinch: 0, start: pos(e) };
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
      if (gesture.moved > 8) { v.tx += dx; v.ty += dy; clampView(); ui.dirty = true; }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / gesture.pinch);
      gesture.pinch = d;
    }
  });
  function endPtr(e) {
    const had = ptrs.has(e.pointerId);
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (had && e.type === 'pointerup' && ptrs.size === 0 && gesture.moved <= 8 && p) tap(p.x, p.y);
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  function zoomAt(px, py, f) {
    const v = ui.view; const old = v.z;
    v.z = Math.max(0.7, Math.min(3.2, v.z * f));
    const r = v.z / old;
    v.tx = (px - W / 2) - ((px - W / 2) - v.tx) * r;
    v.ty = (py - H / 2) - ((py - H / 2) - v.ty) * r;
    clampView(); ui.dirty = true;
  }
  $('zin').onclick = () => zoomAt(W / 2, H / 2, 1.25);
  $('zout').onclick = () => zoomAt(W / 2, H / 2, 0.8);
  $('zfit').onclick = fitView;

  function tap(x, y) {
    if (!G) return;
    const t = targets();
    if (!t.kind || !t.list.length) return;
    let best = null, bd = Infinity;
    const lim = t.kind === 'h' ? Infinity : Math.max(26, S * ui.view.z * 0.55);
    t.list.forEach((id) => {
      let px, py;
      if (t.kind === 'v') { px = sx(VERT[id].x); py = sy(VERT[id].y); }
      else if (t.kind === 'e') { px = sx((VERT[EDGE[id].a].x + VERT[EDGE[id].b].x) / 2); py = sy((VERT[EDGE[id].a].y + VERT[EDGE[id].b].y) / 2); }
      else { px = sx(HEX[id].x); py = sy(HEX[id].y); }
      const d = Math.hypot(px - x, py - y);
      const max = t.kind === 'h' ? 0.95 * S * ui.view.z : lim;
      if (d < bd && d <= max) { bd = d; best = id; }
    });
    if (best !== null) onTarget(t.kind, best);
  }

  // ------------------------------------------------------------ HUD
  function playersHtml() {
    return G.players.map((pl, i) => {
      const pub = C.publicVP(G, i), hid = i === 0 ? C.hiddenVp(pl) : 0;
      const badges = (G.longest.owner === i ? '<span class="badge">LONGEST ROAD</span>' : '') + (G.army.owner === i ? '<span class="badge">ARMY</span>' : '');
      return '<div class="pcard' + (G.current === i && G.phase !== 'gameover' ? ' active' : '') + '" style="--pc:' + PCOL[i] + '">' +
        '<div class="nm">' + esc(pl.name) + (i === 0 ? '' : '') + '</div>' +
        '<div class="vp">' + pub + '<small>VP' + (hid ? ' (+' + hid + ')' : '') + '</small></div>' +
        '<div class="st">Cards <b>' + C.handSize(pl) + '</b> Dev <b>' + C.devCount(pl) + '</b></div>' +
        '<div class="st" title="Longest road length / knights played">Road <b>' + G.roadLen[i] + '</b> Kn <b>' + pl.knights + '</b></div>' +
        '<div class="st">' + (badges || '&nbsp;') + '</div></div>';
    }).join('');
  }
  function handHtml() {
    return RES.map((r) => '<div class="chip r-' + r + (me().res[r] ? '' : ' dim') + '" title="' + C.RES_NAME[r] + '">' + C.RES_NAME[r] + '<b>' + me().res[r] + '</b></div>').join('');
  }

  function reasonCant(kind) {
    const pl = me();
    if (!myTurn()) return 'Not your turn.';
    if (G.phase !== 'main' || G.freeRoads > 0) return 'Not available right now.';
    if (kind === 'road') {
      if (pl.roadsLeft <= 0) return 'No roads left.';
      if (!C.canAfford(pl, C.COST.road)) return 'A road costs 1 Brick and 1 Lumber.';
      if (!C.roadSpots(G, 0).length) return 'No legal road spots.';
    } else if (kind === 'settlement') {
      if (pl.settlementsLeft <= 0) return 'No settlements left.';
      if (!C.canAfford(pl, C.COST.settlement)) return 'A settlement costs Brick, Lumber, Wool and Grain.';
      if (!C.settlementSpots(G, 0, false).length) return 'No legal spot. Settlements need your road and two edges of space.';
    } else if (kind === 'city') {
      if (pl.citiesLeft <= 0) return 'No cities left.';
      if (!C.canAfford(pl, C.COST.city)) return 'A city costs 3 Ore and 2 Grain.';
      if (!C.cityVertices(G, 0).length) return 'You have no settlement to upgrade.';
    } else if (kind === 'dev') {
      if (!G.devDeck.length) return 'The development deck is empty.';
      if (!C.canAfford(pl, C.COST.dev)) return 'A development card costs Ore, Wool and Grain.';
    }
    return '';
  }
  function playableDev() {
    const pl = me();
    return C.DEV_TYPES.filter((d) => d !== 'vp' && pl.dev[d] > 0).length > 0 && !G.devPlayed;
  }

  function actionsHtml() {
    if (G.phase === 'gameover') return '<button class="btn primary full" data-a="menu">New game</button>';
    if (G.phase === 'setup') {
      const t = myTurn();
      return '<div class="hint">' + (t ? (G.setup.step === 'settlement' ? 'Tap a glowing spot to place a settlement.' : 'Tap a glowing road spot next to it.') : esc(G.players[G.current].name) + ' is placing...') + '</div>';
    }
    if (!myTurn()) {
      let h = '<div class="hint">' + esc(G.players[G.current].name) + ' is playing...</div>';
      if (G.phase === 'discard' && G.discardQueue.some((q) => q.p === 0)) h = '<button class="btn primary full" data-a="discard">Discard cards</button>';
      return h;
    }
    if (G.phase === 'discard') return G.discardQueue.some((q) => q.p === 0) ? '<button class="btn primary full" data-a="discard">Discard cards</button>' : '<div class="hint">Waiting for others to discard...</div>';
    if (G.phase === 'robber') return '<div class="hint">Tap a hex to move the robber there.</div>';
    if (G.phase === 'steal') return '<div class="hint">Choose who to steal from.</div>';
    if (G.phase === 'roll') {
      return '<button class="btn primary full" data-a="roll">Roll dice</button>' +
        (me().dev.knight > 0 && !G.devPlayed ? '<button class="btn full small" data-a="knight">Play Knight before rolling</button>' : '');
    }
    const dis = (k) => (reasonCant(k) ? ' aria-disabled="true"' : '');
    const on = (m) => (ui.mode === m ? ' on' : '');
    if (G.freeRoads > 0) return '<div class="hint">Road Building: tap a glowing spot to place a free road (' + G.freeRoads + ' left).</div>';
    return '<button class="btn' + on('road') + '" data-a="road"' + dis('road') + '>Road<small>' + costHtml(C.COST.road) + '</small></button>' +
      '<button class="btn' + on('settlement') + '" data-a="settlement"' + dis('settlement') + '>Settle<small>' + costHtml(C.COST.settlement) + '</small></button>' +
      '<button class="btn' + on('city') + '" data-a="city"' + dis('city') + '>City<small>' + costHtml(C.COST.city) + '</small></button>' +
      '<button class="btn" data-a="buydev"' + dis('dev') + '>Buy card<small>' + costHtml(C.COST.dev) + '</small></button>' +
      '<button class="btn" data-a="dev">Dev cards<small>' + C.devCount(me()) + ' held</small></button>' +
      '<button class="btn" data-a="trade">Trade<small>bank / players</small></button>' +
      '<button class="btn primary full" style="grid-column: span 2" data-a="end">End turn</button>';
  }

  function statusHtml() {
    const dice = G.dice ? '<div class="dice"><div class="die">' + G.dice[0] + '</div><div class="die">' + G.dice[1] + '</div></div>' : '';
    const last = G.log[G.log.length - 1] || '';
    let msg;
    if (G.phase === 'gameover') msg = esc(G.players[G.winner].name) + ' won the game';
    else if (G.phase === 'setup') msg = 'Setup: ' + esc(G.players[G.current].name) + ' (' + (G.setup.idx < G.nPlayers ? 'first' : 'second') + ' placement)';
    else if (G.phase === 'roll') msg = (myTurn() ? 'Your turn' : esc(G.players[G.current].name) + "'s turn") + ': roll the dice';
    else if (G.phase === 'discard') msg = 'A 7 was rolled: discard half if you hold more than 7';
    else if (G.phase === 'robber') msg = myTurn() ? 'Move the robber' : esc(G.players[G.current].name) + ' moves the robber';
    else if (G.phase === 'steal') msg = 'Choose a victim';
    else msg = (myTurn() ? 'Your turn' : esc(G.players[G.current].name) + "'s turn") + ' (turn ' + G.turn + ')';
    return dice + '<div class="msg">' + msg + '<em>' + esc(last) + '</em></div>';
  }

  function bannerText() {
    if (!G || G.phase === 'gameover') return '';
    if (G.phase === 'setup' && myTurn()) return G.setup.step === 'settlement' ? 'Place a settlement' : 'Place a road';
    if (!myTurn()) return '';
    if (G.phase === 'robber') return 'Tap a hex for the robber';
    if (G.phase === 'main' && G.freeRoads > 0) return 'Place a free road';
    if (G.phase === 'main' && ui.mode) return { road: 'Tap a spot to build a road', settlement: 'Tap a spot to build a settlement', city: 'Tap a settlement to upgrade' }[ui.mode];
    return '';
  }

  function render() {
    if (!G) return;
    const np = G.nPlayers;
    $('players').style.setProperty('--np', np);
    $('players').innerHTML = playersHtml();
    $('status').innerHTML = statusHtml();
    $('hand').innerHTML = handHtml();
    $('actions').innerHTML = actionsHtml();
    const bt = bannerText();
    $('banner').innerHTML = bt ? '<span>' + esc(bt) + '</span>' : '';
    const lg = $('log');
    lg.innerHTML = G.log.slice(-80).map((m) => '<li>' + esc(m) + '</li>').join('');
    lg.parentElement.scrollTop = lg.parentElement.scrollHeight;
    ui.dirty = true;
    maybeModals();
    if (ui.modal === 'trade') renderTrade();
    if (ui.modal === 'log') renderLogModal();
  }

  // modals that the game forces
  function maybeModals() {
    if (G.phase === 'gameover') { showGameOver(); return; }
    if (ui.modal === 'discard') { if (!G.discardQueue.some((q) => q.p === 0)) closeModal(); else return; }
    if (G.phase === 'discard' && G.discardQueue.some((q) => q.p === 0) && ui.modal !== 'discard' && !ui.modal) openDiscard();
    if (G.phase === 'steal' && myTurn() && ui.modal !== 'steal') openSteal();
    if (ui.modal === 'steal' && G.phase !== 'steal') closeModal();
  }

  // ------------------------------------------------------------ modal plumbing
  let prevFocus = null;
  function openModal(kind, html) {
    ui.modal = kind;
    prevFocus = document.activeElement;
    $('modalBody').innerHTML = html;
    $('modal').hidden = false;
    const f = $('sheet').querySelector('button, input');
    if (f) f.focus({ preventScroll: true });
  }
  function setModalHtml(html) {
    const sheet = $('sheet'), st = sheet.scrollTop;
    $('modalBody').innerHTML = html; sheet.scrollTop = st;
  }
  function closeModal() {
    ui.modal = null; ui.tr = null; ui.pickDev = null;
    $('modal').hidden = true;
    $('modalBody').innerHTML = '';
    if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal') && !['discard', 'steal', 'over'].includes(ui.modal)) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.modal && !['discard', 'steal', 'over'].includes(ui.modal)) closeModal();
  });

  // ------------------------------------------------------------ start / menu
  function openMenu(first) {
    const sv = loadSave();
    const t = tally();
    let h = '<p class="big">Settlers of Catan</p>';
    h += '<p>Play against 2 or 3 computer opponents. First to 10 victory points wins.</p>';
    if (sv) {
      const pv = C.publicVP(sv, 0);
      h += '<button class="btn primary" style="width:100%" data-m="resume">Resume saved game (turn ' + sv.turn + ', you ' + pv + ' VP)</button>';
    }
    h += '<h3>New game</h3><div class="seg"><button class="btn sel" data-m="np" data-n="4">4 players</button><button class="btn" data-m="np" data-n="3">3 players</button></div>';
    h += '<p>Seed (optional, same seed gives the same board and dice)</p><input type="text" inputmode="numeric" id="seedIn" placeholder="random" aria-label="Seed" />';
    h += '<div class="row"><button class="btn primary" data-m="new">Start new game</button></div>';
    h += '<div class="tally">Record against the computer: <b>' + t.wins + '</b> won, <b>' + t.losses + '</b> lost.</div>';
    h += '<div class="row"><button class="btn small" data-m="rules">How to play</button>' + (G ? '<button class="btn small" data-m="close">Back to game</button>' : '') + '</div>';
    openModal('menu', h);
    ui.menuN = 4;
  }
  function openRules() {
    openModal('rules', '<h2>How to play / rules used</h2>' +
      '<h3>Goal</h3><p>Be the first to reach 10 victory points on your own turn. Settlements are 1 point, cities 2, Longest Road 2, Largest Army 2, and Victory Point cards 1 each (hidden until revealed; they count when you win).</p>' +
      '<h3>Setup</h3><p>Each player places 2 settlements and 2 roads in snake order (1,2,3,4,4,3,2,1). Your second settlement pays one card for each adjacent land hex. Settlements need at least two edges of space from any other settlement.</p>' +
      '<h3>Your turn</h3><ul><li>Roll two dice. Every hex with that number pays 1 card to each adjacent settlement and 2 to each city. If the bank cannot pay everyone for a resource and more than one player is owed it, nobody gets it; if only one player is owed, they get what is left.</li>' +
      '<li>On a 7 nobody collects. Anyone with more than 7 cards discards half (rounded down). Then the roller moves the robber and steals one random card from a player on that hex. The robber blocks the hex it sits on.</li>' +
      '<li>Then build, trade and play one development card in any order, and end your turn.</li></ul>' +
      '<h3>Costs</h3><ul><li>Road: Brick + Lumber (15 pieces). It must touch your own road, settlement or city.</li><li>Settlement: Brick + Lumber + Wool + Grain (5 pieces). It must connect to your road.</li><li>City: 3 Ore + 2 Grain, replaces one of your settlements (4 pieces).</li><li>Development card: Ore + Wool + Grain.</li></ul>' +
      '<h3>Trading</h3><p>Bank 4:1. A generic port gives 3:1. A specific port gives 2:1 for its resource. You can also offer a trade to any opponent: choose what you give and what you want. The computer players accept only offers that help them and that do not cost them what they are saving for. They never start a trade themselves, and they refuse to help a player who is close to winning.</p>' +
      '<h3>Development cards (25)</h3><ul><li>Knight (14): move the robber and steal. Three played Knights take Largest Army; someone must have strictly more to take it from you.</li><li>Road Building (2): place 2 free roads.</li><li>Year of Plenty (2): take any 2 resources from the bank.</li><li>Monopoly (2): name a resource, every opponent hands over all of it.</li><li>Victory Point (5): worth 1 point.</li></ul>' +
      '<p>You may play one development card per turn, never one bought this turn (Victory Points are the exception). In this version Knights can be played before or after the roll; the other cards only after rolling.</p>' +
      '<h3>Longest Road</h3><p>5 or more connected road segments earn 2 points. An opponent settlement built on your road breaks it. Cycles count once per segment. A tie never takes the card from its holder; if the holder is broken and two players tie, nobody holds it.</p>' +
      '<h3>Controls</h3><p>Tap glowing spots on the board to place pieces or the robber. Drag to pan, pinch or use the + and minus buttons to zoom, Fit to reset. Your game saves automatically after every action. Add <b>?seed=123</b> to the address for a repeatable board and dice.</p>' +
      '<button class="btn primary close" data-m="close">Got it</button>');
  }
  function renderLogModal() {
    setModalHtml('<h2>Action log</h2><ol class="biglog">' + G.log.slice(-120).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ol><button class="btn close" data-m="close">Close</button>');
  }
  function showGameOver() {
    if (ui.modal === 'over' || ui.modal === 'viewing') return;
    recordResult();
    const t = tally();
    const won = G.winner === 0;
    const rows = G.players.map((pl, i) => '<li>' + esc(pl.name) + ': ' + C.totalVP(G, i) + ' VP</li>').join('');
    openModal('over', '<p class="big">' + (won ? 'You win!' : esc(G.players[G.winner].name) + ' wins') + '</p><ul>' + rows + '</ul>' +
      '<div class="tally">Record: <b>' + t.wins + '</b> won, <b>' + t.losses + '</b> lost.</div>' +
      '<div class="row"><button class="btn primary" data-m="menu2">New game</button><button class="btn" data-m="close2">Look at the board</button></div>');
  }

  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-m]');
    if (!m) return;
    const k = m.dataset.m;
    if (k === 'close') closeModal();
    else if (k === 'close2') { ui.modal = 'viewing'; $('modal').hidden = true; }
    else if (k === 'rules') openRules();
    else if (k === 'menu2') openMenu();
    else if (k === 'resume') { const s = loadSave(); if (s) { G = s; closeModal(); fitView(); render(); pump(); } }
    else if (k === 'np') {
      ui.menuN = +m.dataset.n;
      document.querySelectorAll('[data-m="np"]').forEach((b) => b.classList.toggle('sel', b === m));
    } else if (k === 'new') {
      const raw = ($('seedIn').value || '').trim();
      const seed = /^\d+$/.test(raw) ? (+raw >>> 0) : (Date.now() >>> 0);
      startNew(ui.menuN === 3 ? 3 : 4, seed);
    }
  });

  // ------------------------------------------------------------ discard / steal
  function openDiscard() {
    const q = G.discardQueue.find((x) => x.p === 0);
    if (!q) return;
    ui.dis = {}; RES.forEach((r) => { ui.dis[r] = 0; });
    ui.disN = q.n;
    openModal('discard', '');
    renderDiscard();
  }
  function renderDiscard() {
    const sum = RES.reduce((t, r) => t + ui.dis[r], 0);
    let h = '<h2>Discard ' + ui.disN + ' cards</h2><p>A 7 was rolled and you hold more than 7 cards. Choose ' + ui.disN + ' to give back.</p>';
    RES.forEach((r) => {
      h += '<div class="stepper"><span class="lab">' + chip(r) + ' ' + C.RES_NAME[r] + ' <span class="own">you have ' + me().res[r] + '</span></span><button data-d="-" data-r="' + r + '" aria-label="Less ' + r + '">&minus;</button><span class="n">' + ui.dis[r] + '</span><button data-d="+" data-r="' + r + '" aria-label="More ' + r + '">+</button></div>';
    });
    h += '<button class="btn primary close" data-d="ok"' + (sum === ui.disN ? '' : ' aria-disabled="true"') + '>Discard ' + sum + ' of ' + ui.disN + '</button>';
    setModalHtml(h);
  }
  function openSteal() {
    let h = '<h2>Steal a card</h2><p>Choose a player next to the robber.</p><div class="row">';
    G.stealFrom.forEach((p) => { h += '<button class="btn" data-s="' + p + '"><span style="color:' + PCOL[p] + '">&#9679;</span> ' + esc(G.players[p].name) + '<small>' + C.handSize(G.players[p]) + ' cards</small></button>'; });
    openModal('steal', h + '</div>');
  }

  // ------------------------------------------------------------ dev cards
  function openDev() {
    const pl = me();
    let h = '<h2>Development cards</h2>';
    const any = C.DEV_TYPES.some((d) => pl.dev[d] + pl.newDev[d] > 0);
    if (!any) h += '<p>You hold no development cards. Buy one for Ore, Wool and Grain.</p>';
    const can = (G.phase === 'main' && G.freeRoads === 0 && myTurn()) || (G.phase === 'roll' && myTurn());
    C.DEV_TYPES.forEach((d) => {
      const n = pl.dev[d], nw = pl.newDev[d];
      if (n + nw === 0) return;
      const desc = { knight: 'Move the robber and steal a card.', vp: 'Worth 1 victory point. Counts toward winning automatically.', road: 'Place 2 free roads.', plenty: 'Take any 2 resources from the bank.', monopoly: 'Take all of one resource from every opponent.' }[d];
      h += '<div class="stepper" style="flex-wrap:wrap"><span class="lab">' + C.DEV_NAME[d] + ' x' + (n + nw) + '<br><span class="own">' + desc + (nw ? ' (' + nw + ' bought this turn, playable next turn)' : '') + '</span></span>';
      if (d === 'vp') { if (myTurn() && G.phase !== 'setup') h += '<button class="btn small" style="width:auto;padding:0 12px" data-dv="vp">Reveal</button>'; }
      else if (n > 0) h += '<button class="btn small" style="width:auto;padding:0 12px" data-dv="' + d + '"' + (can && !G.devPlayed ? '' : ' aria-disabled="true"') + '>Play</button>';
      h += '</div>';
    });
    if (G.devPlayed) h += '<p>You already played a card this turn.</p>';
    if (pl.hiddenVp) h += '';
    if (ui.pickDev === 'plenty') {
      h += '<h3>Year of Plenty: choose 2 resources</h3><div class="pick">' + RES.map((r) => '<button class="chip r-' + r + (ui.plentyPick && ui.plentyPick.includes(r) ? ' sel' : '') + '" data-pp="' + r + '">' + C.RES_NAME[r] + '<small>' + (ui.plentyPick ? ui.plentyPick.filter((x) => x === r).length : 0) + '</small></button>').join('') + '</div>';
    }
    if (ui.pickDev === 'monopoly') {
      h += '<h3>Monopoly: choose a resource</h3><div class="pick">' + RES.map((r) => '<button class="chip r-' + r + '" data-mp="' + r + '">' + C.RES_NAME[r] + '</button>').join('') + '</div>';
    }
    h += '<button class="btn close" data-m="close">Close</button>';
    if (ui.modal !== 'dev') openModal('dev', h); else setModalHtml(h);
  }

  // ------------------------------------------------------------ trade
  function openTrade() {
    ui.tr = { tab: 'bank', bg: null, bt: null, give: {}, get: {} };
    RES.forEach((r) => { ui.tr.give[r] = 0; ui.tr.get[r] = 0; });
    openModal('trade', '');
    renderTrade();
  }
  function renderTrade() {
    const t = ui.tr; if (!t) return;
    const pl = me();
    let h = '<h2>Trade</h2><div class="tabs"><button class="btn' + (t.tab === 'bank' ? ' sel' : '') + '" data-t="tab" data-v="bank">Bank and ports</button><button class="btn' + (t.tab === 'players' ? ' sel' : '') + '" data-t="tab" data-v="players">Players</button></div>';
    if (t.tab === 'bank') {
      h += '<p>Pick what you give, then what you want.</p><div class="pick">';
      RES.forEach((r) => {
        const rt = C.ratio(G, 0, r), ok = pl.res[r] >= rt;
        h += '<button class="chip r-' + r + (t.bg === r ? ' sel' : '') + '" data-t="bg" data-v="' + r + '"' + (ok ? '' : ' aria-disabled="true"') + '>' + LET[r] + ' ' + pl.res[r] + '<small>' + rt + ':1</small></button>';
      });
      h += '</div><p>Get one of:</p><div class="pick">';
      RES.forEach((r) => { h += '<button class="chip r-' + r + (t.bt === r ? ' sel' : '') + '" data-t="bt" data-v="' + r + '">' + LET[r] + '<small>' + C.RES_NAME[r] + '</small></button>'; });
      h += '</div>';
      const ok = t.bg && t.bt && t.bg !== t.bt && pl.res[t.bg] >= C.ratio(G, 0, t.bg);
      h += '<button class="btn primary close" data-t="bank"' + (ok ? '' : ' aria-disabled="true"') + '>' + (t.bg && t.bt ? 'Trade ' + C.ratio(G, 0, t.bg) + ' ' + C.RES_NAME[t.bg] + ' for 1 ' + C.RES_NAME[t.bt] : 'Choose resources') + '</button>';
    } else {
      h += '<h3>You give</h3>';
      RES.forEach((r) => { h += '<div class="stepper"><span class="lab">' + chip(r) + ' ' + C.RES_NAME[r] + ' <span class="own">have ' + pl.res[r] + '</span></span><button data-t="gm" data-v="' + r + '" aria-label="Give less ' + r + '">&minus;</button><span class="n">' + t.give[r] + '</span><button data-t="gp" data-v="' + r + '" aria-label="Give more ' + r + '">+</button></div>'; });
      h += '<h3>You want</h3>';
      RES.forEach((r) => { h += '<div class="stepper"><span class="lab">' + chip(r) + ' ' + C.RES_NAME[r] + '</span><button data-t="wm" data-v="' + r + '" aria-label="Want less ' + r + '">&minus;</button><span class="n">' + t.get[r] + '</span><button data-t="wp" data-v="' + r + '" aria-label="Want more ' + r + '">+</button></div>'; });
      h += '<h3>Offer to</h3><div class="row">';
      G.players.forEach((o, i) => { if (i) h += '<button class="btn small" data-t="offer" data-v="' + i + '"><span style="color:' + PCOL[i] + '">&#9679;</span> ' + esc(o.name) + '<small>' + C.handSize(o) + ' cards</small></button>'; });
      h += '<button class="btn small" data-t="offer" data-v="all">Everyone</button></div>';
    }
    h += '<button class="btn close" data-m="close">Done</button>';
    setModalHtml(h);
  }
  function sumOf(o) { return RES.reduce((t, r) => t + o[r], 0); }
  function tradeClick(el) {
    const t = ui.tr, k = el.dataset.t, v = el.dataset.v, pl = me();
    if (k === 'tab') { t.tab = v; }
    else if (k === 'bg') { if (pl.res[v] < C.ratio(G, 0, v)) toast('You need ' + C.ratio(G, 0, v) + ' ' + C.RES_NAME[v] + ' (rate ' + C.ratio(G, 0, v) + ':1).'); else t.bg = v; if (t.bt === v) t.bt = null; }
    else if (k === 'bt') { t.bt = v; if (t.bg === v) t.bg = null; }
    else if (k === 'bank') {
      if (!(t.bg && t.bt)) return toast('Choose what to give and what to get.');
      const r = act({ t: 'bank_trade', give: t.bg, get: t.bt });
      if (r.ok) { toast('Traded ' + r.rate + ' ' + C.RES_NAME[t.bg] + ' for 1 ' + C.RES_NAME[t.bt]); t.bg = null; t.bt = null; }
    } else if (k === 'gp') { if (t.give[v] < pl.res[v]) { t.give[v]++; t.get[v] = 0; } }
    else if (k === 'gm') { if (t.give[v] > 0) t.give[v]--; }
    else if (k === 'wp') { if (t.get[v] < 9) { t.get[v]++; t.give[v] = 0; } }
    else if (k === 'wm') { if (t.get[v] > 0) t.get[v]--; }
    else if (k === 'offer') {
      if (!sumOf(t.give) || !sumOf(t.get)) return toast('Choose something to give and something to get.');
      const order = v === 'all' ? G.players.map((o, i) => i).filter((i) => i) : [+v];
      let done = false;
      for (const pid of order) {
        const offer = { from: 0, give: Object.assign({}, t.give), get: Object.assign({}, t.get) };
        G.log.push('You offer ' + G.players[pid].name + ' ' + fmt(t.give) + ' for ' + fmt(t.get) + '.');
        const resp = C.aiRespondTrade(G, pid, offer);
        if (!resp.accept) { G.log.push(G.players[pid].name + ' declines.'); continue; }
        const r = C.apply(G, { t: 'player_trade', with: pid, give: offer.give, get: offer.get });
        if (r.ok) { toast(G.players[pid].name + ' accepts.'); done = true; RES.forEach((x) => { t.give[x] = 0; t.get[x] = 0; }); break; }
        G.log.push(G.players[pid].name + ' cannot do that.');
      }
      if (!done) toast(order.length > 1 ? 'Nobody accepted.' : G.players[order[0]].name + ' declines.');
      saveGame(); render(); return;
    }
    renderTrade();
  }
  function fmt(o) { return RES.filter((r) => o[r]).map((r) => o[r] + ' ' + C.RES_NAME[r]).join(', '); }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-t],[data-d],[data-s],[data-dv],[data-pp],[data-mp]');
    if (!el || !G) return;
    if (el.dataset.t && ui.tr) { tradeClick(el); return; }
    if (el.dataset.d !== undefined) {
      const d = el.dataset.d, r = el.dataset.r;
      if (d === '+') { if (ui.dis[r] < me().res[r] && RES.reduce((t, x) => t + ui.dis[x], 0) < ui.disN) ui.dis[r]++; }
      else if (d === '-') { if (ui.dis[r] > 0) ui.dis[r]--; }
      else if (d === 'ok') {
        if (RES.reduce((t, x) => t + ui.dis[x], 0) !== ui.disN) return toast('Choose exactly ' + ui.disN + ' cards.');
        const res = Object.assign({}, ui.dis);
        closeModal();
        act({ t: 'discard', p: 0, res });
        return;
      }
      renderDiscard(); return;
    }
    if (el.dataset.s !== undefined) { closeModal(); act({ t: 'steal', from: +el.dataset.s }); return; }
    if (el.dataset.dv) {
      const d = el.dataset.dv;
      if (el.getAttribute('aria-disabled') === 'true') return toast(G.devPlayed ? 'Only one development card per turn.' : 'Play it after rolling.');
      if (d === 'knight') { closeModal(); act({ t: 'play_knight' }); }
      else if (d === 'road') { closeModal(); act({ t: 'play_road_building' }); }
      else if (d === 'vp') { act({ t: 'play_vp' }); openDev(); }
      else if (d === 'plenty') { ui.pickDev = 'plenty'; ui.plentyPick = []; openDev(); }
      else if (d === 'monopoly') { ui.pickDev = 'monopoly'; openDev(); }
      return;
    }
    if (el.dataset.pp) {
      ui.plentyPick.push(el.dataset.pp);
      if (ui.plentyPick.length === 2) { const [a, b] = ui.plentyPick; ui.pickDev = null; closeModal(); act({ t: 'play_plenty', a, b }); }
      else openDev();
      return;
    }
    if (el.dataset.mp) { const r = el.dataset.mp; closeModal(); act({ t: 'play_monopoly', res: r }); }
  });

  // ------------------------------------------------------------ action buttons
  $('actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || !G) return;
    const a = b.dataset.a;
    if (a === 'menu') return openMenu();
    if (a === 'roll') return act({ t: 'roll' });
    if (a === 'knight') return act({ t: 'play_knight' });
    if (a === 'discard') return openDiscard();
    if (a === 'end') { ui.mode = null; return act({ t: 'end_turn' }); }
    if (a === 'dev') { return openDev(); }
    if (a === 'trade') { return openTrade(); }
    if (a === 'buydev') {
      const why = reasonCant('dev'); if (why) return toast(why);
      const r = act({ t: 'buy_dev' });
      if (r.ok) toast('You drew: ' + C.DEV_NAME[r.card] + (r.card === 'vp' ? '' : ' (playable next turn)'));
      return;
    }
    if (a === 'road' || a === 'settlement' || a === 'city') {
      const why = reasonCant(a); if (why) return toast(why);
      ui.mode = ui.mode === a ? null : a;
      render();
    }
  });
  $('btnMenu').onclick = () => openMenu();
  $('btnRules').onclick = () => openRules();
  $('btnLog').onclick = () => { openModal('log', ''); renderLogModal(); };

  // ------------------------------------------------------------ boot
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('boardwrap'));
  window.__catan = {
    get state() { return G; }, act, targets, ui,
    screenOf(kind, id) {
      const r = cv.getBoundingClientRect();
      if (kind === 'v') return { x: r.left + sx(VERT[id].x), y: r.top + sy(VERT[id].y) };
      if (kind === 'e') return { x: r.left + sx((VERT[EDGE[id].a].x + VERT[EDGE[id].b].x) / 2), y: r.top + sy((VERT[EDGE[id].a].y + VERT[EDGE[id].b].y) / 2) };
      return { x: r.left + sx(HEX[id].x), y: r.top + sy(HEX[id].y) };
    },
  };
  resize();
  requestAnimationFrame(loop);

  (function boot() {
    const q = new URLSearchParams(location.search);
    if (q.has('seed') && /^\d+$/.test(q.get('seed'))) {
      startNew(q.get('players') === '3' ? 3 : 4, (+q.get('seed')) >>> 0);
      return;
    }
    // blank board behind the start dialog
    G = null;
    openMenu(true);
    ui.dirty = true;
  })();
})();
