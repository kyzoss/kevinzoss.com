// Drawing engine. A drawing is { w, h, ops }: the board's size in CSS pixels
// when the page was started, plus a list of operations in that coordinate
// space. Everything (the live board after a rotation, undo, the time-lapse
// replay, gallery thumbnails) is a re-render of the same ops at another size,
// so nothing depends on the screen it was drawn on.
//   stroke: { t:'s', c:'#hex'|'rainbow'|'eraser', w:width, h0:hue, p:[x,y,x,y...] }
//   fill:   { t:'f', c:'#hex', x, y }
//   clear:  { t:'c' }    (an op, not a wipe, so a clear can be undone)
//   stamp:  { t:'k', ch:{character}, x, y, z }  a Character Studio character
//           { t:'e', e:'🌳', x, y, z }          an emoji sticker (Free Draw)
// A stamp carries its whole character, so a drawing still renders after the
// character is edited or deleted.
(function () {
  const PAPER = '#FFFFFF';
  const MARGIN = '#E9E4FA';
  const ERASER_SCALE = 2.2;

  function rainbowAt(op, k) {
    return 'hsl(' + ((op.h0 + k * 7) % 360) + ',95%,55%)';
  }
  function strokeColor(op, k) {
    if (op.c === 'rainbow') return rainbowAt(op, k);
    if (op.c === 'eraser') return PAPER;
    return op.c;
  }
  function strokeWidth(op) {
    return op.c === 'eraser' ? op.w * ERASER_SCALE : op.w;
  }

  // Segment k (1..n-1) runs from the midpoint before point k-1 to the midpoint
  // after it, curving through point k-1. Live drawing, full renders and the
  // replay all draw the same segments, so they all look identical.
  function drawSegment(ctx, op, k) {
    const p = op.p;
    const x1 = p[(k - 1) * 2], y1 = p[(k - 1) * 2 + 1];
    const x2 = p[k * 2], y2 = p[k * 2 + 1];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    let sx, sy;
    if (k === 1) { sx = x1; sy = y1; }
    else { sx = (p[(k - 2) * 2] + x1) / 2; sy = (p[(k - 2) * 2 + 1] + y1) / 2; }
    ctx.strokeStyle = strokeColor(op, k);
    ctx.lineWidth = strokeWidth(op);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(x1, y1, mx, my);
    ctx.stroke();
  }
  // The last half-segment, from the final midpoint to the final point. A
  // stroke of one point is a tap and draws a dot.
  function drawTail(ctx, op) {
    const p = op.p, n = p.length / 2;
    if (n === 1) {
      ctx.fillStyle = strokeColor(op, 0);
      ctx.beginPath();
      ctx.arc(p[0], p[1], strokeWidth(op) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const x1 = p[(n - 2) * 2], y1 = p[(n - 2) * 2 + 1];
    const x2 = p[(n - 1) * 2], y2 = p[(n - 1) * 2 + 1];
    ctx.strokeStyle = strokeColor(op, n);
    ctx.lineWidth = strokeWidth(op);
    ctx.beginPath();
    ctx.moveTo((x1 + x2) / 2, (y1 + y2) / 2);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Scanline flood fill in device pixels, kept inside the paper rectangle.
  // After filling, the region grows by one pixel so the soft anti-aliased edge
  // of a crayon line doesn't leave a pale halo inside the shape.
  function floodFill(ctx, view, op) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const bx0 = Math.max(0, Math.floor(view.ox)), by0 = Math.max(0, Math.floor(view.oy));
    const bx1 = Math.min(W - 1, Math.ceil(view.ox + view.w * view.s) - 1);
    const by1 = Math.min(H - 1, Math.ceil(view.oy + view.h * view.s) - 1);
    const sx = Math.round(op.x * view.s + view.ox), sy = Math.round(op.y * view.s + view.oy);
    if (sx < bx0 || sx > bx1 || sy < by0 || sy > by1) return;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const si = (sy * W + sx) * 4;
    const tr = d[si], tg = d[si + 1], tb = d[si + 2];
    const [fr, fg, fb] = hexToRgb(op.c);
    if (Math.abs(tr - fr) < 8 && Math.abs(tg - fg) < 8 && Math.abs(tb - fb) < 8) return;
    const T = 48;
    const mask = new Uint8Array(W * H);
    const match = (x, y) => {
      const pi = y * W + x;
      if (mask[pi]) return false;
      const i = pi * 4;
      return Math.abs(d[i] - tr) <= T && Math.abs(d[i + 1] - tg) <= T && Math.abs(d[i + 2] - tb) <= T;
    };
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (!match(x, y)) continue;
      let lx = x, rx = x;
      while (lx - 1 >= bx0 && match(lx - 1, y)) lx--;
      while (rx + 1 <= bx1 && match(rx + 1, y)) rx++;
      for (let xx = lx; xx <= rx; xx++) mask[y * W + xx] = 1;
      for (const ny of [y - 1, y + 1]) {
        if (ny < by0 || ny > by1) continue;
        let inRun = false;
        for (let xx = lx; xx <= rx; xx++) {
          if (match(xx, ny)) {
            if (!inRun) { stack.push(xx, ny); inRun = true; }
          } else inRun = false;
        }
      }
    }
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const pi = y * W + x;
        if (mask[pi] !== 1) continue;
        if (x > bx0 && !mask[pi - 1]) mask[pi - 1] = 2;
        if (x < bx1 && !mask[pi + 1]) mask[pi + 1] = 2;
        if (y > by0 && !mask[pi - W]) mask[pi - W] = 2;
        if (y < by1 && !mask[pi + W]) mask[pi + W] = 2;
      }
    }
    for (let pi = 0; pi < mask.length; pi++) {
      if (!mask[pi]) continue;
      const i = pi * 4;
      d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Fit the drawing's own space into a device-pixel canvas, centred.
  function fitView(W, H, w, h) {
    const s = Math.min(W / w, H / h);
    return { s, ox: (W - w * s) / 2, oy: (H - h * s) / 2, w, h };
  }
  function prep(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  function paintPaper(ctx, view) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = MARGIN;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  function applyOp(ctx, view, op) {
    if (op.t === 's') {
      const n = op.p.length / 2;
      for (let k = 1; k < n; k++) drawSegment(ctx, op, k);
      drawTail(ctx, op);
    } else if (op.t === 'f') {
      floodFill(ctx, view, op);
    } else if (op.t === 'c') {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, view.w, view.h);
    } else if (op.t === 'k' || op.t === 'e') {
      drawStamp(ctx, op);
    }
  }
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function drawStamp(ctx, op) {
    if (op.t === 'k') {
      if (window.Characters) window.Characters.draw(ctx, op.ch, op.x, op.y, op.z);
      return;
    }
    ctx.save();
    ctx.font = Math.round(op.z * 0.82) + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(op.e, op.x, op.y + op.z * 0.04);
    ctx.restore();
  }
  function renderAll(ctx, view, ops) {
    prep(ctx);
    paintPaper(ctx, view);
    for (const op of ops) applyOp(ctx, view, op);
  }

  // ---------- the live board ----------
  function createBoard(canvas, opts) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const board = {
      drawing: { w: 1, h: 1, ops: [] },
      enabled: true,
      color: '#222222',
      size: 9,
      tool: 'pen',
      stamp: null, // { t:'k', ch } or { t:'e', e }
      stampSize: 120,
      onChange: opts.onChange || (() => {}),
      onStart: opts.onStart || (() => {}),
    };
    let view = null;
    let dpr = 1;
    let active = null; // { id, op }
    let hue = 0;
    let ghost = null; // { id, op, snap } while a stamp is being dragged into place

    function cssSize() {
      const r = canvas.parentElement.getBoundingClientRect();
      return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
    }
    function layout() {
      const { w, h } = cssSize();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      view = fitView(canvas.width, canvas.height, board.drawing.w, board.drawing.h);
      renderAll(ctx, view, board.drawing.ops);
    }
    board.reset = function () {
      const { w, h } = cssSize();
      board.drawing = { w, h, ops: [] };
      active = null;
      layout();
      board.onChange();
    };
    board.resize = layout;
    // Drop a stamp without a tap: used to start a Character Adventure with the
    // drawer's character already standing on the page.
    board.placeStamp = function (stamp, fx, fy, frac) {
      const d = board.drawing;
      const op = Object.assign({}, stamp, { x: d.w * fx, y: d.h * fy, z: Math.min(d.w, d.h) * frac });
      d.ops.push(op);
      applyOp(ctx, view, op);
      board.onChange();
    };
    board.undo = function () {
      if (active || ghost || !board.drawing.ops.length) return false;
      board.drawing.ops.pop();
      renderAll(ctx, view, board.drawing.ops);
      board.onChange();
      return true;
    };
    board.clear = function () {
      const ops = board.drawing.ops;
      if (!ops.length || ops[ops.length - 1].t === 'c') return false;
      ops.push({ t: 'c' });
      applyOp(ctx, view, ops[ops.length - 1]);
      board.onChange();
      return true;
    };
    board.isBlank = function () {
      const ops = board.drawing.ops;
      let i = ops.length - 1;
      while (i >= 0 && ops[i].t !== 'c') i--;
      return i === ops.length - 1;
    };
    board.stats = function () {
      const colors = new Set();
      let strokes = 0;
      for (const op of board.drawing.ops) {
        if (op.t === 's' && op.c !== 'eraser') { colors.add(op.c); strokes++; }
        if (op.t === 'f') colors.add(op.c);
      }
      return { colors: colors.size, strokes };
    };

    function toBase(e) {
      const r = canvas.getBoundingClientRect();
      const dx = (e.clientX - r.left) * dpr, dy = (e.clientY - r.top) * dpr;
      return [
        Math.round(((dx - view.ox) / view.s) * 10) / 10,
        Math.round(((dy - view.oy) / view.s) * 10) / 10,
      ];
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!board.enabled || active || ghost) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const [x, y] = toBase(e);
      if (board.tool === 'stamp' && board.stamp) {
        // Show the stamp under the finger and let it be dragged into place;
        // it only becomes part of the drawing when the finger lifts.
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        const snap = document.createElement('canvas');
        snap.width = canvas.width; snap.height = canvas.height;
        snap.getContext('2d').drawImage(canvas, 0, 0);
        const op = Object.assign({}, board.stamp, { x, y, z: board.stampSize });
        ghost = { id: e.pointerId, op, snap };
        drawGhost();
        board.onStart(op);
        return;
      }
      if (board.tool === 'fill') {
        if (board.color === 'rainbow') return;
        const op = { t: 'f', c: board.color, x, y };
        board.drawing.ops.push(op);
        applyOp(ctx, view, op);
        board.onStart(op);
        board.onChange();
        return;
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      hue = (hue + 40) % 360;
      const op = {
        t: 's',
        c: board.tool === 'eraser' ? 'eraser' : board.color,
        w: board.size,
        h0: hue,
        p: [x, y],
      };
      board.drawing.ops.push(op);
      active = { id: e.pointerId, op };
      prep(ctx);
      board.onStart(op);
    });

    function addPoints(e) {
      const op = active.op;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ce of (evs.length ? evs : [e])) {
        const [x, y] = toBase(ce);
        const n = op.p.length / 2;
        const lx = op.p[(n - 1) * 2], ly = op.p[(n - 1) * 2 + 1];
        if (Math.abs(x - lx) + Math.abs(y - ly) < 1.2) continue;
        op.p.push(x, y);
        drawSegment(ctx, op, n);
      }
    }
    function drawGhost() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(ghost.snap, 0, 0);
      ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
      drawStamp(ctx, ghost.op);
    }
    canvas.addEventListener('pointermove', (e) => {
      if (ghost && e.pointerId === ghost.id) {
        e.preventDefault();
        const [x, y] = toBase(e);
        ghost.op.x = x; ghost.op.y = y;
        drawGhost();
        return;
      }
      if (!active || e.pointerId !== active.id) return;
      e.preventDefault();
      addPoints(e);
    });
    function end(e) {
      if (ghost && e.pointerId === ghost.id) {
        board.drawing.ops.push(ghost.op);
        ghost = null;
        board.onChange();
        return;
      }
      if (!active || e.pointerId !== active.id) return;
      drawTail(ctx, active.op);
      active = null;
      board.onChange();
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return board;
  }

  // ---------- off-screen renders ----------
  function toImage(drawing, maxW) {
    maxW = maxW || 640;
    let W = maxW, H = Math.round((maxW * drawing.h) / drawing.w);
    if (H > maxW * 1.5) { H = Math.round(maxW * 1.5); W = Math.round((H * drawing.w) / drawing.h); }
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    renderAll(ctx, fitView(W, H, drawing.w, drawing.h), drawing.ops);
    return c.toDataURL('image/jpeg', 0.82);
  }

  // Time-lapse: the whole drawing in about `duration` ms, whatever its length.
  function replay(canvas, drawing, duration, onDone) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const view = fitView(canvas.width, canvas.height, drawing.w, drawing.h);
    prep(ctx);
    paintPaper(ctx, view);
    const ops = drawing.ops;
    const cost = (op) => (op.t === 's' ? op.p.length / 2 : 10);
    const total = ops.reduce((a, op) => a + cost(op), 0) || 1;
    let oi = 0, k = 1, done = 0, budget = 0, last = performance.now(), raf = 0, stopped = false;
    function frame(now) {
      if (stopped) return;
      budget += ((now - last) / duration) * total;
      last = now;
      while (budget >= 1 && oi < ops.length) {
        const op = ops[oi];
        if (op.t === 's') {
          const n = op.p.length / 2;
          if (k < n) { drawSegment(ctx, op, k); k++; budget--; done++; continue; }
          drawTail(ctx, op);
          budget--; done++;
        } else {
          applyOp(ctx, view, op);
          budget -= 10; done += 10;
        }
        oi++; k = 1;
      }
      if (oi < ops.length) raf = requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    raf = requestAnimationFrame(frame);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }

  window.Draw = { createBoard, toImage, replay };
})();
