// Character Studio parts and renderer. A character is a small config object;
// it's drawn straight onto a canvas with paths (no image files), so it renders
// synchronously anywhere: the studio preview, a player avatar, or a stamp on
// the board that replays and re-renders like any other stroke.
(function () {
  const INK = '#2A1A5E';

  const PARTS = {
    body: [
      { id: 'round', label: 'Round' }, { id: 'blob', label: 'Blob' }, { id: 'tall', label: 'Tall' },
      { id: 'square', label: 'Boxy' }, { id: 'ghost', label: 'Ghosty' }, { id: 'spiky', label: 'Spiky' },
    ],
    color: [
      { id: '#FF6B6B' }, { id: '#FF9F43' }, { id: '#FFD43B' }, { id: '#51CF66' }, { id: '#22B8CF' },
      { id: '#4D7CFE' }, { id: '#9775FA' }, { id: '#F783AC' }, { id: '#A0785A' }, { id: '#F1F3F5' },
    ],
    pattern: [
      { id: 'none', label: 'Plain' }, { id: 'spots', label: 'Spots' }, { id: 'stripes', label: 'Stripes' }, { id: 'belly', label: 'Belly' },
    ],
    eyes: [
      { id: 'two', label: 'Googly' }, { id: 'big', label: 'Big' }, { id: 'one', label: 'One' }, { id: 'three', label: 'Three' },
      { id: 'sleepy', label: 'Sleepy' }, { id: 'star', label: 'Stars' }, { id: 'cool', label: 'Shades' },
    ],
    mouth: [
      { id: 'smile', label: 'Smile' }, { id: 'grin', label: 'Grin' }, { id: 'tongue', label: 'Silly' },
      { id: 'o', label: 'Ooh' }, { id: 'fangs', label: 'Fangs' }, { id: 'teeth', label: 'Teeth' },
    ],
    top: [
      { id: 'none', label: 'Nothing' }, { id: 'bunny', label: 'Bunny ears' }, { id: 'cat', label: 'Cat ears' },
      { id: 'horns', label: 'Horns' }, { id: 'antenna', label: 'Antennas' }, { id: 'crown', label: 'Crown' },
      { id: 'party', label: 'Party hat' }, { id: 'tophat', label: 'Top hat' }, { id: 'hair', label: 'Hair' },
      { id: 'unicorn', label: 'Unicorn' },
    ],
    arms: [
      { id: 'wave', label: 'Waving' }, { id: 'up', label: 'Hooray' }, { id: 'wings', label: 'Wings' }, { id: 'none', label: 'None' },
    ],
    extra: [
      { id: 'none', label: 'Nothing' }, { id: 'blush', label: 'Rosy' }, { id: 'bowtie', label: 'Bow tie' },
      { id: 'mustache', label: 'Mustache' }, { id: 'freckles', label: 'Freckles' },
    ],
  };

  // Where the top of each body sits, so hats and ears land on the head.
  const TOP_Y = { round: -22, blob: -22, tall: -30, square: -20, ghost: -27, spiky: -26 };
  const HALF_W = { round: 30, blob: 30, tall: 22, square: 30, ghost: 28, spiky: 30 };

  function rr(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function bodyPath(ctx, shape) {
    ctx.beginPath();
    if (shape === 'round') ctx.arc(0, 8, 30, 0, Math.PI * 2);
    else if (shape === 'blob') rr(ctx, -30, -22, 60, 58, 26);
    else if (shape === 'tall') ctx.ellipse(0, 6, 22, 36, 0, 0, Math.PI * 2);
    else if (shape === 'square') rr(ctx, -30, -20, 60, 56, 12);
    else if (shape === 'ghost') {
      ctx.moveTo(-28, 36);
      ctx.lineTo(-28, 1);
      ctx.arc(0, 1, 28, Math.PI, 0);
      ctx.lineTo(28, 36);
      for (let i = 0; i < 4; i++) {
        const x0 = 28 - i * 14;
        ctx.quadraticCurveTo(x0 - 3.5, 44, x0 - 7, 36);
        ctx.quadraticCurveTo(x0 - 10.5, 28, x0 - 14, 36);
      }
      ctx.closePath();
    } else { // spiky
      const n = 16;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 29 : 35;
        const x = Math.cos(a) * r, y = 6 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt)));
    return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function outlinedLine(ctx, pts, color, w) {
    for (const [c, lw] of [[INK, w + 4], [color, w]]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      if (pts.length === 6) ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
      else ctx.lineTo(pts[2], pts[3]);
      ctx.stroke();
    }
  }
  function blob(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  }
  function starPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr2 = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath();
  }

  function drawArms(ctx, c, behind) {
    const hw = HALF_W[c.body];
    if (c.arms === 'wings' && behind) {
      ctx.fillStyle = '#FFFFFF';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (hw - 6), 0);
        ctx.quadraticCurveTo(s * (hw + 26), -30, s * (hw + 20), 4);
        ctx.quadraticCurveTo(s * (hw + 22), 12, s * (hw + 8), 10);
        ctx.quadraticCurveTo(s * (hw + 14), 20, s * (hw - 4), 16);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    if (behind || c.arms === 'wings' || c.arms === 'none') return;
    const col = c.color;
    if (c.arms === 'wave') {
      outlinedLine(ctx, [-hw + 2, 12, -hw - 10, 18, -hw - 12, 30], col, 6);
      outlinedLine(ctx, [hw - 2, 8, hw + 12, 0, hw + 14, -16], col, 6);
      blob(ctx, -hw - 12, 31, 5, col);
      blob(ctx, hw + 14, -17, 5, col);
    } else { // up
      outlinedLine(ctx, [-hw + 2, 8, -hw - 12, 0, -hw - 14, -16], col, 6);
      outlinedLine(ctx, [hw - 2, 8, hw + 12, 0, hw + 14, -16], col, 6);
      blob(ctx, -hw - 14, -17, 5, col);
      blob(ctx, hw + 14, -17, 5, col);
    }
  }
  function drawLegs(ctx, c) {
    if (c.body === 'ghost') return;
    ctx.fillStyle = shade(c.color, -25);
    for (const s of [-1, 1]) {
      ctx.beginPath(); rr(ctx, s * 13 - 7, 30, 14, 16, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * 14, 46, 10, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  function drawPattern(ctx, c) {
    if (c.pattern === 'none') return;
    ctx.save();
    bodyPath(ctx, c.body);
    ctx.clip();
    if (c.pattern === 'spots') {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      for (const [x, y, r] of [[-18, -8, 6], [16, -14, 4], [20, 18, 7], [-14, 26, 5], [2, 32, 4], [-26, 12, 4]]) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (c.pattern === 'stripes') {
      ctx.fillStyle = 'rgba(0,0,0,.13)';
      for (let y = -36; y < 50; y += 14) ctx.fillRect(-50, y, 100, 6);
    } else if (c.pattern === 'belly') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.ellipse(0, 28, 17, 13, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawEyes(ctx, c) {
    const y = -2;
    const pupil = (x, yy, r) => {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.35, yy - r * 0.4, r * 0.35, 0, Math.PI * 2); ctx.fill();
    };
    if (c.eyes === 'two') {
      for (const s of [-1, 1]) { blob(ctx, s * 11, y, 7.5, '#fff'); pupil(s * 11 + 1.5, y + 1, 3.6); }
    } else if (c.eyes === 'big') {
      for (const s of [-1, 1]) { blob(ctx, s * 12, y, 10.5, '#fff'); pupil(s * 12 + 1, y + 1, 6.5); }
    } else if (c.eyes === 'one') {
      blob(ctx, 0, y - 2, 13, '#fff'); pupil(1.5, y - 1, 7);
    } else if (c.eyes === 'three') {
      for (const [x, yy] of [[-14, y], [0, y - 7], [14, y]]) { blob(ctx, x, yy, 6, '#fff'); pupil(x + 1, yy + 1, 3); }
    } else if (c.eyes === 'sleepy') {
      ctx.lineWidth = 3;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 11, y - 2, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    } else if (c.eyes === 'star') {
      ctx.fillStyle = '#FFD43B';
      for (const s of [-1, 1]) { starPath(ctx, s * 11, y, 9); ctx.fill(); ctx.stroke(); }
    } else if (c.eyes === 'cool') {
      ctx.fillStyle = '#1B1238';
      ctx.beginPath(); rr(ctx, -22, y - 7, 19, 13, 5); ctx.fill();
      ctx.beginPath(); rr(ctx, 3, y - 7, 19, 13, 5); ctx.fill();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, y - 3); ctx.lineTo(4, y - 3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillRect(-19, y - 5, 5, 3); ctx.fillRect(6, y - 5, 5, 3);
    }
    ctx.lineWidth = 3;
  }
  function drawMouth(ctx, c) {
    const y = 15;
    ctx.lineWidth = 3;
    if (c.mouth === 'smile' || c.mouth === 'fangs') {
      ctx.beginPath(); ctx.arc(0, y - 6, 10, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      if (c.mouth === 'fangs') {
        ctx.fillStyle = '#fff';
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(s * 7 - 2.5, y + 1.5); ctx.lineTo(s * 7 + 2.5, y + 1); ctx.lineTo(s * 6.5, y + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    } else if (c.mouth === 'grin' || c.mouth === 'tongue') {
      ctx.fillStyle = '#7A1F3D';
      ctx.beginPath(); ctx.moveTo(-12, y - 2); ctx.quadraticCurveTo(0, y + 18, 12, y - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FF7AA2';
      if (c.mouth === 'tongue') {
        ctx.beginPath(); ctx.ellipse(3, y + 8, 5, 6, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(0, y + 5.5, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (c.mouth === 'o') {
      ctx.fillStyle = '#7A1F3D';
      ctx.beginPath(); ctx.ellipse(0, y + 1, 5, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (c.mouth === 'teeth') {
      ctx.fillStyle = '#7A1F3D';
      ctx.beginPath(); rr(ctx, -12, y - 4, 24, 12, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-5, y - 3, 4.5, 5); ctx.fillRect(0.5, y - 3, 4.5, 5);
    }
  }
  function drawExtra(ctx, c) {
    if (c.extra === 'blush' || c.extra === 'freckles') {
      if (c.extra === 'blush') {
        ctx.fillStyle = 'rgba(255,90,140,.45)';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 18, 10, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = shade(c.color, -70);
        for (const [x, y] of [[-19, 8], [-15, 11], [-21, 12], [19, 8], [15, 11], [21, 12]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill(); }
      }
    } else if (c.extra === 'mustache') {
      ctx.fillStyle = '#5A3A22';
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-6, 4, -16, 6, -17, 12);
      ctx.bezierCurveTo(-12, 10, -6, 13, 0, 11);
      ctx.bezierCurveTo(6, 13, 12, 10, 17, 12);
      ctx.bezierCurveTo(16, 6, 6, 4, 0, 8);
      ctx.fill(); ctx.stroke();
    } else if (c.extra === 'bowtie') {
      const y = c.body === 'tall' ? 30 : 28;
      ctx.fillStyle = '#FF3B5C';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(-11, y - 6); ctx.lineTo(-11, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(11, y - 6); ctx.lineTo(11, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      blob(ctx, 0, y, 3, '#FF3B5C');
    }
  }
  function drawTop(ctx, c) {
    const t = TOP_Y[c.body];
    ctx.lineWidth = 3;
    if (c.top === 'bunny') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.ellipse(s * 11, t - 14, 6.5, 17, s * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FF9EC0';
        ctx.beginPath(); ctx.ellipse(s * 11, t - 13, 3, 11, s * 0.15, 0, Math.PI * 2); ctx.fill();
      }
    } else if (c.top === 'cat') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.moveTo(s * 6, t + 4); ctx.lineTo(s * 16, t - 16); ctx.lineTo(s * 26, t + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FF9EC0';
        ctx.beginPath(); ctx.moveTo(s * 11, t + 3); ctx.lineTo(s * 16, t - 8); ctx.lineTo(s * 21, t + 4); ctx.closePath(); ctx.fill();
      }
    } else if (c.top === 'horns') {
      ctx.fillStyle = '#F5E6C8';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 8, t + 5); ctx.quadraticCurveTo(s * 12, t - 14, s * 24, t - 18); ctx.quadraticCurveTo(s * 20, t - 2, s * 18, t + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (c.top === 'antenna') {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 8, t + 3); ctx.quadraticCurveTo(s * 10, t - 12, s * 18, t - 20); ctx.stroke();
        blob(ctx, s * 18, t - 21, 5, '#FFD43B');
      }
    } else if (c.top === 'crown') {
      ctx.fillStyle = '#FFD43B';
      ctx.beginPath();
      ctx.moveTo(-16, t + 4); ctx.lineTo(-18, t - 14); ctx.lineTo(-9, t - 5); ctx.lineTo(0, t - 18); ctx.lineTo(9, t - 5); ctx.lineTo(18, t - 14); ctx.lineTo(16, t + 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      blob(ctx, 0, t - 3, 3, '#FF3B5C');
    } else if (c.top === 'party') {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-13, t + 4); ctx.lineTo(3, t - 28); ctx.lineTo(15, t + 2); ctx.closePath();
      ctx.fillStyle = '#4D7CFE'; ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#FFD43B';
      for (let i = -40; i < 10; i += 10) { ctx.beginPath(); ctx.moveTo(-30, t + i); ctx.lineTo(30, t + i - 14); ctx.lineTo(30, t + i - 10); ctx.lineTo(-30, t + i + 4); ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-13, t + 4); ctx.lineTo(3, t - 28); ctx.lineTo(15, t + 2); ctx.closePath(); ctx.stroke();
      blob(ctx, 3, t - 29, 4.5, '#FF6B6B');
    } else if (c.top === 'tophat') {
      ctx.fillStyle = '#231942';
      ctx.beginPath(); rr(ctx, -20, t - 1, 40, 7, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); rr(ctx, -12, t - 26, 24, 26, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FF3B5C'; ctx.fillRect(-11, t - 8, 22, 5);
    } else if (c.top === 'hair') {
      ctx.fillStyle = shade(c.color, -60);
      ctx.beginPath();
      ctx.moveTo(-14, t + 6);
      ctx.quadraticCurveTo(-16, t - 10, -6, t - 14);
      ctx.quadraticCurveTo(-4, t - 4, 0, t - 18);
      ctx.quadraticCurveTo(4, t - 4, 8, t - 14);
      ctx.quadraticCurveTo(16, t - 8, 14, t + 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (c.top === 'unicorn') {
      ctx.fillStyle = '#FFE066';
      ctx.beginPath(); ctx.moveTo(-6, t + 4); ctx.lineTo(1, t - 26); ctx.lineTo(7, t + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#F59F00'; ctx.lineWidth = 2;
      for (const yy of [t - 4, t - 12]) { ctx.beginPath(); ctx.moveTo(-4, yy + 2); ctx.lineTo(5, yy - 2); ctx.stroke(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
    }
  }

  // Draw a character centred at (cx, cy), fitting a box `size` wide.
  function draw(ctx, c, cx, cy, size) {
    const s = size / 100;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    drawArms(ctx, c, true);
    drawLegs(ctx, c);
    ctx.lineWidth = 3;
    bodyPath(ctx, c.body);
    ctx.fillStyle = c.color;
    ctx.fill();
    drawPattern(ctx, c);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    bodyPath(ctx, c.body);
    ctx.stroke();
    ctx.lineWidth = 3;
    drawArms(ctx, c, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    drawTop(ctx, c);
    drawExtra(ctx, c);
    drawEyes(ctx, c);
    drawMouth(ctx, c);
    ctx.restore();
  }

  const NAMES = ['Zorp', 'Blobby', 'Wiggles', 'Captain Puff', 'Noodle', 'Sir Fuzz', 'Bloop', 'Twinkle', 'Mr. Pickles', 'Gizmo', 'Snorkel', 'Dottie', 'Boing', 'Pip', 'Moxie', 'Sprinkles', 'Tater Tot', 'Fizz'];
  const pickFrom = (a) => a[Math.floor(Math.random() * a.length)];
  function random(keep) {
    const c = {};
    for (const k of Object.keys(PARTS)) c[k] = pickFrom(PARTS[k]).id;
    c.name = keep && keep.name ? keep.name : pickFrom(NAMES);
    c.id = keep && keep.id ? keep.id : 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    return c;
  }

  const PRESETS = [
    { id: 'p-zorp', name: 'Zorp', body: 'round', color: '#51CF66', pattern: 'spots', eyes: 'one', mouth: 'grin', top: 'antenna', arms: 'wave', extra: 'none' },
    { id: 'p-puff', name: 'Princess Puff', body: 'blob', color: '#F783AC', pattern: 'belly', eyes: 'big', mouth: 'smile', top: 'crown', arms: 'up', extra: 'blush' },
    { id: 'p-spike', name: 'Captain Spike', body: 'spiky', color: '#FF9F43', pattern: 'none', eyes: 'cool', mouth: 'teeth', top: 'none', arms: 'wave', extra: 'none' },
    { id: 'p-boo', name: 'Boo', body: 'ghost', color: '#F1F3F5', pattern: 'none', eyes: 'two', mouth: 'o', top: 'none', arms: 'none', extra: 'blush' },
    { id: 'p-sparkle', name: 'Sparkle', body: 'tall', color: '#9775FA', pattern: 'stripes', eyes: 'star', mouth: 'tongue', top: 'unicorn', arms: 'wings', extra: 'none' },
    { id: 'p-gus', name: 'Gus', body: 'square', color: '#4D7CFE', pattern: 'none', eyes: 'three', mouth: 'fangs', top: 'horns', arms: 'up', extra: 'bowtie' },
  ];

  // Small PNG of a character for avatars and lists, cached per look.
  const imgCache = new Map();
  function toDataURL(c, px) {
    px = px || 160;
    const key = px + JSON.stringify([c.body, c.color, c.pattern, c.eyes, c.mouth, c.top, c.arms, c.extra]);
    if (imgCache.has(key)) return imgCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    draw(cv.getContext('2d'), c, px / 2, px * 0.53, px * 0.86);
    const url = cv.toDataURL('image/png');
    imgCache.set(key, url);
    return url;
  }

  const KEY = 'pict.chars';
  function load() {
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {}
  }
  function all() { return load().concat(PRESETS); }
  function byId(id) { return all().find((c) => c.id === id) || null; }

  window.Characters = { PARTS, PRESETS, draw, random, toDataURL, load, save, all, byId };
})();
