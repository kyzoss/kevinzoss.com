// The screen-light games. Each one is built so the phone can sit face-down:
// the narrator reads everything aloud, and the play happens out loud, on
// paper, or out the window. Shares players, voice and sound with Pictionary
// through window.App.
(function () {
  const A = window.App, X = window.Extras;
  const { $, esc, pick, store, show, speak, Sound, toast, confetti, avatarHTML, actions } = A;
  const players = () => A.settings().players.map((p, i) => ({ name: A.playerName(p, i), av: p.av, level: Math.min(3, p.age) }));
  const LEVEL_NAME = { 1: 'ages 4-5', 2: 'ages 6-7', 3: 'ages 8-10' };

  // ================= QUIZ QUEST =================
  const Q = { ps: [], scores: [], turn: 0, used: new Set(), cur: null, mode: 'turns' };
  function quizStart() {
    Q.ps = players();
    Q.scores = Q.ps.map(() => 0);
    Q.turn = 0;
    Q.mode = store.get('pict.quizMode', 'turns');
    show('quiz');
    A.keepAwake(true);
    quizNext();
  }
  function quizNext() {
    const p = Q.ps[Q.turn % Q.ps.length];
    Q.cur = X.quizQuestion(p.level, Q.used);
    Q.used.add(Q.cur.q);
    const cat = X.QUIZ_CATS[Q.cur.c] || ['❓', 'Quiz'];
    $('quizWho').innerHTML = Q.mode === 'turns'
      ? avatarHTML(p.av, 'sm') + '<span><b>' + esc(p.name) + '’s question</b><small>' + LEVEL_NAME[p.level] + '</small></span>'
      : '<span class="avatar sm" style="--av:#E3D9C6">🙋</span><span><b>Everyone answer!</b><small>First to shout it</small></span>';
    $('quizCat').textContent = cat[0] + '  ' + cat[1];
    $('quizQ').textContent = Q.cur.q;
    $('quizA').hidden = true;
    $('quizA').textContent = Q.cur.a;
    $('quizShow').hidden = false;
    $('quizJudge').hidden = true;
    $('quizJudge').innerHTML = '';
    quizScores();
    document.querySelectorAll('#quizModes button').forEach((b) => b.classList.toggle('on', b.dataset.q === Q.mode));
    const lead = Q.mode === 'turns' ? p.name + ', here’s your question. ' : '';
    setTimeout(() => speak(lead + Q.cur.q), 250);
  }
  function quizScores() {
    $('quizScores').innerHTML = Q.ps.map((p, i) => '<div class="mini-score">' + avatarHTML(p.av, 'sm') + '<b>★</b> ' + Q.scores[i] + '</div>').join('');
  }
  function quizShowAnswer() {
    $('quizA').hidden = false;
    $('quizShow').hidden = true;
    const judge = $('quizJudge');
    judge.hidden = false;
    if (Q.mode === 'turns') {
      judge.innerHTML = '<button class="btn soft missed" data-act="quizNo">Not this time</button><button class="btn primary gotit" data-act="quizYes">Got it!</button>';
    } else {
      judge.innerHTML = '<p class="quiz-ask">Who got it?</p><div class="quiz-who-grid">' + Q.ps.map((p, i) =>
        '<button class="who-btn sm" data-act="quizYes" data-i="' + i + '">' + avatarHTML(p.av, 'sm') + esc(p.name) + '</button>').join('') +
        '</div><button class="btn soft missed" data-act="quizNo">Nobody</button>';
    }
    Sound.sparkle();
    speak('The answer is: ' + Q.cur.a.replace(/\(|\)/g, ''));
  }
  Object.assign(actions, {
    quiz() { quizStart(); },
    quizSay() { speak(Q.cur.q); },
    quizShow() { quizShowAnswer(); },
    quizYes(el) {
      const i = Q.mode === 'turns' ? Q.turn % Q.ps.length : Number(el.dataset.i);
      Q.scores[i]++;
      Sound.ding(); confetti(50, ['⭐']);
      toast(Q.ps[i].name + ' +1 ★');
      Q.turn++; quizNext();
    },
    quizNo() { Sound.boing(); Q.turn++; quizNext(); },
    quizSkip() { Q.turn++; quizNext(); },
    quizMode(el) { Q.mode = el.dataset.q; store.set('pict.quizMode', Q.mode); quizNext(); },
    quizDone() {
      const best = Math.max(...Q.scores);
      const winners = Q.ps.filter((_, i) => Q.scores[i] === best && best > 0).map((p) => p.name);
      A.ask(winners.length ? (winners.join(' and ') + (winners.length > 1 ? ' tie' : ' wins') + ' with ' + best + ' ★') : 'Great thinking, everyone!',
        [{ label: 'Play again', cls: 'primary', val: 'again' }, { label: 'Home', val: 'home' }]).then((v) => {
        if (v === 'again') quizStart(); else actions.home();
      });
      Sound.fanfare(); confetti(160, ['🧠', '⭐']);
    },
  });

  // ================= STORY SPINNER =================
  const St = { hero: null, place: null, problem: null, teller: 0, ps: [] };
  function heroPick() {
    const chars = window.Characters ? Characters.all() : [];
    if (chars.length && Math.random() < 0.35) {
      const c = pick(chars);
      return { img: Characters.toDataURL(c), e: '', text: c.name, say: c.name };
    }
    const [e, noun] = pick(X.HEROES);
    const adj = pick(X.ADJ);
    const art = /^[aeiou]/.test(adj) ? 'an' : 'a';
    return { e, text: adj + ' ' + noun, say: art + ' ' + adj + ' ' + noun };
  }
  const placePick = () => { const [e, t] = pick(X.PLACES); return { e, text: t }; };
  const problemPick = () => { const [e, t] = pick(X.PROBLEMS); return { e, text: t }; };
  function renderReel(k, v) {
    const el = $('reel-' + k);
    el.querySelector('.reel-e').innerHTML = v.img ? '<img alt="" src="' + v.img + '">' : v.e;
    el.querySelector('.reel-t').textContent = k === 'problem' ? v.text.replace(/\.$/, '') : v.text;
  }
  function storySentence() {
    return 'Once upon a time, ' + St.hero.say + ' lived ' + St.place.text + '. One day, ' + St.problem.text;
  }
  async function spin(keys) {
    const pools = { hero: X.HEROES.map((h) => h[0]), place: X.PLACES.map((p) => p[0]), problem: X.PROBLEMS.map((p) => p[0]) };
    keys.forEach((k) => $('reel-' + k).classList.add('spinning'));
    Sound.tock();
    for (let f = 0; f < 10; f++) {
      keys.forEach((k) => { $('reel-' + k).querySelector('.reel-e').textContent = pick(pools[k]); });
      await A.wait(70);
    }
    keys.forEach((k, i) => {
      if (k === 'hero') St.hero = heroPick();
      if (k === 'place') St.place = placePick();
      if (k === 'problem') St.problem = problemPick();
      setTimeout(() => { $('reel-' + k).classList.remove('spinning'); renderReel(k, St[k]); Sound.pop(); }, i * 160);
    });
    await A.wait(keys.length * 160 + 60);
    $('storyText').textContent = storySentence();
    $('storyTwist').hidden = true;
    renderTeller();
    speak(storySentence() + ' ' + St.ps[St.teller % St.ps.length].name + ', what happens next?');
  }
  function renderTeller() {
    const p = St.ps[St.teller % St.ps.length];
    $('storyTeller').innerHTML = avatarHTML(p.av, 'sm') + '<span><b>' + esc(p.name) + '</b> tells what happens next</span>';
  }
  Object.assign(actions, {
    story() {
      St.ps = players(); St.teller = 0;
      show('story'); A.keepAwake(true);
      spin(['hero', 'place', 'problem']);
    },
    storySpin() { St.teller = 0; spin(['hero', 'place', 'problem']); },
    storyReel(el) { spin([el.dataset.r]); },
    storyNext() {
      St.teller++;
      renderTeller();
      Sound.pop();
      speak(St.ps[St.teller % St.ps.length].name + ', your turn. What happens next?');
    },
    storyTwist() {
      const t = pick(X.TWISTS);
      $('storyTwist').textContent = '✨ ' + t;
      $('storyTwist').hidden = false;
      Sound.sparkle();
      speak('Plot twist! ' + t);
    },
    storySay() { speak(storySentence()); },
  });

  // ================= I SPY BINGO =================
  const LINES = (n) => {
    const L = [];
    for (let r = 0; r < n; r++) L.push([...Array(n)].map((_, c) => r * n + c));
    for (let c = 0; c < n; c++) L.push([...Array(n)].map((_, r) => r * n + c));
    L.push([...Array(n)].map((_, i) => i * n + i));
    L.push([...Array(n)].map((_, i) => i * n + (n - 1 - i)));
    return L;
  };
  let B = store.get('pict.spy', null);
  function spyNew(place, size) {
    const items = X.SPY[place].items.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, size * size);
    B = { place, size, items, found: items.map(() => false), bingos: 0 };
    store.set('pict.spy', B);
  }
  function spyRender() {
    const P = X.SPY[B.place];
    $('spyPlaces').innerHTML = Object.entries(X.SPY).map(([k, v]) =>
      '<button class="' + (k === B.place ? 'on' : '') + '" data-act="spyPlace" data-p="' + k + '"><b>' + v.emoji + '</b><small>' + v.name + '</small></button>').join('');
    const grid = $('bingo');
    grid.style.setProperty('--n', B.size);
    grid.innerHTML = B.items.map((it, i) => {
      const x = P.items[it];
      return '<button class="cell' + (B.found[i] ? ' found' : '') + '" data-act="spyTap" data-i="' + i + '"><span class="ce">' + x.e + '</span><span class="ct">' + esc(x.t) + '</span></button>';
    }).join('');
    $('spySize').textContent = B.size === 3 ? 'Bigger card (4×4)' : 'Smaller card (3×3)';
    const lines = LINES(B.size).filter((l) => l.every((i) => B.found[i]));
    lines.forEach((l) => l.forEach((i) => grid.children[i].classList.add('line')));
    return lines.length;
  }
  Object.assign(actions, {
    spy() {
      if (!B || !X.SPY[B.place]) spyNew('car', 4);
      show('spy');
      spyRender();
      speak('I spy bingo! Look around and tap things when you spot them. No peeking at the phone in between!');
    },
    spyPlace(el) { spyNew(el.dataset.p, B.size); spyRender(); Sound.pop(); speak(X.SPY[B.place].name + ' bingo. Start looking!'); },
    spySize() { spyNew(B.place, B.size === 3 ? 4 : 3); spyRender(); },
    spyNewCard() { spyNew(B.place, B.size); spyRender(); Sound.sparkle(); },
    spyTap(el) {
      const i = Number(el.dataset.i);
      B.found[i] = !B.found[i];
      store.set('pict.spy', B);
      const before = B.bingos || 0;
      const now = spyRender();
      if (B.found[i]) { Sound.pop(); A.buzz(20); speak(X.SPY[B.place].items[B.items[i]].t + '!'); }
      if (now > before) {
        Sound.fanfare(); confetti(180, ['🎉', '⭐', '👀']);
        toast(now === 1 ? 'BINGO!' : 'Another BINGO!');
        setTimeout(() => speak('Bingo!'), 300);
      }
      B.bingos = now;
      store.set('pict.spy', B);
      if (B.found.every(Boolean)) { setTimeout(() => { toast('You found everything!'); speak('Wow! You found everything on the card!'); confetti(220); }, 900); }
    },
  });
})();
