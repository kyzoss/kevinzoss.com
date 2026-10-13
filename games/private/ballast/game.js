// Ballast. One rule: the platform has a centre of mass.
//
// Built to the one-rule recipe: no external assets, fixed 1/60 s timestep,
// seeded randomness, and no clock reads inside the simulation, so the same
// seed and the same inputs always give the same island. With ?capture there is
// no animation loop; window.render(t) steps the real simulation to time t with
// a scripted player and draws one frame, for frame-by-frame trailer recording.
(() => {
  "use strict";

  const DT = 1 / 60;
  const LIMIT = 15;     // degrees of tilt before blocks start sliding
  const MAX_LOST = 5;   // blocks lost before the platform flips
  const FALL_T = 0.38;  // seconds a dropped block takes to land
  const MAX_LEVEL = 10; // a stack taller than this topples
  const AUTO_T = 7;     // seconds of dithering before the balloon drops it for you
  const AIM_SPEED = 2.4;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const q = new URLSearchParams(location.search);
  const CAPTURE = q.has("capture");

  // The clock is only read here, to pick today's island. Never inside the sim.
  const utcDay = () => {
    const d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  };
  const SEED = q.has("seed") ? parseInt(q.get("seed"), 10) || 1 : CAPTURE ? 20260101 : utcDay();
  const dayLabel = (n) => `${Math.floor(n / 10000)}-${String(Math.floor(n / 100) % 100).padStart(2, "0")}-${String(n % 100).padStart(2, "0")}`;
  const MODE = q.has("seed") ? `Island ${SEED}` : `Daily island ${dayLabel(SEED)}`;

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------------------------------------------------------------- simulation

  function newSim() {
    const s = {
      rng: mulberry32(SEED), t: 0, angle: 0, vel: 0,
      blocks: [], debris: [], lost: 0, placed: 0, spawned: 0,
      over: false, started: false, aimX: 0, targetX: 0, idle: 0, flash: 0,
      cur: null, next: 0,
    };
    s.next = weight(s);
    s.cur = takeNext(s);
    return s;
  }

  // Heavier pieces arrive later in the run.
  function weight(s) {
    const w = 1 + s.rng() * (1 + Math.min(s.spawned, 40) / 6);
    s.spawned++;
    return Math.min(5, Math.round(w * 2) / 2);
  }
  function takeNext(s) {
    const w = s.next;
    s.next = weight(s);
    return { w, x: s.aimX, fall: -1 };
  }

  // Block width in platform units, and how high each block sits in its stack.
  const widthU = (w) => (14 + 8 * w) / 250;
  function levelFor(blocks, u, w) {
    let level = 0;
    for (const b of blocks) {
      if (Math.abs(b.u - u) < (widthU(w) + widthU(b.w)) / 2 - 0.001) level = Math.max(level, b.level + 1);
    }
    return level;
  }
  function relevel(blocks) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      b.level = levelFor(blocks.slice(0, i), b.u, b.w);
    }
  }

  // Gusts start 30 seconds in and get stronger.
  const wind = (t) => (t > 30 ? Math.sin(t * 0.7) * Math.min(1, (t - 30) / 60) * 3 : 0);
  const torque = (s) => s.blocks.reduce((a, b) => a + b.w * b.u, 0) + wind(s.t);

  function step(s) {
    if (!s.started || s.over) return;
    s.t += DT;
    s.flash = Math.max(0, s.flash - DT);

    const d = s.targetX - s.aimX, m = AIM_SPEED * DT;
    s.aimX += Math.abs(d) <= m ? d : Math.sign(d) * m;

    const c = s.cur;
    if (c) {
      if (c.fall < 0) {
        c.x = s.aimX;
        s.idle += DT;
        if (s.idle >= AUTO_T) { // a slow drop lands on a random edge
          s.idle = 0;
          s.aimX = s.targetX = (s.rng() < 0.5 ? -1 : 1) * 0.9;
          c.x = s.aimX;
          c.fall = 0;
        }
      } else {
        c.fall += DT;
        if (c.fall >= FALL_T) {
          const u = clamp(c.x, -1.2, 1.2);
          if (levelFor(s.blocks, u, c.w) >= MAX_LEVEL) { // too tall: it topples off
            const a = (s.angle * Math.PI) / 180, dir = u < 0 ? -1 : 1;
            s.debris.push({ x: u * Math.cos(a), y: u * Math.sin(a) - 0.1, vx: dir * 0.3, vy: -0.3, r: 0, w: c.w });
            s.lost++; s.flash = 0.5;
          } else {
            s.blocks.push({ u, w: c.w, level: levelFor(s.blocks, u, c.w) });
            s.placed++;
          }
          s.idle = 0;
          s.cur = takeNext(s);
        }
      }
    }

    // The platform is a spring pulled toward the angle its torque asks for.
    // A taller pile is tippier: height multiplies how far a given torque tilts it.
    const tall = 1 + 0.12 * s.blocks.reduce((m, b) => Math.max(m, b.level), 0);
    const target = clamp(torque(s) * 1.4 * tall, -45, 45);
    s.vel += ((target - s.angle) * 28 - s.vel * 7.5) * DT;
    s.angle += s.vel * DT;

    // Past the limit the rim slides into the clouds.
    const over = Math.abs(s.angle) - LIMIT;
    if (over > 0) {
      const dir = Math.sign(s.angle), a = (s.angle * Math.PI) / 180;
      const keep = [];
      for (const b of s.blocks) {
        b.u += dir * (0.12 + 0.03 * over) * DT;
        if (Math.abs(b.u) > 1.05) {
          s.debris.push({ x: b.u * Math.cos(a), y: b.u * Math.sin(a), vx: dir * 0.35, vy: -0.25, r: 0, w: b.w });
          s.lost++;
          s.flash = 0.5;
        } else keep.push(b);
      }
      s.blocks = keep;
      relevel(s.blocks);
    }
    for (const d of s.debris) { d.x += d.vx * DT; d.y += d.vy * DT; d.vy += 3 * DT; d.r += d.vx * 4 * DT; }
    s.debris = s.debris.filter((d) => d.y < 3);

    if (s.lost >= MAX_LOST) {
      s.over = true;
      saveBest(s.placed);
    }
  }

  // The same input functions a human uses; the capture bot calls these too.
  function setAim(s, x) { s.targetX = clamp(x, -1.1, 1.1); }
  function drop(s) {
    if (!s.started) { s.started = true; return; }
    if (s.over) return;
    if (s.cur && s.cur.fall < 0) { s.cur.fall = 0; s.cur.x = s.aimX; s.idle = 0; }
  }

  // ------------------------------------------------------------------- storage

  const BEST_KEY = "kz.ballast.best";
  const readBest = () => { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch { return 0; } };
  function saveBest(n) { try { if (n > readBest()) localStorage.setItem(BEST_KEY, String(n)); } catch {} }

  // ----------------------------------------------------------------- rendering

  const cv = document.getElementById("c");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const DISPLAY = '"Archivo Black","Arial Black",Impact,sans-serif';
  const BODY = 'Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif';
  const COLORS = ["#F0A93C", "#FF7A5C", "#FF4FA3", "#8B5CF6", "#3FA9F5"];
  const colorFor = (w) => COLORS[w <= 1 ? 0 : w <= 2 ? 1 : w <= 3 ? 2 : w <= 4 ? 3 : 4];

  const cloudRng = mulberry32(99);
  const CLOUDS = Array.from({ length: 8 }, () => ({
    x: cloudRng(), y: 0.08 + cloudRng() * 0.55, s: 0.6 + cloudRng() * 1.2, v: 4 + cloudRng() * 10,
  }));

  function text(str, x, y, size, color, align = "left", font = BODY, weight = "700") {
    ctx.font = `${font === DISPLAY ? "900" : weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function draw(s, best) {
    const P = Math.min(W * 0.4, 260), k = P / 250;
    const px = W / 2, py = H * 0.64;
    const bh = 20 * k, th = 8 * k;
    const bw = (w) => (14 + 8 * w) * k;
    const rad = (s.angle * Math.PI) / 180;

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0B0B0E"); g.addColorStop(0.55, "#2a1b4d"); g.addColorStop(1, "#ff7a5c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // clouds
    ctx.fillStyle = "rgba(250,250,248,.045)";
    for (const c of CLOUDS) {
      const x = ((c.x * (W + 240) + s.t * c.v) % (W + 240)) - 120, y = c.y * H, r = 60 * c.s * k * 2;
      for (const [dx, dy, rr] of [[0, 0, 1], [0.7, 0.15, 0.75], [-0.7, 0.18, 0.7]]) {
        ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r * 0.4, r * rr, r * 0.38 * rr, 0, 0, 7); ctx.fill();
      }
    }

    // pillar and pivot
    ctx.fillStyle = "#15151c";
    ctx.beginPath(); ctx.moveTo(px - 16 * k, py); ctx.lineTo(px + 16 * k, py); ctx.lineTo(px + 60 * k, H + 10); ctx.lineTo(px - 60 * k, H + 10); ctx.fill();
    ctx.fillStyle = "#D80707"; ctx.beginPath(); ctx.arc(px, py, 14 * k, 0, 7); ctx.fill();

    // platform and its blocks
    ctx.save();
    ctx.translate(px, py); ctx.rotate(rad);
    const danger = Math.abs(s.angle) > LIMIT;
    ctx.fillStyle = "#E8E1D4"; ctx.fillRect(-P, -th, 2 * P, th * 2);
    ctx.fillStyle = danger ? "#FF3B2F" : "#D80707";
    ctx.fillRect(-P, -th, 14 * k, th * 2); ctx.fillRect(P - 14 * k, -th, 14 * k, th * 2);
    for (const b of s.blocks) {
      const w = bw(b.w), x = b.u * P - w / 2;
      const y0 = -th - (b.level + 1) * bh;
      ctx.fillStyle = colorFor(b.w); ctx.fillRect(x, y0, w, bh - 1);
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x, y0 + bh * 0.65, w, bh * 0.35 - 1);
      text(String(b.w), x + w / 2, y0 + bh * 0.68, 13 * k + 2, "#0B0B0E", "center");
    }
    ctx.restore();

    // falling debris
    for (const d of s.debris) {
      ctx.save(); ctx.translate(px + d.x * P, py + d.y * P); ctx.rotate(d.r);
      ctx.fillStyle = colorFor(d.w); ctx.fillRect(-bw(d.w) / 2, -bh / 2, bw(d.w), bh); ctx.restore();
    }

    // the block under the balloon
    const c = s.cur, topY = H * 0.3;
    if (c && !s.over) {
      const x = px + c.x * P, w = bw(c.w);
      const surf = py + c.x * P * Math.sin(rad) - th * Math.cos(rad) - bh;
      const e = c.fall < 0 ? 0 : (c.fall / FALL_T) ** 2;
      const y = topY + (surf - topY) * e;
      if (c.fall < 0) {
        ctx.setLineDash([4, 7]); ctx.strokeStyle = "rgba(250,250,248,.25)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y + bh); ctx.lineTo(x, surf + bh); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(250,250,248,.5)";
        ctx.beginPath(); ctx.moveTo(x - w * 0.3, y); ctx.lineTo(x, y - 46 * k); ctx.lineTo(x + w * 0.3, y); ctx.stroke();
        ctx.fillStyle = "#D80707"; ctx.beginPath(); ctx.ellipse(x, y - 64 * k, 22 * k, 26 * k, 0, 0, 7); ctx.fill();
      }
      ctx.fillStyle = colorFor(c.w); ctx.fillRect(x - w / 2, y, w, bh);
      text(String(c.w), x, y + bh * 0.7, 13 * k + 2, "#0B0B0E", "center");
    }

    // HUD: score and lives
    const pad = Math.max(16, W * 0.04);
    text("BLOCKS", pad, pad + 10, 11, "rgba(250,250,248,.6)");
    text(String(s.placed), pad, pad + 54, 46, "#FAFAF8", "left", DISPLAY);
    for (let i = 0; i < MAX_LOST; i++) {
      ctx.fillStyle = i < s.lost ? "#FF3B2F" : "rgba(250,250,248,.22)";
      ctx.fillRect(pad + i * 18, pad + 68, 12, 12);
    }

    // next card
    const nx = W - pad - 64;
    ctx.fillStyle = "rgba(250,250,248,.08)"; ctx.fillRect(nx, pad, 64, 78);
    text("NEXT", nx + 32, pad + 18, 11, "rgba(250,250,248,.6)", "center");
    ctx.fillStyle = colorFor(s.next); ctx.fillRect(nx + 32 - bw(s.next) * 0.5 * 0.9, pad + 32, bw(s.next) * 0.9, 26 * 0.9);
    text(String(s.next), nx + 32, pad + 52, 13, "#0B0B0E", "center");

    // tilt gauge
    const gw = Math.min(220, W * 0.34), gx = W / 2 - gw / 2, gy = pad + 14, sc = gw / 60;
    ctx.fillStyle = "rgba(250,250,248,.12)"; ctx.fillRect(gx, gy, gw, 8);
    ctx.fillStyle = "rgba(120,220,140,.55)"; ctx.fillRect(gx + gw / 2 - LIMIT * sc, gy, LIMIT * 2 * sc, 8);
    ctx.fillStyle = danger ? "#FF3B2F" : "#FAFAF8";
    ctx.fillRect(gx + gw / 2 + clamp(s.angle, -30, 30) * sc - 2, gy - 5, 4, 18);
    text(`TILT ${Math.abs(s.angle).toFixed(1)}°`, W / 2, gy + 34, 12, danger ? "#FF3B2F" : "rgba(250,250,248,.7)", "center");

    text(`${MODE}  ·  best ${best}`, pad, H - pad, 12, "rgba(250,250,248,.6)");

    if (s.flash > 0 && !REDUCED) {
      ctx.fillStyle = `rgba(255,59,47,${s.flash * 0.35})`; ctx.fillRect(0, 0, W, H);
    }
    if (danger && !s.over) text("HOLD ON!", W / 2, H * 0.86, Math.min(48, W * 0.11), "#FF3B2F", "center", DISPLAY);

    if (!s.started || s.over) {
      ctx.fillStyle = "rgba(11,11,14,.72)"; ctx.fillRect(0, 0, W, H);
      const big = Math.min(64, W * 0.15);
      if (!s.started) {
        text("BALLAST", W / 2, H * 0.38, big, "#FAFAF8", "center", DISPLAY);
        text("The platform has a centre of mass.", W / 2, H * 0.38 + big * 0.7, 16, "#C9C9CE", "center");
        text("Move to aim, tap to drop. Past 15° the rim slides.", W / 2, H * 0.38 + big * 0.7 + 26, 14, "#C9C9CE", "center");
        text("TAP TO START", W / 2, H * 0.38 + big * 0.7 + 78, 15, "#FF3B2F", "center");
      } else {
        text("IT TIPPED", W / 2, H * 0.38, big, "#FF3B2F", "center", DISPLAY);
        text(`${s.placed} blocks  ·  best ${Math.max(best, s.placed)}`, W / 2, H * 0.38 + big * 0.7, 18, "#FAFAF8", "center");
        text("TAP TO GO AGAIN", W / 2, H * 0.38 + big * 0.7 + 52, 15, "#FF3B2F", "center");
      }
    }
  }

  // ------------------------------------------------------------------ wiring

  let s = newSim();
  const best = () => Math.max(readBest(), s.over ? s.placed : 0);

  function restart() { s = newSim(); s.started = true; }
  function press() { if (s.over) restart(); else drop(s); }

  function aimFromPointer(e) {
    const P = Math.min(W * 0.4, 260);
    setAim(s, (e.clientX - W / 2) / P);
  }
  cv.addEventListener("pointermove", (e) => { if (!s.over) aimFromPointer(e); });
  cv.addEventListener("pointerdown", (e) => { aimFromPointer(e); press(); });
  addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); press(); }
    else if (e.code === "ArrowLeft") setAim(s, s.targetX - 0.25);
    else if (e.code === "ArrowRight") setAim(s, s.targetX + 0.25);
  });
  addEventListener("resize", () => { resize(); if (CAPTURE) draw(s, 0); });
  resize();

  window.__ballast = { get state() { return s; }, setAim: (x) => setAim(s, x), drop: () => drop(s), step: () => step(s), restart };

  if (CAPTURE) {
    // A scripted player that uses the same setAim and drop a human does.
    let botRng = mulberry32(7);
    // Sloppier as the run goes on, so the demo reaches the tip.
    const bot = () => {
      const n = Math.round(s.t / DT);
      if (n % 70 === 0 && s.cur && s.cur.fall < 0) {
        const sloppy = 0.4 + Math.min(1.4, s.t / 20);
        const aim = clamp(-torque(s) / s.cur.w * 0.7 + (botRng() - 0.5) * sloppy, -0.95, 0.95);
        setAim(s, aim);
      } else if (n % 70 === 45) drop(s);
    };
    const reset = () => { s = newSim(); s.started = true; botRng = mulberry32(7); };
    reset();
    window.render = (t) => {
      if (t < s.t - 1e-6) reset();
      while (s.t + DT <= t + 1e-9 && !s.over) { bot(); step(s); }
      draw(s, 0);
    };
    draw(s, 0);
  } else {
    let last = null, acc = 0;
    const frame = (ts) => {
      if (last === null) last = ts;
      acc += Math.min(0.1, (ts - last) / 1000); last = ts;
      while (acc >= DT) { step(s); acc -= DT; }
      draw(s, best());
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
})();
