/* Guts UI. Rules and AI live in logic.js. Play-money chips only. */
(function () {
  'use strict';
  const L = window.GutsLogic;
  const $ = (id) => document.getElementById(id);
  const SAVE = 'guts.save.v1', PREFS = 'guts.prefs.v1', TALLY = 'guts.tally.v1';
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const params = new URLSearchParams(location.search);

  function sget(k) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function sset(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function sdel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  let G = null;
  let V = null; // view state for the paced reveal
  let token = 0; // bumps on new game so stale timers do nothing
  let modalOpen = false;
  let timers = [];

  function later(fn, ms) {
    const t = token;
    if (reduced || ms <= 0) { fn(); return; }
    timers.push(setTimeout(() => { if (t === token) fn(); }, ms));
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; token++; }

  // ---- svg pieces
  const SUIT_SVG = {
    S: '<path d="M12 2C9 7 4 9.5 4 14a4 4 0 0 0 7 2.5C10.8 19 10 20.5 8.5 22h7c-1.5-1.5-2.3-3-2.5-5.5A4 4 0 0 0 20 14c0-4.5-5-7-8-12z"/>',
    H: '<path d="M12 21C5 15.5 3 12 3 8.5A4.5 4.5 0 0 1 12 6.5 4.5 4.5 0 0 1 21 8.5C21 12 19 15.5 12 21z"/>',
    D: '<path d="M12 2l7 10-7 10-7-10z"/>',
    C: '<circle cx="12" cy="7" r="4.6"/><circle cx="6.6" cy="14" r="4.6"/><circle cx="17.4" cy="14" r="4.6"/><path d="M12 12l-2.4 10h4.8z"/>',
  };
  const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  const suitSvg = (s) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + SUIT_SVG[s] + '</svg>';
  function rk(r) { return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r); }

  function cardHtml(c, extra) {
    extra = extra || '';
    if (!c) return '<div class="card down ' + extra + '" aria-label="face down card"></div>';
    const red = c.s === 'H' || c.s === 'D';
    return '<div class="card ' + (red ? 'red ' : '') + extra + '" role="img" aria-label="' + L.rankName(c.r) + ' of ' + SUIT_NAME[c.s] + '">' +
      '<span class="cr' + (c.r === 10 ? ' ten' : '') + '">' + rk(c.r) + '</span><span class="cs">' + suitSvg(c.s) + '</span><span class="cb">' + suitSvg(c.s) + '</span></div>';
  }

  // chip stacks: 100 ink, 25 forest, 5 clay, 1 gold
  const DENOMS = [[100, '#2B2622', '#F3EDE3'], [25, '#2F4B35', '#F5F0E6'], [5, '#D9663A', '#FBF8F2'], [1, '#C99A2E', '#FBF8F2']];
  function chipSvg(amount) {
    if (amount <= 0) return '<svg viewBox="0 0 40 72" aria-hidden="true"><ellipse cx="20" cy="66" rx="16" ry="5" fill="none" stroke="#C9BDAA" stroke-dasharray="3 3"/></svg>';
    let left = amount;
    const stacks = [];
    for (const [d, fill, edge] of DENOMS) {
      let n = Math.floor(left / d);
      left -= n * d;
      if (d === 100 && n > 16) { left += (n - 16) * d; n = 16; }
      while (n > 0 && stacks.length < 5) { const k = Math.min(n, 9); stacks.push({ fill, edge, k }); n -= k; }
    }
    const w = stacks.length * 38 + 4;
    let out = '<svg viewBox="0 0 ' + w + ' 72" aria-hidden="true">';
    stacks.forEach((st, si) => {
      const x = 22 + si * 38;
      for (let j = 0; j < st.k; j++) {
        const y = 64 - j * 6;
        out += '<ellipse cx="' + x + '" cy="' + (y + 3) + '" rx="16" ry="6" fill="' + st.fill + '" stroke="' + st.edge + '" stroke-width="1.2"/>';
        out += '<rect x="' + (x - 16) + '" y="' + y + '" width="32" height="3" fill="' + st.fill + '"/>';
        out += '<ellipse cx="' + x + '" cy="' + y + '" rx="16" ry="6" fill="' + st.fill + '" stroke="' + st.edge + '" stroke-width="1.2"/>';
        out += '<ellipse cx="' + x + '" cy="' + y + '" rx="9" ry="3" fill="none" stroke="' + st.edge + '" stroke-width="1" stroke-dasharray="3 2"/>';
      }
    });
    return out + '</svg>';
  }

  // ---- persistence
  function save() { if (G) sset(SAVE, { g: G }); }
  function prefs() { const p = sget(PREFS) || {}; return { opponents: p.opponents >= 2 && p.opponents <= 5 ? p.opponents : 3, ante: p.ante === 5 ? 5 : 1 }; }
  function tallyGet() { const t = sget(TALLY); return t && typeof t.games === 'number' ? t : { games: 0, wins: 0, net: 0 }; }
  function renderTally() {
    const t = tallyGet();
    $('tally').textContent = t.games ? 'Games ' + t.wins + '/' + t.games + ' won, net ' + (t.net >= 0 ? '+' : '') + t.net : 'No games finished yet';
  }
  function recordEnd() {
    if (!G.over || G.tallied) return;
    G.tallied = true;
    const t = tallyGet();
    t.games++;
    if (G.winner === 0) t.wins++;
    t.net += G.players[0].chips - L.START_CHIPS;
    sset(TALLY, t);
    renderTally();
  }

  // ---- view helpers
  function nameOf(i) { return G.players[i].name; }
  function who(i) { return i === 0 ? 'You' : nameOf(i); }
  function plural(i, a, b) { return i === 0 ? a : b; }

  function chipsShown(i) { return V.phase === 'done' ? G.players[i].chips : V.snap.chips[i]; }
  function bustShown(i) { return V.phase === 'done' ? G.players[i].bust : V.snap.bust[i]; }
  function potShown() { return V.phase === 'done' ? G.pot : V.snap.pot; }

  function makeView(done) {
    V = { phase: done ? 'done' : 'call', decided: 0, snap: snapshot(), chosen: null };
  }
  function snapshot() {
    return { chips: G.players.map((p) => p.chips), bust: G.players.map((p) => p.bust), pot: G.pot };
  }

  const stage = () => V.phase; // call | locked | suspense | calls | cards | done

  function render() {
    renderOpps(); renderPot(); renderMe(); renderStatus(); renderActions(); renderLog();
  }

  function renderOpps() {
    const n = G.players.length - 1;
    const el = $('opps');
    el.dataset.n = n;
    el.style.setProperty('--n', n);
    let h = '';
    const r = G.last;
    for (let i = 1; i <= n; i++) {
      const p = G.players[i];
      const gone = bustShown(i);
      const st = stage();
      const revCalls = st === 'calls' || st === 'cards' || st === 'done';
      const revCards = (st === 'cards' || st === 'done') && r && r.ins.indexOf(i) >= 0 && r.type === 'showdown';
      const win = st === 'done' && r && r.winners.indexOf(i) >= 0;
      let badge = '';
      if (gone) badge = '<span class="badge out">Out of game</span>';
      else if (revCalls && p.call) badge = '<span class="badge ' + p.call + (st === 'calls' ? ' flip' : '') + '">' + p.call.toUpperCase() + '</span>';
      else if (st === 'call') badge = '<span class="badge">Deciding</span>';
      else if (st === 'locked' && V.decided >= i) badge = '<span class="badge lock">Locked</span>';
      else if (st === 'locked') badge = '<span class="badge">Deciding</span>';
      else badge = '<span class="badge lock">Locked</span>';
      let cards = '';
      if (!gone) {
        for (let k = 0; k < 3; k++) {
          const c = p.hand[k];
          const dim = revCalls && p.call === 'out' ? 'dim' : '';
          cards += revCards ? cardHtml(c, (st === 'cards' ? 'turn ' : '') + (win ? 'gold ' : '')) : cardHtml(null, dim);
        }
      }
      let hname = '', note = '', ncls = '';
      if (revCards && r.evals[i]) hname = r.evals[i].name;
      if (st === 'done' && r) {
        const m = r.matches.find((x) => x.i === i);
        if (win) { note = r.type === 'solo' ? 'Wins ' + r.share : 'Wins ' + r.share; ncls = 'good'; }
        else if (m) { note = m.bust ? 'Matched ' + m.paid + ' (all in), out' : 'Matched ' + m.paid; ncls = 'bad'; }
        else if (p.call === 'out' && !gone) note = 'Folded';
      }
      h += '<div class="opp' + (win ? ' win' : '') + (gone ? ' gone' : '') + '" data-i="' + i + '">' +
        '<div class="nm">' + p.name + '</div>' +
        '<div class="stack"><b>' + chipsShown(i) + '</b> chips</div>' +
        '<div class="minis">' + cards + '</div>' +
        '<div class="hname">' + hname + '</div>' + badge +
        '<div class="note ' + ncls + '">' + note + '</div></div>';
    }
    el.innerHTML = h;
  }

  let lastPot = null;
  function renderPot() {
    const pot = potShown();
    $('potChips').innerHTML = chipSvg(pot);
    const num = $('potNum');
    num.textContent = pot;
    if (lastPot !== null && lastPot !== pot) { num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
    lastPot = pot;
    let sub = 'Ante ' + G.ante + ' each';
    if (stage() === 'call' || stage() === 'locked' || stage() === 'suspense') sub = 'Lose a showdown and you match ' + pot;
    else if (stage() === 'done' && pot > 0 && !G.over) sub = 'Next hand starts with this plus antes';
    $('potSub').textContent = sub;
  }

  function renderMe() {
    const p = G.players[0];
    const st = stage();
    const r = G.last;
    const win = st === 'done' && r && r.winners.indexOf(0) >= 0;
    let cards = '';
    const dim = (st === 'calls' || st === 'cards' || st === 'done') && p.call === 'out' ? 'dim' : '';
    for (const c of p.hand) cards += cardHtml(c, (win ? 'gold ' : '') + dim);
    let hname = p.hand.length === 3 ? L.evaluate(p.hand).name : '';
    let note = '', ncls = '';
    if (st === 'done' && r) {
      const m = r.matches.find((x) => x.i === 0);
      if (win) { note = 'You win ' + r.share + (r.type === 'solo' ? ' (alone in)' : ''); ncls = 'good'; }
      else if (m) { note = m.bust ? 'You matched ' + m.paid + ' (all in) and are out' : 'You matched ' + m.paid; ncls = 'bad'; }
      else if (p.call === 'out') note = 'You folded and paid nothing';
    }
    $('me').className = 'me' + (win ? ' win' : '');
    $('me').innerHTML = '<div class="meta"><span class="nm">You</span><span class="stack"><b>' + chipsShown(0) + '</b> chips</span></div>' +
      '<div class="row">' + cards + '</div><div class="hname">' + hname + '</div><div class="note ' + ncls + '">' + note + '</div>';
  }

  function resultLines(r) {
    const out = [];
    if (r.type === 'carry') { out.push('Nobody stayed in. The pot of ' + r.potBefore + ' carries over.'); return out; }
    if (r.type === 'solo') {
      const w = r.winners[0];
      out.push(who(w) + ' stayed in alone and ' + plural(w, 'win', 'wins') + ' the pot of ' + r.share + '.');
      return out;
    }
    const ws = r.winners;
    if (ws.length === 1) out.push(who(ws[0]) + ' ' + plural(ws[0], 'win', 'wins') + ' ' + r.share + ' with ' + r.evals[ws[0]].name + '.');
    else out.push(ws.map(who).join(' and ') + ' tie with ' + r.evals[ws[0]].name + ' and split the pot, ' + r.share + ' each.' + (r.odd ? ' The odd chip carries to the next pot.' : ''));
    r.matches.forEach((m) => {
      out.push(who(m.i) + ' ' + plural(m.i, 'matched', 'matched') + ' the pot with ' + m.paid + (m.bust ? ' (all in, out of the game)' : '') + '.');
    });
    return out;
  }

  function renderStatus() {
    const st = stage();
    const el = $('status');
    const r = G.last;
    if (G.over && st === 'done') {
      el.textContent = G.winner === 0 ? 'You are the last player standing.' : G.players[0].bust ? 'You are out of chips.' : 'Game over.';
    } else if (st === 'call') {
      el.textContent = G.anteBust && G.anteBust.length ? G.anteBust.join(', ') + ' could not cover the ante and ' + (G.anteBust.length > 1 ? 'are' : 'is') + ' out. Are you IN or OUT?' : 'Hand ' + G.handNo + '. Look at your cards. Are you IN or OUT?';
    } else if (st === 'locked') el.textContent = 'You called ' + G.players[0].call.toUpperCase() + '. Waiting on the table...';
    else if (st === 'suspense') el.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    else if (st === 'calls') {
      const n = r.ins.length;
      el.textContent = n === 0 ? 'Everyone is OUT.' : n === 1 ? who(r.ins[0]) + (r.ins[0] === 0 ? ' are' : ' is') + ' IN alone.' : n + ' players are IN. Cards up...';
    } else if (st === 'cards') el.textContent = 'Comparing hands...';
    else if (st === 'done') el.textContent = resultLines(r)[0];
  }

  function renderActions() {
    const st = stage();
    const a = $('actions');
    if (st === 'call' || st === 'locked' || st === 'suspense' || st === 'calls' || st === 'cards') {
      const my = G.players[0].call;
      const locked = st !== 'call';
      a.innerHTML = '<button class="btn in' + (locked ? (my === 'in' ? ' chosen' : ' unchosen') : '') + '" id="btnIn" type="button"' + (locked ? ' disabled' : '') + '>In<small>' + (locked && my === 'in' ? 'Locked' : 'Stay and risk a match') + '</small></button>' +
        '<button class="btn outb' + (locked ? (my === 'out' ? ' chosen' : ' unchosen') : '') + '" id="btnOut" type="button"' + (locked ? ' disabled' : '') + '>Out<small>' + (locked && my === 'out' ? 'Locked' : 'Fold, pay nothing') + '</small></button>';
      $('btnIn').addEventListener('click', () => onCall('in'));
      $('btnOut').addEventListener('click', () => onCall('out'));
    } else if (G.over) {
      a.innerHTML = '<button class="btn primary next" id="btnNext" type="button">Play again</button>';
      $('btnNext').addEventListener('click', () => { if (!modalOpen) openNew(); });
    } else {
      a.innerHTML = '<button class="btn primary next" id="btnNext" type="button">Next hand</button>';
      $('btnNext').addEventListener('click', onNext);
      try { $('btnNext').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function renderLog() {
    const hist = G.history || [];
    $('log').innerHTML = hist.map((t) => '<li>' + t + '</li>').join('');
  }

  // ---- actions
  function onCall(c) {
    if (!G || G.phase !== 'call' || modalOpen || V.phase !== 'call') return;
    L.setCall(G, 0, c);
    V.phase = 'locked'; V.decided = 0;
    V.snap = snapshot();
    // compute the whole hand now (AI never sees other hands), then reveal it in beats
    L.aiCalls(G);
    L.resolve(G);
    const lines = resultLines(G.last);
    G.history = (G.history || []);
    G.history.unshift('Hand ' + G.last.hand + ': ' + lines.join(' '));
    G.history = G.history.slice(0, 5);
    save();
    render();
    const n = G.players.length - 1;
    let i = 1;
    (function step() {
      if (i > n) { suspense(); return; }
      V.decided = i; i++;
      renderOpps();
      later(step, 280);
    })();
  }

  function suspense() {
    V.phase = 'suspense'; render();
    later(() => {
      V.phase = 'calls'; render();
      later(() => {
        if (G.last.type === 'showdown') {
          V.phase = 'cards'; render();
          later(finish, 900);
        } else finish();
      }, 800);
    }, 1100);
  }

  function finish() {
    V.phase = 'done'; render(); save();
  }

  function onNext() {
    if (!G || V.phase !== 'done' || G.over || modalOpen) return;
    L.nextHand(G);
    if (G.over) { makeView(true); G.last = G.last || null; recordEnd(); save(); render(); endModal(); return; }
    makeView(false);
    save(); render();
  }

  function endModal() {
    const rows = G.players.map((p, i) => ({ n: p.name, c: p.chips })).sort((a, b) => b.c - a.c);
    const won = G.winner === 0;
    const html = '<p>' + (won ? 'Everyone else is out of chips. You win the table.' : 'You could not cover the ' + (G.players[0].chips === 0 ? 'match or ante' : 'ante') + ' and are out.') + '</p>' +
      '<table class="final">' + rows.map((r) => '<tr><td>' + r.n + '</td><td>' + r.c + ' chips</td></tr>').join('') + '</table>';
    modal(won ? 'You win' : 'Game over', html, [
      { label: 'New game', cls: 'btn primary', fn: () => { closeModal(); openNew(); } },
      { label: 'Close', fn: closeModal },
    ]);
  }

  // ---- game lifecycle
  function newGame(setup, seed) {
    clearTimers();
    if (seed === undefined) seed = Date.now() | 0;
    G = L.newGame({ seed, opponents: setup.opponents, ante: setup.ante });
    G.history = [];
    lastPot = null;
    makeView(G.over);
    sset(PREFS, { opponents: setup.opponents, ante: setup.ante });
    save(); render();
  }

  function resume(saved) {
    clearTimers();
    G = saved.g;
    lastPot = null;
    if (G.phase === 'result' || G.phase === 'over') makeView(true);
    else makeView(false);
    // a save taken mid-hand (after the call was locked) always has phase result, so we only land here at call or done
    render();
    return true;
  }

  // ---- modal
  let modalDismiss = false;
  function modal(title, html, btns, opts) {
    modalOpen = true; modalDismiss = !!(opts && opts.dismiss);
    $('mTitle').textContent = title;
    $('mBody').innerHTML = html;
    const b = $('mBtns'); b.innerHTML = '';
    btns.forEach((x) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = x.cls || 'btn'; el.textContent = x.label;
      el.addEventListener('click', x.fn);
      b.appendChild(el);
    });
    $('modal').hidden = false;
    const first = b.querySelector('button'); if (first) first.focus();
  }
  function closeModal() { modalOpen = false; $('modal').hidden = true; }

  function openNew() {
    const p = prefs();
    const seg = (name, vals, cur, fmt) => '<div class="seg">' + vals.map((v) => '<label><input type="radio" name="' + name + '" value="' + v + '"' + (v === cur ? ' checked' : '') + '><span>' + fmt(v) + '</span></label>').join('') + '</div>';
    const html = '<div class="fld"><span>Opponents</span>' + seg('opp', [2, 3, 4, 5], p.opponents, (v) => v) + '</div>' +
      '<div class="fld"><span>Ante per hand (chips)</span>' + seg('ante', [1, 5], p.ante, (v) => v) + '</div>' +
      '<p>Everyone starts with ' + L.START_CHIPS + ' play-money chips. No real money.</p>';
    modal('New game', html, [
      { label: 'Deal', cls: 'btn primary', fn: () => {
        const o = parseInt(document.querySelector('input[name=opp]:checked').value, 10);
        const a = parseInt(document.querySelector('input[name=ante]:checked').value, 10);
        closeModal(); newGame({ opponents: o, ante: a });
      } },
      { label: 'Cancel', fn: closeModal },
    ], { dismiss: true });
  }

  function openRules() {
    const html =
      '<h3>Goal</h3><p>Win chips by staying IN with the best three-card hand. Play-money chips only. Everyone starts with ' + L.START_CHIPS + '.</p>' +
      '<h3>Each hand</h3><ol>' +
      '<li>Everyone antes ' + (G ? G.ante : '1') + ' chip' + (G && G.ante > 1 ? 's' : '') + ' into the pot and gets 3 cards from a 52-card deck. No draws.</li>' +
      '<li>Everyone decides secretly and at the same time: <b>IN</b> or <b>OUT</b>. You choose first and your choice locks. Then all calls are shown together.</li>' +
      '<li><b>Nobody IN:</b> the pot carries to the next hand, where new antes are added.</li>' +
      '<li><b>Exactly one IN:</b> that player wins the pot.</li>' +
      '<li><b>Two or more IN:</b> the hands are compared and the best hand takes the pot. Every other player who stayed IN must <b>match the pot</b> (an amount equal to the pot as it stood after the antes). All matched chips form the next hand\'s pot. Players who went OUT pay nothing.</li></ol>' +
      '<h3>Hand ranking, best to worst</h3><ol><li>Straight flush</li><li>Three of a kind</li><li>Straight</li><li>Flush</li><li>Pair</li><li>High card</li></ol>' +
      '<p>Ace counts high or low in a straight (A-K-Q is the highest, A-2-3 the lowest). There is no wraparound, so Q-K-A-2 is not a straight. Ties are broken by rank (pair, then kicker; then highest card down). Suits never break ties.</p>' +
      '<h3>Ties and odd chips</h3><p>If the best hands tie exactly, those players split the pot and nobody matches. If the pot does not divide evenly, the odd chip stays in the next pot.</p>' +
      '<h3>Going bust</h3><ul><li>If you lose a showdown and cannot afford the full match, you pay all you have into the next pot (you are "all in") and go bust.</li>' +
      '<li>If you cannot cover the ante, you pay what you have into the pot and go bust. Busted players sit out.</li>' +
      '<li>The game ends when you bust or you are the last player standing, who also takes the final pot.</li></ul>' +
      '<h3>Computer players</h3><p>They only look at their own cards, the pot, their stack and how many players are left. They always stay in with a straight or better, usually with a pair, rarely with a lone high card, and get more careful when the pot is big next to their stack. If you fold a lot they bluff a little more.</p>' +
      '<h3>Keys</h3><p>I stay in, O fold, Enter or N for the next hand.</p>' +
      (G ? '<p>Deal seed: <b>' + G.seed + '</b>. Add <b>?seed=' + G.seed + '</b> to the address to replay it.</p>' : '');
    modal('How to play', html, [{ label: 'Close', cls: 'btn primary', fn: closeModal }], { dismiss: true });
    $('mBody').scrollTop = 0;
  }

  // ---- wiring
  $('btnRules').addEventListener('click', () => { if (!modalOpen) openRules(); });
  $('btnNew').addEventListener('click', () => { if (!modalOpen) openNew(); });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && modalDismiss) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (modalOpen) { if (k === 'escape' && modalDismiss) closeModal(); return; }
    if (!G) return;
    if (k === 'i') onCall('in');
    else if (k === 'o') onCall('out');
    else if (k === 'n') onNext();
  });

  // ---- boot
  renderTally();
  const sp = parseInt(params.get('seed'), 10);
  const pf = prefs();
  const np = parseInt(params.get('opponents'), 10);
  const an = parseInt(params.get('ante'), 10);
  if (!isNaN(sp)) {
    newGame({ opponents: np >= 2 && np <= 5 ? np : pf.opponents, ante: an === 5 ? 5 : an === 1 ? 1 : pf.ante }, sp);
  } else {
    const saved = sget(SAVE);
    if (saved && saved.g && saved.g.v === 1 && Array.isArray(saved.g.players) && !saved.g.over) {
      modal('Welcome back', '<p>You have a game in progress (hand ' + saved.g.handNo + ', you hold ' + saved.g.players[0].chips + ' chips).</p>', [
        { label: 'Resume', cls: 'btn primary', fn: () => { closeModal(); resume(saved); } },
        { label: 'New game', fn: () => { sdel(SAVE); closeModal(); openNew(); } },
      ]);
      // show something behind the sheet
      G = saved.g; makeView(saved.g.phase !== 'call'); render();
    } else {
      newGame(pf);
    }
  }
  window.__guts = { get G() { return G; }, L, render };
})();
