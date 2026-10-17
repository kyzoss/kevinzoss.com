// Road Trip UI. All content lives in content.js and all rules in logic.js;
// this file draws the menu and the ten mini games, saves state and talks.
(function () {
  "use strict";
  var L = window.RoadTripLogic, C = window.RoadTripContent;
  var PREF_KEY = "kz.road-trip.prefs.v1", SAVE_KEY = "kz.road-trip.save.v1";
  var reduceMotion = false, canSpeak = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  try { canSpeak = !!(window.speechSynthesis && window.SpeechSynthesisUtterance); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function readJSON(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var prefs = L.normalizePrefs(readJSON(PREF_KEY));
  var saves = readJSON(SAVE_KEY);
  if (!saves || typeof saves !== "object") saves = {};
  function savePrefs() { lsSet(PREF_KEY, JSON.stringify(prefs)); }
  function save() { lsSet(SAVE_KEY, JSON.stringify(saves)); }
  var urlSeed = L.parseSeed(location.search);
  function freshSeed() {
    if (urlSeed !== null) { var s = urlSeed; urlSeed = null; return s; }
    return ((Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) & 0x7fffffff) || 1;
  }
  var app = { game: "menu", timer: 0, speaking: false };

  // ------------------------------------------------------------ mascot
  function carSVG(pose) {
    var eyes, mouth, extra = "";
    if (pose === "happy") { eyes = '<path d="M42 40q5-6 10 0M66 40q5-6 10 0" stroke="#2B2622" stroke-width="3" fill="none" stroke-linecap="round"/>'; mouth = '<path d="M50 50q9 9 18 0" stroke="#2B2622" stroke-width="3" fill="#D9663A" stroke-linecap="round"/>'; }
    else if (pose === "honk") { eyes = '<circle cx="47" cy="40" r="4.5" fill="#2B2622"/><circle cx="71" cy="40" r="4.5" fill="#2B2622"/>'; mouth = '<ellipse cx="59" cy="52" rx="6" ry="5" fill="#2B2622"/>'; extra = '<text x="98" y="22" font-family="Marcellus, Georgia, serif" font-size="14" fill="#C99A2E">HONK</text><path d="M92 30l6-4M92 36h7" stroke="#C99A2E" stroke-width="2" stroke-linecap="round"/>'; }
    else if (pose === "shush") { eyes = '<path d="M42 41q5-4 10 0M66 41q5-4 10 0" stroke="#2B2622" stroke-width="3" fill="none" stroke-linecap="round"/>'; mouth = '<path d="M54 52h10" stroke="#2B2622" stroke-width="3" stroke-linecap="round"/><rect x="62" y="44" width="4" height="14" rx="2" fill="#F5CBA7" stroke="#2B2622" stroke-width="1.5"/>'; extra = '<text x="92" y="24" font-family="Jost, sans-serif" font-size="13" font-weight="600" fill="#7B7064">shh</text>'; }
    else { eyes = '<circle cx="47" cy="40" r="4.5" fill="#2B2622"/><circle cx="71" cy="40" r="4.5" fill="#2B2622"/><circle cx="48.5" cy="38.5" r="1.5" fill="#fff"/><circle cx="72.5" cy="38.5" r="1.5" fill="#fff"/>'; mouth = '<path d="M52 50q7 6 14 0" stroke="#2B2622" stroke-width="3" fill="none" stroke-linecap="round"/>'; }
    return '<svg viewBox="0 0 124 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="carbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6C85F"/><stop offset="1" stop-color="#D9A32E"/></linearGradient>' +
      '<linearGradient id="carglass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAF4FB"/><stop offset="1" stop-color="#CFE3F4"/></linearGradient></defs>' +
      '<ellipse cx="60" cy="88" rx="46" ry="5" fill="rgba(84,62,38,.18)"/>' +
      '<path d="M14 72V58q0-8 8-8h12l10-16q3-4 8-4h26q5 0 8 4l10 16h12q8 0 8 8v14q0 4-4 4H18q-4 0-4-4z" fill="url(#carbody)" stroke="#9A6E16" stroke-width="2"/>' +
      '<path d="M36 50l9-14q2-3 5-3h24q3 0 5 3l9 14z" fill="url(#carglass)" stroke="#9A6E16" stroke-width="2"/>' +
      '<rect x="22" y="56" width="14" height="6" rx="3" fill="#FFF3C9"/><rect x="88" y="56" width="14" height="6" rx="3" fill="#F09A7E"/>' +
      '<circle cx="36" cy="76" r="11" fill="#2B2622"/><circle cx="36" cy="76" r="5" fill="#D8CBB4"/><circle cx="88" cy="76" r="11" fill="#2B2622"/><circle cx="88" cy="76" r="5" fill="#D8CBB4"/>' +
      '<path d="M54 36q6-4 12 0" stroke="#fff" stroke-width="2" opacity=".7" stroke-linecap="round"/>' +
      eyes + mouth + extra + '</svg>';
  }
  function mascot(pose, cls) { return '<div class="mascot ' + (cls || "") + '" aria-hidden="true">' + carSVG(pose) + '</div>'; }

  // ------------------------------------------------------------ helpers
  function announce(t) { var n = $("live"); if (n) { n.textContent = ""; setTimeout(function () { n.textContent = t; }, 30); } }
  function confetti() {
    if (reduceMotion) return;
    var cols = ["#C99A2E", "#D9663A", "#3F8F63", "#4A86C8", "#F6E3A6", "#CFE3F4"], html = "", i;
    for (i = 0; i < 80; i++) {
      html += '<i style="--x:' + (Math.random() * 100).toFixed(1) + "%;--d:" + (2.2 + Math.random() * 1.8).toFixed(2) + "s;--delay:" + (Math.random() * 0.8).toFixed(2) + "s;--r:" + Math.floor(Math.random() * 360) + "deg;--c:" + cols[i % cols.length] + ";width:" + (7 + Math.random() * 7).toFixed(0) + 'px"></i>';
    }
    $("confetti").innerHTML = html;
    setTimeout(function () { $("confetti").innerHTML = ""; }, 5000);
  }
  function stopSpeaking() {
    if (!canSpeak) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    app.speaking = false;
    var b = document.querySelector(".speak.on"); if (b) b.classList.remove("on");
  }
  function speak(text, btn) {
    if (!canSpeak) return;
    if (app.speaking) { stopSpeaking(); return; }
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 1.05;
      u.onend = u.onerror = function () { app.speaking = false; if (btn) btn.classList.remove("on"); };
      app.speaking = true; if (btn) btn.classList.add("on");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { app.speaking = false; }
  }
  function speakBtn(text) {
    if (!canSpeak) return "";
    return '<button class="btn speak" type="button" data-act="speak" data-say="' + esc(text) + '" aria-label="Read aloud">🔊 Read aloud</button>';
  }
  function setBody(html) { $("gameBody").innerHTML = html; }
  function stopTick() { if (app.timer) { clearInterval(app.timer); app.timer = 0; } }
  function startTick(fn, ms) { stopTick(); app.timer = setInterval(fn, ms || 250); }
  function playersOf() { return prefs.players.slice(0, 4); }
  function sdata(id) { if (!saves[id] || typeof saves[id] !== "object") saves[id] = {}; return saves[id]; }

  // ------------------------------------------------------------ routing
  function openGame(id, push) {
    stopSpeaking(); stopTick();
    app.game = L.gameById(id) ? id : "menu";
    if (push) {
      try { history.pushState({ g: app.game }, "", location.pathname + (app.game === "menu" ? "" : "?g=" + app.game)); } catch (e) {}
    }
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  window.addEventListener("popstate", function () { stopSpeaking(); stopTick(); app.game = L.parseGame(location.search); render(); });

  function render() {
    var menu = app.game === "menu";
    $("menu").hidden = !menu; $("game").hidden = menu;
    if (menu) { renderMenu(); return; }
    var g = L.gameById(app.game);
    $("gameTitle").textContent = g.title;
    document.title = g.title + " | Road Trip";
    $("topRight").innerHTML = '<span class="tag">' + (prefs.age === "big" ? "Big" : "Little") + "</span>";
    R[app.game]();
  }

  // ------------------------------------------------------------ menu
  function renderMenu() {
    document.title = "Road Trip";
    $("heroCar").innerHTML = carSVG("idle");
    document.querySelectorAll(".segbtn").forEach(function (b) { var on = b.getAttribute("data-age") === prefs.age; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    var ps = playersOf(), html = "";
    ps.forEach(function (p) { html += '<span class="pchip"><span class="av" aria-hidden="true">' + esc(p.emoji) + "</span>" + esc(p.name) + "</span>"; });
    html += '<button class="linkbtn" type="button" id="editPlayers">' + (ps.length ? "Edit players" : "Add players (optional)") + "</button>";
    $("roster").innerHTML = html;
    $("editPlayers").onclick = openPlayers;
    var groups = "";
    L.GROUPS.forEach(function (gr) {
      groups += '<section class="group"><h2>' + esc(gr.title) + '</h2><div class="gamegrid">';
      L.GAMES.filter(function (g) { return g.group === gr.id; }).forEach(function (g) {
        var inProgress = hasSave(g.id);
        groups += '<button class="gcard" type="button" data-g="' + g.id + '"><span class="gicon ' + gr.id + '" aria-hidden="true">' + g.emoji + '</span><span class="gtxt"><b>' + esc(g.title) + "</b><small>" + esc(g.blurb) + "</small>" + (inProgress ? '<span class="saved">In progress</span>' : "") + "</span></button>";
      });
      groups += "</div></section>";
    });
    $("groups").innerHTML = groups;
    $("groups").querySelectorAll(".gcard").forEach(function (b) { b.onclick = function () { openGame(b.getAttribute("data-g"), true); }; });
  }
  function hasSave(id) {
    var s = saves[id]; if (!s) return false;
    switch (id) {
      case "bingo": return !!(s.card && s.card.marked.filter(Boolean).length > 1);
      case "ispy": return !!(s.st && (s.st.got || s.st.skipped));
      case "twenty": return !!(s.st && s.st.secret && !s.st.revealed);
      case "rather": return !!(s.st && s.st.rounds);
      case "alphabet": return !!(s.st && s.st.found.length && !s.st.finishedAt);
      case "plates": return !!(s.st && L.platesCount(s.st));
      case "story": return !!((s.st && s.st.tpl !== null && !L.storyDone(s.st)) || (s.robin && s.robin.lines.length));
      case "count": return !!(s.st && !s.st.winner && s.st.history.length);
      case "quiet": return !!(s.st && s.st.running);
      default: return false;
    }
  }
  document.querySelectorAll(".segbtn").forEach(function (b) {
    b.onclick = function () { prefs.age = b.getAttribute("data-age"); savePrefs(); renderMenu(); };
  });

  // players modal
  function openPlayers() {
    var m = $("modal"), ps = playersOf().map(function (p) { return { name: p.name, emoji: p.emoji }; });
    function draw() {
      var html = '<p class="hint" style="margin:0 0 10px">Up to four players for Would You Rather and Count It. Names stay on this phone.</p>';
      ps.forEach(function (p, i) {
        html += '<div class="prow"><input type="text" maxlength="14" placeholder="Name" value="' + esc(p.name) + '" data-i="' + i + '" aria-label="Player ' + (i + 1) + ' name" /><button class="btn" type="button" data-rm="' + i + '" aria-label="Remove player ' + (i + 1) + '">Remove</button></div>';
        html += '<div class="avpick" role="group" aria-label="Avatar for player ' + (i + 1) + '">';
        C.AVATARS.forEach(function (a) { html += '<button type="button" class="' + (a === p.emoji ? "on" : "") + '" data-av="' + i + '" data-e="' + a + '" aria-label="' + a + '" aria-pressed="' + (a === p.emoji) + '">' + a + "</button>"; });
        html += "</div>";
      });
      if (ps.length < 4) html += '<button class="btn wide" type="button" id="addPlayer">+ Add a player</button>';
      $("modalBody").innerHTML = html;
      $("modalBody").querySelectorAll("input").forEach(function (inp) { inp.oninput = function () { ps[+inp.getAttribute("data-i")].name = inp.value; }; });
      $("modalBody").querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { ps.splice(+b.getAttribute("data-rm"), 1); draw(); }; });
      $("modalBody").querySelectorAll("[data-av]").forEach(function (b) { b.onclick = function () { ps[+b.getAttribute("data-av")].emoji = b.getAttribute("data-e"); draw(); }; });
      var add = $("addPlayer"); if (add) add.onclick = function () { ps.push({ name: "", emoji: C.AVATARS[ps.length % C.AVATARS.length] }); draw(); setTimeout(function () { var ins = $("modalBody").querySelectorAll("input"); if (ins.length) ins[ins.length - 1].focus(); }, 0); };
    }
    draw();
    m.hidden = false;
    $("modalClose").onclick = function () {
      prefs.players = ps.map(function (p, i) { return { name: (p.name || "").trim() || "Player " + (i + 1), emoji: p.emoji }; });
      savePrefs(); m.hidden = true; renderMenu();
    };
    $("modalClose").focus();
  }
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) $("modalClose").click(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) $("modalClose").click(); });
  $("toMenu").onclick = function () { openGame("menu", true); };

  // Shared action dispatch for the game body.
  var ACT = {};
  $("gameBody").addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
    var act = el.getAttribute("data-act");
    if (act === "speak") { speak(el.getAttribute("data-say"), el); return; }
    var h = ACT[app.game] && ACT[app.game][act];
    if (h) h(el, e);
  });

  var R = {};

  // ------------------------------------------------------------ bingo
  R.bingo = function () {
    var s = sdata("bingo");
    if (!s.card) { s.card = L.makeBingoCard(freshSeed(), prefs.age); save(); }
    var card = s.card, cells = L.bingoCells(card), lines = L.bingoLines(card.marked), inLine = {};
    lines.forEach(function (li) { L.BINGO_LINES[li].forEach(function (i) { inLine[i] = 1; }); });
    var black = L.bingoBlackout(card.marked), found = card.marked.filter(Boolean).length - 1;
    var html = "";
    if (black) html += '<div class="banner">BLACKOUT! The whole card!<small>You spotted all 24 things. Amazing.</small></div>';
    else if (lines.length) html += '<div class="banner">BINGO!<small>' + lines.length + (lines.length === 1 ? " line" : " lines") + ". Keep going for a blackout.</small></div>";
    html += '<div class="statusbar"><span class="tag">' + (card.tier === "big" ? "Big set" : "Little set") + '</span><span class="tag num">Card #' + card.seed + '</span><span class="pill mint num">' + found + " of 24 found</span></div>";
    html += '<div class="bgrid" role="grid" aria-label="Bingo card, five by five">';
    cells.forEach(function (c, i) {
      var on = card.marked[i], cls = "bcell" + (on ? " on" : "") + (i === L.FREE ? " free" : "") + (inLine[i] ? " line" : "");
      html += '<button type="button" class="' + cls + '" data-act="cell" data-i="' + i + '" role="gridcell" aria-pressed="' + on + '" aria-label="' + esc(c.label) + (on ? ", marked" : "") + '"' + (i === L.FREE ? " disabled" : "") + '><span class="em" aria-hidden="true">' + c.emoji + '</span><span class="lb">' + esc(c.label) + "</span></button>";
    });
    html += "</div>";
    html += '<div class="row" style="margin-top:14px"><button class="btn grow" type="button" data-act="newcard">New card</button><button class="btn grow" type="button" data-act="clear">Clear marks</button></div>';
    html += '<p class="hint">Share the card number so another phone can open the same card: add <b>?g=bingo&amp;seed=' + card.seed + "</b> to the link.</p>";
    setBody(html);
  };
  ACT.bingo = {
    cell: function (el) {
      var s = sdata("bingo"), i = +el.getAttribute("data-i"), before = L.bingoLines(s.card.marked).length;
      L.bingoToggle(s.card, i); save();
      var after = L.bingoLines(s.card.marked).length, black = L.bingoBlackout(s.card.marked);
      R.bingo();
      var cell = $("gameBody").querySelector('[data-i="' + i + '"]'); if (cell && !reduceMotion) cell.classList.add("pop");
      if (black) { confetti(); announce("Blackout! The whole card is full."); }
      else if (after > before) { confetti(); announce("Bingo! " + after + (after === 1 ? " line." : " lines.")); }
    },
    newcard: function () { var s = sdata("bingo"); s.card = L.makeBingoCard(freshSeed(), prefs.age); save(); R.bingo(); announce("New card."); },
    clear: function () { var s = sdata("bingo"); s.card = L.makeBingoCard(s.card.seed, s.card.tier); save(); R.bingo(); }
  };

  // ------------------------------------------------------------ I spy
  R.ispy = function () {
    var s = sdata("ispy");
    if (!s.st || s.st.tier !== prefs.age) { s.st = L.newSpy(freshSeed(), prefs.age); L.spyNext(s.st); s.timerEnd = null; save(); }
    var st = s.st, cur = st.current, html = "";
    html += '<div class="statusbar"><span class="pill mint num">Found ' + st.got + '</span><span class="pill coral num">Skipped ' + st.skipped + "</span>" +
      '<button class="chip ' + (s.timerEnd ? "on" : "") + '" type="button" data-act="timer" aria-pressed="' + !!s.timerEnd + '" style="margin-left:auto">⏱ 60 s</button></div>';
    html += '<div class="timerbar" id="spyBar" ' + (s.timerEnd ? "" : "hidden") + "><i></i></div>";
    html += '<div class="card bigprompt">' + mascot("idle", "small bob") + '<div class="eyebrow">I spy with my little eye</div>';
    if (cur.kind === "colour") html += '<div class="main">something</div><span class="swatch" style="background:' + cur.hex + '" role="img" aria-label="' + esc(cur.value) + '"></span><div class="main" style="text-transform:uppercase">' + esc(cur.value) + "</div>";
    else if (cur.kind === "letter") html += '<div class="main">something that starts with</div><div class="huge">' + cur.value + "</div>";
    else html += '<div class="main">something that is</div><div class="huge" style="font-size:44px;font-family:var(--body)">' + esc(cur.value) + "</div>";
    html += '<div class="row center" style="margin-top:8px">' + speakBtn("I spy with my little eye, " + cur.text + ".") + "</div></div>";
    html += '<div class="choices"><button class="btn primary big" type="button" data-act="got">Got it!</button><button class="btn big" type="button" data-act="skip">Skip</button></div>';
    html += '<div class="row" style="margin-top:12px"><button class="btn ghost" type="button" data-act="reset">Reset count</button></div>';
    setBody(html);
    if (s.timerEnd) startTick(spyTick, 250);
    spyTick();
  };
  function spyTick() {
    var s = sdata("ispy"), bar = $("spyBar"); if (!bar || !s.timerEnd) return;
    var left = Math.max(0, s.timerEnd - Date.now()), i = bar.querySelector("i");
    i.style.width = (left / 60000 * 100).toFixed(1) + "%"; i.classList.toggle("low", left < 10000);
    if (left === 0) { stopTick(); s.timerEnd = null; save(); announce("Time is up!"); var b = $("gameBody").querySelector('[data-act="timer"]'); if (b) { b.textContent = "⏱ Time's up"; } }
  }
  ACT.ispy = {
    got: function () { var s = sdata("ispy"); L.spyGot(s.st); if (s.timerEnd) s.timerEnd = Date.now() + 60000; save(); R.ispy(); announce("Got it. New prompt: " + s.st.current.text); },
    skip: function () { var s = sdata("ispy"); L.spySkip(s.st); if (s.timerEnd) s.timerEnd = Date.now() + 60000; save(); R.ispy(); announce("New prompt: " + s.st.current.text); },
    timer: function () { var s = sdata("ispy"); s.timerEnd = s.timerEnd ? null : Date.now() + 60000; save(); R.ispy(); },
    reset: function () { var s = sdata("ispy"); s.st = L.newSpy(freshSeed(), prefs.age); L.spyNext(s.st); s.timerEnd = null; save(); R.ispy(); }
  };

  // ------------------------------------------------------------ 20 questions
  R.twenty = function () {
    var s = sdata("twenty");
    if (!s.st) { s.st = L.newTwenty(freshSeed()); save(); }
    var st = s.st, html = "";
    if (!st.secret) {
      html += '<div class="card bigprompt">' + mascot("idle", "bob") + '<div class="main">One person is the keeper.</div><p class="hint">The phone picks a secret thing and shows it only to the keeper. Everyone else asks yes or no questions. Twenty questions, then guess!</p></div>';
      html += '<div class="card"><h2>Pick from</h2><div class="chipgrid">';
      ["any"].concat(L.twentyCats()).forEach(function (c) { html += '<button class="chip ' + (st.cat === c ? "on" : "") + '" type="button" data-act="cat" data-c="' + esc(c) + '" aria-pressed="' + (st.cat === c) + '">' + (c === "any" ? "Anything" : esc(c + "s")) + "</button>"; });
      html += "</div></div>";
      html += '<button class="btn primary big wide" type="button" data-act="pick">Pick a secret thing</button>';
    } else {
      var out = L.twentyOut(st);
      if (st.revealed) html += '<div class="banner">It was: ' + esc(st.secret.name) + "<small>" + esc(st.secret.cat) + " · " + st.asked + (st.asked === 1 ? " question" : " questions") + " asked</small></div>";
      html += '<div class="card"><div class="row"><span class="tag">Hint: ' + esc(st.secret.cat) + '</span><span class="tag num" style="margin-left:auto">' + (L.TWENTY_MAX - st.asked) + " left</span></div>";
      html += '<button type="button" class="peek" id="peek" data-act="peeknone" aria-label="Tap and hold to peek at the secret"><span id="peekTxt">Tap and hold to peek</span><small>keeper only</small></button>';
      html += '<div class="dots" aria-hidden="true">';
      for (var i = 0; i < L.TWENTY_MAX; i++) html += "<i class=\"" + (i < st.asked ? (i >= 15 ? "on warn" : "on") : "") + '"></i>';
      html += '</div><div class="counter num">' + st.asked + "<small>of 20 questions</small></div></div>";
      if (out && !st.revealed) html += '<div class="banner">Out of questions!<small>Time for a final guess.</small></div>';
      html += '<div class="choices"><button class="btn primary big" type="button" data-act="ask" ' + (out || st.revealed ? "disabled" : "") + '>Asked one</button><button class="btn big" type="button" data-act="unask" ' + (st.asked === 0 ? "disabled" : "") + ">Undo</button></div>";
      html += '<div class="row" style="margin-top:12px"><button class="btn grow" type="button" data-act="reveal" ' + (st.revealed ? "disabled" : "") + '>Reveal</button><button class="btn grow" type="button" data-act="another">New secret</button></div>';
    }
    setBody(html);
    var pk = $("peek");
    if (pk) {
      var show = function (on) { pk.classList.toggle("show", on); $("peekTxt").innerHTML = on ? '<span class="secret">' + esc(st.secret.name) + "</span>" : "Tap and hold to peek"; };
      pk.addEventListener("pointerdown", function (e) { e.preventDefault(); show(true); try { pk.setPointerCapture(e.pointerId); } catch (x) {} });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { pk.addEventListener(ev, function () { show(false); }); });
      pk.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); show(true); } });
      pk.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") show(false); });
      pk.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }
  };
  ACT.twenty = {
    cat: function (el) { sdata("twenty").st.cat = el.getAttribute("data-c"); save(); R.twenty(); },
    pick: function () { var s = sdata("twenty"); L.twentyPick(s.st, s.st.cat); save(); R.twenty(); announce("Secret picked. Keeper, tap and hold to peek."); },
    ask: function () { var s = sdata("twenty"); L.twentyAsk(s.st); save(); R.twenty(); announce(s.st.asked + " questions asked, " + (L.TWENTY_MAX - s.st.asked) + " left."); },
    unask: function () { var s = sdata("twenty"); L.twentyUnask(s.st); save(); R.twenty(); },
    reveal: function () { var s = sdata("twenty"); s.st.revealed = true; save(); R.twenty(); announce("It was " + s.st.secret.name + "."); },
    another: function () { var s = sdata("twenty"); L.twentyPick(s.st, s.st.cat); save(); R.twenty(); announce("New secret picked."); }
  };

  // ------------------------------------------------------------ would you rather
  R.rather = function () {
    var s = sdata("rather"), ps = playersOf();
    var same = s.st && s.st.tier === prefs.age && JSON.stringify(s.st.players) === JSON.stringify(ps);
    if (!same) { s.st = L.newRather(freshSeed(), prefs.age, ps); L.ratherNext(s.st); s.view = "vote"; save(); }
    var st = s.st, pair = C.RATHER[st.current], html = "";
    if (s.view === "totals") {
      var tot = L.ratherTotals(st);
      html += '<div class="card"><h2>Totals after ' + st.rounds + (st.rounds === 1 ? " round" : " rounds") + '</h2><div class="totals">';
      tot.forEach(function (t) {
        var pa = t.total ? t.a / t.total * 100 : 0, pb = t.total ? t.b / t.total * 100 : 0;
        html += '<div class="trow"><span class="av" aria-hidden="true">' + esc(t.emoji) + '</span><div><b>' + esc(t.name) + '</b><div class="bar" role="img" aria-label="' + t.a + " blue, " + t.b + ' orange"><i class="a" style="width:' + pa + '%"></i><i class="b" style="width:' + pb + '%"></i></div></div><span class="n num">' + t.a + " · " + t.b + "</span></div>";
      });
      html += '</div><div class="legend"><span><i style="background:#3A72C4"></i>Picked the first one</span><span><i style="background:#D9663A"></i>Picked the second one</span></div></div>';
      html += '<div class="row"><button class="btn primary grow" type="button" data-act="back">Back to voting</button><button class="btn grow" type="button" data-act="resettot">Reset totals</button></div>';
      setBody(html); return;
    }
    var done = L.ratherRoundDone(st), who = ps.length ? ps[st.turn] : null;
    html += '<div class="statusbar"><span class="tag num">Round ' + (st.rounds + (done ? 0 : 1)) + '</span><button class="chip" type="button" data-act="totals" style="margin-left:auto">Totals</button></div>';
    if (done) {
      html += '<div class="banner">Everyone voted!<small>' + ps.map(function (p, i) { return esc(p.emoji + " " + p.name) + ": " + (st.votes[i] === "a" ? "first" : "second"); }).join(" · ") + "</small></div>";
    } else if (who) {
      html += '<div class="whose"><span class="av" aria-hidden="true">' + esc(who.emoji) + "</span>" + esc(who.name) + ", would you rather...</div>";
    } else {
      html += '<div class="whose">' + mascot("idle", "small") + '</div><div class="orsep" style="margin-bottom:10px">Would you rather</div>';
    }
    html += '<div class="wyr"><button class="wyrbtn a" type="button" data-act="vote" data-side="a" ' + (done ? "disabled" : "") + '><span class="or">Option one</span>' + esc(pair.a) + '</button><button class="wyrbtn b" type="button" data-act="vote" data-side="b" ' + (done ? "disabled" : "") + '><span class="or">Option two</span>' + esc(pair.b) + "</button></div>";
    html += '<div class="row center" style="margin:12px 0">' + speakBtn("Would you rather " + pair.a.toLowerCase() + ", or " + pair.b.toLowerCase() + "?") + "</div>";
    html += '<div class="row"><button class="btn primary grow" type="button" data-act="next">' + (done ? "Next question" : "Skip this one") + "</button></div>";
    setBody(html);
  };
  ACT.rather = {
    vote: function (el) {
      var s = sdata("rather"), st = s.st, ps = playersOf(), side = el.getAttribute("data-side");
      var full = L.ratherVote(st, st.turn, side); save();
      if (ps.length === 0 || full) { if (ps.length === 0) L.ratherNext(st); save(); R.rather(); announce(ps.length === 0 ? "Vote counted. Next question." : "Everyone voted."); }
      else { R.rather(); announce("Pass the phone to " + ps[st.turn].name + "."); }
    },
    next: function () { var s = sdata("rather"); L.ratherNext(s.st); save(); R.rather(); },
    totals: function () { var s = sdata("rather"); s.view = "totals"; save(); R.rather(); },
    back: function () { var s = sdata("rather"); s.view = "vote"; save(); R.rather(); },
    resettot: function () { var s = sdata("rather"); s.st.totals = {}; s.st.rounds = 0; L.ratherNext(s.st); s.view = "vote"; save(); R.rather(); }
  };

  // ------------------------------------------------------------ alphabet hunt
  R.alphabet = function () {
    var s = sdata("alphabet");
    if (!s.st) { s.st = L.newAlphabet("order"); save(); }
    var st = s.st, next = L.alphaNext(st), html = "", started = st.startedAt !== null;
    html += '<div class="statusbar"><div class="seg" style="flex:1 1 220px;grid-template-columns:1fr 1fr"><button class="chip ' + (st.mode === "order" ? "on" : "") + '" type="button" data-act="mode" data-m="order" aria-pressed="' + (st.mode === "order") + '">In order</button><button class="chip ' + (st.mode === "any" ? "on" : "") + '" type="button" data-act="mode" data-m="any" aria-pressed="' + (st.mode === "any") + '">Any order</button></div></div>';
    if (st.finishedAt) html += '<div class="banner">A to Z, done!<small>Time: ' + L.fmtMs(st.finishedAt - st.startedAt) + (saves.alphaBest ? " · Best: " + L.fmtMs(saves.alphaBest) : "") + "</small></div>";
    html += '<div class="row" style="margin-bottom:12px"><span class="pill sky num" id="alphaTime">⏱ ' + L.fmtMs(L.alphaElapsed(st, Date.now())) + '</span><span class="pill mint num">' + st.found.length + ' of 26</span>' + (saves.alphaBest ? '<span class="pill gold num">Best ' + L.fmtMs(saves.alphaBest) + "</span>" : "") + (next && !st.finishedAt ? '<span class="tag" style="margin-left:auto">' + (st.mode === "order" ? "Next: " + next : "Tap any letter") + "</span>" : "") + "</div>";
    html += '<div class="agrid" role="group" aria-label="Letters A to Z">';
    L.ALPHA.forEach(function (ch) {
      var found = st.found.indexOf(ch) >= 0, can = L.alphaCanTap(st, ch);
      html += '<button type="button" class="akey' + (found ? " found" : "") + (can && st.mode === "order" ? " next" : "") + '" data-act="letter" data-l="' + ch + '" ' + (can ? "" : "disabled") + ' aria-pressed="' + found + '" aria-label="' + ch + (found ? ", found" : "") + '">' + ch + "</button>";
    });
    html += "</div>";
    html += '<div class="row" style="margin-top:14px"><button class="btn grow" type="button" data-act="undo" ' + (st.found.length && !st.finishedAt ? "" : "disabled") + '>Undo</button><button class="btn grow" type="button" data-act="restart">Start over</button></div>';
    html += '<p class="hint">Find each letter on road signs, license plates, trucks and billboards.' + (started ? "" : " The clock starts on your first tap.") + "</p>";
    setBody(html);
    if (started && !st.finishedAt) startTick(function () { var n = $("alphaTime"); if (n) n.textContent = "⏱ " + L.fmtMs(L.alphaElapsed(st, Date.now())); }, 500);
  };
  ACT.alphabet = {
    mode: function (el) { var s = sdata("alphabet"); if (s.st.startedAt !== null && !confirm("Switching mode starts over. OK?")) return; s.st = L.newAlphabet(el.getAttribute("data-m")); save(); R.alphabet(); },
    letter: function (el) {
      var s = sdata("alphabet"); if (!L.alphaTap(s.st, el.getAttribute("data-l"), Date.now())) return;
      if (s.st.finishedAt) { saves.alphaBest = L.alphaBest(saves.alphaBest || null, s.st); confetti(); announce("All 26 letters found in " + L.fmtMs(s.st.finishedAt - s.st.startedAt) + "."); }
      save(); R.alphabet();
      if (!s.st.finishedAt && s.st.mode === "order") { var nx = $("gameBody").querySelector(".akey.next"); if (nx) nx.focus(); }
    },
    undo: function () { var s = sdata("alphabet"); L.alphaUndo(s.st); save(); R.alphabet(); },
    restart: function () { var s = sdata("alphabet"); s.st = L.newAlphabet(s.st.mode); save(); R.alphabet(); }
  };

  // ------------------------------------------------------------ license plates
  R.plates = function () {
    var s = sdata("plates");
    if (!s.st) { s.st = L.newPlates(); save(); }
    var st = s.st, n = L.platesCount(st), html = "";
    if (n === 51) html += '<div class="banner">All 51 found!<small>Every state plus D.C. What a trip.</small></div>';
    html += '<div class="row"><span class="pill mint num">' + n + ' of 51 found</span><span class="tag" style="margin-left:auto">Tap a state when you spot its plate</span></div>';
    html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="51" aria-valuenow="' + n + '"><i style="width:' + (n / 51 * 100).toFixed(1) + '%"></i></div>';
    html += '<div class="sgrid">';
    L.statesSorted().forEach(function (x) {
      var on = !!st.found[x.ab];
      html += '<button type="button" class="state' + (on ? " on" : "") + '" data-act="state" data-ab="' + x.ab + '" aria-pressed="' + on + '"><span class="chk" aria-hidden="true"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span><b>' + esc(x.name) + '</b><span class="ab">' + x.ab + "</span><small>" + esc(x.fact) + "</small></span></button>";
    });
    html += "</div>";
    html += '<div class="row" style="margin-top:14px">' + (s.confirmReset ? '<button class="btn grow" type="button" data-act="resetyes" style="border-color:var(--clay);color:var(--clay)">Yes, clear all ' + n + '</button><button class="btn grow" type="button" data-act="resetno">Keep them</button>' : '<button class="btn grow" type="button" data-act="reset" ' + (n ? "" : "disabled") + ">Reset for a new trip</button>") + "</div>";
    setBody(html);
  };
  ACT.plates = {
    state: function (el) {
      var s = sdata("plates"), ab = el.getAttribute("data-ab"), on = L.platesToggle(s.st, ab); save();
      el.classList.toggle("on", on); el.setAttribute("aria-pressed", String(on));
      var n = L.platesCount(s.st);
      var pill = $("gameBody").querySelector(".pill"); if (pill) pill.textContent = n + " of 51 found";
      var bar = $("gameBody").querySelector(".progress i"); if (bar) bar.style.width = (n / 51 * 100).toFixed(1) + "%";
      var pb = $("gameBody").querySelector(".progress"); if (pb) pb.setAttribute("aria-valuenow", n);
      var rs = $("gameBody").querySelector('[data-act="reset"]'); if (rs) rs.disabled = n === 0;
      if (n === 51) { confetti(); R.plates(); announce("All 51 found!"); }
    },
    reset: function () { var s = sdata("plates"); s.confirmReset = true; R.plates(); },
    resetno: function () { var s = sdata("plates"); s.confirmReset = false; R.plates(); },
    resetyes: function () { var s = sdata("plates"); s.st = L.newPlates(); s.confirmReset = false; save(); R.plates(); announce("Reset. Zero of 51."); }
  };

  // ------------------------------------------------------------ story chain
  R.story = function () {
    var s = sdata("story");
    if (!s.st) { s.st = L.newStory(freshSeed()); L.storyNext(s.st); s.mode = "fill"; save(); }
    var st = s.st, html = "";
    html += '<div class="seg" style="margin-bottom:12px"><button class="chip ' + (s.mode === "fill" ? "on" : "") + '" type="button" data-act="mode" data-m="fill" aria-pressed="' + (s.mode === "fill") + '">Fill the blanks</button><button class="chip ' + (s.mode === "robin" ? "on" : "") + '" type="button" data-act="mode" data-m="robin" aria-pressed="' + (s.mode === "robin") + '">Round robin</button></div>';
    if (s.mode === "robin") { setBody(html + robinHTML(s)); robinTick(); startTick(robinTick, 500); return; }
    var done = L.storyDone(st), words = [];
    for (var i = 0; i < st.slots.length; i++) words.push(st.filled[i]);
    var parts = L.fillStory(C.STORIES[st.tpl], words), text = "";
    parts.forEach(function (p, idx) {
      if (p.text !== undefined) { text += esc(p.text); return; }
      var slotIdx = parts.slice(0, idx).filter(function (q) { return q.slot; }).length;
      if (p.word === null) text += '<span class="blank' + (slotIdx === st.step ? " cur" : "") + '" aria-label="blank for a ' + p.slot + '">&nbsp;</span>';
      else text += '<span class="fill ' + p.slot + '">' + esc(p.word) + "</span>";
    });
    html += '<div class="card"><div class="storytext" aria-live="polite">' + text + "</div>";
    if (done) html += '<div class="row center" style="margin-top:14px">' + speakBtn(L.storyText(st)) + "</div>";
    html += "</div>";
    if (!done) {
      var kind = st.slots[st.step], label = { noun: "a thing", animal: "an animal", place: "a place", verb: "a silly action", number: "a number" }[kind];
      if (!s.choices || s.choicesStep !== st.step) { s.choices = L.storyChoices(st); s.choicesStep = st.step; save(); }
      html += '<div class="card"><h2>Pick ' + label + '</h2><div class="chipgrid">';
      s.choices.forEach(function (w) { html += '<button class="chip gold" type="button" data-act="word" data-w="' + esc(w) + '">' + esc(w) + "</button>"; });
      html += '<button class="chip" type="button" data-act="more">More words</button></div></div>';
      html += '<div class="row"><button class="btn grow" type="button" data-act="back" ' + (st.step ? "" : "disabled") + '>Back</button><button class="btn grow" type="button" data-act="auto">Surprise me</button></div>';
    } else {
      html += '<div class="row"><button class="btn primary big grow" type="button" data-act="another">Another story</button></div>';
    }
    setBody(html);
  };
  function robinHTML(s) {
    if (!s.robin) { s.robin = L.newRobin(playersOf(), Date.now()); save(); }
    var rb = s.robin, who = L.robinWho(rb), html = "";
    html += '<div class="card bigprompt">' + mascot("honk", "small") + '<div class="eyebrow">Next person adds one sentence</div><div class="whose"><span class="av" aria-hidden="true">' + esc(who.emoji) + "</span>" + esc(who.name) + '</div><div class="counter num" id="robinTime">' + L.robinRemaining(rb, Date.now()) + "<small>seconds</small></div></div>";
    html += '<div class="card robin">' + (rb.lines.length ? '<div class="robinlines">' + rb.lines.map(function (ln, i) { var p = rb.players.length ? rb.players[i % rb.players.length] : null; return "<p>" + (p ? '<span class="nm">' + esc(p.emoji + " " + p.name) + "</span>" : "") + esc(ln) + "</p>"; }).join("") + "</div>" : '<p class="hint" style="margin:0 0 10px">Say your sentence out loud. Type it in if you want it on the screen, then tap Next person.</p>') +
      '<input type="text" id="robinInput" maxlength="140" placeholder="Type the sentence (optional)" aria-label="Sentence" />' +
      '<div class="row" style="margin-top:10px"><button class="btn primary grow" type="button" data-act="addline">Next person</button><button class="btn grow" type="button" data-act="robinreset">Start over</button></div>' +
      (rb.lines.length ? '<div class="row center" style="margin-top:10px">' + speakBtn(rb.lines.join(" ")) + "</div>" : "") + "</div>";
    return html;
  }
  function robinTick() { var s = sdata("story"), n = $("robinTime"); if (!n || !s.robin) return; var left = L.robinRemaining(s.robin, Date.now()); n.firstChild.nodeValue = left; n.style.color = left <= 5 ? "var(--clay)" : ""; }
  ACT.story = {
    mode: function (el) { var s = sdata("story"); s.mode = el.getAttribute("data-m"); if (s.mode === "robin" && s.robin) s.robin.turnStartedAt = Date.now(); save(); R.story(); },
    word: function (el) { var s = sdata("story"); L.storyPick(s.st, el.getAttribute("data-w")); save(); R.story(); },
    more: function () { var s = sdata("story"); s.choices = L.storyChoices(s.st); save(); R.story(); },
    back: function () { var s = sdata("story"); L.storyBack(s.st); save(); R.story(); },
    auto: function () { var s = sdata("story"); L.storyAuto(s.st); save(); R.story(); announce(L.storyText(s.st)); },
    another: function () { var s = sdata("story"); L.storyNext(s.st); save(); R.story(); },
    addline: function () { var s = sdata("story"), inp = $("robinInput"); L.robinAdd(s.robin, inp ? inp.value : "", Date.now()); save(); R.story(); announce("Next: " + L.robinWho(s.robin).name); var n = $("robinInput"); if (n) n.focus(); },
    robinreset: function () { var s = sdata("story"); s.robin = L.newRobin(playersOf(), Date.now()); save(); R.story(); }
  };

  // ------------------------------------------------------------ riddles and jokes
  R.riddles = function () {
    var s = sdata("riddles");
    if (!s.kind) { s.kind = "riddles"; s.tier = prefs.age; }
    if (!s.st || s.st.kind !== s.kind || s.st.tier !== s.tier) { s.st = L.newRiddles(freshSeed(), s.kind, s.tier); L.riddleNext(s.st); save(); }
    var st = s.st, item = L.riddleList(st)[st.idx], html = "", isJoke = st.kind === "jokes";
    html += '<div class="seg" style="margin-bottom:10px"><button class="chip ' + (s.kind === "riddles" ? "on" : "") + '" type="button" data-act="kind" data-k="riddles" aria-pressed="' + (s.kind === "riddles") + '">Riddles</button><button class="chip ' + (s.kind === "jokes" ? "on" : "") + '" type="button" data-act="kind" data-k="jokes" aria-pressed="' + (s.kind === "jokes") + '">Jokes</button></div>';
    html += '<div class="chipgrid" style="margin-bottom:12px" role="group" aria-label="Difficulty">';
    [["little", "Little"], ["big", "Big"], ["all", "All"]].forEach(function (t) { html += '<button class="chip ' + (s.tier === t[0] ? "on" : "") + '" type="button" data-act="tier" data-t="' + t[0] + '" aria-pressed="' + (s.tier === t[0]) + '">' + t[1] + "</button>"; });
    html += "</div>";
    html += '<div class="card qcard">' + mascot(st.revealed ? "happy" : "idle", "small" + (st.revealed && !reduceMotion ? " happy" : "")) + '<div class="q">' + esc(item.q) + "</div>";
    if (st.revealed) html += '<div class="a" aria-live="polite">' + esc(item.a) + "</div>";
    else html += '<button type="button" class="reveal" data-act="reveal">' + (isJoke ? "Tap for the punchline" : "Tap to reveal the answer") + "</button>";
    html += '<div class="row center" style="margin-top:14px">' + speakBtn(st.revealed ? item.q + " " + item.a : item.q) + "</div></div>";
    html += '<div class="row"><button class="btn primary big grow" type="button" data-act="next">' + (isJoke ? "Another joke" : "Another riddle") + '</button></div><p class="hint num">' + st.seen + " of " + L.riddleList(st).length + " seen in this set</p>";
    setBody(html);
  };
  ACT.riddles = {
    kind: function (el) { var s = sdata("riddles"); s.kind = el.getAttribute("data-k"); save(); R.riddles(); },
    tier: function (el) { var s = sdata("riddles"); s.tier = el.getAttribute("data-t"); save(); R.riddles(); },
    reveal: function () { var s = sdata("riddles"); L.riddleReveal(s.st); save(); R.riddles(); announce(L.riddleList(s.st)[s.st.idx].a); },
    next: function () { var s = sdata("riddles"); L.riddleNext(s.st); save(); R.riddles(); announce(L.riddleList(s.st)[s.st.idx].q); }
  };

  // ------------------------------------------------------------ count it
  R.count = function () {
    var s = sdata("count"), html = "";
    if (!s.st) {
      s.pick = s.pick || ["redcars", "trucks"]; s.target = s.target || 10;
      html += '<div class="card"><h2>Pick 2 to 4 things to count</h2><div class="pickgrid">';
      C.COUNTABLES.forEach(function (c) { var on = s.pick.indexOf(c.id) >= 0; html += '<button type="button" class="pick ' + (on ? "on" : "") + '" data-act="pick" data-id="' + c.id + '" aria-pressed="' + on + '"><span class="em" aria-hidden="true">' + c.emoji + "</span>" + esc(c.label) + "</button>"; });
      html += "</div></div>";
      html += '<div class="card"><h2>First to</h2><div class="chipgrid">';
      [5, 10, 20, 50].forEach(function (n) { html += '<button class="chip ' + (s.target === n ? "on" : "") + '" type="button" data-act="target" data-n="' + n + '" aria-pressed="' + (s.target === n) + '">' + n + "</button>"; });
      html += "</div></div>";
      html += '<button class="btn primary big wide" type="button" data-act="start" ' + (s.pick.length >= 2 ? "" : "disabled") + ">Start the race</button>";
      setBody(html); return;
    }
    var st = s.st, ps = playersOf();
    if (st.winner) { var w = L.countable(st.winner); html += '<div class="banner">' + w.emoji + " " + esc(w.label) + " win!<small>First to " + st.target + ".</small></div>"; }
    html += '<div class="statusbar"><span class="tag num">First to ' + st.target + "</span>" + (ps.length ? '<span class="tag">' + esc(ps.map(function (p) { return p.emoji + " " + p.name; }).join("  ")) + "</span>" : "") + "</div>";
    html += '<div class="counters">';
    st.ids.forEach(function (id) {
      var c = L.countable(id), n = st.counts[id];
      html += '<div class="cnt' + (st.winner === id ? " win" : "") + '" style="background:linear-gradient(160deg,' + c.color + 'E6,' + c.color + ')"><span class="lb">' + c.emoji + " " + esc(c.label) + '</span><span class="n num" aria-live="polite" aria-label="' + esc(c.label) + ": " + n + '">' + n + '</span><button type="button" class="plus" data-act="plus" data-id="' + id + '" aria-label="Add one ' + esc(c.label) + '" ' + (st.winner ? "disabled" : "") + ">+1</button></div>";
    });
    html += "</div>";
    html += '<div class="row" style="margin-top:14px"><button class="btn grow" type="button" data-act="undo" ' + (st.history.length ? "" : "disabled") + '>Undo</button><button class="btn grow" type="button" data-act="newrace">New race</button></div>';
    setBody(html);
  };
  ACT.count = {
    pick: function (el) { var s = sdata("count"), id = el.getAttribute("data-id"), i = s.pick.indexOf(id); if (i >= 0) s.pick.splice(i, 1); else if (s.pick.length < 4) s.pick.push(id); save(); R.count(); },
    target: function (el) { var s = sdata("count"); s.target = +el.getAttribute("data-n"); save(); R.count(); },
    start: function () { var s = sdata("count"); s.st = L.newCount(s.pick, s.target); save(); R.count(); },
    plus: function (el) { var s = sdata("count"), id = el.getAttribute("data-id"); L.countAdd(s.st, id); save(); R.count(); if (s.st.winner) { confetti(); announce(L.countable(id).label + " win!"); } else { var b = $("gameBody").querySelector('[data-id="' + id + '"]'); if (b) b.focus(); } },
    undo: function () { var s = sdata("count"); L.countUndo(s.st); save(); R.count(); },
    newrace: function () { var s = sdata("count"); s.st = null; save(); R.count(); }
  };

  // ------------------------------------------------------------ quiet game
  R.quiet = function () {
    var s = sdata("quiet"), html = "", rec = saves.quietRecord || 0;
    if (!s.st) {
      html += '<div class="card bigprompt">' + mascot("shush", "bob") + '<div class="main">Who can stay quiet the longest?</div><p class="hint">Pick a time. If someone talks, tap the big button and the clock starts over.</p></div>';
      html += '<div class="card"><h2>How long?</h2><div class="chipgrid">';
      [1, 3, 5, 10].forEach(function (m) { html += '<button class="chip" type="button" data-act="start" data-m="' + m + '">' + m + (m === 1 ? " minute" : " minutes") + "</button>"; });
      html += "</div></div>";
      if (rec) html += '<p class="hint num" style="text-align:center">Quiet record: ' + L.fmtMs(rec) + "</p>";
      setBody(html); return;
    }
    var st = s.st, t = L.quietTick(st, Date.now());
    if (t.done) html += '<div class="banner">You did it!<small>' + L.fmtMs(st.total) + " of quiet. " + (st.talks ? st.talks + (st.talks === 1 ? " restart." : " restarts.") : "Not a peep.") + "</small></div>";
    var r = 104, circ = 2 * Math.PI * r;
    html += '<div class="card" style="text-align:center"><div class="ring"><svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="ringgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A86C8"/><stop offset="1" stop-color="#3F8F63"/></linearGradient></defs><circle class="track" cx="120" cy="120" r="' + r + '"/><circle class="arc" id="arc" cx="120" cy="120" r="' + r + '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + (circ * t.frac).toFixed(1) + '"/></svg>' +
      '<div class="face">' + mascot(t.done ? "happy" : "shush") + '<div class="time num" id="quietTime" role="timer" aria-live="off">' + L.fmtMs(t.remaining) + '</div><div class="sub">' + (t.done ? "all done" : "stay quiet") + "</div></div></div>";
    html += '<div class="row center"><span class="pill coral num">' + st.talks + (st.talks === 1 ? " restart" : " restarts") + '</span><span class="pill gold num">Record ' + L.fmtMs(Math.max(rec, st.record)) + "</span></div></div>";
    if (!t.done) html += '<button class="btn big wide talked" type="button" data-act="talked">Someone talked! Start over</button>';
    html += '<div class="row" style="margin-top:12px"><button class="btn grow" type="button" data-act="stop">' + (t.done ? "Play again" : "Stop") + "</button></div>";
    setBody(html);
    if (!t.done) startTick(quietTickUI, 500);
  };
  function quietTickUI() {
    var s = sdata("quiet"); if (!s.st) return;
    var t = L.quietTick(s.st, Date.now()), n = $("quietTime"), a = $("arc");
    if (n) n.textContent = L.fmtMs(t.remaining);
    if (a) a.setAttribute("stroke-dashoffset", (2 * Math.PI * 104 * t.frac).toFixed(1));
    if (t.done) { stopTick(); saves.quietRecord = Math.max(saves.quietRecord || 0, s.st.record); save(); confetti(); R.quiet(); announce("Time is up. You did it!"); }
  }
  ACT.quiet = {
    start: function (el) { var s = sdata("quiet"); s.st = L.newQuiet(+el.getAttribute("data-m"), Date.now(), saves.quietRecord || 0); save(); R.quiet(); announce("Quiet game started. Shh."); },
    talked: function () { var s = sdata("quiet"); L.quietTalked(s.st, Date.now()); saves.quietRecord = Math.max(saves.quietRecord || 0, s.st.record); save(); R.quiet(); announce("Starting over."); },
    stop: function () { var s = sdata("quiet"); if (s.st) saves.quietRecord = Math.max(saves.quietRecord || 0, s.st.record); s.st = null; save(); R.quiet(); }
  };

  // ------------------------------------------------------------ boot
  app.game = L.parseGame(location.search);
  try { history.replaceState({ g: app.game }, "", location.href); } catch (e) {}
  render();
  window.__roadtrip = { app: app, prefs: prefs, saves: saves, L: L, C: C, open: function (id) { openGame(id, true); }, confetti: confetti, render: render };
})();
