/* Procedural board art for Settlers of Catan.
   Everything here is drawn with canvas paths and gradients: no image assets, no network.
   Coordinates: hex radius = 1 unit. The board is viewed from a slightly elevated camera,
   which is a vertical squash (YS) of the top plane; tiles extrude straight down by LIFT. */
(function () {
  'use strict';
  const YS = 0.86;           // vertical squash of the ground plane
  const LIFT = 0.22;         // tile thickness in hex-radius units
  const SANS = "Jost, system-ui, 'Segoe UI', Arial, sans-serif";
  const INK = '#2B2622';
  const PCOL = ['#C8372D', '#2F6DB5', '#3A3632', '#8A4FC0'];
  const PLITE = ['#EC6F60', '#6AA0E0', '#6E655E', '#B687E6'];
  const PDARK = ['#7A1E17', '#1B4270', '#17140F', '#4F2C74'];
  const RCOL = { brick: '#C9694A', lumber: '#4F8F58', wool: '#A8CC7A', grain: '#E6C760', ore: '#9AA0A8' };
  const TWORD = { hill: 'BRICK', forest: 'LUMBER', pasture: 'WOOL', field: 'GRAIN', mountain: 'ORE', desert: 'DESERT' };
  const TER = {
    forest: { hi: '#5E9C5E', base: '#3F7D4A', lo: '#2A5636' },
    pasture: { hi: '#C2E08E', base: '#9CC96C', lo: '#78A94F' },
    field: { hi: '#F3D36E', base: '#E1B94A', lo: '#BC9032' },
    hill: { hi: '#DD8E6A', base: '#C66B48', lo: '#974B30' },
    mountain: { hi: '#B4B9BF', base: '#8D939A', lo: '#5D636B' },
    desert: { hi: '#F4E7C5', base: '#E5D3A3', lo: '#C9B27C' },
  };
  const DEEP = '#0B1F2E';

  // ------------------------------------------------------------ small helpers
  function prng(seed) {
    let s = (seed * 2654435761 + 97) >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(h, a) { const c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function shade(h, t) { // t in [-1, 1]: negative darkens toward black, positive lightens toward white
    const c = hexRgb(h); const m = t < 0 ? 0 : 255; const k = Math.abs(t);
    return 'rgb(' + c.map((v) => Math.round(v + (m - v) * k)).join(',') + ')';
  }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  // ------------------------------------------------------------ backdrop (screen space, cached per size)
  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    const t = mk(160, 160), g = t.getContext('2d'), r = prng(11);
    for (let i = 0; i < 2600; i++) {
      const a = r();
      g.fillStyle = a < 0.5 ? 'rgba(255,255,255,' + (0.03 + r() * 0.07) + ')' : 'rgba(0,0,0,' + (0.04 + r() * 0.08) + ')';
      g.fillRect(r() * 160, r() * 160, 1 + r() * 1.4, 1 + r() * 1.4);
    }
    grainTile = t; return t;
  }
  let bd = null;
  function backdrop(W, H, DPR) {
    const key = W + 'x' + H + '@' + DPR;
    if (bd && bd.key === key) return bd.c;
    const c = mk(W * DPR, H * DPR), g = c.getContext('2d');
    g.scale(DPR, DPR);
    const R = Math.hypot(W, H) * 0.62;
    const rg = g.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, R);
    rg.addColorStop(0, '#1F6472'); rg.addColorStop(0.5, '#153F55'); rg.addColorStop(1, DEEP);
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.55; g.fillStyle = g.createPattern(grain(), 'repeat'); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    // warm light sweep from the upper left
    const sw = g.createLinearGradient(0, 0, W * 0.9, H);
    sw.addColorStop(0, 'rgba(255,236,190,.13)'); sw.addColorStop(0.45, 'rgba(255,236,190,0)'); sw.addColorStop(1, 'rgba(0,0,0,.12)');
    g.fillStyle = sw; g.fillRect(0, 0, W, H);
    // vignette
    const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, R);
    vg.addColorStop(0, 'rgba(3,12,20,0)'); vg.addColorStop(1, 'rgba(3,12,20,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    bd = { key, c }; return c;
  }

  // ------------------------------------------------------------ world (board space, cached per zoom + board)
  const X0 = -6.4, X1 = 6.4, Y0 = -5.5, Y1 = 5.5;   // bounds in (x, squashed y) units
  function worldKey(p) {
    return [p.G.hexes.map((h) => h.terrain[0] + (h.num || 0)).join(''), p.G.ports.map((q) => q.edge + q.type[0]).join(''), p.fontsOK ? 1 : 0].join('|');
  }
  function buildWorld(p) {
    const { HEX, VERT, G, kw } = p;
    const ox = -X0, oy = -Y0;
    const c = mk((X1 - X0) * kw, (Y1 - Y0) * kw), g = c.getContext('2d');
    g.setTransform(kw, 0, 0, kw, ox * kw, oy * kw); // unit coords, y already squashed by callers
    const P = (v) => [VERT[v].x, VERT[v].y * YS];
    const hexPts = HEX.map((h) => h.verts.map(P));
    g.lineJoin = 'round'; g.lineCap = 'round';

    // --- water near the island
    const wg = g.createRadialGradient(0, 0, 0.5, 0, 0, 6.2);
    wg.addColorStop(0, '#2D8A8E'); wg.addColorStop(0.55, '#1E6C7A'); wg.addColorStop(0.86, 'rgba(19,59,80,1)'); wg.addColorStop(1, 'rgba(19,59,80,0)');
    g.fillStyle = wg; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    // shallow turquoise shelf around the island, with a cell-like caustic net
    g.save(); g.scale(1, YS);
    const sg = g.createRadialGradient(0, 0, 3.4, 0, 0, 5.1);
    sg.addColorStop(0, 'rgba(120,214,205,.42)'); sg.addColorStop(0.45, 'rgba(96,196,190,.22)'); sg.addColorStop(1, 'rgba(70,170,170,0)');
    g.fillStyle = sg; ell(g, 0, 0, 5.2, 5.2); g.fill();
    const cr = prng(23);
    g.lineWidth = 0.018;
    for (let i = 0; i < 220; i++) {
      const a0 = cr() * Math.PI * 2, d0 = 3.7 + cr() * 1.4, x0 = Math.cos(a0) * d0, y0 = Math.sin(a0) * d0, rad = 0.07 + cr() * 0.15, n = 8;
      g.beginPath();
      for (let j = 0; j <= n; j++) { const t = j / n * Math.PI * 2, rr = rad * (0.75 + cr() * 0.5); const x = x0 + Math.cos(t) * rr, y = y0 + Math.sin(t) * rr; if (j) g.lineTo(x, y); else g.moveTo(x, y); }
      g.closePath(); g.strokeStyle = 'rgba(225,250,245,' + (0.05 + cr() * 0.09) + ')'; g.stroke();
    }
    g.restore();
    // caustic ripple bands
    const r = prng(7);
    for (let i = 0; i < 16; i++) {
      const rad = 3.9 + i * 0.13 + r() * 0.08, ph = r() * 6.3, f = 5 + Math.floor(r() * 5), amp = 0.03 + r() * 0.05;
      g.beginPath();
      for (let a = 0; a <= 72; a++) {
        const t = a / 72 * Math.PI * 2, rr = rad + Math.sin(t * f + ph) * amp + Math.sin(t * 2 + ph * 3) * 0.05;
        const x = Math.cos(t) * rr, y = Math.sin(t) * rr * YS;
        if (a) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.strokeStyle = 'rgba(190,240,240,' + (0.04 + r() * 0.06) + ')'; g.lineWidth = 0.015 + r() * 0.035; g.stroke();
    }
    // glints
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 3.95 + r() * 2.1, x = Math.cos(a) * d, y = Math.sin(a) * d * YS, l = 0.05 + r() * 0.16;
      g.strokeStyle = 'rgba(220,250,250,' + (0.08 + r() * 0.14) + ')'; g.lineWidth = 0.012 + r() * 0.02;
      g.beginPath(); g.moveTo(x - l, y); g.lineTo(x + l, y); g.stroke();
    }
    // --- island cast shadow (light from upper left)
    g.fillStyle = 'rgba(4,18,28,.28)';
    hexPts.forEach((pts) => { poly(g, pts.map((q) => [q[0] + 0.34, q[1] + LIFT + 0.3])); g.fill(); });
    g.fillStyle = 'rgba(4,18,28,.4)';
    hexPts.forEach((pts) => { poly(g, pts.map((q) => [q[0] + 0.16, q[1] + LIFT + 0.14])); g.fill(); });
    // --- shoreline foam
    g.strokeStyle = 'rgba(215,245,245,.14)'; g.lineWidth = 0.62;
    hexPts.forEach((pts) => { poly(g, pts.map((q) => [q[0], q[1] + LIFT * 0.6])); g.stroke(); });
    g.strokeStyle = 'rgba(235,250,250,.3)'; g.lineWidth = 0.3;
    hexPts.forEach((pts) => { poly(g, pts.map((q) => [q[0], q[1] + LIFT * 0.6])); g.stroke(); });
    g.fillStyle = 'rgba(235,250,250,.25)';
    hexPts.forEach((pts) => { poly(g, pts.map((q) => [q[0], q[1] + LIFT * 0.6])); g.fill(); });

    // --- piers (under the tiles so they appear to tuck under the coast)
    G.ports.forEach((q) => drawPier(g, VERT, q, kw, false));

    // --- extruded sides
    HEX.forEach((h, i) => {
      const pts = hexPts[i], t = TER[G.hexes[i].terrain];
      const face = (a, b, dark) => {
        const A = pts[a], B = pts[b];
        const lg = g.createLinearGradient(0, A[1], 0, A[1] + LIFT);
        lg.addColorStop(0, shade(t.lo, -0.15)); lg.addColorStop(0.3, '#6A4E38'); lg.addColorStop(1, '#3A2A1E');
        poly(g, [A, B, [B[0], B[1] + LIFT], [A[0], A[1] + LIFT]]); g.fillStyle = lg; g.fill();
        if (dark) { g.fillStyle = 'rgba(10,8,6,.35)'; g.fill(); }
        // strata lines
        g.strokeStyle = 'rgba(20,12,6,.25)'; g.lineWidth = 0.012;
        g.beginPath(); g.moveTo(A[0], A[1] + LIFT * 0.45); g.lineTo(B[0], B[1] + LIFT * 0.45); g.stroke();
        g.beginPath(); g.moveTo(A[0], A[1] + LIFT * 0.78); g.lineTo(B[0], B[1] + LIFT * 0.78); g.stroke();
      };
      face(2, 3, false); // lower-left face
      face(1, 2, true);  // lower-right face, away from the light
    });

    // --- tile tops
    HEX.forEach((h, i) => {
      const hx = G.hexes[i], pts = hexPts[i], t = TER[hx.terrain];
      const cx = h.x, cy = h.y * YS;
      g.save(); poly(g, pts); g.clip();
      const lg = g.createLinearGradient(cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9);
      lg.addColorStop(0, t.hi); lg.addColorStop(0.5, t.base); lg.addColorStop(1, t.lo);
      g.fillStyle = lg; g.fillRect(cx - 1.1, cy - 1.1, 2.2, 2.2);
      const rr = prng(i * 31 + 5);
      for (let n = 0; n < 9; n++) {
        ell(g, cx - 0.9 + rr() * 1.8, cy - 0.8 + rr() * 1.6, 0.12 + rr() * 0.3, 0.08 + rr() * 0.18);
        g.fillStyle = rr() < 0.5 ? rgba('#FFFFFF', 0.05 + rr() * 0.05) : rgba('#000000', 0.04 + rr() * 0.05); g.fill();
      }
      drawTerrain(g, hx.terrain, cx, cy, rr, hx.num ? 1 : 0);
      g.restore();
      // bevel: lit edges upper-left, shaded edges lower-right
      g.lineWidth = 0.045; g.strokeStyle = 'rgba(255,246,222,.55)';
      g.beginPath(); g.moveTo(pts[2][0], pts[2][1]); g.lineTo(pts[3][0], pts[3][1]); g.lineTo(pts[4][0], pts[4][1]); g.lineTo(pts[5][0], pts[5][1]); g.lineTo(pts[0][0], pts[0][1]); g.stroke();
      g.strokeStyle = 'rgba(25,16,8,.4)';
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.stroke();
      g.lineWidth = 0.018; g.strokeStyle = 'rgba(30,20,10,.45)'; poly(g, pts); g.stroke();
      // inner soft rim light
      g.lineWidth = 0.09; g.strokeStyle = 'rgba(255,240,205,.08)'; poly(g, pts.map((q) => [cx + (q[0] - cx) * 0.9, cy + (q[1] - cy) * 0.9])); g.stroke();
    });

    // --- labels and number tokens
    HEX.forEach((h, i) => {
      const hx = G.hexes[i], cx = h.x, cy = h.y * YS;
      if (p.labelPx >= 7) {
        g.save(); g.translate(cx, cy - 0.62); g.scale(1 / kw, 1 / kw);
        g.font = '500 ' + p.labelPx + 'px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,250,236,.55)'; g.fillText(TWORD[hx.terrain], 0, 1);
        g.fillStyle = 'rgba(30,22,14,.78)'; g.fillText(TWORD[hx.terrain], 0, 0);
        g.restore();
      }
      if (hx.num) drawToken(g, cx, cy + 0.33, hx.num, p.pipsOf(hx.num), kw);
    });
    // --- pier signs on top
    G.ports.forEach((q) => drawPier(g, VERT, q, kw, true));
    return { c, kw, ox, oy };
  }

  function drawToken(g, x, y, num, pips, kw) {
    const R = 0.34;
    ell(g, x + 0.05, y + 0.08, R * 1.02, R * YS * 1.02); g.fillStyle = 'rgba(10,8,4,.35)'; g.fill();
    ell(g, x, y + 0.03, R, R * YS); g.fillStyle = '#B9A77F'; g.fill();
    const rg = g.createRadialGradient(x - 0.1, y - 0.12, 0.02, x, y, R);
    rg.addColorStop(0, '#FFFEF8'); rg.addColorStop(0.7, '#F6EEDC'); rg.addColorStop(1, '#E2D4B6');
    ell(g, x, y, R, R * YS); g.fillStyle = rg; g.fill();
    g.lineWidth = 0.028; g.strokeStyle = 'rgba(95,72,44,.55)'; g.stroke();
    g.lineWidth = 0.03; g.strokeStyle = 'rgba(255,255,255,.8)';
    g.beginPath(); g.ellipse(x, y, R * 0.86, R * YS * 0.86, 0, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
    g.strokeStyle = 'rgba(90,70,40,.22)';
    g.beginPath(); g.ellipse(x, y, R * 0.86, R * YS * 0.86, 0, Math.PI * 0.1, Math.PI * 0.8); g.stroke();
    const hot = num === 6 || num === 8;
    g.save(); g.translate(x, y - 0.035); g.scale(1 / kw, 1 / kw);
    g.fillStyle = hot ? '#B3321F' : INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 ' + Math.round(0.31 * kw) + 'px ' + SANS; g.fillText(String(num), 0, 0);
    g.restore();
    g.fillStyle = hot ? '#B3321F' : INK;
    for (let q = 0; q < pips; q++) { ell(g, x + (q - (pips - 1) / 2) * 0.075, y + 0.17, 0.026, 0.026); g.fill(); }
  }

  function drawPier(g, VERT, q, kw, top) {
    const a = VERT[q.a], b = VERT[q.b];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(mx, my) || 1;
    const ux = mx / d, uy = my / d;              // outward (unsquashed)
    const sx0 = mx, sy0 = my * YS;               // squashed start
    const L = 0.72, Wd = 0.24;
    const ex = sx0 + ux * L, ey = sy0 + uy * L * YS;
    const nx = -uy * Wd / 2, ny = ux * Wd / 2 * YS;
    if (!top) {
      // shadow on water, then planks
      g.fillStyle = 'rgba(4,18,28,.35)';
      poly(g, [[sx0 + nx + 0.08, sy0 + ny + 0.1], [ex + nx + 0.08, ey + ny + 0.1], [ex - nx + 0.08, ey - ny + 0.1], [sx0 - nx + 0.08, sy0 - ny + 0.1]]); g.fill();
      const lg = g.createLinearGradient(sx0 + nx, sy0 + ny, sx0 - nx, sy0 - ny);
      lg.addColorStop(0, '#B07E4C'); lg.addColorStop(1, '#7A5230');
      poly(g, [[sx0 + nx, sy0 + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx0 - nx, sy0 - ny]]); g.fillStyle = lg; g.fill();
      g.strokeStyle = 'rgba(40,24,10,.45)'; g.lineWidth = 0.015;
      for (let i = 1; i < 7; i++) { const t = i / 7, px = sx0 + (ex - sx0) * t, py = sy0 + (ey - sy0) * t; g.beginPath(); g.moveTo(px + nx, py + ny); g.lineTo(px - nx, py - ny); g.stroke(); }
      g.lineWidth = 0.02; g.strokeStyle = 'rgba(60,36,16,.7)'; poly(g, [[sx0 + nx, sy0 + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx0 - nx, sy0 - ny]]); g.stroke();
      // mooring posts
      [[ex + nx * 0.8, ey + ny * 0.8], [ex - nx * 0.8, ey - ny * 0.8]].forEach((pt) => {
        g.fillStyle = '#3E2A18'; g.fillRect(pt[0] - 0.03, pt[1] - 0.12, 0.06, 0.14);
        ell(g, pt[0], pt[1] - 0.12, 0.034, 0.02); g.fillStyle = '#8A6238'; g.fill();
      });
      return;
    }
    // sign: a flag pole with a pennant in resource color and a cream badge with the ratio
    const col = q.type === 'any' ? '#F3EDE3' : RCOL[q.type];
    const fx = ex + ux * 0.14, fy = ey + uy * 0.14 * YS;
    ell(g, fx + 0.06, fy + 0.3, 0.26, 0.11); g.fillStyle = 'rgba(4,18,28,.35)'; g.fill();
    g.fillStyle = '#4A3320'; g.fillRect(fx - 0.02, fy - 0.42, 0.04, 0.7);
    poly(g, [[fx + 0.02, fy - 0.42], [fx + 0.34, fy - 0.32], [fx + 0.02, fy - 0.2]]); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(30,20,10,.5)'; g.lineWidth = 0.014; g.stroke();
    const R = 0.3;
    const rg = g.createRadialGradient(fx - 0.08, fy - 0.03, 0.02, fx, fy + 0.05, R);
    rg.addColorStop(0, '#FFFDF6'); rg.addColorStop(1, '#E6D9BE');
    ell(g, fx, fy + 0.07, R, R); g.fillStyle = rg; g.fill();
    g.lineWidth = 0.05; g.strokeStyle = col; g.stroke();
    g.lineWidth = 0.016; g.strokeStyle = 'rgba(40,28,14,.6)'; ell(g, fx, fy + 0.07, R + 0.03, R + 0.03); g.stroke();
    g.save(); g.translate(fx, fy + 0.07); g.scale(1 / kw, 1 / kw);
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 ' + Math.max(8, Math.round(0.23 * kw)) + 'px ' + SANS;
    g.fillText(q.type === 'any' ? '3:1' : '2:1', 0, -0.07 * kw);
    g.font = '500 ' + Math.max(7, Math.round(0.17 * kw)) + 'px ' + SANS;
    g.fillStyle = 'rgba(43,38,34,.8)';
    g.fillText(q.type === 'any' ? 'ANY' : { brick: 'B', lumber: 'L', wool: 'W', grain: 'G', ore: 'O' }[q.type], 0, 0.14 * kw);
    g.restore();
  }

  // ------------------------------------------------------------ terrain art (unit coords, centered at cx, cy)
  function tree(g, x, y, s, light) {
    ell(g, x + 0.04 * s, y + 0.1 * s, 0.3 * s, 0.1 * s); g.fillStyle = 'rgba(10,30,15,.35)'; g.fill();
    g.fillStyle = '#5A3C24'; g.fillRect(x - 0.035 * s, y - 0.05 * s, 0.07 * s, 0.17 * s);
    const tiers = [[0.75, 0.42], [0.5, 0.36], [0.25, 0.28]];
    tiers.forEach((t, i) => {
      const top = y - t[0] * s, base = y - (t[0] - 0.4) * s + 0.02 * s, w = t[1] * s;
      poly(g, [[x, top], [x + w, base], [x, base + 0.02 * s]]); g.fillStyle = light ? '#1F4A2B' : '#1B3F26'; g.fill();
      poly(g, [[x, top], [x - w, base], [x, base + 0.02 * s]]); g.fillStyle = light ? '#4C9256' : '#3E7F49'; g.fill();
      if (i === 2) { poly(g, [[x, top], [x - w * 0.55, base - 0.03 * s], [x - w * 0.1, top + 0.22 * s]]); g.fillStyle = 'rgba(190,240,170,.28)'; g.fill(); }
    });
  }
  function sheep(g, x, y, s) {
    ell(g, x + 0.02 * s, y + 0.1 * s, 0.14 * s, 0.05 * s); g.fillStyle = 'rgba(20,40,10,.3)'; g.fill();
    g.fillStyle = '#3A3028'; g.fillRect(x - 0.08 * s, y + 0.02 * s, 0.03 * s, 0.08 * s); g.fillRect(x + 0.05 * s, y + 0.02 * s, 0.03 * s, 0.08 * s);
    ell(g, x, y, 0.13 * s, 0.09 * s); g.fillStyle = '#FBF8F2'; g.fill();
    ell(g, x - 0.03 * s, y - 0.03 * s, 0.07 * s, 0.045 * s); g.fillStyle = '#FFFFFF'; g.fill();
    ell(g, x + 0.12 * s, y - 0.02 * s, 0.05 * s, 0.045 * s); g.fillStyle = '#3A3028'; g.fill();
  }
  function peak(g, x, y, w, h, snow) {
    poly(g, [[x, y - h], [x + w, y], [x - w * 0.1, y + 0.02]]); g.fillStyle = '#5B6069'; g.fill();
    poly(g, [[x, y - h], [x - w, y], [x - w * 0.1, y + 0.02]]); g.fillStyle = '#9BA1A8'; g.fill();
    poly(g, [[x, y - h], [x - w * 0.35, y - h * 0.45], [x - w * 0.1, y - h * 0.5]]); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
    if (snow) {
      poly(g, [[x, y - h], [x + w * 0.34, y - h * 0.62], [x + w * 0.18, y - h * 0.58], [x + w * 0.08, y - h * 0.66], [x - w * 0.12, y - h * 0.6], [x - w * 0.3, y - h * 0.64]]); g.fillStyle = '#F5F7F8'; g.fill();
      poly(g, [[x, y - h], [x + w * 0.34, y - h * 0.62], [x + w * 0.18, y - h * 0.58], [x + w * 0.02, y - h * 0.63]]); g.fillStyle = '#D5DAE0'; g.fill();
    }
  }
  function brick(g, x, y, w, h) {
    poly(g, [[x, y], [x + w, y], [x + w + 0.05, y - 0.05], [x + 0.05, y - 0.05]]); g.fillStyle = '#E09A78'; g.fill();
    poly(g, [[x + w, y], [x + w, y + h], [x + w + 0.05, y + h - 0.05], [x + w + 0.05, y - 0.05]]); g.fillStyle = '#7D3A24'; g.fill();
    g.fillStyle = '#B85C3E'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(40,16,8,.35)'; g.lineWidth = 0.012; g.strokeRect(x, y, w, h);
  }
  function drawTerrain(g, kind, cx, cy, r, hasToken) {
    const yoff = hasToken ? -0.12 : 0.05;
    if (kind === 'forest') {
      // darker ground around the stand
      ell(g, cx - 0.05, cy + 0.05 + yoff, 0.78, 0.5); g.fillStyle = 'rgba(20,50,30,.22)'; g.fill();
      const list = [];
      for (let i = 0; i < 12; i++) list.push([cx - 0.74 + r() * 1.48, cy - 0.5 + yoff + r() * 0.95, 0.5 + r() * 0.35]);
      if (hasToken) { for (let i = 0; i < 3; i++) list.push([cx - 0.7 + i * 0.7 + r() * 0.1, cy + 0.6 + r() * 0.15, 0.42 + r() * 0.1]); }
      list.sort((a, b) => a[1] - b[1]);
      list.forEach((t, i) => tree(g, t[0], t[1], t[2], i % 3 !== 1));
    } else if (kind === 'pasture') {
      for (let i = 0; i < 4; i++) {
        const x = cx - 0.6 + r() * 1.2, y = cy - 0.45 + yoff + r() * 0.9, w = 0.3 + r() * 0.3;
        ell(g, x + 0.04, y + 0.06, w, w * 0.4); g.fillStyle = 'rgba(40,80,20,.16)'; g.fill();
        const gg = g.createRadialGradient(x - w * 0.3, y - w * 0.3, 0.01, x, y, w);
        gg.addColorStop(0, 'rgba(230,250,190,.55)'); gg.addColorStop(1, 'rgba(150,200,110,0)');
        ell(g, x, y, w, w * 0.45); g.fillStyle = gg; g.fill();
      }
      // grass tufts
      g.strokeStyle = 'rgba(70,120,40,.5)'; g.lineWidth = 0.014;
      for (let i = 0; i < 18; i++) { const x = cx - 0.75 + r() * 1.5, y = cy - 0.6 + r() * 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 0.03, y - 0.07); g.moveTo(x, y); g.lineTo(x + 0.035, y - 0.065); g.stroke(); }
      sheep(g, cx - 0.42, cy - 0.3 + yoff, 1); sheep(g, cx + 0.28, cy - 0.48 + yoff, 0.9); sheep(g, cx + 0.1, cy - 0.05 + yoff, 1.05);
    } else if (kind === 'field') {
      g.lineWidth = 0.05;
      for (let i = -5; i <= 5; i++) {
        const y = cy + yoff + i * 0.17;
        g.strokeStyle = i % 2 ? 'rgba(120,80,20,.16)' : 'rgba(255,235,150,.22)';
        g.beginPath(); g.moveTo(cx - 0.95, y + 0.05); g.quadraticCurveTo(cx, y - 0.08, cx + 0.95, y + 0.05); g.stroke();
      }
      // wind-bent highlight across the rows
      g.lineWidth = 0.18; g.strokeStyle = 'rgba(255,245,190,.18)';
      g.beginPath(); g.moveTo(cx - 0.9, cy + 0.35 + yoff); g.quadraticCurveTo(cx - 0.1, cy - 0.35 + yoff, cx + 0.9, cy - 0.15 + yoff); g.stroke();
      // wheat stalks in clusters
      const stalk = (x, y, h, lean) => {
        g.strokeStyle = '#9A6B1C'; g.lineWidth = 0.018; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.4, y - h * 0.6, x + lean, y - h); g.stroke();
        for (let i = 0; i < 5; i++) {
          const t = 0.58 + i * 0.1, px = x + lean * t * t, py = y - h * t;
          ell(g, px + (i % 2 ? 0.028 : -0.028), py, 0.028, 0.042); g.fillStyle = i % 2 ? '#F3D373' : '#E3B94D'; g.fill();
          ell(g, px + (i % 2 ? 0.02 : -0.036), py - 0.01, 0.01, 0.02); g.fillStyle = 'rgba(255,250,220,.7)'; g.fill();
        }
      };
      const clusters = [[cx - 0.5, cy + 0.05 + yoff], [cx + 0.38, cy - 0.12 + yoff], [cx - 0.05, cy + 0.42 + yoff], [cx + 0.55, cy + 0.4 + yoff]];
      clusters.forEach((c, ci) => {
        ell(g, c[0] + 0.03, c[1] + 0.02, 0.22, 0.06); g.fillStyle = 'rgba(100,65,10,.22)'; g.fill();
        for (let i = 0; i < 6; i++) stalk(c[0] - 0.14 + i * 0.056 + r() * 0.03, c[1] + r() * 0.04, 0.34 + r() * 0.18 - (ci === 3 ? 0.08 : 0), 0.08 + r() * 0.08);
      });
    } else if (kind === 'hill') {
      // quarry pit
      const pg = g.createRadialGradient(cx + 0.1, cy + 0.15 + yoff, 0.05, cx + 0.1, cy + 0.15 + yoff, 0.75);
      pg.addColorStop(0, 'rgba(90,40,20,.35)'); pg.addColorStop(1, 'rgba(90,40,20,0)');
      ell(g, cx + 0.1, cy + 0.15 + yoff, 0.8, 0.5); g.fillStyle = pg; g.fill();
      ell(g, cx - 0.1, cy + 0.32 + yoff, 0.62, 0.14); g.fillStyle = 'rgba(40,16,8,.3)'; g.fill();
      for (let row = 0; row < 3; row++) for (let c = 0; c < 3 - row; c++) {
        brick(g, cx - 0.52 + c * 0.36 + row * 0.18, cy + 0.15 + yoff - row * 0.17, 0.3, 0.14);
      }
      brick(g, cx + 0.42, cy - 0.3 + yoff, 0.26, 0.12);
      brick(g, cx - 0.72, cy - 0.38 + yoff, 0.24, 0.11);
    } else if (kind === 'mountain') {
      ell(g, cx, cy + 0.3 + yoff, 0.85, 0.22); g.fillStyle = 'rgba(20,24,30,.3)'; g.fill();
      peak(g, cx - 0.45, cy + 0.22 + yoff, 0.5, 0.62, true);
      peak(g, cx + 0.42, cy + 0.26 + yoff, 0.46, 0.5, true);
      peak(g, cx + 0.02, cy + 0.32 + yoff, 0.62, 0.86, true);
      // ore glint
      const gx = cx + 0.22, gy = cy + 0.08 + yoff;
      poly(g, [[gx, gy - 0.07], [gx + 0.05, gy], [gx, gy + 0.07], [gx - 0.05, gy]]); g.fillStyle = '#DDE9F2'; g.fill();
      poly(g, [[gx, gy - 0.07], [gx + 0.05, gy], [gx, gy]]); g.fillStyle = 'rgba(120,140,160,.8)'; g.fill();
    } else if (kind === 'desert') {
      g.lineWidth = 0.06;
      for (let i = 0; i < 4; i++) {
        const y = cy - 0.5 + yoff + i * 0.3, x = cx - 0.9 + (i % 2) * 0.2;
        g.strokeStyle = 'rgba(120,90,40,.16)'; g.beginPath(); g.moveTo(x, y + 0.06); g.quadraticCurveTo(x + 0.6, y - 0.18, x + 1.3, y + 0.08); g.stroke();
        g.strokeStyle = 'rgba(255,250,225,.4)'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 0.6, y - 0.24, x + 1.3, y + 0.02); g.stroke();
      }
      // cactus
      const x = cx - 0.3, y = cy + 0.25 + yoff;
      ell(g, x + 0.08, y + 0.03, 0.2, 0.06); g.fillStyle = 'rgba(80,60,20,.3)'; g.fill();
      g.fillStyle = '#4F8A4A'; g.lineCap = 'round'; g.strokeStyle = '#4F8A4A'; g.lineWidth = 0.12;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 0.6); g.stroke();
      g.lineWidth = 0.09; g.beginPath(); g.moveTo(x - 0.03, y - 0.3); g.lineTo(x - 0.17, y - 0.3); g.lineTo(x - 0.17, y - 0.48); g.stroke();
      g.beginPath(); g.moveTo(x + 0.03, y - 0.22); g.lineTo(x + 0.17, y - 0.22); g.lineTo(x + 0.17, y - 0.42); g.stroke();
      g.strokeStyle = 'rgba(200,240,180,.5)'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(x - 0.03, y - 0.05); g.lineTo(x - 0.03, y - 0.55); g.stroke();
      // bones
      g.strokeStyle = '#F7F1E0'; g.lineWidth = 0.035; g.beginPath(); g.moveTo(cx + 0.3, cy - 0.25 + yoff); g.lineTo(cx + 0.55, cy - 0.4 + yoff); g.stroke();
      [[cx + 0.3, cy - 0.25 + yoff], [cx + 0.55, cy - 0.4 + yoff]].forEach((q) => { ell(g, q[0], q[1], 0.045, 0.045); g.fillStyle = '#F7F1E0'; g.fill(); });
      ell(g, cx + 0.5, cy + 0.1 + yoff, 0.09, 0.07); g.fillStyle = '#F7F1E0'; g.fill();
      ell(g, cx + 0.47, cy + 0.1 + yoff, 0.02, 0.02); g.fillStyle = '#C9B27C'; g.fill();
      ell(g, cx + 0.53, cy + 0.1 + yoff, 0.02, 0.02); g.fill();
    }
  }

  // ------------------------------------------------------------ dynamic pieces (screen space)
  function road(ctx, ax, ay, bx, by, k, p) {
    const w = k * 0.17;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(8,10,14,.35)'; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(ax + 2, ay + 3.2); ctx.lineTo(bx + 2, by + 3.2); ctx.stroke();
    ctx.strokeStyle = PDARK[p]; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay + 2.2); ctx.lineTo(bx, by + 2.2); ctx.stroke();
    ctx.strokeStyle = PCOL[p]; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = PLITE[p]; ctx.lineWidth = Math.max(1, w * 0.3); ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(ax - 0.5, ay - w * 0.22); ctx.lineTo(bx - 0.5, by - w * 0.22); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }
  function building(ctx, x, y, k, p, city, showNum) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    const s = city ? 1.22 : 1;
    ell(ctx, 0.05 * s, 0.2 * s, 0.34 * s, 0.11 * s); ctx.fillStyle = 'rgba(8,10,14,.4)'; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = 0.02;
    // body: lit front wall + shaded right wall
    const H = 0.26 * s, Wf = 0.24 * s, D = 0.12 * s;
    ctx.fillStyle = PCOL[p]; ctx.fillRect(-Wf / 2, -H + 0.16 * s, Wf, H);
    poly(ctx, [[Wf / 2, -H + 0.16 * s], [Wf / 2 + D, -H + 0.16 * s - D * 0.5], [Wf / 2 + D, 0.16 * s - D * 0.5], [Wf / 2, 0.16 * s]]); ctx.fillStyle = PDARK[p]; ctx.fill();
    // roof: left plane lit, right plane mid
    const ry = -H + 0.16 * s, apex = ry - 0.2 * s;
    poly(ctx, [[-Wf / 2 - 0.03 * s, ry], [0, apex], [0 + D, apex - D * 0.5], [-Wf / 2 - 0.03 * s + D, ry - D * 0.5]]); ctx.fillStyle = PLITE[p]; ctx.fill();
    poly(ctx, [[0, apex], [Wf / 2 + 0.03 * s, ry], [Wf / 2 + 0.03 * s + D, ry - D * 0.5], [D, apex - D * 0.5]]); ctx.fillStyle = PCOL[p]; ctx.fill();
    poly(ctx, [[-Wf / 2 - 0.03 * s, ry], [0, apex], [Wf / 2 + 0.03 * s, ry]]); ctx.fillStyle = shade(PCOL[p], -0.28); ctx.fill();
    // door and window
    ctx.fillStyle = 'rgba(255,240,200,.85)'; ctx.fillRect(-0.03 * s, 0.02 * s, 0.07 * s, 0.1 * s);
    if (city) {
      // tower at the back-left with its own roof and a small flag
      const tx = -0.2 * s, tw = 0.14 * s, th = 0.42 * s, tb = 0.1 * s;
      ctx.fillStyle = PCOL[p]; ctx.fillRect(tx - tw / 2, tb - th, tw, th);
      poly(ctx, [[tx + tw / 2, tb - th], [tx + tw / 2 + D * 0.7, tb - th - D * 0.35], [tx + tw / 2 + D * 0.7, tb - D * 0.35], [tx + tw / 2, tb]]); ctx.fillStyle = PDARK[p]; ctx.fill();
      poly(ctx, [[tx - tw / 2 - 0.02 * s, tb - th], [tx, tb - th - 0.14 * s], [tx + tw / 2 + 0.02 * s, tb - th]]); ctx.fillStyle = PLITE[p]; ctx.fill();
      poly(ctx, [[tx, tb - th - 0.14 * s], [tx + tw / 2 + 0.02 * s, tb - th], [tx + tw / 2 + 0.02 * s + D * 0.7, tb - th - D * 0.35], [tx + D * 0.7, tb - th - 0.14 * s - D * 0.35]]); ctx.fillStyle = shade(PCOL[p], -0.15); ctx.fill();
      ctx.strokeStyle = '#3A2A1E'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(tx, tb - th - 0.14 * s); ctx.lineTo(tx, tb - th - 0.3 * s); ctx.stroke();
      poly(ctx, [[tx, tb - th - 0.3 * s], [tx + 0.1 * s, tb - th - 0.26 * s], [tx, tb - th - 0.22 * s]]); ctx.fillStyle = '#C99A2E'; ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,.85)'; ctx.fillRect(tx - 0.025 * s, tb - th + 0.1 * s, 0.05 * s, 0.07 * s);
    }
    // crisp edge light
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(-Wf / 2, ry); ctx.lineTo(-Wf / 2, 0.16 * s); ctx.stroke();
    if (showNum) {
      ctx.fillStyle = '#FBF8F2'; ctx.font = '600 0.17px ' + SANS; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ell(ctx, 0.08 * s, -0.03 * s, 0.085, 0.085); ctx.fill();
      ctx.fillStyle = '#FBF8F2'; ctx.fillText(String(p + 1), 0.08 * s, -0.025 * s);
    }
    ctx.restore();
  }
  function robber(ctx, x, y, k, active, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    if (active) {
      const pulse = 0.75 + 0.25 * Math.sin(t / 220);
      const rg = ctx.createRadialGradient(0, 0.05, 0.05, 0, 0.05, 0.62);
      rg.addColorStop(0, 'rgba(217,102,58,' + 0.5 * pulse + ')'); rg.addColorStop(1, 'rgba(217,102,58,0)');
      ell(ctx, 0, 0.05, 0.62, 0.4); ctx.fillStyle = rg; ctx.fill();
    }
    ell(ctx, 0.04, 0.17, 0.26, 0.09); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
    const bg = ctx.createLinearGradient(-0.25, 0, 0.25, 0);
    bg.addColorStop(0, '#4A443E'); bg.addColorStop(0.45, '#2B2622'); bg.addColorStop(1, '#141211');
    ctx.beginPath(); ctx.moveTo(-0.24, 0.16); ctx.quadraticCurveTo(-0.26, -0.12, -0.1, -0.24); ctx.lineTo(0.1, -0.24); ctx.quadraticCurveTo(0.26, -0.12, 0.24, 0.16); ctx.closePath();
    ctx.fillStyle = bg; ctx.fill();
    // hood
    ctx.beginPath(); ctx.moveTo(-0.17, -0.18); ctx.quadraticCurveTo(-0.2, -0.46, 0, -0.5); ctx.quadraticCurveTo(0.2, -0.46, 0.17, -0.18); ctx.closePath(); ctx.fillStyle = '#2B2622'; ctx.fill();
    ell(ctx, 0, -0.28, 0.1, 0.11); ctx.fillStyle = '#0C0B0A'; ctx.fill();
    ell(ctx, -0.035, -0.29, 0.016, 0.016); ctx.fillStyle = active ? '#E07A4A' : '#8A7F74'; ctx.fill();
    ell(ctx, 0.035, -0.29, 0.016, 0.016); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 0.016; ctx.beginPath(); ctx.moveTo(-0.16, -0.2); ctx.quadraticCurveTo(-0.19, -0.42, -0.02, -0.47); ctx.stroke();
    ctx.restore();
  }
  function tokenGlow(ctx, x, y, r, s) {
    // s in (0, 1]: strength of the warm pulse after a matching roll
    const rg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
    rg.addColorStop(0, 'rgba(255,214,120,' + 0.55 * s + ')'); rg.addColorStop(0.5, 'rgba(255,190,80,' + 0.25 * s + ')'); rg.addColorStop(1, 'rgba(255,170,50,0)');
    ell(ctx, x, y, r * 2.2, r * 2.2 * YS); ctx.fillStyle = rg; ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.16); ctx.strokeStyle = 'rgba(255,200,90,' + 0.9 * s + ')';
    ell(ctx, x, y, r * (1.08 + (1 - s) * 0.5), r * YS * (1.08 + (1 - s) * 0.5)); ctx.stroke();
  }
  function ring(ctx, x, y, r, pulse) {
    const rr = r + pulse * 2.5;
    ctx.lineWidth = rr * 0.9; ctx.strokeStyle = 'rgba(255,205,90,.14)'; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke();
    ctx.lineWidth = rr * 0.42; ctx.strokeStyle = 'rgba(255,215,110,.28)'; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fillStyle = 'rgba(255,250,235,.72)'; ctx.fill();
    ctx.lineWidth = Math.max(2.5, rr * 0.2); ctx.strokeStyle = '#C99A2E'; ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x, y, rr * 0.62, 0, 7); ctx.stroke();
  }
  function hexGlow(ctx, pts, pulse) {
    poly(ctx, pts); ctx.fillStyle = 'rgba(255,230,160,' + (0.22 + pulse * 0.14) + ')'; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,205,90,.2)'; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#C99A2E'; ctx.stroke();
  }
  function ambient(ctx, W, H, t, sx0, sy0, k) {
    // drifting cloud shadows and a slow light sweep over the water
    const T = t / 1000;
    const clouds = [[0.18, 0.35, 0.013, 0.17], [0.7, 0.2, 0.009, 0.14], [0.45, 0.78, 0.011, 0.2]];
    clouds.forEach((c, i) => {
      const x = ((c[0] + T * c[2] + i * 0.1) % 1.4 - 0.2) * W, y = (c[1] + Math.sin(T * 0.1 + i) * 0.03) * H, r = Math.max(W, H) * c[3];
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(6,16,26,.16)'); rg.addColorStop(0.6, 'rgba(6,16,26,.07)'); rg.addColorStop(1, 'rgba(6,16,26,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    const ph = (T * 0.09) % 1;
    const rad = (4.2 + ph * 2.2) * k, a = (1 - ph) * 0.1;
    ctx.lineWidth = Math.max(1.5, k * 0.05); ctx.strokeStyle = 'rgba(210,245,245,' + a + ')';
    ell(ctx, sx0, sy0, rad, rad * YS); ctx.stroke();
  }

  window.CatanArt = { YS, LIFT, PCOL, PLITE, PDARK, backdrop, buildWorld, worldKey, road, building, robber, tokenGlow, ring, hexGlow, ambient, poly };
})();
