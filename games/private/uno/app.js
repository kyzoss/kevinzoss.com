(function () {
  'use strict';
  const L = window.UnoLogic;
  const SAVE = 'kz_uno_save', TALLY = 'kz_uno_tally', PREFS = 'kz_uno_prefs';
  const $ = (id) => document.getElementById(id);

  // ---- storage (every access guarded; the game works without it)
  function sget(k) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function sset(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function sdel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  const params = new URLSearchParams(location.search);
  const COLOR_NAME = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };
  const SHAPE = { red: '●', yellow: '■', green: '▲', blue: '◆' };
  const LETTER = { red: 'R', yellow: 'Y', green: 'G', blue: 'B' };
  const SYM = { skip: '⊘', rev: '⇄', d2: '+2', wild: 'W', d4: '+4' };
  const VNAME = { skip: 'Skip', rev: 'Reverse', d2: 'Draw Two', wild: 'Wild', d4: 'Wild Draw Four' };

  let G = null;          // game state
  let log = [];          // recent event lines, newest first
  let lastText = '';
  let timer = null, unoTimer = null;
  let paused = false;
  let lastDiscardId = null;
  let modalOpen = false;
  let busy = false;      // a human decision dialog is open

  const cardName = (c) => (c.c ? COLOR_NAME[c.c] + ' ' : '') + (VNAME[c.v] || c.v);
  const nm = (p) => (p === 0 ? 'You' : G.players[p].name);
  const verb = (p, a, b) => (p === 0 ? a : b);

  // ---- card rendering
  function cardEl(c, tag) {
    const el = document.createElement(tag || 'div');
    el.className = 'card ' + (c.c || 'wild');
    el.setAttribute('aria-label', cardName(c));
    const sym = SYM[c.v] || c.v;
    const small = c.v === 'd2' || c.v === 'd4' || c.v === 'wild';
    let h = '<span class="tl">' + sym + '</span>';
    if (!c.c) h += '<span class="quad"></span>';
    h += '<span class="mid' + (small ? ' sm' : '') + '">' + sym + '</span>';
    h += '<span class="mk">' + (c.c ? SHAPE[c.c] + ' ' + LETTER[c.c] : '● ■ ▲ ◆') + '</span>';
    el.innerHTML = h;
    return el;
  }

  // ---- event text
  function evText(e) {
    switch (e.t) {
      case 'start': return 'Starting card: ' + cardName(e.card) + '.';
      case 'play': return nm(e.p) + ' ' + verb(e.p, 'play', 'plays') + ' ' + cardName(e.card) + (e.card.c ? '' : ', color ' + COLOR_NAME[e.color]) + '.';
      case 'draw':
        if (e.forced) return nm(e.p) + ' ' + verb(e.p, 'draw', 'draws') + ' ' + e.n + ' card' + (e.n === 1 ? '' : 's') + '.';
        if (e.p === 0) return 'You drew ' + cardName(e.card) + (e.playable ? '. You can play it.' : '.');
        return nm(e.p) + ' draws a card.';
      case 'pass': return e.empty ? 'No cards left to draw. ' + nm(e.p) + ' ' + verb(e.p, 'pass', 'passes') + '.' : nm(e.p) + ' ' + verb(e.p, 'pass', 'passes') + '.';
      case 'skip': return nm(e.p) + ' ' + verb(e.p, 'are', 'is') + ' skipped.';
      case 'reverse': return 'Direction reversed.';
      case 'uno': return nm(e.p) + ' ' + verb(e.p, 'call', 'calls') + ' UNO!';
      case 'unopenalty': return 'You forgot to call UNO. You draw ' + e.n + '.';
      case 'catch': return nm(e.by) + ' ' + verb(e.by, 'caught', 'caught') + ' ' + nm(e.who) + ' without UNO. ' + nm(e.who) + ' ' + verb(e.who, 'draw', 'draws') + ' ' + e.n + '.';
      case 'challenge':
        return e.won
          ? nm(e.by) + ' ' + verb(e.by, 'challenge', 'challenges') + ' and wins: ' + nm(e.who) + ' held the color and ' + verb(e.who, 'draw', 'draws') + ' ' + e.n + '.'
          : nm(e.by) + ' ' + verb(e.by, 'challenge', 'challenges') + ' and loses: ' + nm(e.by) + ' ' + verb(e.by, 'draw', 'draws') + ' ' + e.n + '.';
      case 'color': return nm(e.p) + ' ' + verb(e.p, 'pick', 'picks') + ' ' + COLOR_NAME[e.color] + '.';
      case 'swap': return nm(e.p) + ' ' + verb(e.p, 'swap', 'swaps') + ' hands with ' + nm(e.with) + '.';
      case 'rotate': return 'All hands pass along.';
      case 'reshuffle': return 'Draw pile reshuffled from the discards.';
      case 'roundover': return nm(e.p) + ' ' + verb(e.p, 'go', 'goes') + ' out.';
      default: return '';
    }
  }
  function record(events) {
    for (const e of events) {
      const t = evText(e);
      if (!t) continue;
      log.unshift(t);
      lastText = t;
    }
    if (log.length > 12) log.length = 12;
  }

  // ---- persistence
  function save() {
    if (!G) return;
    if (G.phase === 'roundover' && G.over) { sdel(SAVE); return; }
    sset(SAVE, { g: G, log: log.slice(0, 8), last: lastText });
  }
  function tally() { return sget(TALLY) || { w: 0, l: 0 }; }
  function renderTally() { const t = tally(); $('tally').textContent = 'W ' + t.w + '  L ' + t.l; }

  // ---- rendering
  function humanMoves() { return G.cur === 0 ? L.legalMoves(G, 0) : []; }

  function render() {
    if (!G) return;
    const you = G.players[0];
    // opponents
    const opps = $('opps');
    opps.innerHTML = '';
    G.players.forEach((p, i) => {
      if (i === 0) return;
      const d = document.createElement('div');
      d.className = 'opp' + (G.cur === i && G.phase !== 'roundover' ? ' turn' : '');
      const fan = Math.min(p.hand.length, 8);
      d.innerHTML = '<span class="nm"></span><span class="fan">' + '<i></i>'.repeat(fan) + '</span><span class="ct"></span><span class="badge ' + (p.hand.length === 1 ? '' : 'none') + '">UNO</span>';
      d.querySelector('.nm').textContent = p.name;
      d.querySelector('.ct').textContent = p.hand.length + (p.hand.length === 1 ? ' card' : ' cards') + (G.rules.target ? ' · ' + p.score + ' pts' : '');
      d.setAttribute('aria-label', p.name + ', ' + p.hand.length + ' cards' + (G.cur === i ? ', their turn' : ''));
      opps.appendChild(d);
    });

    // table
    const top = L.topCard(G);
    const disc = $('discard');
    disc.innerHTML = '';
    disc.appendChild(cardEl(top));
    disc.classList.toggle('ring', !top.c);
    disc.style.setProperty('--ring', top.c ? '#fff' : cssColor(G.color));
    if (top.id !== lastDiscardId) { disc.classList.remove('pop'); void disc.offsetWidth; disc.classList.add('pop'); lastDiscardId = top.id; }
    $('drawCount').textContent = G.draw.length;
    const chip = $('colorChip');
    chip.innerHTML = '<span class="dot" style="background:' + cssColor(G.color) + '">' + (G.color ? LETTER[G.color] : '') + '</span>' + (G.color ? COLOR_NAME[G.color] : '');
    chip.style.borderColor = cssColor(G.color);
    $('dirChip').textContent = G.dir === 1 ? 'Clockwise ↻' : 'Counter ↺';
    if (G.pendingDraw) $('dirChip').textContent = 'Stack: +' + G.pendingDraw;

    // turn line
    const turn = $('turn');
    const mine = G.cur === 0 && G.phase !== 'roundover';
    const moves = humanMoves();
    let tt;
    if (G.phase === 'roundover') tt = 'Round over';
    else if (G.phase === 'unowin') tt = 'Tap UNO now!';
    else if (G.phase === 'challenge') tt = G.cur === 0 ? 'Challenge the Wild Draw Four?' : G.players[G.cur].name + ' is deciding...';
    else if (mine && G.phase === 'drawn') tt = 'Play the drawn card, or keep it and pass';
    else if (mine && G.pendingDraw) tt = moves.length ? 'Stack a Draw Two, or draw ' + G.pendingDraw : 'Draw ' + G.pendingDraw + ' cards';
    else if (mine) tt = moves.length ? 'Your turn' : 'Your turn: nothing to play, draw a card';
    else tt = G.players[G.cur].name + "'s turn...";
    turn.textContent = tt;
    turn.classList.toggle('you', mine || G.phase === 'unowin');
    $('last').textContent = lastText;
    const ul = $('log');
    ul.innerHTML = '';
    log.slice(1, 4).forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });

    // actions
    const dp = $('drawPile');
    const canDraw = mine && G.phase === 'play';
    dp.disabled = !canDraw;
    dp.classList.toggle('hint', canDraw && moves.length === 0);
    dp.setAttribute('aria-label', 'Draw pile, ' + G.draw.length + ' cards' + (canDraw ? '. Tap to draw' : ''));
    const uno = $('btnUno');
    const canUno = (G.phase === 'unowin' && G.unoWho === 0) || (mine && (G.phase === 'play' || G.phase === 'drawn') && you.hand.length <= 2);
    uno.disabled = !canUno || you.uno;
    uno.classList.toggle('urgent', G.phase === 'unowin' && !you.uno);
    uno.classList.toggle('on', you.uno && you.hand.length <= 2);
    const ct = $('btnCatch');
    const canCatch = G.catchable !== null && G.catchable !== 0 && G.phase !== 'roundover';
    ct.disabled = !canCatch;
    ct.classList.toggle('catch-on', canCatch);
    ct.textContent = canCatch ? 'Catch ' + G.players[G.catchable].name + '!' : 'Catch';
    $('btnPass').hidden = !(mine && G.phase === 'drawn');

    // hand
    const hand = $('hand');
    hand.innerHTML = '';
    hand.classList.toggle('dense', you.hand.length > 12);
    const order = { red: 0, yellow: 1, green: 2, blue: 3 };
    const sorted = you.hand.slice().sort((a, b) => {
      const ka = a.c ? order[a.c] : 9, kb = b.c ? order[b.c] : 9;
      if (ka !== kb) return ka - kb;
      return (a.v + '').localeCompare(b.v + '', undefined, { numeric: true });
    });
    const legal = new Set(moves.map((c) => c.id));
    for (const c of sorted) {
      const el = cardEl(c, 'button');
      el.type = 'button';
      const ok = legal.has(c.id);
      if (mine) el.classList.add(ok ? 'ok' : 'no');
      if (G.phase === 'drawn' && c.id === G.drawnId) el.classList.add('fresh');
      el.addEventListener('click', () => onCard(c, el));
      hand.appendChild(el);
    }
  }
  function cssColor(c) { return c ? 'var(--c-' + c + ')' : '#555'; }

  // ---- modal helper
  function modal(title, bodyHtml, buttons, opts) {
    opts = opts || {};
    $('mTitle').textContent = title;
    const body = $('mBody');
    if (typeof bodyHtml === 'string') body.innerHTML = bodyHtml; else { body.innerHTML = ''; body.appendChild(bodyHtml); }
    const bt = $('mBtns');
    bt.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = b.cls || 'btn';
      if (b.html) el.innerHTML = b.html; else el.textContent = b.label;
      el.addEventListener('click', () => b.fn());
      bt.appendChild(el);
    }
    $('modal').hidden = false;
    modalOpen = true;
    modalDismiss = opts.dismiss || null;
    const first = bt.querySelector('button');
    if (first) first.focus();
  }
  let modalDismiss = null;
  function closeModal() { $('modal').hidden = true; modalOpen = false; modalDismiss = null; }

  function pickColor(title, cb) {
    const wrap = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'picks';
    L.COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick ' + c;
      b.innerHTML = SHAPE[c] + ' ' + COLOR_NAME[c] + ' <small>(' + (i + 1) + ')</small>';
      b.addEventListener('click', () => { closeModal(); cb(c); });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    modal(title, wrap, [], {});
    grid.querySelector('button').focus();
  }

  // ---- human actions
  function apply(res) {
    if (!res || !res.ok) return false;
    record(res.events);
    after();
    return true;
  }
  function after() {
    save();
    render();
    schedule();
  }

  function onCard(c, el) {
    if (!G || G.cur !== 0 || busy || modalOpen) return;
    if (!L.legalMoves(G, 0).some((x) => x.id === c.id)) {
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      $('last').textContent = "That card can't be played on " + cardName(L.topCard(G)) + (G.color && !L.topCard(G).c ? ' (' + COLOR_NAME[G.color] + ')' : '') + '.';
      return;
    }
    const go = (o) => { busy = false; apply(L.play(G, 0, c.id, o)); };
    const needColor = !c.c;
    const needSwap = G.rules.sevenZero && c.v === '7' && G.players.length > 2;
    const swap = (o) => {
      if (!needSwap) return go(o);
      const wrap = document.createElement('div');
      const grid = document.createElement('div');
      grid.className = 'picks';
      G.players.forEach((p, i) => {
        if (i === 0) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pick plain';
        b.textContent = p.name + ' (' + p.hand.length + ')';
        b.addEventListener('click', () => { closeModal(); o.swapWith = i; go(o); });
        grid.appendChild(b);
      });
      wrap.appendChild(grid);
      modal('Swap hands with', wrap, [{ label: 'Cancel', fn: () => { closeModal(); busy = false; } }]);
      grid.querySelector('button').focus();
    };
    busy = true;
    if (needColor) pickColor('Choose a color', (col) => swap({ color: col }));
    else swap({});
  }

  function onDraw() { if (G && G.cur === 0 && G.phase === 'play' && !busy && !modalOpen) apply(L.draw(G, 0)); }
  function onPass() { if (G && G.cur === 0 && G.phase === 'drawn' && !modalOpen) apply(L.pass(G, 0)); }
  function onUno() {
    if (!G || modalOpen) return;
    apply(L.callUno(G, 0));
  }
  function onCatch() { if (G && !modalOpen) apply(L.catchUno(G, 0)); }

  // ---- scheduler: AI turns with a visible pause, UNO window, human dialogs
  function schedule() {
    clearTimeout(timer);
    clearTimeout(unoTimer);
    if (!G || paused) return;
    if (G.phase === 'roundover') { showRoundOver(); return; }
    const cur = G.players[G.cur];
    if (!cur.human) {
      const delay = G.catchable !== null ? 1900 : G.phase === 'challenge' ? 1200 : 1050;
      timer = setTimeout(() => { if (!paused && !modalOpen) apply(L.aiStep(G)); }, delay);
      return;
    }
    if (G.phase === 'unowin') {
      unoTimer = setTimeout(() => { if (G.phase === 'unowin') apply(L.endTurn(G, 0)); }, 2300);
    } else if (G.phase === 'firstcolor') {
      busy = true;
      pickColor('Starting card is Wild. Choose the color', (col) => { busy = false; apply(L.setColor(G, 0, col)); });
    } else if (G.phase === 'challenge') {
      const p = G.pending;
      busy = true;
      modal('Wild Draw Four', '<p><b>' + G.players[p.by].name + '</b> played a Wild Draw Four and chose <b>' + COLOR_NAME[G.color] + '</b>.</p>' +
        '<p>Challenge if you think they held a card of the previous color (' + COLOR_NAME[p.prevColor] + '). If you are right they draw 4. If you are wrong you draw 6.</p>',
        [
          { label: 'Challenge', cls: 'btn primary', fn: () => { closeModal(); busy = false; apply(L.challenge(G, 0, true)); } },
          { label: 'Accept, draw 4', fn: () => { closeModal(); busy = false; apply(L.challenge(G, 0, false)); } },
        ]);
    }
  }

  // ---- round over
  function showRoundOver() {
    if (modalOpen) return;
    const w = G.winner;
    const youWon = w === 0;
    if (G.over && !G.tallied) {
      G.tallied = true;
      const t = tally();
      if (youWon) t.w++; else t.l++;
      sset(TALLY, t);
      renderTally();
      save();
    }
    let body = '<p>' + (youWon ? 'You played your last card.' : G.players[w].name + ' played their last card.') + ' <b>+' + G.roundPoints + ' points</b> for ' + (youWon ? 'you' : G.players[w].name) + ' (the cards left in the other hands).</p>';
    if (G.rules.target) {
      body += '<table class="score">' + G.players.map((p) => '<tr><td>' + (p.human ? 'You' : p.name) + '</td><td>' + p.score + ' / ' + G.rules.target + '</td></tr>').join('') + '</table>';
    }
    const t = tally();
    body += '<p style="margin-top:10px">Record: ' + t.w + ' won, ' + t.l + ' lost.</p>';
    const btns = [];
    if (G.rules.target && !G.over) btns.push({ label: 'Next round', cls: 'btn primary', fn: () => { closeModal(); G.tallied = false; L.startRound(G); log = []; lastText = ''; record(G.ev); lastDiscardId = null; after(); } });
    else btns.push({ label: 'Play again', cls: 'btn primary', fn: () => { closeModal(); newGame(currentSetup()); } });
    btns.push({ label: 'Setup', fn: () => { closeModal(); openNew(); } });
    btns.push({ label: 'Close', fn: () => closeModal() });
    const title = G.over ? (youWon ? 'You win!' : G.players[w].name + ' wins') : (youWon ? 'Round won' : G.players[w].name + ' won the round');
    modal(title, body, btns, { dismiss: true });
  }

  // ---- new game / setup
  function currentSetup() {
    return { players: G ? G.players.length : 4, stack2: G ? G.rules.stack2 : false, sevenZero: G ? G.rules.sevenZero : false, target: G ? !!G.rules.target : false };
  }
  function prefs() {
    const p = sget(PREFS) || {};
    return { players: p.players || 4, stack2: !!p.stack2, sevenZero: !!p.sevenZero, target: !!p.target };
  }
  function newGame(setup, seed) {
    sset(PREFS, setup);
    clearTimeout(timer); clearTimeout(unoTimer);
    if (seed === undefined) seed = Date.now() | 0;
    G = L.newGame({ seed, players: setup.players, rules: { stack2: setup.stack2, sevenZero: setup.sevenZero, target: setup.target ? 500 : 0 } });
    G.tallied = false;
    log = []; lastText = ''; lastDiscardId = null; busy = false;
    record(G.ev);
    closeModal();
    paused = false;
    after();
  }
  function openNew() {
    const pf = G ? currentSetup() : prefs();
    paused = true;
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<h3>Computer opponents</h3><div class="seg">' +
      [1, 2, 3].map((n) => '<label><input type="radio" name="opp" value="' + n + '"' + (pf.players - 1 === n ? ' checked' : '') + '><span>' + n + '</span></label>').join('') +
      '</div><h3>House rules</h3>' +
      '<label class="opt"><input type="checkbox" id="rStack"' + (pf.stack2 ? ' checked' : '') + '><span>Stack +2 on +2<small>Answer a Draw Two with another one.</small></span></label>' +
      '<label class="opt"><input type="checkbox" id="rSeven"' + (pf.sevenZero ? ' checked' : '') + '><span>7-0 swap<small>A 7 swaps hands with a player. A 0 passes every hand along.</small></span></label>' +
      '<label class="opt"><input type="checkbox" id="rPts"' + (pf.target ? ' checked' : '') + '><span>Play to 500 points<small>Off means a single round.</small></span></label>';
    const saved = sget(SAVE);
    const btns = [{
      label: 'Start game', cls: 'btn primary', fn: () => {
        const n = parseInt((wrap.querySelector('input[name=opp]:checked') || {}).value, 10) || 3;
        newGame({ players: n + 1, stack2: wrap.querySelector('#rStack').checked, sevenZero: wrap.querySelector('#rSeven').checked, target: wrap.querySelector('#rPts').checked });
      },
    }];
    if (G && G.phase !== 'roundover') btns.push({ label: 'Cancel', fn: () => { closeModal(); paused = false; schedule(); } });
    else if (saved && saved.g && !(saved.g.phase === 'roundover' && saved.g.over)) btns.push({ label: 'Resume saved', fn: resume });
    modal('New game', wrap, btns, { dismiss: G ? true : false });
  }
  function resume() {
    const s = sget(SAVE);
    if (!s || !s.g || s.g.v !== 1 || !Array.isArray(s.g.players)) return false;
    G = s.g;
    log = s.log || []; lastText = s.last || '';
    lastDiscardId = null; busy = false; paused = false;
    closeModal();
    after();
    return true;
  }

  // ---- rules panel
  function openRules() {
    paused = true;
    const r = G ? G.rules : { stack2: false, sevenZero: false, target: 0 };
    const on = (b) => (b ? '<b>on</b>' : 'off');
    const html =
      '<h3>Goal</h3><p>Be first to play all your cards. Other players score the points left in their hands' + (r.target ? '; first to 500 wins the game' : '') + '.</p>' +
      '<h3>On your turn</h3><ul><li>Play a card matching the top card by <b>color</b>, <b>number</b> or <b>symbol</b>, or play any Wild.</li>' +
      '<li>No match? Draw one card. If it can be played you may play it, otherwise you pass.</li>' +
      '<li>Each color also carries a shape and letter (R circle, Y square, G triangle, B diamond) so colors are never the only clue.</li></ul>' +
      '<h3>Action cards</h3><ul><li><b>Skip</b> (⊘): next player loses a turn.</li><li><b>Reverse</b> (⇄): flips direction. With 2 players it acts as a Skip.</li>' +
      '<li><b>Draw Two</b> (+2): next player draws 2 and loses a turn.</li><li><b>Wild</b>: choose the color.</li>' +
      '<li><b>Wild Draw Four</b> (+4): choose the color, next player draws 4 and loses a turn. Legal only if you hold no card of the current color. The next player may challenge: if you did hold that color you draw 4 instead, otherwise the challenger draws 6.</li></ul>' +
      '<h3>UNO</h3><p>When you are down to one card you must press <b>UNO</b>, either before you play your second-to-last card or right after it (you get a couple of seconds). Forget and you draw 2. Computer players usually call it, but sometimes forget: tap <b>Catch</b> before the next player moves and they draw 2.</p>' +
      '<h3>Start of a round</h3><p>7 cards each. If the first card is Skip, Reverse or Draw Two it applies to the first player. If it is Wild, the first player picks the color. A Wild Draw Four start card is put back and reshuffled. When the draw pile runs out the discards (under the top card) are reshuffled.</p>' +
      '<h3>House rules for this game</h3><ul><li>Stack +2 on +2: ' + on(r.stack2) + '</li><li>7-0 swap: ' + on(r.sevenZero) + '</li><li>Scoring: ' + (r.target ? 'play to 500 points' : 'single round') + '</li></ul>' +
      '<p>Points: number cards face value, Skip, Reverse and Draw Two 20, Wilds 50.</p>' +
      '<h3>Keys</h3><p>D draw, U call UNO, P keep and pass, K catch, 1 to 4 pick a color. Tab to a card and press Enter to play it.</p>' +
      (G ? '<p>Deal seed: <b>' + G.seed + '</b>. Add <b>?seed=' + G.seed + '</b> to the address to replay this deal.</p>' : '');
    modal('How to play', html, [{ label: 'Close', cls: 'btn primary', fn: () => { closeModal(); paused = false; schedule(); } }], { dismiss: true });
    $('mBody').scrollTop = 0;
  }

  // ---- wiring
  $('drawPile').addEventListener('click', onDraw);
  $('btnUno').addEventListener('click', onUno);
  $('btnCatch').addEventListener('click', onCatch);
  $('btnPass').addEventListener('click', onPass);
  $('btnRules').addEventListener('click', () => { if (!modalOpen) openRules(); });
  $('btnNew').addEventListener('click', () => { if (!modalOpen) openNew(); });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && modalDismiss) dismissModal(); });
  function dismissModal() {
    closeModal();
    if (paused) { paused = false; schedule(); }
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (modalOpen) {
      if (k === 'escape' && modalDismiss) dismissModal();
      const picks = document.querySelectorAll('#mBody .pick');
      if (picks.length === 4 && '1234'.indexOf(k) >= 0 && k.length === 1) picks[parseInt(k, 10) - 1].click();
      return;
    }
    if (k === 'd') onDraw();
    else if (k === 'u') onUno();
    else if (k === 'p') onPass();
    else if (k === 'k') onCatch();
  });

  // ---- boot
  renderTally();
  const sp = parseInt(params.get('seed'), 10);
  const pf = prefs();
  const np = parseInt(params.get('players'), 10);
  if (!isNaN(sp)) {
    newGame({ players: np >= 2 && np <= 4 ? np : pf.players, stack2: params.get('stack2') === '1' || pf.stack2, sevenZero: params.get('seven') === '1' || pf.sevenZero, target: params.get('points') === '1' || pf.target }, sp);
  } else {
    const saved = sget(SAVE);
    if (saved && saved.g && saved.g.v === 1 && Array.isArray(saved.g.players) && !(saved.g.phase === 'roundover' && saved.g.over)) {
      paused = true;
      modal('Welcome back', '<p>You have a game in progress.</p>', [
        { label: 'Resume', cls: 'btn primary', fn: () => { if (!resume()) openNew(); } },
        { label: 'New game', fn: () => { sdel(SAVE); closeModal(); openNew(); } },
      ]);
    } else {
      newGame(pf);
    }
  }
  window.__uno = { get G() { return G; }, L };
})();
