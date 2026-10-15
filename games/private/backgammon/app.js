(function () {
  "use strict";
  var L = window.BackgammonLogic;
  var $ = function (id) { return document.getElementById(id); };
  var KEY_SAVE = "kz.backgammon.save.v1", KEY_TALLY = "kz.backgammon.tally.v1", KEY_CFG = "kz.backgammon.cfg.v1";
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function store(op, k, v) {
    try {
      if (op === "get") return window.localStorage.getItem(k);
      if (op === "set") window.localStorage.setItem(k, v);
      if (op === "del") window.localStorage.removeItem(k);
    } catch (e) {}
    return null;
  }
  function jget(k, d) { try { var t = store("get", k); return t ? JSON.parse(t) : d; } catch (e) { return d; } }

  var app = {
    s: null, mode: "cpu", cfg: { mode: "cpu", cube: false, matchTo: 0, crawford: true },
    sel: null, last: null, gen: 0, timer: null, tumble: false, modalKey: "", seed: null
  };
  var saved = jget(KEY_CFG, null);
  if (saved) for (var k in saved) if (k in app.cfg) app.cfg[k] = saved[k];

  var params = new URLSearchParams(location.search);
  var urlSeed = params.has("seed") && !isNaN(Number(params.get("seed"))) ? Number(params.get("seed")) >>> 0 : null;
  function freshSeed() {
    if (urlSeed !== null) { var s = urlSeed; urlSeed = null; return s; }
    return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  }

  function isHuman(p) { return app.mode === "2p" || p === 0; }
  function nameOf(p) { return app.mode === "2p" ? (p === 0 ? "Cream" : "Ink") : (p === 0 ? "You" : "Computer"); }

  // ---------- rules text ----------
  var RULES = '<details class="card rules"><summary>How to play</summary><div class="body">' +
    '<h3>Goal</h3><p>Move all 15 of your checkers around the board and off it before your opponent does. Cream moves up the left side and down the right side to the home board at the bottom right. Ink travels the other way, home at the bottom left. Point numbers shown are from the side to move: your 24 point is your starting corner, your 1 point is the last one before off.</p>' +
    '<h3>Setup and first roll</h3><p>Each side starts with 2 checkers on the 24 point, 5 on the 13, 3 on the 8 and 5 on the 6. To start, each side rolls one die. The higher die moves first and plays both dice as the opening move. A tie is rolled again.</p>' +
    '<h3>Moving</h3><ul><li>Roll two dice and move checkers by each die. One checker may use both dice, one after the other.</li><li>Doubles play four times.</li><li>A point holding 2 or more opposing checkers is blocked. You may land on empty points, your own points, or a single opposing checker.</li><li>Landing on a single checker (a blot) hits it: it goes to the bar.</li><li>With a checker on the bar you must enter it before any other move. A die of N enters on the opponent home point N (your 25 minus N point), if it is not blocked. If you cannot enter, you lose the turn.</li><li>You must use as many dice as you legally can. If only one die can be played, you must play the higher one if either could be played.</li></ul>' +
    '<h3>Bearing off</h3><p>Once all 15 checkers are in your home board (points 1 to 6) you may bear off. A die matching the point number takes that checker off. A higher die takes off the checker on your highest occupied point, but only if no checker is on a higher point. Otherwise move a checker inside the board.</p>' +
    '<h3>Scoring</h3><p>First to bear off all 15 wins. A gammon (the loser has borne off no checker) is worth 2 points. A backgammon (the loser also has a checker on the bar or in the winner home board) is worth 3. Multiply by the cube value if the cube is used.</p>' +
    '<h3>Doubling cube (optional)</h3><p>Turn it on in the new game settings. Before rolling, the player on turn may double the stakes if the cube is in the middle or on their side. The opponent must take (the cube goes to them and the stakes double) or pass (and lose the current stake as a single game). The cube goes up to 64. There is no Jacoby rule and no beaver. Cube decisions cannot be made before the opening roll.</p>' +
    '<h3>Match play (optional)</h3><p>Play to 3, 5, 7, 9 or 11 points. With the Crawford rule on, the first game after a player reaches one point short of the target is played with no doubling.</p>' +
    '<h3>Controls</h3><ul><li>Tap Roll dice. Tap one of your highlighted checkers, then tap a highlighted destination. A green dot marks where it can land, a clay ring marks a hit.</li><li>Tap a die to play it automatically when it has only one legal move. If only one checker can move it is selected for you.</li><li>Undo takes back moves from the current turn. When your dice are used up, press End turn.</li><li>Your progress saves after every action. Use New game to start over or Resume later.</li></ul>' +
    '</div></details>';
  Array.prototype.forEach.call(document.querySelectorAll(".rules-slot"), function (n) { n.innerHTML = RULES; });

  // ---------- tally ----------
  function emptyTally() { return { w: 0, wg: 0, wb: 0, l: 0, lg: 0, lb: 0, pw: 0, pl: 0 }; }
  function getTally() { var t = jget(KEY_TALLY, null); var e = emptyTally(); if (t) for (var k in e) if (typeof t[k] === "number") e[k] = t[k]; return e; }
  function recordResult(s) {
    if (app.mode !== "cpu" || !s.result || s.result.recorded) return;
    s.result.recorded = true;
    var t = getTally(), r = s.result;
    if (r.winner === 0) { t.w++; t.pw += r.points; if (r.kind === "gammon") t.wg++; if (r.kind === "backgammon") t.wb++; }
    else { t.l++; t.pl += r.points; if (r.kind === "gammon") t.lg++; if (r.kind === "backgammon") t.lb++; }
    store("set", KEY_TALLY, JSON.stringify(t));
  }
  function renderTally() {
    var t = getTally();
    $("tally").innerHTML =
      "<div><b>Wins " + t.w + "</b> (gammons " + t.wg + ", backgammons " + t.wb + ")</div>" +
      "<div><b>Losses " + t.l + "</b> (gammons " + t.lg + ", backgammons " + t.lb + ")</div>" +
      "<div>Points " + t.pw + " to " + t.pl + " against the computer</div>";
  }

  // ---------- save ----------
  function save() {
    if (!app.s) return;
    store("set", KEY_SAVE, JSON.stringify({ s: app.s, mode: app.mode, cfg: app.cfg }));
  }

  // ---------- menu ----------
  function showScreen(name) {
    $("menu").hidden = name !== "menu";
    $("game").hidden = name !== "game";
    window.scrollTo(0, 0);
  }
  function renderMenu() {
    var c = app.cfg;
    Array.prototype.forEach.call($("modeSeg").children, function (b) { b.classList.toggle("on", b.getAttribute("data-mode") === c.mode); });
    $("modeHint").textContent = c.mode === "cpu" ? "You play the cream checkers against the computer." : "Pass the phone: Cream and Ink take turns on this screen.";
    $("cubeChk").checked = !!c.cube;
    $("matchSel").value = String(c.matchTo);
    $("crawChk").checked = !!c.crawford;
    $("crawRow").style.opacity = c.cube && c.matchTo ? "1" : "0.5";
    $("tallyCard").hidden = false;
    renderTally();
    var sv = jget(KEY_SAVE, null);
    var r = $("resume");
    if (sv && sv.s && sv.s.phase !== "over" && sv.s.v === 1) {
      r.hidden = false;
      var m = sv.s.match ? ", match to " + sv.s.match.target + " (" + sv.s.match.score[0] + " to " + sv.s.match.score[1] + ")" : "";
      r.textContent = "Resume game (" + (sv.mode === "2p" ? "two humans" : "vs computer") + m + ")";
    } else r.hidden = true;
  }
  $("modeSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    app.cfg.mode = b.getAttribute("data-mode"); store("set", KEY_CFG, JSON.stringify(app.cfg)); renderMenu();
  });
  $("cubeChk").addEventListener("change", function () { app.cfg.cube = $("cubeChk").checked; store("set", KEY_CFG, JSON.stringify(app.cfg)); renderMenu(); });
  $("matchSel").addEventListener("change", function () { app.cfg.matchTo = Number($("matchSel").value); store("set", KEY_CFG, JSON.stringify(app.cfg)); renderMenu(); });
  $("crawChk").addEventListener("change", function () { app.cfg.crawford = $("crawChk").checked; store("set", KEY_CFG, JSON.stringify(app.cfg)); renderMenu(); });
  $("startBtn").addEventListener("click", function () { startGame(); });
  $("resetTally").addEventListener("click", function () {
    openModal("Reset record?", "<p>This clears your wins and losses against the computer.</p>", [
      { label: "Cancel" }, { label: "Reset", cls: "primary", fn: function () { store("del", KEY_TALLY); renderTally(); } }
    ], "reset");
  });
  $("resume").addEventListener("click", function () {
    var sv = jget(KEY_SAVE, null);
    if (!sv || !sv.s) return;
    app.s = sv.s; app.mode = sv.mode || "cpu";
    if (sv.cfg) app.cfg = Object.assign(app.cfg, sv.cfg);
    app.sel = null; app.last = null;
    enterGame();
  });

  function startGame() {
    var c = app.cfg;
    app.mode = c.mode;
    app.s = L.newGame({ seed: freshSeed(), cube: c.cube, matchTo: c.matchTo, crawford: c.crawford });
    app.sel = null; app.last = null;
    enterGame();
  }
  function enterGame() {
    showScreen("game");
    commit();
  }
  $("menuBtn").addEventListener("click", function () {
    var s = app.s;
    if (s && s.phase !== "over") {
      openModal("Leave this game?", "<p>Your game is saved. You can resume it from the menu, or start a new one.</p>", [
        { label: "Keep playing" }, { label: "Go to menu", cls: "primary", fn: toMenu }
      ], "leave");
    } else toMenu();
  });
  function toMenu() {
    app.gen++; clearTimeout(app.timer);
    closeModal();
    showScreen("menu"); renderMenu();
  }

  // ---------- modal ----------
  var modalFns = [];
  function openModal(title, body, btns, key) {
    if (app.modalKey === key && !$("modal").hidden) return;
    app.modalKey = key;
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    var box = $("modalBtns"); box.innerHTML = ""; modalFns = [];
    btns.forEach(function (b, i) {
      var el = document.createElement("button");
      el.className = "btn" + (b.cls ? " " + b.cls : "");
      el.textContent = b.label;
      el.addEventListener("click", function () { closeModal(); if (b.fn) b.fn(); });
      box.appendChild(el);
    });
    $("modal").hidden = false;
    var first = box.querySelector(".primary") || box.firstChild; if (first) first.focus();
  }
  function closeModal() { $("modal").hidden = true; app.modalKey = ""; }

  // ---------- board geometry ----------
  var G = { top: 4, rowH: 42, barY: 256, barH: 44, lowY: 300, trayY: 560, trayH: 44, lx: 4, rx: 396, len: 180, rad: 17 };
  function pointGeom(i) {
    var left = i >= 12, r = left ? i - 12 : 11 - i;
    var y = r < 6 ? G.top + r * G.rowH : G.lowY + (r - 6) * G.rowH;
    return { left: left, y: y, base: left ? G.lx : G.rx, dir: left ? 1 : -1 };
  }
  function checkerSVG(cx, cy, p, cls) {
    var c = '<g' + (cls ? ' class="' + cls + '"' : '') + '>';
    if (p === 0) {
      c += '<circle cx="' + cx + '" cy="' + cy + '" r="17" fill="#FBF8F2" stroke="#7B7064" stroke-width="2"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="none" stroke="#CFC5B2" stroke-width="2"/>';
    } else {
      c += '<circle cx="' + cx + '" cy="' + cy + '" r="17" fill="#2B2622" stroke="#C99A2E" stroke-width="2.5"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="10.5" fill="none" stroke="#C99A2E" stroke-width="2" stroke-dasharray="3.5 3"/>';
    }
    return c + "</g>";
  }
  function stackPositions(g, n) {
    var avail = G.len - 6 - G.rad * 2;
    var sp = n > 1 ? Math.min(G.rad * 2, avail / (n - 1)) : 0;
    var out = [];
    for (var k = 0; k < n; k++) out.push({ x: g.base + g.dir * (G.rad + 3 + k * sp), y: g.y + G.rowH / 2 });
    return out;
  }

  function legalInfo() {
    var s = app.s, info = { moves: [], sources: {}, dests: {} };
    if (!s || s.phase !== "move" || !isHuman(s.turn)) return info;
    info.moves = L.legalMoves(s);
    info.moves.forEach(function (m) {
      info.sources[m.from] = true;
      if (app.sel !== null && String(m.from) === String(app.sel)) info.dests[m.to] = m;
    });
    return info;
  }

  function renderBoard() {
    var s = app.s, info = legalInfo(), p = s.turn;
    var h = "";
    h += '<rect x="0" y="0" width="400" height="608" rx="14" fill="#E7DCC6"/>';
    h += '<rect x="2" y="2" width="396" height="604" rx="13" fill="none" stroke="#2F4B35" stroke-width="3"/>';
    // points
    for (var i = 0; i < 24; i++) {
      var g = pointGeom(i);
      var col = (i % 2 === 0) ? "#D9663A" : "#8FA58A";
      h += '<polygon points="' + g.base + "," + g.y + " " + g.base + "," + (g.y + G.rowH) + " " + (g.base + g.dir * G.len) + "," + (g.y + G.rowH / 2) + '" fill="' + col + '" opacity="0.92"/>';
    }
    // bar band
    h += '<rect x="4" y="' + G.barY + '" width="392" height="' + G.barH + '" fill="#2F4B35" opacity="0.9"/>';
    h += '<text x="200" y="' + (G.barY + G.barH / 2 + 4) + '" text-anchor="middle" font-size="11" letter-spacing="3" fill="#F5F0E6" opacity="0.55">BAR</text>';
    // last move highlight
    if (app.last) {
      [app.last.from, app.last.to].forEach(function (x) {
        if (typeof x === "number") {
          var lg = pointGeom(x);
          h += '<rect x="' + (lg.left ? G.lx : 206) + '" y="' + lg.y + '" width="190" height="' + G.rowH + '" fill="#C99A2E" opacity="0.32"/>';
        }
      });
    }
    // point numbers (from the view of the side to move)
    var vp = s.phase === "over" ? 0 : (app.mode === "2p" ? p : 0);
    for (var j = 0; j < 24; j++) {
      var gg = pointGeom(j);
      var tx = gg.base + gg.dir * (G.len - 15), ty = gg.y + G.rowH / 2;
      h += '<rect x="' + (tx - 11) + '" y="' + (ty - 8) + '" width="22" height="16" rx="8" fill="#FBF8F2" opacity="0.88"/>' +
        '<text x="' + tx + '" y="' + (ty + 4) + '" text-anchor="middle" font-size="11" font-weight="500" fill="#2B2622">' + L.pointNo(vp, j) + "</text>";
    }
    // destination highlights
    Object.keys(info.dests).forEach(function (key) {
      var m = info.dests[key];
      if (m.to === "off") return;
      var dg = pointGeom(m.to);
      h += '<rect x="' + (dg.left ? G.lx : 206) + '" y="' + dg.y + '" width="190" height="' + G.rowH + '" fill="#2F4B35" opacity="0.28"/>';
    });
    // checkers on points
    for (var q = 0; q < 24; q++) {
      var v = s.pts[q]; if (!v) continue;
      var owner = v > 0 ? 0 : 1, n = Math.abs(v), pg = pointGeom(q), pos = stackPositions(pg, n);
      for (var k = 0; k < n; k++) {
        var top = k === n - 1;
        var isSrc = top && owner === p && info.sources[q] && s.phase === "move";
        var isSel = isSrc && app.sel !== null && String(app.sel) === String(q);
        if (isSel) h += '<circle cx="' + pos[k].x + '" cy="' + pos[k].y + '" r="21.5" fill="none" stroke="#C99A2E" stroke-width="4"/>';
        else if (isSrc) h += '<circle class="pulse" cx="' + pos[k].x + '" cy="' + pos[k].y + '" r="21" fill="none" stroke="#C99A2E" stroke-width="3"/>';
        h += checkerSVG(pos[k].x, pos[k].y, owner);
        if (top && n > 5) h += '<text x="' + pos[k].x + '" y="' + (pos[k].y + 5) + '" text-anchor="middle" font-size="14" font-weight="500" fill="' + (owner === 0 ? "#2B2622" : "#F5F0E6") + '">' + n + "</text>";
      }
    }
    // destination markers
    Object.keys(info.dests).forEach(function (key) {
      var m = info.dests[key];
      if (m.to === "off") return;
      var dg = pointGeom(m.to), cnt = Math.abs(s.pts[m.to]);
      var slot = m.hit ? 0 : Math.min(cnt, 5);
      var cx = dg.base + dg.dir * (G.rad + 3 + slot * (G.rad * 2 - 2)), cy = dg.y + G.rowH / 2;
      if (m.hit) h += '<circle cx="' + cx + '" cy="' + cy + '" r="21" fill="none" stroke="#D9663A" stroke-width="4"/>';
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="#2F4B35" stroke="#F5F0E6" stroke-width="2.5"/>';
    });
    // bar checkers
    [0, 1].forEach(function (pl) {
      var n = s.bar[pl]; if (!n) return;
      var cx0 = pl === 0 ? 102 : 298, sp = Math.min(24, 150 / Math.max(1, n - 1));
      var start = cx0 - (n - 1) * sp / 2;
      var cy = G.barY + G.barH / 2;
      var srcBar = pl === p && info.sources.bar;
      var selBar = srcBar && app.sel === "bar";
      for (var k = 0; k < n; k++) {
        var x = start + k * sp;
        if (k === n - 1 && srcBar) h += '<circle ' + (selBar ? "" : 'class="pulse" ') + 'cx="' + x + '" cy="' + cy + '" r="' + (selBar ? 21.5 : 21) + '" fill="none" stroke="#C99A2E" stroke-width="' + (selBar ? 4 : 3) + '"/>';
        h += checkerSVG(x, cy, pl);
      }
    });
    // trays
    [1, 0].forEach(function (pl) {
      var x0 = pl === 0 ? 206 : 4;
      var dest = info.dests.off && pl === p;
      h += '<rect x="' + x0 + '" y="' + G.trayY + '" width="190" height="' + G.trayH + '" rx="8" fill="' + (dest ? "#2F4B35" : "#D9CDB4") + '" opacity="' + (dest ? 0.5 : 0.7) + '"/>';
      var n = s.off[pl];
      for (var k = 0; k < n; k++) {
        var bx = x0 + 8 + k * 10.8;
        h += '<rect x="' + bx + '" y="' + (G.trayY + 8) + '" width="8" height="28" rx="2" fill="' + (pl === 0 ? "#FBF8F2" : "#2B2622") + '" stroke="' + (pl === 0 ? "#7B7064" : "#C99A2E") + '" stroke-width="1.5"/>';
      }
      if (!n) h += '<text x="' + (x0 + 95) + '" y="' + (G.trayY + 27) + '" text-anchor="middle" font-size="11" letter-spacing="3" fill="#7B7064">OFF</text>';
      if (dest) h += '<circle cx="' + (x0 + 95) + '" cy="' + (G.trayY + 22) + '" r="10" fill="#2F4B35" stroke="#F5F0E6" stroke-width="2.5"/>';
    });
    // hit areas
    for (var a = 0; a < 24; a++) {
      var ag = pointGeom(a);
      h += '<rect data-i="' + a + '" x="' + (ag.left ? G.lx : 206) + '" y="' + ag.y + '" width="190" height="' + G.rowH + '" fill="transparent"/>';
    }
    h += '<rect data-i="bar" x="4" y="' + G.barY + '" width="392" height="' + G.barH + '" fill="transparent"/>';
    h += '<rect data-i="off" x="' + (p === 0 ? 206 : 4) + '" y="' + G.trayY + '" width="190" height="' + G.trayH + '" fill="transparent"/>';
    $("board").innerHTML = h;
  }

  // ---------- dice ----------
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(v, cls, tag, val) {
    var h = '<div class="die ' + (cls || "") + '"' + (val ? ' data-die="' + val + '"' : "") + ' aria-label="' + (v ? "die " + v : "no die") + '">';
    for (var i = 0; i < 9; i++) h += '<span class="pip' + (v && PIPS[v].indexOf(i) >= 0 ? " on" : "") + '"></span>';
    if (tag) h += '<span class="tag">' + tag + "</span>";
    return h + "</div>";
  }
  function renderDice() {
    var s = app.s, h = "";
    var tumble = app.tumble && !reduced ? " tumble" : "";
    var blk = s.turn === 1 ? " black" : "";
    if (s.phase === "opening") {
      var od = s.opening ? s.opening.dice : null;
      h += dieHTML(od ? od[0] : 0, od ? "" : "empty", nameOf(0)) + dieHTML(od ? od[1] : 0, od ? "black" : "empty", nameOf(1));
      if (od) h = h.replace(/class="die /g, 'class="die' + tumble + " ");
    } else if (s.phase === "move") {
      var rem = s.remaining.slice();
      var canTap = isHuman(s.turn);
      s.dice.forEach(function (d) { /* placeholder to keep order */ });
      var list = s.dice[0] === s.dice[1] ? [s.dice[0], s.dice[0], s.dice[0], s.dice[0]] : s.dice.slice();
      list.forEach(function (d) {
        var i = rem.indexOf(d), used = i < 0;
        if (!used) rem.splice(i, 1);
        h += dieHTML(d, (used ? "used " : "") + blk.trim() + tumble + (canTap && !used ? " tap" : ""), "", used ? 0 : d);
      });
    } else if (s.dice.length) {
      var l2 = s.dice[0] === s.dice[1] ? [s.dice[0], s.dice[0], s.dice[0], s.dice[0]] : s.dice.slice();
      l2.forEach(function (d) { h += dieHTML(d, "used " + (s.turn === 0 ? "black" : "").trim(), ""); });
      h = '<span class="hint" style="margin:0">Last roll</span>' + h;
    } else h = dieHTML(0, "empty") + dieHTML(0, "empty");
    $("dice").innerHTML = h;
    app.tumble = false;
  }

  // ---------- status, score, controls ----------
  function pipsOf(p) { return L.pipCount(L.posOf(app.s), p); }
  function renderScore() {
    var s = app.s, h = "";
    [0, 1].forEach(function (p) {
      h += '<div class="pl p' + p + (s.turn === p && s.phase !== "over" && s.phase !== "opening" ? " turn" : "") + '">' +
        '<div class="nm"><i></i>' + nameOf(p) + "</div>" +
        '<div class="st">Pips ' + pipsOf(p) + " | Off " + s.off[p] + (s.bar[p] ? " | Bar " + s.bar[p] : "") + "</div></div>";
      if (p === 0) {
        var mid = "";
        if (s.cube.on) mid += '<span class="cube own' + (s.cube.owner === null ? "x" : s.cube.owner) + '" title="Doubling cube">' + (s.cube.value === 1 && s.cube.owner === null ? 64 : s.cube.value) + "</span>";
        if (s.match) mid += "<span>To " + s.match.target + "<br>" + s.match.score[0] + " : " + s.match.score[1] + (s.crawfordGame ? "<br>Crawford" : "") + "</span>";
        else if (!s.cube.on) mid += "<span>Single<br>game</span>";
        h += '<div class="mid">' + mid + "</div>";
      }
    });
    $("score").innerHTML = h;
  }
  function lastRollNote() {
    var s = app.s, e = s.log[s.log.length - 1];
    return e && e.p === -1 && /tied/.test(e.text) ? e : null;
  }
  function renderStatus() {
    var s = app.s, t = "", info;
    var me = nameOf(s.turn);
    if (s.phase === "over") {
      t = "<b>" + nameOf(s.result.winner) + (app.mode === "2p" ? " wins" : (s.result.winner === 0 ? " win" : " wins")) + "</b>";
    } else if (s.phase === "opening") {
      t = lastRollNote() ? "Tie " + s.opening.dice[0] + "-" + s.opening.dice[1] + ". Roll again." : "Roll to see who starts.";
    } else if (s.phase === "double") {
      t = nameOf(s.offer.by) + (app.mode === "2p" || s.offer.by === 1 ? " doubles" : " double") + " to " + s.cube.value * 2 + ". " + (isHuman(1 - s.offer.by) ? (app.mode === "2p" ? nameOf(1 - s.offer.by) + ": take or pass?" : "Take or pass?") : nameOf(1 - s.offer.by) + " is deciding...");
    } else if (s.phase === "roll") {
      t = isHuman(s.turn) ? (app.mode === "cpu" ? "Your turn. Roll the dice." : me + " to roll.") : "Computer is rolling...";
    } else {
      var legal = L.legalMoves(s);
      if (!isHuman(s.turn)) t = "Computer is moving...";
      else if (s.maxUse === 0) t = (app.mode === "cpu" ? "<b>No legal move.</b> Your turn passes." : "<b>" + me + ": no legal move.</b> Turn passes.");
      else if (legal.length === 0) t = "All dice played. End turn, or Undo.";
      else if (s.bar[s.turn] > 0) t = (app.mode === "cpu" ? "You are on the bar. " : me + " is on the bar. ") + "Tap the highlighted checker to enter.";
      else if (legal.length === 1) t = "Only one move is possible. Tap the glowing checker, then its green dot, or tap the die.";
      else if (app.sel !== null) t = "Tap a green dot to move there.";
      else t = (app.mode === "cpu" ? "" : me + ": ") + "Tap a glowing checker to pick it up. " + s.remaining.length + (s.remaining.length === 1 ? " die" : " dice") + " left.";
    }
    $("status").innerHTML = t;
  }
  function renderControls() {
    var s = app.s, main = $("mainBtn"), undo = $("undoBtn"), dbl = $("dblBtn");
    var human = isHuman(s.turn), canEnd = L.canEnd(s);
    main.hidden = false; main.disabled = false;
    main.dataset.act = "";
    if (s.phase === "over") { main.textContent = s.match && s.match.winner === null ? "Next game" : "Back to menu"; main.dataset.act = "over"; }
    else if (s.phase === "double") { main.hidden = true; }
    else if (s.phase === "opening") { main.textContent = "Roll to start"; main.dataset.act = "roll"; }
    else if (s.phase === "roll") {
      if (human) { main.textContent = "Roll dice"; main.dataset.act = "roll"; } else { main.textContent = "Computer's turn"; main.disabled = true; }
    } else if (!human) { main.textContent = "Computer's turn"; main.disabled = true; }
    else if (canEnd) { main.textContent = s.maxUse === 0 ? "Continue" : "End turn"; main.dataset.act = "end"; }
    else { main.textContent = "Move your checkers"; main.disabled = true; }
    undo.disabled = !(s.phase === "move" && human && s.played.length > 0);
    undo.hidden = false;
    var cd = L.canDouble(s) && human;
    dbl.hidden = !(s.cube.on && cd);
    dbl.textContent = "Double to " + s.cube.value * 2;
  }
  function renderLog() {
    var s = app.s, h = "", n = 0;
    s.log.forEach(function (e) {
      if (e.p === -1) h += '<li><span class="note">' + e.text + "</span></li>";
      else if (e.dice.length) { n++; h += '<li><span class="who">' + nameOf(e.p) + '</span><span class="dd">' + e.dice[0] + "-" + e.dice[1] + "</span><span>" + e.text + "</span></li>"; }
      else h += '<li><span class="who">' + nameOf(e.p) + '</span><span class="note">' + e.text + "</span></li>";
    });
    if (s.phase === "move" && s.played.length) h += '<li><span class="who">' + nameOf(s.turn) + '</span><span class="dd">' + s.dice[0] + "-" + s.dice[1] + "</span><span>" + L.notation(s.turn, s.played) + " ...</span></li>";
    var ol = $("log"); ol.innerHTML = h || '<li><span class="note">No moves yet.</span></li>';
    ol.scrollTop = ol.scrollHeight;
  }
  function renderModal() {
    var s = app.s;
    if (s.phase === "double" && isHuman(1 - s.offer.by)) {
      var who = nameOf(s.offer.by), me = nameOf(1 - s.offer.by);
      openModal(app.mode === "cpu" ? "Computer doubles" : who + " doubles",
        "<p>" + (app.mode === "cpu" ? "The computer offers to double the stakes to " : who + " offers to double the stakes to ") + s.cube.value * 2 + ".</p><p>Take and you own the cube. Pass and " + (app.mode === "cpu" ? "you lose " : me + " loses ") + s.cube.value + (s.cube.value === 1 ? " point" : " points") + ".</p>",
        [{ label: "Pass", fn: function () { L.dropDouble(s); commit(); } }, { label: "Take", cls: "primary", fn: function () { L.takeDouble(s); commit(); } }],
        "dbl" + s.turnNo + "_" + s.log.length);
    } else if (s.phase === "over") {
      var r = s.result, w = nameOf(r.winner);
      var kind = r.kind === "gammon" ? "Gammon! " : r.kind === "backgammon" ? "Backgammon! " : "";
      var body = "<p>" + w + (app.mode === "cpu" && r.winner === 0 ? " win " : " wins ") + r.points + (r.points === 1 ? " point" : " points") + (r.kind === "pass" ? " (the double was passed)" : "") + ".</p>";
      if (r.cube > 1) body += "<p>Cube was at " + r.cube + ".</p>";
      var btns;
      if (s.match) {
        body += "<p>Match to " + s.match.target + ": " + nameOf(0) + " " + s.match.score[0] + ", " + nameOf(1) + " " + s.match.score[1] + ".</p>";
        if (s.match.winner !== null) {
          body += "<p><b>" + nameOf(s.match.winner) + (app.mode === "cpu" && s.match.winner === 0 ? " win the match!" : " wins the match!") + "</b></p>";
          btns = [{ label: "Close" }, { label: "New game", cls: "primary", fn: toMenu }];
        } else btns = [{ label: "Close" }, { label: "Next game", cls: "primary", fn: nextMatchGame }];
      } else btns = [{ label: "Close" }, { label: "New game", cls: "primary", fn: toMenu }];
      openModal(kind + (r.winner === 0 && app.mode === "cpu" ? "You won" : app.mode === "cpu" ? "Computer won" : w + " won"), body, btns, "over" + s.log.length);
    } else if (app.modalKey && /^(dbl|over)/.test(app.modalKey)) closeModal();
  }
  function nextMatchGame() {
    var n = L.nextGame(app.s);
    if (!n) return toMenu();
    app.s = n; app.sel = null; app.last = null;
    commit();
  }

  function render() {
    renderScore(); renderStatus(); renderBoard(); renderDice(); renderControls(); renderLog(); renderModal();
    $("seedNote").textContent = "Seed " + app.s.seed + ". Add ?seed=" + app.s.seed + " to the address to replay the dice of this game.";
  }

  // ---------- flow ----------
  function autoSelect() {
    var s = app.s;
    if (s.phase !== "move" || !isHuman(s.turn)) { app.sel = null; return; }
    var ms = L.legalMoves(s), srcs = {};
    ms.forEach(function (m) { srcs[m.from] = true; });
    var keys = Object.keys(srcs);
    if (app.sel !== null && !srcs[app.sel]) app.sel = null;
    if (keys.length === 1) app.sel = keys[0] === "bar" ? "bar" : Number(keys[0]);
  }
  function commit() {
    var s = app.s;
    autoSelect();
    if (s.phase === "over") recordResult(s);
    save();
    render();
    tick();
  }

  function tick() {
    var s = app.s, gen = ++app.gen;
    clearTimeout(app.timer);
    if (!s || s.phase === "over") return;
    var slow = reduced ? 350 : 750;
    function later(ms, fn) { app.timer = setTimeout(function () { if (gen === app.gen) fn(); }, ms); }
    if (s.phase === "move") {
      if (L.canEnd(s)) {
        if (!isHuman(s.turn)) later(reduced ? 300 : 700, function () { L.endTurn(s); app.last = app.last; commit(); });
        else if (s.maxUse === 0) later(1700, function () { L.endTurn(s); commit(); });
        return;
      }
      if (!isHuman(s.turn)) {
        later(slow, function () {
          var plan = L.chooseTurn(s);
          if (!plan.length) { L.endTurn(s); commit(); return; }
          var m = plan[0];
          var ok = L.move(s, m);
          app.last = { from: m.from, to: m.to, p: s.turn };
          if (!ok) { L.endTurn(s); }
          commit();
        });
      }
      return;
    }
    if (s.phase === "roll" && !isHuman(s.turn)) {
      later(slow, function () {
        if (L.aiShouldDouble(s)) { L.offerDouble(s); commit(); }
        else { app.last = null; L.roll(s); app.tumble = true; commit(); }
      });
      return;
    }
    if (s.phase === "double" && !isHuman(1 - s.offer.by)) {
      later(slow + 400, function () { if (L.aiShouldTake(s)) L.takeDouble(s); else L.dropDouble(s); commit(); });
    }
  }

  function rollAction() {
    var s = app.s;
    if (!(s.phase === "opening" || (s.phase === "roll" && isHuman(s.turn)))) return;
    app.last = null;
    L.roll(s);
    app.tumble = true;
    commit();
  }
  function endAction() {
    var s = app.s;
    if (s.phase === "move" && isHuman(s.turn) && L.canEnd(s)) { app.sel = null; L.endTurn(s); commit(); }
  }
  $("mainBtn").addEventListener("click", function () {
    var a = $("mainBtn").dataset.act;
    if (a === "roll") rollAction();
    else if (a === "end") endAction();
    else if (a === "over") { if (app.s.match && app.s.match.winner === null) nextMatchGame(); else toMenu(); }
  });
  $("undoBtn").addEventListener("click", function () {
    var s = app.s;
    if (s.phase === "move" && isHuman(s.turn) && L.undo(s)) { app.sel = null; commit(); }
  });
  $("dblBtn").addEventListener("click", function () {
    var s = app.s;
    if (L.canDouble(s) && isHuman(s.turn) && L.offerDouble(s)) commit();
  });

  function doMove(m) {
    var s = app.s;
    if (L.move(s, m)) { app.last = null; app.sel = null; commit(); }
  }
  function pickMove(list) {
    // same from and to with different dice (bearing off): use the smallest die
    return list.slice().sort(function (a, b) { return a.die - b.die; })[0];
  }
  function onPoint(raw) {
    var s = app.s;
    if (s.phase !== "move" || !isHuman(s.turn)) return;
    var i = raw === "bar" || raw === "off" ? raw : Number(raw);
    var ms = L.legalMoves(s);
    if (app.sel !== null) {
      var dm = ms.filter(function (m) { return String(m.from) === String(app.sel) && String(m.to) === String(i); });
      if (dm.length) return doMove(pickMove(dm));
    }
    if (i === "off") return;
    var isSrc = ms.some(function (m) { return String(m.from) === String(i); });
    if (isSrc) app.sel = (app.sel !== null && String(app.sel) === String(i)) ? null : i;
    else app.sel = null;
    autoSelect();
    render();
  }
  $("board").addEventListener("click", function (e) {
    var t = e.target.closest("[data-i]");
    if (t) onPoint(t.getAttribute("data-i"));
  });
  $("dice").addEventListener("click", function (e) {
    var d = e.target.closest("[data-die]");
    if (!d) return;
    var s = app.s;
    if (s.phase !== "move" || !isHuman(s.turn)) return;
    var v = Number(d.getAttribute("data-die"));
    var ms = L.legalMoves(s).filter(function (m) { return m.die === v; });
    if (app.sel !== null) {
      var fromSel = ms.filter(function (m) { return String(m.from) === String(app.sel); });
      if (fromSel.length === 1) return doMove(fromSel[0]);
    }
    if (ms.length === 1) return doMove(ms[0]);
    if (ms.length === 0) { $("status").innerHTML = "That die has no legal move right now."; return; }
    $("status").innerHTML = "Pick a checker to move " + v + ". " + ms.length + " moves possible.";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("modal").hidden && /^(leave|reset)$/.test(app.modalKey)) closeModal();
  });

  // ---------- boot ----------
  renderMenu();
  window.__bg = { app: app, L: L };
})();
