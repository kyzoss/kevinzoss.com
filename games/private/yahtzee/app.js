(function () {
  "use strict";
  var L = window.YahtzeeLogic;
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SAVE_KEY = "yahtzee.save.v1", STATS_KEY = "yahtzee.stats.v1";
  var params = new URLSearchParams(location.search);
  var URL_SEED = params.has("seed") ? (parseInt(params.get("seed"), 10) | 0) : null;
  var firstSeed = Date.now() >>> 0; // clock is read here only, never in the logic

  var $ = function (id) { return document.getElementById(id); };
  var state = { g: null, mode: null, ready: true, busy: false, token: 0, log: [], planner: null, best: false };
  var menuSel = { bots: 1, humans: 2 };

  // ------------------------------------------------------------ storage
  function store(op, key, val) {
    try {
      if (op === "get") return window.localStorage.getItem(key);
      if (op === "set") window.localStorage.setItem(key, val);
      if (op === "del") window.localStorage.removeItem(key);
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  function loadStats() {
    try { var s = JSON.parse(store("get", STATS_KEY)); if (s && typeof s.played === "number") return s; } catch (e) {}
    return { played: 0, best: 0 };
  }
  function saveStats(s) { store("set", STATS_KEY, JSON.stringify(s)); }
  function saveGame() {
    if (!state.g || state.g.over) { store("del", SAVE_KEY); return; }
    store("set", SAVE_KEY, JSON.stringify({ g: state.g, mode: state.mode, log: state.log.slice(0, 4) }));
  }
  function loadSaved() {
    try {
      var d = JSON.parse(store("get", SAVE_KEY));
      if (d && L.validGame(d.g) && !d.g.over && d.mode) return d;
    } catch (e) {}
    return null;
  }

  // ------------------------------------------------------------ menu
  function modeLabel(m) {
    if (m.kind === "solo") return "Solo";
    if (m.kind === "bots") return "vs " + m.n + " computer" + (m.n > 1 ? "s" : "");
    return m.n + " player hot-seat";
  }
  function renderMenu() {
    $("menu").hidden = false; $("game").hidden = true;
    var st = loadStats();
    $("stats").textContent = "Best " + st.best + " | Games " + st.played;
    var sv = loadSaved(), rb = $("resume");
    if (sv) {
      rb.hidden = false;
      rb.textContent = "Resume game (" + modeLabel(sv.mode) + ", round " + sv.g.round + " of 13)";
    } else rb.hidden = true;
  }
  function segInit(id, key) {
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      menuSel[key] = +b.dataset.n;
      Array.prototype.forEach.call($(id).children, function (c) { c.classList.toggle("on", c === b); });
    });
  }
  segInit("botCount", "bots"); segInit("humanCount", "humans");
  document.querySelectorAll("[data-start]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.start;
      startGame(k === "solo" ? { kind: "solo", n: 1 } : k === "bots" ? { kind: "bots", n: menuSel.bots } : { kind: "hotseat", n: menuSel.humans });
    });
  });
  $("resume").addEventListener("click", function () {
    var sv = loadSaved(); if (!sv) return;
    state.token++; state.g = sv.g; state.mode = sv.mode; state.log = sv.log || [];
    state.busy = false; state.planner = null; state.best = false;
    state.ready = !(state.mode.kind === "hotseat");
    showGame();
  });

  // ------------------------------------------------------------ game start
  function playersFor(m) {
    var ps = [], i;
    if (m.kind === "solo") ps.push({ name: "You", type: "human" });
    else if (m.kind === "bots") {
      ps.push({ name: "You", type: "human" });
      for (i = 1; i <= m.n; i++) ps.push({ name: "Bot " + i, type: "bot" });
    } else for (i = 1; i <= m.n; i++) ps.push({ name: "Player " + i, type: "human" });
    return ps;
  }
  var gamesStarted = 0;
  function startGame(m) {
    state.token++;
    var seed = URL_SEED !== null ? URL_SEED : (gamesStarted === 0 ? firstSeed : Date.now() >>> 0);
    gamesStarted++;
    state.mode = m; state.g = L.newGame(seed, playersFor(m));
    state.log = []; state.busy = false; state.ready = !(m.kind === "hotseat"); state.planner = null; state.best = false;
    saveGame();
    showGame();
  }
  function showGame() {
    closeOverlay();
    $("menu").hidden = true; $("game").hidden = false;
    window.scrollTo(0, 0);
    render();
    turnStart();
  }

  // ------------------------------------------------------------ rendering
  var PIPS = { 0: [], 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function dieHTML(v) {
    var s = "", on = PIPS[v] || [];
    for (var i = 1; i <= 9; i++) s += '<span class="pip' + (on.indexOf(i) >= 0 ? " on" : "") + '"></span>';
    return s;
  }
  var diceEls = [];
  function buildDice() {
    var box = $("dice"); box.innerHTML = ""; diceEls = [];
    for (var i = 0; i < 5; i++) {
      (function (i) {
        var d = document.createElement("button");
        d.type = "button"; d.className = "die empty";
        d.addEventListener("click", function () { toggle(i); });
        box.appendChild(d); diceEls.push(d);
      })(i);
    }
  }
  function curPlayer() { return state.g.players[state.g.current]; }
  function isHumanTurn() { return !state.g.over && curPlayer().type === "human"; }
  function paintDice(shown) {
    var g = state.g, can = isHumanTurn() && L.canHold(g) && !state.busy && state.ready;
    for (var i = 0; i < 5; i++) {
      var v = shown ? shown[i] : g.dice[i], el = diceEls[i];
      el.innerHTML = dieHTML(v);
      el.className = "die" + (v ? "" : " empty") + (g.held[i] && v ? " held" : "") + (can ? "" : " ro");
      el.setAttribute("aria-label", v ? "Die " + (i + 1) + ": " + v + (g.held[i] ? ", held" : "") : "Die " + (i + 1) + ": not rolled");
      el.setAttribute("aria-pressed", g.held[i] ? "true" : "false");
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderStatus() {
    var g = state.g, p = curPlayer(), el = $("status"), rb = $("rollBtn");
    $("roundLabel").textContent = g.over ? "Game over" : "Round " + g.round + " of 13";
    if (g.over) { el.textContent = "Game over"; rb.disabled = true; rb.textContent = "Game over"; return; }
    var multi = g.players.length > 1;
    if (p.type === "bot") {
      el.innerHTML = "<b>" + esc(p.name) + "</b> is playing";
      rb.disabled = true; rb.textContent = "Computer turn";
    } else {
      var who = multi ? "<b>" + esc(p.name) + "</b>: " : "";
      if (g.rollsLeft === 3) el.innerHTML = who + "roll the dice";
      else if (g.rollsLeft > 0) el.innerHTML = who + "tap dice to hold, then roll or score";
      else el.innerHTML = who + "choose a category to score";
      rb.disabled = g.rollsLeft === 0 || state.busy || !state.ready;
      rb.textContent = g.rollsLeft === 0 ? "Pick a category" : g.rollsLeft === 3 ? "Roll (3 left)" : "Roll again (" + g.rollsLeft + " left)";
    }
  }
  function renderLog() {
    $("log").innerHTML = state.log.slice(0, 3).map(function (t) { return "<div>" + esc(t) + "</div>"; }).join("");
  }
  function renderCard() {
    var g = state.g, cur = g.over ? -1 : g.current, pot = (isHumanTurn() && state.ready && !state.busy) ? L.potentials(g) : null;
    var tots = g.players.map(L.totals), h = "<thead><tr><th></th>";
    g.players.forEach(function (p, i) { h += '<th class="' + (i === cur ? "cur" : "") + '" title="' + esc(p.name) + '">' + esc(p.name) + "</th>"; });
    h += "</tr></thead><tbody>";
    var bestPot = -1;
    if (pot) pot.forEach(function (v, i) { if (v !== null && (bestPot < 0 || v > pot[bestPot])) bestPot = i; });
    var forced = pot && L.jokerApplies(curPlayer(), g.dice);
    function cell(p, pi, ci) {
      var s = p.scores[ci], cls = "val" + (pi === cur ? " cur" : "");
      if (s !== null) return '<td class="' + cls + '">' + s + "</td>";
      if (pi === cur && pot && pot[ci] !== null) {
        return '<td class="' + cls + '"><button class="pot' + (pot[ci] === 0 ? " zero" : "") + (forced ? " forced" : "") +
          '" data-cat="' + ci + '" aria-label="Score ' + pot[ci] + " in " + L.CATS[ci].name + '">' + pot[ci] + "</button></td>";
      }
      return '<td class="' + cls + ' open"></td>';
    }
    function row(ci) {
      var r = "<tr><td>" + L.CATS[ci].short + "</td>";
      g.players.forEach(function (p, pi) { r += cell(p, pi, ci); });
      return r + "</tr>";
    }
    var i;
    for (i = 0; i < 6; i++) h += row(i);
    h += '<tr class="sub"><td>Bonus (63+)</td>';
    g.players.forEach(function (p, pi) {
      var t = tots[pi];
      h += '<td class="' + (pi === cur ? "cur" : "") + '">' + (t.upperBonus ? "+35" : t.upper + "/63") + "</td>";
    });
    h += "</tr>";
    for (i = 6; i < 13; i++) h += row(i);
    h += '<tr class="sub"><td>Yahtzee bonus</td>';
    g.players.forEach(function (p, pi) { h += '<td class="' + (pi === cur ? "cur" : "") + '">' + (tots[pi].yahtzeeBonus || "") + "</td>"; });
    h += '</tr><tr class="total"><td>Total</td>';
    g.players.forEach(function (p, pi) { h += '<td class="' + (pi === cur ? "cur" : "") + '">' + tots[pi].total + "</td>"; });
    h += "</tr></tbody>";
    $("card").innerHTML = h;
    $("seedNote").textContent = "Seed " + g.seed + " (add ?seed=" + g.seed + " to replay these dice)";
  }
  function render(shown) {
    paintDice(shown); renderStatus(); renderLog(); renderCard();
  }
  $("card").addEventListener("click", function (e) {
    var b = e.target.closest(".pot"); if (!b) return;
    humanScore(+b.dataset.cat);
  });

  // ------------------------------------------------------------ actions
  function delay(ms) { return REDUCED ? Math.min(ms, 250) : ms; }
  function tumble(done) {
    var g = state.g, myToken = state.token;
    state.busy = true;
    var rolling = [];
    for (var i = 0; i < 5; i++) if (!g.held[i] || g.rollsLeft === 3) rolling.push(i);
    L.roll(g); saveGame();
    if (REDUCED) { state.busy = false; render(); done && done(); return; }
    rolling.forEach(function (i) { diceEls[i].classList.add("tumble"); });
    var n = 0, shown = g.dice.slice();
    var iv = setInterval(function () {
      if (myToken !== state.token) { clearInterval(iv); return; }
      n++;
      if (n >= 7) {
        clearInterval(iv); state.busy = false; render(); done && done(); return;
      }
      rolling.forEach(function (i) { shown[i] = 1 + Math.floor(Math.random() * 6); });
      paintDice(shown);
      rolling.forEach(function (i) { diceEls[i].classList.add("tumble"); });
    }, 70);
    render(shown); // initial frame of faces; tumble class re-added below
    rolling.forEach(function (i) { diceEls[i].classList.add("tumble"); });
  }
  function toggle(i) {
    if (!isHumanTurn() || state.busy || !state.ready) return;
    if (L.toggleHold(state.g, i)) { saveGame(); render(); }
  }
  function humanRoll() {
    var g = state.g;
    if (!isHumanTurn() || state.busy || !state.ready || g.rollsLeft <= 0) return;
    tumble();
  }
  function describeScore(ev) {
    var p = state.g.players[ev.player], c = L.CATS[ev.cat].name;
    return p.name + " scored " + ev.points + " in " + c + (ev.joker ? " (Joker)" : "") + (ev.yahtzeeBonus ? " +100 Yahtzee bonus" : "");
  }
  function humanScore(cat) {
    if (!isHumanTurn() || state.busy || !state.ready) return;
    var g = state.g, ev;
    try { ev = L.score(g, cat); } catch (e) { return; }
    state.log.unshift(describeScore(ev));
    afterScore();
  }
  function afterScore() {
    state.planner = null;
    var g = state.g;
    if (g.over) { finishGame(); return; }
    state.ready = !(state.mode.kind === "hotseat");
    saveGame(); render(); turnStart();
  }

  // ------------------------------------------------------------ turns
  function turnStart() {
    var g = state.g;
    if (g.over) return;
    var p = curPlayer();
    if (p.type === "bot") { setTimeout(botStep, delay(700), state.token); return; }
    if (state.mode.kind === "hotseat" && !state.ready && g.rollsLeft === 3) showPass(p.name);
    else if (state.mode.kind === "hotseat" && !state.ready) showPass(p.name); // resumed mid-turn
  }
  function showPass(name) {
    var o = $("overlay");
    o.hidden = false;
    o.innerHTML = '<div class="sheet pass" role="dialog" aria-modal="true"><h2>Pass the phone</h2><p>Hand it to <b>' + esc(name) +
      '</b>.</p><button class="btn primary" id="readyBtn">I am ready</button></div>';
    var b = $("readyBtn"); b.focus();
    b.addEventListener("click", function () { state.ready = true; closeOverlay(); render(); });
  }
  function botStep(token) {
    if (token !== state.token) return;
    var g = state.g;
    if (g.over || curPlayer().type !== "bot") return;
    if (!state.planner) state.planner = L.makePlanner(curPlayer());
    var a = L.botAction(g, state.planner), p = curPlayer();
    if (a.action === "roll") {
      if (a.mask) {
        L.setHolds(g, a.mask);
        var hv = L.heldValues(g);
        state.log.unshift(p.name + " holds " + (hv.length ? hv.join(" ") : "nothing") + " and rerolls");
        render();
        setTimeout(function () {
          if (token !== state.token) return;
          tumble(function () { setTimeout(botStep, delay(550), token); });
        }, delay(650));
      } else {
        tumble(function () { setTimeout(botStep, delay(550), token); });
      }
    } else {
      var diceStr = g.dice.join(" ");
      var ev = L.score(g, a.cat);
      state.log.unshift(describeScore(ev) + " (dice " + diceStr + ")");
      state.log = state.log.slice(0, 6);
      setTimeout(function () { if (token === state.token) afterScore(); }, 0);
      saveGame(); render();
    }
  }

  // ------------------------------------------------------------ end of game
  function finishGame() {
    var g = state.g, st = loadStats(), tots = g.players.map(function (p) { return L.totals(p).total; });
    st.played++;
    var hbest = 0;
    g.players.forEach(function (p, i) { if (p.type === "human" && tots[i] > hbest) hbest = tots[i]; });
    state.best = hbest > st.best;
    if (state.best) st.best = hbest;
    saveStats(st); saveGame();
    render();
    var s = L.standings(g), multi = g.players.length > 1, w = L.winners(g);
    var title = !multi ? "Final score" : w.length > 1 ? "It is a tie" : g.players[w[0]].name + " wins";
    var o = $("overlay"); o.hidden = false;
    var list = s.map(function (x) { return "<li><span>" + esc(x.name) + "</span><span>" + x.total + "</span></li>"; }).join("");
    o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><h2>' + esc(title) + "</h2><ul class=\"standings\">" + list + "</ul>" +
      (state.best ? "<p><b>New personal best: " + st.best + "</b></p>" : "<p>Personal best: " + st.best + " | Games played: " + st.played + "</p>") +
      '<button class="btn primary" id="againBtn">Play again</button><button class="btn" id="viewBtn">View scorecard</button><button class="btn" id="menuBtn">Menu</button></div>';
    $("againBtn").addEventListener("click", function () { startGame(state.mode); });
    $("viewBtn").addEventListener("click", closeOverlay);
    $("menuBtn").addEventListener("click", toMenu);
    $("againBtn").focus();
  }
  function toMenu() { state.token++; closeOverlay(); renderMenu(); }
  function closeOverlay() { var o = $("overlay"); o.hidden = true; o.innerHTML = ""; }

  // ------------------------------------------------------------ panels
  function showRules() {
    var o = $("overlay"); o.hidden = false;
    o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="How to play"><h2>How to play</h2>' +
      "<ul>" +
      "<li><b>Goal.</b> Play 13 rounds. Each round you fill one box on your scorecard. Highest total wins.</li>" +
      "<li><b>Your turn.</b> Roll five dice. Tap dice to hold them, then roll the rest again. You get at most 3 rolls, and you may stop early. Then tap a category to score it.</li>" +
      "<li><b>Upper section.</b> Ones to Sixes score the sum of the dice showing that number. If the upper total is 63 or more, you get a 35 point bonus.</li>" +
      "<li><b>Three of a Kind</b> and <b>Four of a Kind</b> score the sum of all five dice, if you have at least that many of one number.</li>" +
      "<li><b>Full House</b> is 25: three of one number and two of another. Five of a kind is a full house only through the Joker rule.</li>" +
      "<li><b>Small Straight</b> is 30 (four in a row), <b>Large Straight</b> is 40 (five in a row), <b>Yahtzee</b> is 50 (five of a kind), <b>Chance</b> is the sum of all dice.</li>" +
      "<li><b>Yahtzee bonus.</b> Each extra Yahtzee after you scored 50 in the Yahtzee box earns 100 points. If the Yahtzee box holds 0, there is no bonus.</li>" +
      "<li><b>Joker rule (forced).</b> When you roll a Yahtzee and the Yahtzee box is already filled (50 or 0): (1) if the matching upper box is open, you must score there; (2) otherwise you may score in any open lower box, with Full House 25, Small Straight 30 and Large Straight 40 scoring in full; (3) otherwise you must score 0 in an open upper box.</li>" +
      "<li><b>Modes.</b> Solo chases a high score. Vs computer adds 1 to 3 bots that play an expected-value strategy and show what they hold and score. Pass the phone is for 2 to 4 people on one device.</li>" +
      "<li><b>Keys.</b> Space or Enter rolls. 1 to 5 hold or release a die. Your game is saved on this device, so you can resume it later.</li>" +
      "<li><b>Seeds.</b> Add ?seed=N to the address to replay the same dice.</li>" +
      '</ul><button class="btn primary" id="closeRules">Got it</button></div>';
    $("closeRules").addEventListener("click", function () {
      if (state.g && state.g.over) finishGame(); else if (state.mode && state.mode.kind === "hotseat" && !state.ready && !$("game").hidden) showPass(curPlayer().name); else closeOverlay();
    });
    $("closeRules").focus();
  }
  function confirmNew() {
    var o = $("overlay"); o.hidden = false;
    o.innerHTML = '<div class="sheet pass" role="dialog" aria-modal="true"><h2>New game?</h2><p>The current game will be abandoned.</p>' +
      '<button class="btn primary" id="yesNew">Start new game</button><button class="btn" id="noNew">Keep playing</button></div>';
    $("yesNew").addEventListener("click", function () { startGame(state.mode); });
    $("noNew").addEventListener("click", function () {
      if (state.g.over) finishGame(); else if (state.mode.kind === "hotseat" && !state.ready) showPass(curPlayer().name); else closeOverlay();
    });
  }
  $("openRules").addEventListener("click", showRules);
  $("rulesBtn").addEventListener("click", showRules);
  $("newBtn").addEventListener("click", function () { if (state.g && state.g.over) toMenu(); else confirmNew(); });
  $("rollBtn").addEventListener("click", humanRoll);

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$("overlay").hidden) { if (e.key === "Escape" && !state.g.over) closeOverlay(); return; }
    if ($("game").hidden) return;
    if (e.key === " " || e.key === "Enter") {
      if (e.target && e.target.closest && e.target.closest(".pot,#newBtn,#rulesBtn,a")) return;
      e.preventDefault(); humanRoll();
    } else if (e.key >= "1" && e.key <= "5") toggle(+e.key - 1);
  });

  buildDice();
  renderMenu();
  window.__yahtzee = { state: state, logic: L };
})();
