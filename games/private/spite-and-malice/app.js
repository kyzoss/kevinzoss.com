(function () {
  'use strict';
  const L = window.SpiteLogic;
  const SAVE_KEY = 'sam-save-v1', TALLY_KEY = 'sam-tally-v1';
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  let s = null;            // game state (logic.js)
  let log = [];            // [{t, who}]
  let sel = null;          // {src, i}
  let undo = [];           // JSON snapshots, current human turn only
  let hl = {};             // highlighted slots {key: 'hl'|'src'}
  let msg = '';
  let busy = false;        // computer is moving
  let aiTimer = null;
  let tally = { w: 0, l: 0 };

  const $ = id => document.getElementById(id);
  const board = $('board');

  // ---- storage (all optional) ----
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function fetchStore(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function dropStore(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function loadTally() {
    try { const t = JSON.parse(fetchStore(TALLY_KEY)); if (t && typeof t.w === 'number') tally = { w: t.w | 0, l: t.l | 0 }; } catch (e) { /* ignore */ }
  }
  function saveGame() {
    if (!s) return;
    if (s.winner !== null) { dropStore(SAVE_KEY); return; }
    store(SAVE_KEY, JSON.stringify({ s: s, log: log.slice(-40), msg: msg }));
  }
  function loadGame() {
    try {
      const o = JSON.parse(fetchStore(SAVE_KEY));
      if (o && o.s && o.s.v === 1 && o.s.winner === null && Array.isArray(o.s.players)) return o;
    } catch (e) { /* ignore */ }
    return null;
  }

  // ---- names ----
  function cname(c) {
    const r = L.rank(c);
    if (r === 0) return 'Joker';
    return RANKS[r] + SUITS[L.suit(c)] + (r === 13 ? ' (wild)' : '');
  }
  function addLog(t, who) { log.push({ t: t, who: who }); if (log.length > 80) log.shift(); }

  // ---- card drawing ----
  function cardHTML(c, asValue) {
    const r = L.rank(c);
    if (r === 0) return '<div class="card joker wild"><span class="jt">JOKER</span><span class="mid">★</span>' + (asValue ? '<span class="asv">as ' + RANKS[asValue] + '</span>' : '') + '</div>';
    const su = L.suit(c), red = su === 1 || su === 2;
    return '<div class="card ' + (red ? 'red' : '') + (r === 13 ? ' wild' : '') + '"><span class="tl">' + RANKS[r] + '<i>' + SUITS[su] + '</i></span><span class="mid">' + SUITS[su] + '</span>' +
      (r === 13 ? '<span class="wtag">WILD</span>' : '') + (asValue ? '<span class="asv">as ' + RANKS[asValue] + '</span>' : '') + '</div>';
  }
  const backHTML = '<div class="card back"></div>';

  function slot(key, o) {
    // o: {card, asValue, count, hint, cls, label, disabled, act, idx, cap}
    const classes = ['slot'];
    if (!o.card && !o.back) classes.push('empty');
    if (o.cls) classes.push(o.cls);
    if (hl[key]) classes.push(hl[key]);
    const inner = o.back ? backHTML : o.card !== undefined ? cardHTML(o.card, o.asValue) : '';
    const cnt = o.count !== undefined && o.count > 0 ? '<span class="count' + (o.dim ? ' dim' : '') + '">' + o.count + '</span>' : '';
    return '<div class="slotwrap"><button type="button" class="' + classes.join(' ') + '" data-act="' + (o.act || '') + '" data-i="' + (o.idx === undefined ? '' : o.idx) + '" data-hint="' + (o.hint || '') + '" aria-label="' + (o.label || '') + '"' + (o.disabled ? ' disabled' : '') + '>' + inner + cnt + '</button><span class="cap">' + (o.cap || '&nbsp;') + '</span></div>';
  }

  function humanTurn() { return s && s.winner === null && s.turn === 0 && !busy; }

  function render() {
    if (!s) return;
    const me = s.players[0], ai = s.players[1];
    const ht = humanTurn();
    const selCard = sel ? L.cardAt(s, 0, sel.src, sel.i) : undefined;
    let h = '';
    // computer
    h += '<div class="zone"><div class="rowlabel"><span>Computer</span><span class="chip">hand ' + ai.hand.length + ' &middot; stock ' + ai.stock.length + ' left</span></div><div class="row">';
    const at = ai.stock.length ? ai.stock[ai.stock.length - 1] : undefined;
    h += slot('os', { card: at, count: ai.stock.length, label: 'Computer stock', disabled: true, cap: 'stock', hint: '0', dim: false });
    for (let j = 0; j < 4; j++) {
      const d = ai.disc[j];
      h += slot('od' + j, { card: d.length ? d[d.length - 1] : undefined, count: d.length > 1 ? d.length : 0, dim: true, label: 'Computer discard ' + (j + 1), disabled: true, cap: j === 0 ? 'discards' : '' });
    }
    h += '</div></div>';
    // center
    h += '<div class="zone"><div class="rowlabel"><span>Build piles</span><span class="chip">Ace up to Queen</span></div><div class="row">';
    h += slot('draw', { back: s.draw.length > 0, count: s.draw.length, dim: true, label: 'Draw pile', disabled: true, cap: 'draw', hint: '', cls: '' });
    for (let k = 0; k < 4; k++) {
      const b = s.build[k], top = b.cards.length ? b.cards[b.cards.length - 1] : undefined;
      const wildTop = top !== undefined && L.isWild(top);
      const can = ht && selCard !== undefined && L.canPlayOn(s, selCard, k);
      h += slot('b' + k, {
        card: top, asValue: wildTop ? b.n - 1 : 0, act: 'build', idx: k, hint: 'A', disabled: !ht,
        cls: can ? 'tgt' : '', label: 'Build pile ' + (k + 1) + ', needs ' + b.n, cap: 'needs ' + b.n
      });
    }
    h += '</div></div>';
    // you
    h += '<div class="zone"><div class="rowlabel"><span>You</span><span class="chip">stock ' + me.stock.length + ' left</span></div><div class="row">';
    const mt = me.stock.length ? me.stock[me.stock.length - 1] : undefined;
    h += slot('ms', { card: mt, count: me.stock.length, act: 'stock', disabled: !ht || mt === undefined, cls: sel && sel.src === 'stock' ? 'sel' : '', label: 'Your stock pile top', cap: 'stock goal' });
    for (let j = 0; j < 4; j++) {
      const d = me.disc[j];
      const isSel = sel && sel.src === 'disc' && sel.i === j;
      const dtgt = ht && sel && sel.src === 'hand';
      h += slot('md' + j, { card: d.length ? d[d.length - 1] : undefined, count: d.length > 1 ? d.length : 0, dim: true, act: 'disc', idx: j, disabled: !ht || (!d.length && !dtgt), cls: (isSel ? 'sel ' : '') + (dtgt ? 'tgt dtgt' : ''), label: 'Your discard pile ' + (j + 1), cap: j === 0 ? 'your discards' : '', hint: '' });
    }
    h += '</div></div>';
    // status
    h += '<div class="status ' + (s.winner !== null ? 'over' : s.turn === 1 ? 'ai' : '') + '" id="status" role="status">' + statusText() + '</div>';
    // hand
    h += '<div class="row hand">';
    for (let i = 0; i < 5; i++) {
      const c = me.hand[i];
      h += slot('mh' + i, { card: c, act: 'hand', idx: i, disabled: !ht || c === undefined, cls: sel && sel.src === 'hand' && sel.i === i ? 'sel' : '', label: c === undefined ? 'Empty hand slot' : 'Hand card ' + cname(c), hint: '' });
    }
    h += '</div>';
    h += '<div class="actions"><button type="button" class="btn" id="btnUndo"' + (ht && (sel || undo.length) ? '' : ' disabled') + '>' + (sel ? 'Cancel selection' : 'Undo play') + '</button>' +
      (ht && L.canEndWithoutDiscard(s) ? '<button type="button" class="btn primary" id="btnEnd">End turn</button>' : '') + '</div>';
    board.innerHTML = h;

    $('tally').innerHTML = 'Record: <b>' + tally.w + '</b> won, <b>' + tally.l + '</b> lost';
    const ol = $('log');
    ol.innerHTML = log.slice(-40).reverse().map(e => '<li class="' + e.who + '">' + e.t + '</li>').join('');
  }

  function statusText() {
    if (s.winner === 0) return 'You emptied your stock pile. You win!';
    if (s.winner === 1) return 'The computer emptied its stock pile. It wins.';
    if (s.winner === 2) return 'Draw: the game stalled with equal stock piles.';
    if (s.turn === 1) return msg || 'Computer is thinking...';
    if (msg) return msg;
    if (sel) return 'Tap a glowing build pile to play it' + (sel.src === 'hand' ? ', or tap one of your discard piles to discard and end your turn.' : '.');
    return 'Your turn. Play cards to the build piles, then discard a hand card to end your turn.';
  }

  // ---- human interaction ----
  function select(src, i) {
    if (!humanTurn()) return;
    if (sel && sel.src === src && sel.i === i) sel = null; else sel = { src: src, i: i };
    msg = '';
    render();
  }
  function humanPlay(pile) {
    const c = L.cardAt(s, 0, sel.src, sel.i);
    if (c === undefined) { sel = null; render(); return; }
    if (!L.canPlayOn(s, c, pile)) {
      msg = 'That card does not fit. This pile needs a ' + RANKS[s.build[pile].n] + ' (or a wild).';
      render(); return;
    }
    undo.push(JSON.stringify(s));
    const src = sel.src, i = sel.i;
    const res = L.play(s, { src: src, i: i, pile: pile });
    sel = null; msg = '';
    hl = { ['b' + pile]: 'hl' };
    let t = 'You played ' + cname(res.card) + ' to pile ' + (pile + 1) + (src === 'stock' ? ' (from stock)' : src === 'disc' ? ' (from discard)' : '');
    if (res.completed) t += ', pile complete';
    addLog(t, 'me');
    if (res.redrew) { msg = 'Hand empty: you drew ' + res.redrew + ' new cards.'; addLog('You drew ' + res.redrew + ' new cards', 'me'); }
    if (res.won) { finish(); return; }
    if (res.turnEnded) { undo = []; afterTurnChange(); return; }
    saveGame(); render();
  }
  function humanDiscard(pile) {
    if (!sel || sel.src !== 'hand') return;
    const c = L.cardAt(s, 0, 'hand', sel.i);
    L.discard(s, sel.i, pile);
    sel = null; undo = []; msg = '';
    hl = { ['md' + pile]: 'hl' };
    addLog('You discarded ' + cname(c) + ' to discard pile ' + (pile + 1), 'me');
    afterTurnChange();
  }
  function afterTurnChange() {
    saveGame(); render();
    if (s.winner !== null) { finish(); return; }
    if (s.turn === 1) startAI();
  }

  board.addEventListener('click', function (e) {
    const b = e.target.closest('button.slot');
    if (!b || b.disabled || !humanTurn()) return;
    const act = b.dataset.act, i = parseInt(b.dataset.i, 10);
    if (act === 'hand') select('hand', i);
    else if (act === 'stock') select('stock', 0);
    else if (act === 'build') { if (sel) humanPlay(i); else { msg = 'Pick a card first, then tap a build pile.'; render(); } }
    else if (act === 'disc') {
      if (sel && sel.src === 'hand') humanDiscard(i);
      else if (s.players[0].disc[i].length) select('disc', i);
    }
  });
  board.addEventListener('click', function (e) {
    if (e.target.closest('#btnUndo')) doUndo();
    else if (e.target.closest('#btnEnd')) {
      if (!humanTurn()) return;
      L.endWithoutDiscard(s); sel = null; undo = []; msg = '';
      addLog('You ended your turn (no cards in hand)', 'me');
      afterTurnChange();
    }
  });
  function doUndo() {
    if (!humanTurn()) return;
    if (sel) { sel = null; msg = ''; render(); return; }
    if (!undo.length) return;
    s = JSON.parse(undo.pop());
    hl = {}; msg = 'Undid your last play.';
    addLog('You undid a play', 'me');
    saveGame(); render();
  }

  document.addEventListener('keydown', function (e) {
    if (!$('modal').hidden) { if (e.key === 'Escape' && s) closeModal(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!humanTurn()) return;
    const hands = ['1', '2', '3', '4', '5'], discs = ['q', 'w', 'e', 'r'], builds = ['a', 's', 'd', 'f'];
    if (hands.includes(k)) { if (s.players[0].hand[+k - 1] !== undefined) select('hand', +k - 1); }
    else if (k === '0') { if (s.players[0].stock.length) select('stock', 0); }
    else if (discs.includes(k)) {
      const j = discs.indexOf(k);
      if (sel && sel.src === 'hand') humanDiscard(j); else if (s.players[0].disc[j].length) select('disc', j);
    }
    else if (builds.includes(k)) { if (sel) humanPlay(builds.indexOf(k)); }
    else if (k === 'u' || k === 'backspace' || k === 'escape') doUndo();
    else return;
    e.preventDefault();
  });

  // ---- computer turn ----
  function startAI() {
    if (aiTimer) clearTimeout(aiTimer);
    busy = true; msg = ''; render();
    aiTimer = setTimeout(aiStep, reduced ? 250 : 700);
  }
  function aiStep() {
    aiTimer = null;
    if (!s || s.winner !== null || s.turn !== 1) { busy = false; render(); return; }
    const ch = L.aiChoose(s);
    hl = {};
    let delay = reduced ? 250 : 750;
    if (ch.type === 'play') {
      const m = ch.move;
      const srcKey = m.src === 'stock' ? 'os' : m.src === 'disc' ? 'od' + m.i : null;
      const res = L.play(s, m);
      hl['b' + m.pile] = 'hl';
      if (srcKey) hl[srcKey] = 'src';
      let t = 'Computer played ' + cname(res.card) + ' to pile ' + (m.pile + 1) + (m.src === 'stock' ? ' (from stock)' : m.src === 'disc' ? ' (from discard)' : '');
      if (res.completed) t += ', pile complete';
      addLog(t, 'ai');
      msg = t + '.';
      if (res.won) { busy = false; finish(); return; }
      if (res.turnEnded) { busy = false; msg = t + '. Your turn.'; saveGame(); render(); return; }
    } else {
      const res = ch.type === 'discard' ? L.discard(s, ch.hand, ch.pile) : L.endWithoutDiscard(s);
      if (ch.type === 'discard') {
        hl['od' + ch.pile] = 'hl';
        const t = 'Computer discarded ' + cname(res.card) + ' to its pile ' + (ch.pile + 1);
        addLog(t, 'ai'); msg = t + '. Your turn.';
      } else { addLog('Computer ended its turn', 'ai'); msg = 'Computer ended its turn. Your turn.'; }
      delay = 0;
      busy = false;
      if (s.winner !== null) { finish(); return; }
      saveGame(); render();
      if (s.turn === 1) startAI();
      return;
    }
    saveGame(); render();
    aiTimer = setTimeout(aiStep, delay);
  }

  // ---- game end / new game ----
  function finish() {
    busy = false; sel = null; undo = [];
    if (!s.tallied && (s.winner === 0 || s.winner === 1)) {
      s.tallied = true;
      if (s.winner === 0) tally.w++; else tally.l++;
      store(TALLY_KEY, JSON.stringify(tally));
    }
    addLog(s.winner === 0 ? 'You win' : s.winner === 1 ? 'Computer wins' : 'Draw', s.winner === 0 ? 'me' : 'ai');
    dropStore(SAVE_KEY);
    render();
    const title = s.winner === 0 ? 'You win!' : s.winner === 1 ? 'Computer wins' : 'Draw';
    const sub = s.winner === 2 ? 'The game stalled with both stock piles equal.' :
      s.winner === 0 ? 'Your stock pile is empty.' : 'The computer cleared its stock pile first. You had ' + s.players[0].stock.length + ' stock cards left.';
    openModal('<h2>' + title + '</h2><p>' + sub + '</p><p>Record: <b>' + tally.w + '</b> won, <b>' + tally.l + '</b> lost. Seed ' + s.seed + '.</p>' +
      '<div class="row2"><button class="btn primary" data-m="new" type="button">New game</button><button class="btn" data-m="close" type="button">Look at the board</button></div>');
  }
  function startNew(seed) {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    busy = false; sel = null; undo = []; hl = {}; log = []; msg = '';
    if (seed === undefined) seed = (Date.now() ^ ((Math.random() * 4294967296) >>> 0)) | 0;
    s = L.newGame(seed);
    addLog('New game, seed ' + s.seed + '. ' + (s.turn === 0 ? 'You go first.' : 'Computer goes first.'), 'me');
    closeModal();
    saveGame(); render();
    if (s.turn === 1) startAI();
  }
  window.__spite = { get state() { return s; }, L: L, newGame: startNew };

  // ---- modal ----
  function openModal(html) { $('sheet').innerHTML = html; $('modal').hidden = false; const b = $('sheet').querySelector('button'); if (b) b.focus(); }
  function closeModal() { $('modal').hidden = true; }
  $('modal').addEventListener('click', function (e) {
    const m = e.target.dataset && e.target.dataset.m;
    if (m === 'close' || (e.target === $('modal') && s)) closeModal();
    else if (m === 'new') startNew();
    else if (m === 'resume') { closeModal(); resume(); }
  });

  const HELP = '<h2>How to play</h2>' +
    '<p>You against the computer. Be the first to play every card from your <b>stock pile</b> (20 cards).</p>' +
    '<h3>Cards</h3><ul><li>Two 52-card decks plus 4 jokers, 108 cards.</li>' +
    '<li><b>Kings and Jokers are wild.</b> A wild card counts as whatever number the pile needs next.</li>' +
    '<li>Aces are low (1) and are not wild. Queen is 12.</li></ul>' +
    '<h3>Setup</h3><ul><li>Each player gets a 20-card stock pile. Only the top card is face up and playable. The computer\'s stock top and discard tops are visible to you too.</li>' +
    '<li>The rest is the shared draw pile. There are 4 shared <b>build piles</b> in the middle and each player has 4 personal <b>discard piles</b>.</li>' +
    '<li>Who goes first is decided by the deal seed.</li></ul>' +
    '<h3>Your turn</h3><ol><li>You draw until you hold 5 cards. If you play all 5 cards from your hand during a turn, you draw 5 more at once and keep going.</li>' +
    '<li>Play as many cards as you like, one at a time, onto the build piles. You can play the top card of your stock pile, a card from your hand, or the top card of any of your own discard piles.</li>' +
    '<li>A build pile starts with an Ace (or a wild), then 2, 3, 4 and so on up to Queen (12). Each card must be exactly the next number. When a pile reaches 12 it is complete and removed.</li>' +
    '<li>To end your turn, discard one hand card onto any of your 4 discard piles. Piles stack freely and only the top card can be played.</li>' +
    '<li>You cannot end a turn without discarding, unless your hand is empty because the draw pile ran out. The one exception to all of this is playing your last stock card, which wins at once.</li></ol>' +
    '<h3>Running out of cards</h3><ul><li>When the draw pile is empty, completed build piles are shuffled to make a new draw pile.</li>' +
    '<li>If no cards can be drawn and a player has no hand and no legal play, their turn is skipped.</li></ul>' +
    '<h3>Controls</h3><ul><li>Tap a card (hand, stock or the top of one of your discard piles), then tap a glowing build pile to play it. With a hand card selected, tap one of your own discard piles to discard and end your turn.</li>' +
    '<li><b>Undo play</b> takes back your plays this turn. It cannot be used after you discard. Tapping a selected card again cancels the selection.</li>' +
    '<li>Keys: 1-5 pick a hand card, 0 stock, Q W E R your discard piles, A S D F build piles, U undo.</li></ul>' +
    '<h3>House rules and simplifications</h3><ul>' +
    '<li>A wild card placed in a pile is labelled with the number it stands for. Wilds are never moved once placed.</li>' +
    '<li>A game that somehow stalls (600 total turns, or repeated skipped turns) is decided by the smaller stock pile. Equal stock piles is a draw.</li>' +
    '<li>Your game is saved in this browser automatically, along with your win/loss record. Add ?seed=N to the address to replay a deal.</li></ul>' +
    '<div class="row2"><button class="btn primary" data-m="close" type="button">Got it</button></div>';

  $('btnHelp').addEventListener('click', function () { openModal(HELP); });
  $('btnNew').addEventListener('click', function () {
    if (s && s.winner === null) openModal('<h2>New game?</h2><p>Your game in progress will be abandoned. It will not count in your record.</p><div class="row2"><button class="btn primary" data-m="new" type="button">New game</button><button class="btn" data-m="close" type="button">Keep playing</button></div>');
    else startNew();
  });

  function resume() {
    const o = loadGame();
    if (!o) { startNew(); return; }
    s = o.s; log = o.log || []; msg = o.msg || ''; sel = null; undo = []; hl = {}; busy = false;
    addLog('Game resumed', 'me');
    render();
    if (s.turn === 1) startAI();
  }

  // ---- boot ----
  loadTally();
  const qs = new URLSearchParams(location.search);
  const seedParam = qs.get('seed');
  const saved = loadGame();
  if (seedParam !== null && seedParam !== '' && !isNaN(parseInt(seedParam, 10))) startNew(parseInt(seedParam, 10));
  else if (saved) {
    openModal('<h2>Welcome back</h2><p>You have a game in progress against the computer.</p><div class="row2"><button class="btn primary" data-m="resume" type="button">Resume</button><button class="btn" data-m="new" type="button">New game</button></div>');
  } else startNew();
})();
