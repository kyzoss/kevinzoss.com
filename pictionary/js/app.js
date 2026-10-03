(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // localStorage can throw (private mode, full, blocked). The game must still
  // play without it; it just won't remember anything.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  const ANIMALS = [
    ['🦊', '#FFC48A'], ['🐼', '#D0EBFF'], ['🐯', '#FFE066'], ['🐸', '#B2F2BB'], ['🦄', '#FCC2D7'],
    ['🐙', '#E5DBFF'], ['🐨', '#E9ECEF'], ['🦁', '#FFD8A8'], ['🐵', '#EBD3B0'], ['🐷', '#FFDEEB'],
    ['🐰', '#F3F0FF'], ['🐲', '#C3FAE8'], ['🐻', '#E6CCB2'], ['🐧', '#C5F6FA'], ['🦖', '#D8F5A2'], ['🐝', '#FFF3BF'],
  ];
  const AGES = [
    { id: 1, label: '4-5', name: 'Little' },
    { id: 2, label: '6-7', name: 'Kid' },
    { id: 3, label: '8-10', name: 'Big kid' },
    { id: 4, label: 'Adult', name: 'Grown-up' },
  ];
  // Seconds to draw, by the drawer's age. Littles need longer to get going.
  const BASE_TIME = { 1: 100, 2: 80, 3: 65, 4: 60 };
  const PACE = { relaxed: 1.4, normal: 1, speedy: 0.65, off: 0 };
  const COLORS = ['#222222', '#FF3B30', '#FF9500', '#FFD60A', '#34C759', '#0A84FF', '#AF52DE', '#FF6FB5', '#A2672D', 'rainbow'];
  const SIZES = [{ stroke: 5, stamp: 0.2, dot: 8 }, { stroke: 10, stamp: 0.32, dot: 14 }, { stroke: 20, stamp: 0.48, dot: 22 }];
  const STICKERS = ['🌳', '🌲', '🌸', '🌻', '🌈', '☀️', '🌙', '⭐', '☁️', '⚡', '🏠', '🏰', '⛺', '🚗', '🚀', '✈️', '⛵', '🚂',
    '🐶', '🐱', '🦄', '🐉', '🦖', '🐠', '🦋', '🐝', '🐞', '🍎', '🍕', '🍦', '🎂', '🍩', '🎈', '🎁', '👑', '💎', '⚽', '🏀',
    '🎸', '❤️', '💖', '✨', '🔥', '💧', '🌊', '⛰️', '🌵', '🍄', '🎃', '👻', '🤖', '👽', '🛸', '🪐'];
  const CHEERS = ['You got it!', 'Nailed it.', 'Brilliant.', 'Too easy.', 'Right on.', 'Spot on!', 'Yes!'];
  const TRIES = ['So close.', 'Good try.', 'Nice drawing.', 'Next time.'];

  // ---------------- sound, speech, buzz ----------------
  const Sound = {
    on: store.get('pict.sound', true),
    ctx: null,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, dur, type, vol, when, slideTo) {
      if (!this.on) return;
      const ac = this.ensure();
      if (!ac) return;
      const t = ac.currentTime + (when || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    pop() { this.tone(520, 0.09, 'sine', 0.12, 0, 860); },
    tick() { this.tone(1200, 0.05, 'square', 0.035); },
    tock() { this.tone(700, 0.12, 'triangle', 0.12); },
    go() { [523, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.1)); },
    ding() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.08)); },
    sparkle() { [1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.06, i * 0.06)); },
    boing() { this.tone(180, 0.35, 'sine', 0.2, 0, 520); },
    buzz() { this.tone(330, 0.25, 'sawtooth', 0.07, 0, 220); this.tone(220, 0.45, 'sawtooth', 0.07, 0.22, 140); },
    fanfare() { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 7 ? 0.6 : 0.16, 'triangle', 0.16, [0, .14, .28, .42, .62, .78, .92, 1.1][i])); },
  };
  function speak(text, quiet) {
    if (!Sound.on || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 1.15; u.volume = quiet ? 0.35 : 1;
      const v = speechSynthesis.getVoices().find((x) => /^en(-|_)US/i.test(x.lang)) || null;
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (_) {}
  }
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  // Keep the screen awake while a game or doodle is going: a dimmed board
  // mid-turn is exactly when a four-year-old gives up.
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!on && wake) { await wake.release(); wake = null; }
    } catch (_) { wake = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (current === 'draw' || G)) keepAwake(true);
    if (document.visibilityState === 'hidden' && timer.running) pauseTimer();
  });

  // ---------------- screens, modal, toast, confetti ----------------
  let current = 'home';
  // Full-screen drawing: CSS hides everything but the page; on browsers that
  // allow it (Android, desktop) the real Fullscreen API also hides the
  // browser bars. iPhone Safari has no element fullscreen, so there it is the
  // CSS version, or truly full screen once added to the home screen.
  function setFull(on) {
    $('draw').classList.toggle('full', on);
    try {
      const de = document.documentElement;
      if (on && de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (_) {}
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) $('draw').classList.remove('full'); });
  function show(id) {
    if (id !== 'draw' && $('draw').classList.contains('full')) setFull(false);
    document.querySelectorAll('.screen.on').forEach((s) => s.classList.remove('on'));
    $(id).classList.add('on');
    $(id).scrollTop = 0;
    current = id;
  }
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function ask(html, buttons) {
    return new Promise((resolve) => {
      $('modalBody').innerHTML = html;
      const box = $('modalActions');
      box.innerHTML = '';
      buttons.forEach((b) => {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.cls || 'soft');
        el.textContent = b.label;
        el.onclick = () => { Sound.pop(); $('modal').hidden = true; resolve(b.val); };
        box.appendChild(el);
      });
      $('modal').hidden = false;
    });
  }

  const confetti = (() => {
    const cv = $('confetti');
    const ctx = cv.getContext('2d');
    let parts = [], raf = 0;
    const cols = ['#C8623E', '#E2A33E', '#8DB089', '#2A9D8F', '#D9467A', '#F3EADA', '#A06C43'];
    function size() { cv.width = innerWidth * (devicePixelRatio || 1); cv.height = innerHeight * (devicePixelRatio || 1); }
    function frame() {
      const d = devicePixelRatio || 1;
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((p) => p.y < innerHeight + 40 && p.life-- > 0);
      for (const p of parts) {
        p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.setTransform(d, 0, 0, d, p.x * d, p.y * d);
        ctx.rotate(p.r);
        if (p.e) { ctx.font = p.s * 2 + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.e, 0, 0); }
        else { ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
        ctx.restore();
      }
      if (parts.length) raf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); raf = 0; }
    }
    return function burst(n, emojis) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      size();
      for (let i = 0; i < (n || 120); i++) {
        const fromLeft = i % 2 === 0;
        parts.push({
          x: fromLeft ? -10 : innerWidth + 10, y: innerHeight * (0.55 + Math.random() * 0.3),
          vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 9), vy: -(9 + Math.random() * 10),
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: 8 + Math.random() * 8,
          c: pick(cols), e: emojis && Math.random() < 0.25 ? pick(emojis) : null, life: 260,
        });
      }
      if (!raf) raf = requestAnimationFrame(frame);
    };
  })();

  // ---------------- avatars ----------------
  function avatarHTML(av, cls) {
    cls = cls || '';
    if (typeof av === 'string') {
      const ch = Characters.byId(av);
      if (ch) return '<span class="avatar char ' + cls + '"><img alt="' + esc(ch.name) + '" src="' + Characters.toDataURL(ch) + '"></span>';
      av = 0;
    }
    const a = ANIMALS[av % ANIMALS.length];
    return '<span class="avatar ' + cls + '" style="--av:' + a[1] + '">' + a[0] + '</span>';
  }
  const avatarOptions = () => ANIMALS.map((_, i) => i).concat(Characters.all().map((c) => c.id));

  // ---------------- settings ----------------
  const defaults = {
    players: [{ name: '', av: 0, age: 2 }, { name: '', av: 4, age: 3 }],
    cats: CATEGORIES.filter((c) => !c.character).map((c) => c.id),
    mode: 'race', pace: 'normal', rounds: 2, hints: 'on',
  };
  let S = Object.assign({}, defaults, store.get('pict.settings', {}));
  S.cats = S.cats.filter((id) => CATEGORIES.some((c) => c.id === id));
  if (!S.cats.length) S.cats = defaults.cats.slice();
  const saveSettings = () => store.set('pict.settings', S);
  const playerName = (p, i) => (p.name || '').trim() || 'Player ' + (i + 1);
  const wordLevel = (p) => Math.min(3, p.age);
  function turnSeconds(p, pace) {
    return PACE[pace] ? Math.round((BASE_TIME[p.age] * PACE[pace]) / 5) * 5 : 0;
  }

  // ---------------- setup ----------------
  let step = 0;
  function renderSetup() {
    document.querySelectorAll('#setup .step').forEach((el) => el.classList.toggle('on', Number(el.dataset.step) === step));
    document.querySelectorAll('#setup .steps i').forEach((el, i) => el.classList.toggle('on', i === step));
    $('setupNext').textContent = step === 2 ? 'Start game' : 'Next';
    if (step === 0) renderPlayers();
    if (step === 1) renderCats();
    if (step === 2) renderOpts();
  }
  function renderPlayers() {
    const list = $('playerList');
    list.innerHTML = S.players.map((p, i) =>
      '<div class="player">' +
        '<button class="avbtn" data-act="cycleAv" data-i="' + i + '" aria-label="Change picture">' + avatarHTML(p.av) + '</button>' +
        '<input data-i="' + i + '" value="' + esc(p.name) + '" placeholder="Player ' + (i + 1) + '" maxlength="14" enterkeyhint="done" autocomplete="off" />' +
        (S.players.length > 2 ? '<button class="remove" data-act="removePlayer" data-i="' + i + '" aria-label="Remove">✖️</button>' : '<span></span>') +
        '<div class="ages">' + AGES.map((a) =>
          '<button class="age' + (p.age === a.id ? ' on' : '') + '" data-act="setAge" data-i="' + i + '" data-age="' + a.id + '">' + a.label + '<small>' + a.name + '</small></button>'
        ).join('') + '</div>' +
      '</div>'
    ).join('');
    list.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => { S.players[Number(inp.dataset.i)].name = inp.value; saveSettings(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });
    $('addPlayerBtn').hidden = S.players.length >= 8;
  }
  function renderCats() {
    $('catGrid').innerHTML = CATEGORIES.map((c) =>
      '<button class="cat' + (S.cats.includes(c.id) ? ' on' : '') + '" style="--c:' + c.color + '" data-act="toggleCat" data-id="' + c.id + '">' +
        '<span class="ce">' + c.emoji + '</span>' + esc(c.name) + (c.character ? '<small>with your characters!</small>' : '') +
      '</button>'
    ).join('');
  }
  function renderOpts() {
    document.querySelectorAll('#setup .seg').forEach((seg) => {
      const key = seg.dataset.opt;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(S[key]) === b.dataset.val));
    });
    if (S.pace === 'off') $('paceNote').textContent = 'No clock. The artist taps "Got it!" when someone guesses.';
    else {
      const t = (age) => turnSeconds({ age }, S.pace);
      $('paceNote').textContent = 'Ages 4-5 get ' + t(1) + ' seconds, 6-7 get ' + t(2) + ', 8-10 get ' + t(3) + ', grown-ups ' + t(4) + '.';
    }
  }

  // ---------------- word dealing ----------------
  function dealCards(p, n) {
    const L = wordLevel(p);
    const recent = new Set(store.get('pict.recent', []));
    const cats = CATEGORIES.filter((c) => G.cats.includes(c.id));
    const build = (maxLevel, avoidRecent) => {
      const out = [];
      for (const c of cats) for (const w of c.words) {
        if (w.level > maxLevel) continue;
        if (G.used.includes(w.word)) continue;
        if (avoidRecent && recent.has(w.word)) continue;
        const weight = w.level === L ? 4 : L - w.level === 1 ? 2 : 1;
        out.push({ w, weight });
      }
      return out;
    };
    let pool = build(L, true);
    if (pool.length < n * 3) pool = build(L, false);
    if (pool.length < n * 2) pool = build(L + 1, false);
    if (pool.length < n) { G.used = []; pool = build(3, false); }
    const chosen = [];
    for (let k = 0; k < n && pool.length; k++) {
      // Second card from another category when possible, so it's a real choice.
      let cand = pool.filter((x) => !chosen.some((c) => c.word === x.w.word || c.cat === x.w.cat));
      if (!cand.length) cand = pool.filter((x) => !chosen.some((c) => c.word === x.w.word));
      if (!cand.length) break;
      let r = Math.random() * cand.reduce((a, x) => a + x.weight, 0);
      let hit = cand[cand.length - 1];
      for (const x of cand) { r -= x.weight; if (r <= 0) { hit = x; break; } }
      const card = Object.assign({}, hit.w);
      if (CATEGORIES.find((c) => c.id === card.cat).character) card.ch = characterFor(p);
      chosen.push(card);
    }
    return chosen;
  }
  // A Character Adventure stars the drawer's own character if their avatar is
  // one, otherwise one the family made, otherwise a ready-made friend.
  function characterFor(p) {
    if (typeof p.av === 'string') { const c = Characters.byId(p.av); if (c) return c; }
    const mine = Characters.load();
    return mine.length ? pick(mine) : pick(Characters.PRESETS);
  }
  const catOf = (card) => CATEGORIES.find((c) => c.id === card.cat);

  // ---------------- game ----------------
  let G = null;
  const saveGame = () => { if (G) store.set('pict.game', Object.assign({}, G, { card: null })); };

  function startGame() {
    const players = S.players.map((p, i) => ({
      name: playerName(p, i), av: p.av, age: p.age,
      stars: 0, guesses: 0, fastest: 0, drawn: 0, gotDrawn: 0, colors: 0, strokes: 0,
    }));
    G = {
      id: 'g' + Date.now().toString(36),
      players, cats: S.cats.slice(), mode: S.mode, pace: S.pace, hints: S.hints,
      total: players.length * Number(S.rounds), turn: 0, used: [], teamStars: 0, card: null,
    };
    saveGame();
    keepAwake(true);
    goHandoff();
  }
  const drawerIdx = () => G.turn % G.players.length;
  const drawer = () => G.players[drawerIdx()];

  function goHandoff() {
    const p = drawer();
    $('turnCount').textContent = 'Turn ' + (G.turn + 1) + ' of ' + G.total;
    $('handAvatar').outerHTML = avatarHTML(p.av, 'huge bounce').replace('class="', 'id="handAvatar" class="');
    $('handTitle').textContent = p.name + "'s turn!";
    $('handBtn').textContent = "I'm " + p.name + ', show my cards';
    if (G.mode === 'team') {
      const pct = Math.round((G.teamStars / G.total) * 100);
      $('miniScores').innerHTML = '<div class="rainbow-meter"><div class="label">Family stars · ' + G.teamStars + ' of ' + G.total + '</div><div class="rainbow-track"><div class="rainbow-fill" style="width:' + pct + '%"></div></div></div>';
    } else {
      $('miniScores').innerHTML = G.players.map((q) => '<div class="mini-score">' + avatarHTML(q.av, 'sm') + '<b>★</b> ' + q.stars + '</div>').join('');
    }
    G.swaps = 2;
    show('handoff');
    speak('Pass the phone to ' + p.name + '!');
  }

  function showWords() {
    G.cards = dealCards(drawer(), 2);
    renderCards();
    show('pick');
    Sound.sparkle();
  }
  function renderCards() {
    $('wordCards').innerHTML = G.cards.map((c, i) => {
      const cat = catOf(c);
      const stars = '★'.repeat(c.level);
      const face = c.ch
        ? '<div class="wchar-row"><img class="wchar" alt="" src="' + Characters.toDataURL(c.ch) + '"><span class="we">' + c.emoji + '</span></div><div class="wis">' + esc(c.ch.name) + ' is…</div>'
        : '<div class="we">' + c.emoji + '</div>';
      return '<div class="word-card" style="--c:' + cat.color + '" data-act="chooseCard" data-i="' + i + '" role="button" tabindex="0">' +
        '<button class="say" data-act="sayCard" data-i="' + i + '" aria-label="Hear it">' + '<svg class="ic"><use href="#i-volume"/></svg>' + '</button>' +
        face + '<div class="ww">' + esc(c.word) + '</div><div class="wc">' + cat.emoji + ' ' + esc(cat.name) + '</div><div class="stars">' + stars + '</div></div>';
    }).join('');
    $('newCardsBtn').textContent = G.swaps > 0 ? 'Deal new cards · ' + G.swaps + ' left' : 'No more new cards';
    $('newCardsBtn').disabled = G.swaps <= 0;
  }
  const cardSpeech = (c) => (c.ch ? c.ch.name + ' is ' : '') + c.word;

  async function chooseCard(i) {
    G.card = G.cards[i];
    G.used.push(G.card.word);
    const recent = store.get('pict.recent', []);
    recent.push(G.card.word);
    store.set('pict.recent', recent.slice(-150));
    speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel();
    show('countdown');
    $('cdHint').textContent = 'Everyone, open your eyes';
    for (const n of [3, 2, 1]) {
      const el = $('cdNum');
      el.textContent = n;
      el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
      Sound.tock();
      await wait(800);
    }
    $('cdNum').textContent = 'Draw!';
    Sound.go();
    await wait(450);
    startDrawing();
  }

  // ---------------- timer ----------------
  const timer = { running: false, dur: 0, start: 0, pausedAt: 0, paused: 0, raf: 0, lastSec: -1, hint1: false, hint2: false };
  function elapsed() {
    const now = timer.pausedAt || performance.now();
    return now - timer.start - timer.paused;
  }
  function startTimer(seconds) {
    Object.assign(timer, { running: true, dur: seconds * 1000, start: performance.now(), pausedAt: 0, paused: 0, lastSec: -1, hint1: false, hint2: false });
    $('timer').classList.toggle('off', !seconds);
    $('timer').classList.remove('mid', 'low');
    cancelAnimationFrame(timer.raf);
    timer.raf = requestAnimationFrame(tickTimer);
  }
  function stopTimer() { timer.running = false; cancelAnimationFrame(timer.raf); $('timer').classList.remove('low'); $('lastSecs').textContent = ''; }
  function pauseTimer() { if (timer.running && !timer.pausedAt) timer.pausedAt = performance.now(); }
  function resumeTimer() {
    if (!timer.pausedAt) return;
    timer.paused += performance.now() - timer.pausedAt;
    timer.pausedAt = 0;
    cancelAnimationFrame(timer.raf);
    timer.raf = requestAnimationFrame(tickTimer);
  }
  function tickTimer() {
    if (!timer.running) return;
    const el = elapsed();
    if (!timer.dur) {
      $('timerFill').style.transform = 'scaleX(1)';
      $('fullFill').style.transform = 'scaleX(1)';
      $('timerNum').textContent = '';
      $('fullNum').textContent = '';
      maybeHints(el / 90000);
    } else {
      const left = Math.max(0, timer.dur - el);
      const frac = left / timer.dur;
      const secs = Math.ceil(left / 1000);
      $('timerFill').style.transform = 'scaleX(' + frac + ')';
      $('fullFill').style.transform = 'scaleX(' + frac + ')';
      $('timerNum').textContent = secs;
      $('fullNum').textContent = secs;
      $('timer').classList.toggle('mid', frac <= 0.5 && secs > 10);
      $('timer').classList.toggle('low', secs <= 10);
      if (secs !== timer.lastSec) {
        timer.lastSec = secs;
        if (secs <= 10 && secs > 0) Sound.tick();
        if (secs <= 5 && secs > 0) {
          const ls = $('lastSecs');
          ls.textContent = secs;
          ls.classList.remove('tick'); void ls.offsetWidth; ls.classList.add('tick');
          buzz(30);
        }
      }
      maybeHints(1 - frac);
      if (left <= 0) { timeUp(); return; }
    }
    if (!timer.pausedAt) timer.raf = requestAnimationFrame(tickTimer);
  }

  // ---------------- hints ----------------
  function blanks(word, reveal) {
    let first = true;
    return word.split('').map((ch) => {
      if (ch === ' ') return ' ';
      if (!/[a-z]/i.test(ch)) return ch;
      if (reveal && first) { first = false; return ch.toUpperCase(); }
      first = false;
      return '_';
    }).join(' ');
  }
  function renderHint(level) {
    const c = G.card, cat = catOf(c);
    const lead = c.ch ? 'What is ' + esc(c.ch.name) + ' doing?' : cat.emoji + ' ' + esc(cat.name);
    const tail = level > 0 ? ' <span class="blanks">' + esc(blanks(c.word, level > 1)) + '</span>' : '';
    $('hint').innerHTML = lead + tail;
  }
  function maybeHints(progress) {
    if (G.hints !== 'on') return;
    if (!timer.hint1 && progress >= 0.4) { timer.hint1 = true; renderHint(1); hintPop(); }
    if (!timer.hint2 && progress >= 0.7) { timer.hint2 = true; renderHint(2); hintPop(); }
  }
  function hintPop() {
    const h = $('hintPop');
    h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
    Sound.sparkle();
  }

  // ---------------- drawing board ----------------
  const board = Draw.createBoard($('canvas'), {
    onStart() { if (current === 'draw') $('stampHint').classList.remove('on'); },
    onChange() { freeDirty = true; },
  });
  let sizeIdx = 1, lastBrush = 'pen', freeDirty = false;
  new ResizeObserver(() => { if (current === 'draw') board.resize(); }).observe($('board'));

  function renderPalette() {
    $('palette').innerHTML = COLORS.map((c) =>
      '<button class="swatch' + (c === 'rainbow' ? ' rainbow' : '') + (board.color === c ? ' on' : '') + '" style="--c:' + c + '" data-act="color" data-c="' + c + '" aria-label="' + (c === 'rainbow' ? 'Rainbow' : 'Color') + '"><i></i></button>'
    ).join('');
  }
  function renderTools() {
    document.querySelectorAll('.tool[data-tool]').forEach((b) => {
      const t = b.dataset.tool;
      b.classList.toggle('on', ['pen', 'fill', 'eraser', 'stamp'].includes(t) && board.tool === t);
    });
    const d = SIZES[sizeIdx].dot;
    Object.assign($('sizeDot').style, { width: d + 'px', height: d + 'px' });
  }
  function applySize() {
    board.size = SIZES[sizeIdx].stroke;
    board.stampSize = Math.round(Math.min(board.drawing.w, board.drawing.h) * SIZES[sizeIdx].stamp);
  }
  function resetBoard() {
    board.reset();
    board.tool = 'pen'; lastBrush = 'pen';
    board.color = '#222222'; board.stamp = null;
    applySize();
    renderPalette(); renderTools();
    freeDirty = false;
  }

  function startDrawing() {
    const p = drawer();
    $('draw').classList.remove('free');
    $('drawWho').innerHTML = avatarHTML(p.av, 'sm') + esc(p.name);
    renderHint(0);
    $('peekCard').innerHTML = G.card.ch
      ? '<img alt="" style="width:120px;height:120px" src="' + Characters.toDataURL(G.card.ch) + '"><div>' + esc(G.card.ch.name) + ' is…</div><div>' + G.card.emoji + ' ' + esc(G.card.word) + '</div>'
      : '<div class="we">' + G.card.emoji + '</div><div>' + esc(G.card.word) + '</div>';
    $('draw').classList.remove('full');
    show('draw');
    board.enabled = true;
    requestAnimationFrame(() => {
      resetBoard();
      if (G.card.ch) board.placeStamp({ t: 'k', ch: G.card.ch }, 0.5, 0.55, 0.42);
      startTimer(turnSeconds(p, G.pace));
    });
  }

  function gotIt() {
    if (!timer.running) return;
    pauseTimer();
    G.guessMs = elapsed();
    Sound.ding(); buzz(60);
    if (G.mode === 'team') { stopTimer(); reveal(true, -1); return; }
    renderWho(false);
  }
  function timeUp() {
    stopTimer();
    G.guessMs = timer.dur;
    Sound.buzz(); buzz([80, 60, 80]);
    renderWho(true);
  }
  function renderWho(timedOut) {
    G.timedOut = timedOut;
    if (G.mode === 'team') {
      $('whoTitle').textContent = "Time's up. Did someone shout it?";
      $('whoGrid').innerHTML = '<button class="who-btn" data-act="teamGot"><span class="avatar" style="--av:#4ADE80">🙌</span>Yes, we got it</button>';
    } else {
      $('whoTitle').textContent = timedOut ? "Time's up. Did anyone get it?" : 'Who guessed it?';
      $('whoGrid').innerHTML = G.players.map((q, i) => i === drawerIdx() ? '' :
        '<button class="who-btn" data-act="whoGot" data-i="' + i + '">' + avatarHTML(q.av) + esc(q.name) + '</button>').join('');
    }
    $('nobodyBtn').hidden = !timedOut;
    $('backDrawBtn').hidden = timedOut;
    board.enabled = false;
    show('who');
  }

  let stopReplay = null;
  function reveal(got, guesser) {
    stopTimer();
    const p = drawer();
    const st = board.stats();
    p.drawn++; p.colors += st.colors; p.strokes += st.strokes;
    const awards = [];
    if (got) {
      if (G.mode === 'team') {
        G.teamStars++;
        awards.push('<div class="star-award"><span class="avatar sm" style="--av:#FFE066">🌈</span>Family <b>+1 ★</b></div>');
      } else {
        p.stars++; p.gotDrawn++;
        awards.push('<div class="star-award">' + avatarHTML(p.av, 'sm') + esc(p.name) + ' <b>+1 ★</b></div>');
        if (guesser >= 0) {
          const q = G.players[guesser];
          q.stars++; q.guesses++;
          if (!q.fastest || G.guessMs < q.fastest) q.fastest = G.guessMs;
          awards.push('<div class="star-award">' + avatarHTML(q.av, 'sm') + esc(q.name) + ' <b>+1 ★</b></div>');
        }
      }
    }
    const drawing = board.drawing;
    saveToGallery(drawing, { word: G.card.word, emoji: G.card.emoji, ch: G.card.ch ? G.card.ch.name : '', by: p.name, av: p.av, gameId: G.id, got });

    $('revealTitle').textContent = got ? pick(CHEERS) : pick(TRIES);
    $('revealWord').innerHTML = (G.card.ch ? '<img alt="" style="width:56px;height:56px" src="' + Characters.toDataURL(G.card.ch) + '">' : '') + '<span class="we">' + G.card.emoji + '</span>' + esc(G.card.word);
    $('revealStars').innerHTML = awards.join('');
    const last = G.turn + 1 >= G.total;
    const next = G.players[(G.turn + 1) % G.players.length];
    $('nextBtn').innerHTML = last ? 'See results' : 'Next up: ' + esc(next.name);
    show('reveal');
    G.lastDrawing = drawing;
    requestAnimationFrame(() => playReplay());
    if (got) { confetti(140, ['⭐', '🎉', G.card.emoji]); Sound.fanfare(); }
    const said = (got ? 'Yes! ' : '') + 'It was ' + cardSpeech(G.card) + '!';
    setTimeout(() => { if (current === 'reveal') speak(said); }, 500);
  }
  function playReplay() {
    if (stopReplay) stopReplay();
    stopReplay = Draw.replay($('replayCanvas'), G.lastDrawing, 3500);
  }

  function nextTurn() {
    if (stopReplay) { stopReplay(); stopReplay = null; }
    G.turn++;
    G.card = null;
    if (G.turn >= G.total) { endGame(); return; }
    saveGame();
    goHandoff();
  }

  // ---------------- end of game ----------------
  const FUN_AWARDS = [['🦄', 'Most Imaginative'], ['😂', 'Silliest Doodles'], ['💖', 'Best Sport'], ['🚀', 'Rocket Drawer'],
    ['🧠', 'Big Thinker'], ['🎉', 'Party Starter'], ['🐢', 'Careful Creator'], ['🌟', 'Shining Star']];
  function giveAwards(players) {
    const out = new Map();
    const tryGive = (emoji, title, scoreFn, better) => {
      let best = null;
      players.forEach((p, i) => {
        if (out.has(i)) return;
        const v = scoreFn(p);
        if (!v) return;
        if (best === null || better(v, best.v)) best = { i, v };
      });
      if (best) out.set(best.i, [emoji, title]);
    };
    const more = (a, b) => a > b;
    tryGive('🌟', 'Superstar', (p) => p.stars, more);
    tryGive('🔍', 'Super Guesser', (p) => p.guesses, more);
    tryGive('⚡', 'Lightning Brain', (p) => p.fastest, (a, b) => a < b);
    tryGive('🎨', 'Master Artist', (p) => p.gotDrawn, more);
    tryGive('🌈', 'Rainbow Artist', (p) => p.colors, more);
    tryGive('🖍️', 'Busy Crayon', (p) => p.strokes, more);
    let f = 0;
    players.forEach((_, i) => { if (!out.has(i)) out.set(i, FUN_AWARDS[f++ % FUN_AWARDS.length]); });
    return out;
  }
  function endGame() {
    store.del('pict.game');
    const ps = G.players;
    const awards = giveAwards(ps);
    let html = '';
    if (G.mode === 'team') {
      const pct = Math.round((G.teamStars / G.total) * 100);
      const best = store.get('pict.teamBest', 0);
      const record = pct > best && G.teamStars > 0;
      if (record) store.set('pict.teamBest', pct);
      $('endTitle').textContent = pct >= 80 ? 'Rainbow complete.' : pct >= 50 ? 'Great teamwork.' : 'Nice teamwork.';
      html += '<div class="team-total">' + G.teamStars + '<small> / ' + G.total + ' stars</small></div>';
      html += '<div class="rainbow-meter"><div class="label">Family stars</div><div class="rainbow-track"><div class="rainbow-fill" id="endRainbow" style="width:0%"></div></div></div>';
      html += record ? '<div class="record">New family record</div>' : best ? '<div class="record">Family best: ' + best + '%</div>' : '';
      setTimeout(() => { const r = $('endRainbow'); if (r) r.style.width = pct + '%'; }, 300);
    } else {
      const ranked = ps.map((p, i) => ({ p, i })).sort((a, b) => b.p.stars - a.p.stars);
      const top = ranked[0].p.stars;
      const winners = ranked.filter((r) => r.p.stars === top);
      $('endTitle').textContent = winners.length > 1 ? 'It’s a tie.' : winners[0].p.name + ' wins.';
      // Podium order 2-1-3. Ties share a medal, so nobody is "third" by luck.
      const place = (r) => 1 + ranked.filter((x) => x.p.stars > r.p.stars).length;
      const podium = ranked.slice(0, 3);
      const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium.length === 2 ? [podium[1], podium[0]] : podium;
      const medals = { 1: '1ST', 2: '2ND', 3: '3RD' };
      html += '<div class="podium">' + order.map((r) => {
        const pl = place(r);
        return '<div class="pod p' + Math.min(pl, 3) + '">' + avatarHTML(r.p.av) + '<div class="name">' + esc(r.p.name) + '</div><div class="block"><span class="medal">' + (medals[pl] || pl + 'TH') + '</span>' + r.p.stars + '</div></div>';
      }).join('') + '</div>';
    }
    html += '<div class="awards">' + ps.map((p, i) => {
      const a = awards.get(i);
      return '<div class="award" style="animation-delay:' + (0.3 + i * 0.12) + 's"><span class="ai">' + a[0] + '</span>' + avatarHTML(p.av, 'sm') +
        '<div><div class="at">' + esc(a[1]) + '</div><div class="an">' + esc(p.name) + '</div></div>' +
        (G.mode === 'race' ? '<span class="score">★ ' + p.stars + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    $('endBody').innerHTML = html;
    show('end');
    Sound.fanfare();
    confetti(220, ['🏆', '⭐', '🎉', '🌈']);
    speak($('endTitle').textContent.replace(/[^\w\s!'’]/g, ''));
    G = null;
    keepAwake(false);
  }

  // ---------------- gallery ----------------
  function saveToGallery(drawing, meta) {
    if (!drawing.ops.length) return null;
    const item = Object.assign({ id: 'd' + Date.now().toString(36), img: Draw.toImage(drawing, 560), date: Date.now() }, meta);
    let list = store.get('pict.gallery', []);
    list.unshift(item);
    list = list.slice(0, 40);
    // Full storage: drop the oldest pictures until the new one fits.
    while (!store.set('pict.gallery', list) && list.length > 1) list.pop();
    return item;
  }
  let galleryFrom = 'home';
  function renderGallery() {
    const list = store.get('pict.gallery', []);
    $('galleryGrid').innerHTML = list.length ? list.map((g, i) =>
      '<button class="gal" style="--tilt:' + ((i * 37) % 7 - 3) + 'deg" data-act="viewArt" data-id="' + g.id + '">' +
        '<img alt="' + esc(g.word) + '" src="' + g.img + '" loading="lazy">' +
        '<div class="cap">' + (g.emoji || '🖍️') + ' ' + esc(g.ch ? g.ch + ' ' + g.word : g.word) + '</div>' +
        '<div class="by">by ' + esc(g.by) + '</div>' +
      '</button>'
    ).join('') : '<div class="empty"><b>No drawings yet</b>Play a game or try Free Draw.</div>';
  }
  let viewing = null;
  function viewArt(id) {
    viewing = store.get('pict.gallery', []).find((g) => g.id === id);
    if (!viewing) return;
    $('viewerImg').src = viewing.img;
    $('viewerCap').textContent = (viewing.emoji || '') + ' ' + (viewing.ch ? viewing.ch + ' ' : '') + viewing.word + ' · by ' + viewing.by;
    $('viewer').hidden = false;
  }
  async function shareArt() {
    if (!viewing) return;
    const name = (viewing.word || 'drawing').replace(/[^a-z0-9]+/gi, '-') + '.jpg';
    try {
      const blob = await (await fetch(viewing.img)).blob();
      const file = new File([blob], name, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: viewing.word + ' by ' + viewing.by });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = viewing.img; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------------- free draw ----------------
  function startFree(stampChar) {
    $('draw').classList.add('free');
    $('draw').classList.remove('full');
    $('drawWho').textContent = 'Free Draw';
    show('draw');
    board.enabled = true;
    keepAwake(true);
    requestAnimationFrame(() => {
      resetBoard();
      if (stampChar) {
        board.placeStamp({ t: 'k', ch: stampChar }, 0.5, 0.55, 0.42);
        selectStamp({ t: 'k', ch: stampChar });
        freeDirty = true;
      }
    });
  }
  function resumeFree() {
    $('draw').classList.add('free');
    show('draw');
    requestAnimationFrame(() => { board.resize(); applySize(); renderPalette(); renderTools(); });
  }
  async function leaveFree() {
    if (freeDirty && !board.isBlank()) {
      const v = await ask('Save your picture to the Art Show?', [
        { label: 'Yes, save it!', cls: 'primary', val: 'save' }, { label: 'No thanks', val: 'no' }, { label: 'Keep drawing', val: 'stay' },
      ]);
      if (v === 'stay') return false;
      if (v === 'save') saveFree();
    }
    return true;
  }
  function saveFree() {
    const it = saveToGallery(board.drawing, { word: 'Free draw', emoji: '🖍️', by: 'Free Draw', gameId: '' });
    freeDirty = false;
    if (it) { toast('Saved to the Art Show!'); Sound.ding(); confetti(60); }
  }

  // ---------------- stamp tray ----------------
  function openTray() {
    const free = $('draw').classList.contains('free');
    const chars = Characters.all();
    let html = '<div class="tray-sec">Characters</div><div class="tray-grid">' +
      chars.map((c) => '<button class="tray-item" data-act="pickStamp" data-ch="' + esc(c.id) + '" aria-label="' + esc(c.name) + '"><img alt="" src="' + Characters.toDataURL(c) + '"></button>').join('') +
      (free ? '<button class="tray-item make" data-act="trayMake">' + '<svg class="ic"><use href="#i-plus"/></svg>' + 'New</button>' : '') + '</div>';
    // Emoji stickers would hand the guessers the answer, so they're Free Draw only.
    if (free) html += '<div class="tray-sec">Stickers</div><div class="tray-grid">' +
      STICKERS.map((e) => '<button class="tray-item" data-act="pickStamp" data-e="' + e + '">' + e + '</button>').join('') + '</div>';
    $('trayBody').innerHTML = html;
    $('tray').hidden = false;
  }
  function selectStamp(stamp) {
    board.stamp = stamp;
    board.tool = 'stamp';
    applySize();
    renderTools();
    const h = $('stampHint');
    h.classList.add('on');
    clearTimeout(selectStamp.t);
    selectStamp.t = setTimeout(() => h.classList.remove('on'), 3000);
  }

  // ---------------- character studio ----------------
  const TABS = [['body', '🟣', 'Shape'], ['color', '🎨', 'Color'], ['pattern', '🦓', 'Pattern'], ['eyes', '👀', 'Eyes'],
    ['mouth', '👄', 'Mouth'], ['top', '🎩', 'Top'], ['arms', '🙌', 'Arms'], ['extra', '✨', 'Extra']];
  const studio = { ch: null, tab: 'body', saved: false, from: 'home' };
  function openStudio(from, ch) {
    studio.from = from;
    studio.ch = ch ? Object.assign({}, ch) : Characters.random();
    studio.saved = !!ch;
    studio.tab = 'body';
    show('studio');
    renderStudio();
  }
  function drawCharTo(canvas, ch, px) {
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = px * d; canvas.height = px * d;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Characters.draw(ctx, ch, canvas.width / 2, canvas.height * 0.53, canvas.width * 0.86);
  }
  function renderStudio() {
    const ch = studio.ch;
    drawCharTo($('studioCanvas'), ch, 300);
    const nameEl = $('charName');
    if (document.activeElement !== nameEl) nameEl.value = ch.name || '';
    $('partTabs').innerHTML = TABS.map(([k, e, l]) => '<button class="part-tab' + (studio.tab === k ? ' on' : '') + '" data-act="partTab" data-k="' + k + '">' + l + '</button>').join('');
    const opts = Characters.PARTS[studio.tab];
    $('partGrid').innerHTML = opts.map((o, i) => '<button class="part-opt' + (ch[studio.tab] === o.id ? ' on' : '') + '" data-act="partPick" data-i="' + i + '"><canvas></canvas>' + (o.label ? esc(o.label) : '') + '</button>').join('');
    $('partGrid').querySelectorAll('canvas').forEach((cv, i) => {
      drawCharTo(cv, Object.assign({}, ch, { [studio.tab]: opts[i].id }), 72);
    });
    const mine = Characters.load();
    $('charDeleteBtn').hidden = !mine.some((c) => c.id === ch.id);
    $('myChars').innerHTML = '<button class="my-char new" data-act="charNew">' + '<svg class="ic"><use href="#i-plus"/></svg>' + 'New</button>' + mine.map((c) =>
      '<button class="my-char' + (c.id === ch.id ? ' on' : '') + '" data-act="charEdit" data-id="' + esc(c.id) + '"><img alt="" src="' + Characters.toDataURL(c) + '"><span>' + esc(c.name) + '</span></button>'
    ).join('');
  }
  $('charName').addEventListener('input', (e) => { studio.ch.name = e.target.value; studio.saved = false; });
  $('charName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  function saveChar() {
    const ch = studio.ch;
    ch.name = (ch.name || '').trim() || Characters.random().name;
    const list = Characters.load();
    const i = list.findIndex((c) => c.id === ch.id);
    if (i >= 0) list[i] = Object.assign({}, ch); else list.unshift(Object.assign({}, ch));
    Characters.save(list);
    studio.saved = true;
    renderStudio();
    return ch;
  }

  // ---------------- actions ----------------
  const actions = {
    toggleSound() {
      Sound.on = !Sound.on;
      store.set('pict.sound', Sound.on);
      $('soundBtn').innerHTML = '<svg class="ic"><use href="#i-' + (Sound.on ? 'sound' : 'mute') + '"/></svg>';
      if (!Sound.on && 'speechSynthesis' in window) speechSynthesis.cancel();
    },
    newGame() { step = 0; show('setup'); renderSetup(); },
    resume() {
      const g = store.get('pict.game', null);
      if (!g) { $('resumeBtn').hidden = true; return; }
      G = g; keepAwake(true); goHandoff();
    },
    howTo() { show('howto'); },
    home() { keepAwake(false); show('home'); refreshHome(); },
    gallery() { galleryFrom = 'home'; renderGallery(); show('gallery'); },
    endGallery() { galleryFrom = 'end'; renderGallery(); show('gallery'); },
    galleryBack() { if (galleryFrom === 'end') show('end'); else actions.home(); },
    viewArt(el) { viewArt(el.dataset.id); },
    viewerClose() { $('viewer').hidden = true; },
    viewerShare() { shareArt(); },
    async viewerDelete() {
      const v = await ask('Delete this drawing?', [{ label: 'Yes, delete', cls: 'primary', val: true }, { label: 'Keep it', val: false }]);
      if (!v) return;
      store.set('pict.gallery', store.get('pict.gallery', []).filter((g) => g.id !== viewing.id));
      $('viewer').hidden = true;
      renderGallery();
    },

    setupBack() { if (step > 0) { step--; renderSetup(); } else actions.home(); },
    setupNext() {
      if (step === 1 && !S.cats.length) { toast('Pick at least one!'); Sound.boing(); return; }
      if (step < 2) { step++; renderSetup(); return; }
      saveSettings();
      startGame();
    },
    addPlayer() {
      const used = new Set(S.players.map((p) => p.av));
      const av = ANIMALS.findIndex((_, i) => !used.has(i));
      S.players.push({ name: '', av: av < 0 ? 0 : av, age: 2 });
      saveSettings(); renderPlayers();
      const inputs = $('playerList').querySelectorAll('input');
      inputs[inputs.length - 1].focus();
    },
    removePlayer(el) { S.players.splice(Number(el.dataset.i), 1); saveSettings(); renderPlayers(); },
    setAge(el) { S.players[Number(el.dataset.i)].age = Number(el.dataset.age); saveSettings(); renderPlayers(); },
    cycleAv(el) {
      const i = Number(el.dataset.i);
      const opts = avatarOptions();
      const taken = new Set(S.players.filter((_, j) => j !== i).map((p) => p.av));
      let k = opts.indexOf(S.players[i].av);
      for (let n = 0; n < opts.length; n++) {
        k = (k + 1) % opts.length;
        if (!taken.has(opts[k])) break;
      }
      S.players[i].av = opts[k];
      saveSettings(); renderPlayers();
      Sound.boing();
    },
    toggleCat(el) {
      const id = el.dataset.id;
      S.cats = S.cats.includes(id) ? S.cats.filter((c) => c !== id) : S.cats.concat(id);
      saveSettings(); renderCats();
    },
    catsAll() { S.cats = CATEGORIES.map((c) => c.id); saveSettings(); renderCats(); },
    catsNone() { S.cats = []; saveSettings(); renderCats(); },

    showWords() { showWords(); },
    sayCard(el, e) { e.stopPropagation(); speak(cardSpeech(G.cards[Number(el.dataset.i)]), true); },
    chooseCard(el) { chooseCard(Number(el.dataset.i)); },
    newCards() {
      if (G.swaps <= 0) return;
      G.swaps--;
      G.cards.forEach((c) => G.used.push(c.word));
      G.cards = dealCards(drawer(), 2);
      renderCards();
      Sound.sparkle();
    },
    async quitAsk() {
      const v = await ask('Stop this game?', [{ label: 'Keep playing', cls: 'primary', val: false }, { label: 'Yes, stop', val: true }]);
      if (!v) return;
      store.del('pict.game'); G = null; stopTimer(); actions.home();
    },
    async pause() {
      pauseTimer();
      const v = await ask('Paused', [
        { label: 'Keep drawing', cls: 'primary', val: 'go' }, { label: 'Too hard, give up', val: 'give' }, { label: 'Stop the game', val: 'quit' },
      ]);
      if (v === 'go') resumeTimer();
      else if (v === 'give') { stopTimer(); reveal(false, -1); }
      else { store.del('pict.game'); G = null; stopTimer(); actions.home(); }
    },
    gotIt() { gotIt(); },
    fullscreen() {
      setFull(true);
      if (!store.get('pict.fullTip', false)) { toast('Tap Tools to get the toolbar back'); store.set('pict.fullTip', true); }
    },
    exitFull() { setFull(false); },
    whoGot(el) { reveal(true, Number(el.dataset.i)); },
    teamGot() { reveal(true, -1); },
    nobody() { reveal(false, -1); },
    backToDraw() { board.enabled = true; show('draw'); resumeTimer(); },
    nextTurn() { nextTurn(); },
    replay() { playReplay(); },
    playAgain() { startGame(); },

    freeDraw() { startFree(null); },
    async freeHome() { if (await leaveFree()) actions.home(); },
    freeSave() { if (board.isBlank()) { toast('Draw something first!'); return; } saveFree(); },
    async freeNew() { if (await leaveFree()) { resetBoard(); } },

    color(el) {
      board.color = el.dataset.c;
      if (board.tool === 'eraser' || board.tool === 'stamp') board.tool = lastBrush;
      if (board.color === 'rainbow' && board.tool === 'fill') board.tool = 'pen';
      renderPalette(); renderTools();
    },
    trayClose() { $('tray').hidden = true; },
    pickStamp(el) {
      $('tray').hidden = true;
      if (el.dataset.e) selectStamp({ t: 'e', e: el.dataset.e });
      else { const ch = Characters.byId(el.dataset.ch); if (ch) selectStamp({ t: 'k', ch }); }
      Sound.sparkle();
    },
    trayMake() { $('tray').hidden = true; openStudio('free'); },

    studio() { openStudio('home'); },
    async studioBack() {
      if (!studio.saved) {
        const v = await ask('Save ' + esc(studio.ch.name || 'your character') + ' first?', [
          { label: 'Save', cls: 'primary', val: 'save' }, { label: "Don't save", val: 'no' }, { label: 'Keep making', val: 'stay' },
        ]);
        if (v === 'stay') return;
        if (v === 'save') saveChar();
      }
      if (studio.from === 'free') {
        resumeFree();
        if (studio.saved) selectStamp({ t: 'k', ch: Characters.byId(studio.ch.id) || studio.ch });
      } else actions.home();
    },
    partTab(el) { studio.tab = el.dataset.k; renderStudio(); },
    partPick(el) {
      studio.ch[studio.tab] = Characters.PARTS[studio.tab][Number(el.dataset.i)].id;
      studio.saved = false;
      renderStudio();
      Sound.boing();
    },
    charRandom() {
      studio.ch = Characters.random(studio.ch);
      studio.saved = false;
      renderStudio();
      Sound.sparkle();
    },
    charSave() {
      const ch = saveChar();
      toast(ch.name + ' is saved');
      Sound.fanfare(); confetti(90, ['🎭', '⭐']);
      speak('Hi, I’m ' + ch.name + '!');
    },
    charNew() { studio.ch = Characters.random(); studio.saved = false; studio.tab = 'body'; renderStudio(); },
    charEdit(el) { const c = Characters.byId(el.dataset.id); if (c) { studio.ch = Object.assign({}, c); studio.saved = true; renderStudio(); } },
    async charDelete() {
      const v = await ask('Say bye-bye to ' + esc(studio.ch.name) + '?', [{ label: 'Yes, delete', cls: 'primary', val: true }, { label: 'Keep them!', val: false }]);
      if (!v) return;
      const id = studio.ch.id;
      Characters.save(Characters.load().filter((c) => c.id !== id));
      S.players.forEach((p) => { if (p.av === id) p.av = 0; });
      saveSettings();
      actions.charNew();
    },
    charDraw() {
      const ch = saveChar();
      if (studio.from === 'free') { resumeFree(); selectStamp({ t: 'k', ch }); board.placeStamp({ t: 'k', ch }, 0.5, 0.55, 0.42); }
      else startFree(ch);
    },
  };

  // Board tools (data-tool) and everything else (data-act) share one listener.
  document.addEventListener('click', (e) => {
    Sound.ensure();
    const tool = e.target.closest('[data-tool]');
    if (tool) {
      const t = tool.dataset.tool;
      if (t === 'undo') { if (!board.undo()) Sound.boing(); else Sound.pop(); }
      else if (t === 'clear') { if (board.clear()) { Sound.tone(300, 0.3, 'sine', 0.12, 0, 90); toast('Cleared. Tap undo to bring it back'); } }
      else if (t === 'size') { sizeIdx = (sizeIdx + 1) % SIZES.length; applySize(); renderTools(); Sound.pop(); }
      else if (t === 'stamp') { openTray(); Sound.pop(); }
      else {
        if (t === 'fill' && board.color === 'rainbow') board.color = '#FF3B30';
        board.tool = t;
        if (t === 'pen' || t === 'fill') lastBrush = t;
        renderPalette(); renderTools(); Sound.pop();
      }
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    if (!['chooseCard', 'gotIt'].includes(el.dataset.act)) Sound.pop();
    actions[el.dataset.act](el, e);
  });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') { /* must pick a button */ } });
  $('tray').addEventListener('click', (e) => { if (e.target.id === 'tray') $('tray').hidden = true; });
  $('viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') $('viewer').hidden = true; });

  document.querySelectorAll('#setup .seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = seg.dataset.opt;
      S[key] = key === 'rounds' ? Number(b.dataset.val) : b.dataset.val;
      saveSettings(); renderOpts(); Sound.pop();
    });
  });

  // Peek: press and hold to see your word; let go and it hides again.
  const peek = $('peekBtn');
  const peekOn = (e) => { e.preventDefault(); $('peekCard').classList.add('on'); };
  const peekOff = () => $('peekCard').classList.remove('on');
  peek.addEventListener('pointerdown', peekOn);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => peek.addEventListener(ev, peekOff));

  // iOS: no pinch-zoom or double-tap zoom on a page little hands are slapping.
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  function refreshHome() {
    $('resumeBtn').hidden = !store.get('pict.game', null);
    $('soundBtn').innerHTML = '<svg class="ic"><use href="#i-' + (Sound.on ? 'sound' : 'mute') + '"/></svg>';
  }
  refreshHome();
  show('home');
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
