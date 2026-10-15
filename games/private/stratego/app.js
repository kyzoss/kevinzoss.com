(function () {
  "use strict";
  var L = window.StrategoLogic;
  var RED = L.RED, BLUE = L.BLUE;
  var KEY_SAVE = "kz.stratego.save.v1", KEY_TALLY = "kz.stratego.tally.v1";
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  // ---------- storage (every access guarded) ----------
  function store(op, k, v) {
    try {
      if (op === "get") return window.localStorage.getItem(k);
      if (op === "set") window.localStorage.setItem(k, v);
      if (op === "del") window.localStorage.removeItem(k);
    } catch (e) {}
    return null;
  }
  function jget(k, d) { try { var t = store("get", k); return t ? JSON.parse(t) : d; } catch (e) { return d; } }
  function $(id) { return document.getElementById(id); }

  var app = { s: null, sel: null, trayRank: null, selCell: null, busy: false, undo: null, reveal: false, tallied: false, last: null, timer: 0 };
  var seedFromUrl = null;
  try {
    var m = /[?&]seed=(-?\d+)/.exec(window.location.search);
    if (m) seedFromUrl = parseInt(m[1], 10) | 0;
  } catch (e) {}
  function pickSeed() { return seedFromUrl !== null ? seedFromUrl : (Date.now() & 0x7fffffff); }

  // ---------- tally ----------
  function tally() { var t = jget(KEY_TALLY, null); return t && typeof t.w === "number" ? t : { w: 0, l: 0, d: 0 }; }
  function renderTally() {
    var t = tally();
    $("tally").innerHTML = "<div><b>" + t.w + "</b><span>wins</span></div><div><b>" + t.l + "</b><span>losses</span></div><div><b>" + t.d + "</b><span>draws</span></div>";
  }
  function bumpTally(winner) {
    var t = tally();
    if (winner === RED) t.w++; else if (winner === BLUE) t.l++; else t.d++;
    store("set", KEY_TALLY, JSON.stringify(t));
  }

  // ---------- save ----------
  function save() {
    if (!app.s) return;
    store("set", KEY_SAVE, JSON.stringify({ s: app.s, tallied: app.tallied, reveal: app.reveal }));
  }
  function loadSave() {
    var sv = jget(KEY_SAVE, null);
    if (!sv || !sv.s || sv.s.v !== 1 || !sv.s.board || sv.s.board.length !== 100) return null;
    return sv;
  }

  // ---------- art ----------
  var COL = {
    0: { fill: "#B4452F", stroke: "#6B2315", ink: "#FFF6EA" },
    1: { fill: "#3A5C8A", stroke: "#1D3556", ink: "#FFF6EA" }
  };
  function shape(o) {
    var c = COL[o];
    if (o === RED) return '<rect x="3.5" y="3.5" width="33" height="33" rx="7" fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="2"/>';
    return '<polygon points="12,3.5 28,3.5 36.5,12 36.5,28 28,36.5 12,36.5 3.5,28 3.5,12" fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="2"/>' +
      '<polygon points="13,7.5 27,7.5 32.5,13 32.5,27 27,32.5 13,32.5 7.5,27 7.5,13" fill="none" stroke="rgba(255,246,234,0.35)" stroke-width="1"/>';
  }
  // 40x40 piece art. mode: "face" shows the rank, "hidden" shows a face-down piece.
  function pieceArt(o, rank, mode, moved, ghost) {
    var c = COL[o], g = '<g class="pc"' + (ghost ? ' opacity="0.8"' : "") + ">" + shape(o);
    if (mode === "hidden") {
      g += '<path d="M20 11 L29 20 L20 29 L11 20 Z" fill="none" stroke="rgba(255,246,234,0.55)" stroke-width="2"/>';
      g += '<circle cx="20" cy="20" r="2.4" fill="rgba(255,246,234,0.55)"/>';
      if (moved) g += '<circle cx="31" cy="9.5" r="2.8" fill="#C99A2E" stroke="#6B4E10" stroke-width="0.8"/>';
      return g + "</g>";
    }
    if (rank === L.BOMB) {
      g += '<circle cx="19" cy="23" r="9.5" fill="#1F1B18"/><circle cx="15.5" cy="19.5" r="2.4" fill="rgba(255,255,255,0.5)"/>' +
        '<path d="M24 15.5 Q27 11 30 11" fill="none" stroke="#E6D3A3" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M30 7 L31.3 10 L34.5 11 L31.3 12 L30 15 L28.7 12 L25.5 11 L28.7 10 Z" fill="#E8B83A"/>';
    } else if (rank === L.FLAG) {
      g += '<path d="M13 8 L13 32" stroke="' + c.ink + '" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M13.5 9 L30.5 14.5 L13.5 21 Z" fill="#E8B83A" stroke="#7A5A10" stroke-width="1"/>' +
        '<path d="M9 32 L21 32" stroke="' + c.ink + '" stroke-width="2.4" stroke-linecap="round"/>';
    } else if (rank === L.SPY) {
      g += '<path d="M9.5 14 Q20 5 30.5 14 Q20 23 9.5 14 Z" fill="none" stroke="' + c.ink + '" stroke-width="1.8"/>' +
        '<circle cx="20" cy="14" r="3.2" fill="' + c.ink + '"/>' +
        '<text x="20" y="34" text-anchor="middle" font-size="15" fill="' + c.ink + '">S</text>';
    } else {
      g += '<text x="20" y="' + (rank === 10 ? 26.5 : 27.5) + '" text-anchor="middle" font-size="' + (rank === 10 ? 19 : 23) + '" fill="' + c.ink + '">' + rank + "</text>";
    }
    return g + "</g>";
  }
  function tile(o, rank, mode, size) {
    return '<svg class="tile" viewBox="0 0 40 40" width="' + (size || 28) + '" height="' + (size || 28) + '" aria-hidden="true">' + pieceArt(o, rank, mode || "face", false, false) + "</svg>";
  }

  var LAKE_WAVES = "";
  function lakeSvg(x, y) {
    var s = '<rect x="' + x + '" y="' + y + '" width="80" height="80" rx="9" fill="#5C8F93" stroke="#3E6B70" stroke-width="2"/>';
    for (var k = 0; k < 3; k++) {
      var yy = y + 20 + k * 22;
      s += '<path d="M' + (x + 10) + " " + yy + " q10 -8 20 0 t20 0 t20 0" + '" fill="none" stroke="rgba(235,248,246,0.6)" stroke-width="2.2" stroke-linecap="round"/>';
    }
    return s;
  }

  // ---------- board rendering ----------
  function cellLabel(s, i, showAll) {
    var p = s.board[i], r = Math.floor(i / 10) + 1, c = (i % 10) + 1;
    var t = "Row " + r + ", column " + c;
    if (L.isLake(i)) return t + ", lake";
    if (!p) return t + ", empty";
    if (p.o === RED || p.rev || showAll) return t + ", " + (p.o === RED ? "Red " : "Blue ") + L.NAMES[p.r];
    return t + ", Blue piece, face down";
  }
  function drawBoard(s, opts) {
    // opts: sel, dests (array), last {from,to}, reveal, setup
    var out = "", i, x, y, p;
    var dset = {}; (opts.dests || []).forEach(function (d) { dset[d] = 1; });
    for (i = 0; i < 100; i++) {
      x = (i % 10) * 40; y = Math.floor(i / 10) * 40;
      var dark = ((i % 10) + Math.floor(i / 10)) % 2 === 1;
      var fill = dark ? "#DDCCA8" : "#E8DBBE";
      if (opts.setup && L.inHome(RED, i)) fill = dark ? "#D6D2A5" : "#E2DFB5";
      out += '<rect x="' + x + '" y="' + y + '" width="40" height="40" fill="' + fill + '"/>';
    }
    out += lakeSvg(80, 160) + lakeSvg(240, 160);
    if (opts.last) {
      [opts.last.from, opts.last.to].forEach(function (k) {
        out += '<rect x="' + (k % 10) * 40 + '" y="' + Math.floor(k / 10) * 40 + '" width="40" height="40" fill="rgba(201,154,46,0.38)"/>';
      });
    }
    for (i = 0; i < 100; i++) {
      p = s.board[i];
      x = (i % 10) * 40; y = Math.floor(i / 10) * 40;
      if (!p) continue;
      var face = p.o === RED || p.rev || opts.reveal;
      var ghost = p.o === BLUE && !p.rev && opts.reveal;
      out += '<g transform="translate(' + x + " " + y + ')">' + pieceArt(p.o, p.r, face ? "face" : "hidden", p.mv, ghost) + "</g>";
    }
    (opts.dests || []).forEach(function (d) {
      var cx = (d % 10) * 40 + 20, cy = Math.floor(d / 10) * 40 + 20;
      if (s.board[d]) out += '<rect x="' + (cx - 19) + '" y="' + (cy - 19) + '" width="38" height="38" rx="8" fill="rgba(217,102,58,0.25)" stroke="#D9663A" stroke-width="3.2" class="pulse"/>';
      else out += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="#2F4B35" fill-opacity="0.85" stroke="#F5F0E6" stroke-width="1.6" class="pulse"/>';
    });
    if (opts.sel !== null && opts.sel !== undefined && opts.sel >= 0) {
      out += '<rect x="' + (opts.sel % 10) * 40 + '" y="' + Math.floor(opts.sel / 10) * 40 + '" width="40" height="40" fill="none" stroke="#C99A2E" stroke-width="4"/>';
    }
    out += '<rect x="0" y="0" width="400" height="400" fill="none" stroke="#8C7B5E" stroke-width="3"/>';
    for (i = 0; i < 100; i++) {
      x = (i % 10) * 40; y = Math.floor(i / 10) * 40;
      out += '<rect data-i="' + i + '" x="' + x + '" y="' + y + '" width="40" height="40" fill="transparent" aria-label="' + cellLabel(s, i, opts.reveal) + '"/>';
    }
    return out;
  }

  // ---------- rules text ----------
  function rulesHtml() {
    var legend = "";
    var order = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 11, 0];
    var desc = { 10: "strongest", 9: "", 8: "", 7: "", 6: "", 5: "", 4: "", 3: "defuses bombs", 2: "moves far", 1: "kills the 10 if it attacks", 11: "never moves", 0: "capture it to win" };
    order.forEach(function (r) {
      var lab = r === 11 ? "Bomb" : r === 0 ? "Flag" : r === 1 ? "Spy (S)" : L.NAMES[r] + " (" + r + ")";
      legend += "<li>" + tile(RED, r, "face", 30) + "<span>" + lab + (desc[r] ? "<br><small>" + desc[r] + "</small>" : "") + "</span></li>";
    });
    var counts = "1 Flag, 6 Bombs, 1 Spy, 8 Scouts, 5 Miners, 4 Sergeants, 4 Lieutenants, 4 Captains, 3 Majors, 2 Colonels, 1 General, 1 Marshal";
    return '<details class="card rules"><summary>How to play</summary><div class="body">' +
      "<h3>Goal</h3><p>Capture the enemy Flag, or leave the enemy with no piece that can move on their turn.</p>" +
      "<h3>Rank legend</h3><p>A higher number is stronger: Marshal (10) is the strongest, Scout (2) the weakest numbered piece. Red pieces are rounded squares, Blue pieces are eight-sided, so you can tell them apart without colour.</p>" +
      '<ul class="legend">' + legend + "</ul>" +
      "<h3>Army</h3><p>Each side has 40 pieces: " + counts + ".</p>" +
      "<h3>Board and setup</h3><ul>" +
      "<li>10 by 10 board with two 2 by 2 lakes (columns 3-4 and 7-8 on rows 5-6) that nobody can enter or cross.</li>" +
      "<li>You are Red and arrange your 40 pieces on rows 7 to 10 (the bottom four). Blue takes rows 1 to 4. Tap a piece in the tray and then a cell to place it. With no tray piece selected, tap a placed piece and then another placed piece (or an empty cell of yours) to swap or move. Buttons: Random, Defensive (flag on the back row ringed by bombs), Aggressive, Clear. Start unlocks when all 40 are placed.</li>" +
      "<li>Blue's pieces stay face down until a battle reveals them.</li></ul>" +
      "<h3>Moving</h3><ul>" +
      "<li>Red moves first, then you alternate. Each turn move exactly one piece one square up, down, left or right, onto an empty square or onto an enemy piece (an attack).</li>" +
      "<li>Bombs and the Flag never move.</li>" +
      "<li>Scouts may move any number of empty squares in a straight line and may attack at the end of that move. A scout that moves more than one square is revealed as a scout.</li></ul>" +
      "<h3>Battles</h3><ul>" +
      "<li>The higher rank wins and stays on the square. The loser is removed.</li>" +
      "<li>Equal ranks: both are removed.</li>" +
      "<li>The Spy beats the Marshal, but only when the Spy attacks. If the Marshal attacks the Spy, the Marshal wins.</li>" +
      "<li>Any piece that attacks a Bomb is lost, except a Miner, which defuses the Bomb and moves onto its square. A Bomb that is attacked beats everything except a Miner.</li>" +
      "<li>Capturing the Flag wins at once.</li>" +
      "<li>After a battle both pieces involved are face up from then on (a surviving piece stays revealed, a Bomb that won is revealed). The Graveyard lists captured pieces for both sides.</li></ul>" +
      "<h3>Repetition and draws</h3><ul>" +
      "<li>Two-square rule: a piece may not move back and forth between the same two squares more than 3 times in a row. The fourth back-and-forth move is not allowed. Moving a different piece or going elsewhere resets the count.</li>" +
      "<li>The \"more squares\" chase rule is not used. Instead, if 300 moves in a row (150 each) pass with no attack at all, the game is a draw.</li></ul>" +
      "<h3>Undo and reveal</h3><ul>" +
      "<li>Undo takes back your last move and the computer's reply, but only if neither move was an attack or a scout's long move, because that would leak information.</li>" +
      "<li>When the game ends, Reveal opponent shows every Blue piece.</li></ul>" +
      "<h3>The computer</h3><p>Blue never looks at your hidden ranks. It only knows what battles have revealed and which of your pieces have moved.</p>" +
      "</div></details>";
  }
  function fillRules() {
    var slots = document.querySelectorAll(".rules-slot");
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = rulesHtml();
  }

  // ---------- screens ----------
  function show(id) {
    ["menu", "setup", "game"].forEach(function (k) { $(k).hidden = k !== id; });
    window.scrollTo(0, 0);
  }
  function showMenu() {
    clearTimeout(app.timer); app.busy = false;
    show("menu");
    renderTally();
    var sv = loadSave(), b = $("resume");
    if (sv && sv.s.phase !== "over") {
      b.hidden = false;
      b.textContent = sv.s.phase === "setup" ? "Resume setup" : "Resume game (move " + (Math.floor(sv.s.ply / 2) + 1) + ")";
    } else b.hidden = true;
  }

  // ---------- modal ----------
  function modal(title, bodyHtml, buttons) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = bodyHtml;
    var box = $("modalBtns"); box.innerHTML = "";
    buttons.forEach(function (bt) {
      var el = document.createElement("button");
      el.className = "btn" + (bt.primary ? " primary" : ""); el.textContent = bt.label;
      el.onclick = function () { $("modal").hidden = true; if (bt.fn) bt.fn(); };
      box.appendChild(el);
    });
    $("modal").hidden = false;
    var f = box.querySelector("button"); if (f) f.focus();
  }

  // ---------- setup screen ----------
  function renderSetup() {
    var s = app.s, left = L.trayCounts(s, RED), n = L.placedCount(s, RED);
    $("setupBoard").innerHTML = drawBoard(s, { sel: app.selCell, setup: true });
    var tr = "";
    var order = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 11, 0];
    order.forEach(function (r) {
      var cls = (app.trayRank === r ? "on " : "") + (left[r] === 0 ? "none" : "");
      var nm = r === 11 ? "Bomb" : r === 0 ? "Flag" : r === 1 ? "Spy" : L.NAMES[r];
      tr += '<button data-r="' + r + '" class="' + cls + '" aria-label="' + nm + (r > 1 && r < 11 ? " " + r : "") + ", " + left[r] + ' left">' +
        tile(RED, r, "face", 38) + '<span class="cnt">' + left[r] + "</span><span>" + nm + "</span></button>";
    });
    $("tray").innerHTML = tr;
    var ready = n === 40;
    $("setupStatus").innerHTML = ready ? "All 40 placed. Press Start when ready." : "Placed " + n + " of 40. Tap a tray piece, then a cell in your rows.";
    var hint = "Higher number is stronger. Tap a tray piece to place it, or tap two placed pieces to swap them.";
    if (app.trayRank !== null) hint = L.NAMES[app.trayRank] + (app.trayRank > 1 && app.trayRank < 11 ? " (" + app.trayRank + ")" : "") + " selected. Tap an empty cell in your rows" + (n > 0 ? " (or a placed piece to replace it)." : ".");
    else if (app.selCell !== null) hint = "Piece selected. Tap another placed piece or an empty cell to swap, or tap it again to deselect.";
    $("trayHint").textContent = hint;
    $("sStart").disabled = !ready;
    $("sReturn").hidden = app.selCell === null;
  }
  function setupCell(i) {
    var s = app.s;
    if (!L.inHome(RED, i) || L.isLake(i)) { $("trayHint").textContent = "Place pieces in your own four rows at the bottom."; return; }
    var p = s.board[i];
    if (app.trayRank !== null) {
      if (L.placePiece(s, app.trayRank, i)) {
        if (L.trayCounts(s, RED)[app.trayRank] === 0) app.trayRank = null;
        save();
      }
    } else if (app.selCell !== null) {
      if (i === app.selCell) app.selCell = null;
      else { L.swapPieces(s, app.selCell, i); app.selCell = null; save(); }
    } else if (p) {
      app.selCell = i;
    }
    renderSetup();
  }
  function setupInit() {
    app.trayRank = null; app.selCell = null;
    show("setup");
    renderSetup();
  }

  // ---------- game screen ----------
  function lastCombat() {
    var log = app.s.log;
    for (var i = log.length - 1; i >= 0; i--) if (log[i].att) return log[i];
    return null;
  }
  function nameOf(r) { return L.NAMES[r] + (r > 1 && r < 10 ? " (" + r + ")" : r === 10 ? " (10)" : ""); }
  function describeMove(e) {
    var who = e.side === RED ? "You" : "Blue";
    if (!e.att) return who + (e.leap ? " slid a scout" : " moved");
    var a = (e.side === RED ? "your " : "Blue ") + L.NAMES[e.ar], d = (e.side === RED ? "Blue " : "your ") + L.NAMES[e.dr];
    var res = { win: "wins", lose: "loses", tie: "both removed", defuse: "defuses the bomb", flag: "captures the flag" }[e.out];
    return who + ": " + a + " (" + L.LABELS[e.ar] + ") attacks " + d + " (" + L.LABELS[e.dr] + "), " + res;
  }
  function renderGame() {
    var s = app.s, over = s.phase === "over";
    var showAll = app.reveal;
    var dests = (!over && app.sel !== null && !app.busy) ? L.destinations(s, app.sel) : [];
    $("board").innerHTML = drawBoard(s, { sel: app.sel, dests: dests, last: app.last, reveal: showAll });
    var cr = L.countAlive(s, RED), cb = L.countAlive(s, BLUE);
    $("score").innerHTML =
      '<div class="pl' + (!over && s.turn === RED ? " turn" : "") + '"><div class="nm">' + tile(RED, 0, "hidden", 16) + 'You (Red)</div><div class="st">' + cr.total + " pieces left</div></div>" +
      '<div class="pl' + (!over && s.turn === BLUE ? " turn" : "") + '"><div class="nm">' + tile(BLUE, 0, "hidden", 16) + 'Computer (Blue)</div><div class="st">' + cb.total + " pieces left</div></div>";
    var st;
    if (over) {
      st = s.winner === RED ? "You win. " : s.winner === BLUE ? "Blue wins. " : "Draw. ";
      st += { flag: s.winner === RED ? "You captured the flag." : "Your flag was captured.", blocked: s.winner === RED ? "Blue has no piece that can move." : "You have no piece that can move.", resign: "You resigned.", draw: "No attack for 300 moves." }[s.reason] || "";
    } else if (app.busy || s.turn === BLUE) st = "Blue is thinking...";
    else if (app.sel !== null) st = "Tap a highlighted square to move, or another piece to switch.";
    else st = "Your move. Tap one of your Red pieces.";
    $("status").textContent = st;
    $("undoBtn").disabled = !app.undo || app.busy || over;
    $("undoBtn").hidden = over;
    $("resignBtn").hidden = over;
    $("revealBtn").hidden = !over || app.reveal;
    $("againBtn").hidden = !over;
    $("undoNote").textContent = over ? "" : (app.undo ? "Undo takes back your last move and Blue's reply." : "Undo is off after a battle or a scout's long move.");
    // graveyards
    function gy(el, list, o) {
      if (!list.length) { el.innerHTML = '<span class="none">None yet</span>'; return; }
      var cnt = {}; list.forEach(function (r) { cnt[r] = (cnt[r] || 0) + 1; });
      var h = "";
      [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 11, 0].forEach(function (r) {
        if (cnt[r]) h += '<span class="chip" title="' + L.NAMES[r] + '">' + tile(o, r, "face", 28) + "&times;" + cnt[r] + "</span>";
      });
      el.innerHTML = h;
    }
    gy($("gyBlue"), s.dead[BLUE], BLUE);
    gy($("gyRed"), s.dead[RED], RED);
    // last battle
    var lc = lastCombat();
    $("combatCard").hidden = !lc;
    if (lc) {
      var aO = lc.side, dO = 1 - lc.side;
      $("combat").innerHTML = tile(aO, lc.ar, "face", 40) + '<span class="vs">attacks</span>' + tile(dO, lc.dr, "face", 40) +
        "<p>" + describeMove(lc) + "</p>";
    }
    var log = "", n = 0;
    for (var i = s.log.length - 1; i >= 0 && n < 40; i--, n++) log += '<li><span class="no">' + s.log[i].n + "</span><span>" + describeMove(s.log[i]) + "</span></li>";
    $("log").innerHTML = log;
    $("seedNote").textContent = "Seed " + s.seed;
  }
  function gameInit() {
    show("game");
    app.sel = null; app.last = null;
    var lg = app.s.log;
    if (lg.length) app.last = { from: lg[lg.length - 1].from, to: lg[lg.length - 1].to };
    renderGame();
    if (app.s.phase === "over") finish(false);
    else if (app.s.turn === BLUE) scheduleAi();
  }
  function scheduleAi() {
    app.busy = true;
    renderGame();
    clearTimeout(app.timer);
    app.timer = setTimeout(aiStep, reduceMotion ? 120 : 600);
  }
  function aiStep() {
    var s = app.s;
    if (!s || s.phase !== "play" || s.turn !== BLUE) { app.busy = false; renderGame(); return; }
    var res = L.aiPlay(s);
    app.busy = false;
    if (res) {
      app.last = { from: res.from, to: res.to };
      if (res.att || res.leap) app.undo = null;
    }
    save();
    renderGame();
    if (s.phase === "over") finish(true);
  }
  function humanMove(from, to) {
    var s = app.s, snap = JSON.stringify(s);
    var res = L.move(s, from, to);
    if (!res) return;
    app.sel = null;
    app.last = { from: from, to: to };
    app.undo = (res.att || res.leap) ? null : snap;
    save();
    if (s.phase === "over") { renderGame(); finish(true); return; }
    scheduleAi();
  }
  function gameCell(i) {
    var s = app.s;
    if (s.phase !== "play" || app.busy || s.turn !== RED) return;
    var p = s.board[i];
    if (app.sel !== null) {
      var d = L.destinations(s, app.sel);
      if (d.indexOf(i) >= 0) { humanMove(app.sel, i); return; }
      if (i === app.sel) { app.sel = null; renderGame(); return; }
    }
    if (p && p.o === RED) {
      if (L.destinations(s, i).length) { app.sel = i; renderGame(); }
      else { app.sel = null; renderGame(); $("status").textContent = p.r === L.BOMB || p.r === L.FLAG ? "Bombs and the flag cannot move." : "That piece has no legal move right now."; }
    } else { app.sel = null; renderGame(); }
  }
  function finish(announce) {
    var s = app.s;
    if (!app.tallied) { app.tallied = true; bumpTally(s.winner); save(); }
    renderGame();
    if (!announce) return;
    var title = s.winner === RED ? "You win" : s.winner === BLUE ? "Blue wins" : "Draw";
    var why = { flag: s.winner === RED ? "You captured the enemy flag." : "The computer captured your flag.", blocked: s.winner === RED ? "Blue has no piece that can move." : "You have no piece that can move.", resign: "You resigned.", draw: "300 moves passed with no attack." }[s.reason] || "";
    modal(title, "<p>" + why + "</p>", [
      { label: "Reveal opponent", primary: true, fn: function () { app.reveal = true; save(); renderGame(); } },
      { label: "New game", fn: startSetup },
      { label: "Close" }
    ]);
  }

  // ---------- flow ----------
  function startSetup() {
    clearTimeout(app.timer); app.busy = false;
    app.s = L.newGame({ seed: pickSeed() });
    app.undo = null; app.reveal = false; app.tallied = false; app.last = null;
    save();
    setupInit();
  }
  function resume() {
    var sv = loadSave();
    if (!sv) return;
    app.s = sv.s; app.tallied = !!sv.tallied; app.reveal = !!sv.reveal; app.undo = null; app.busy = false;
    if (app.s.phase === "setup") setupInit(); else gameInit();
  }

  // ---------- events ----------
  function cellOf(e) {
    var t = e.target.closest ? e.target.closest("[data-i]") : null;
    return t ? parseInt(t.getAttribute("data-i"), 10) : -1;
  }
  $("board").addEventListener("click", function (e) { var i = cellOf(e); if (i >= 0) gameCell(i); });
  $("setupBoard").addEventListener("click", function (e) { var i = cellOf(e); if (i >= 0) setupCell(i); });
  $("tray").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-r]");
    if (!b) return;
    var r = parseInt(b.getAttribute("data-r"), 10);
    if (L.trayCounts(app.s, RED)[r] === 0) return;
    app.trayRank = app.trayRank === r ? null : r; app.selCell = null;
    renderSetup();
  });
  function setupAct(fn) { return function () { fn(); app.trayRank = null; app.selCell = null; save(); renderSetup(); }; }
  $("sRandom").onclick = setupAct(function () { L.randomSetup(app.s); });
  $("sDef").onclick = setupAct(function () { L.presetSetup(app.s, "defensive"); });
  $("sAgg").onclick = setupAct(function () { L.presetSetup(app.s, "aggressive"); });
  $("sClear").onclick = setupAct(function () { L.clearSetup(app.s); });
  $("sReturn").onclick = function () { if (app.selCell !== null) { L.removePiece(app.s, app.selCell); app.selCell = null; save(); renderSetup(); } };
  $("sStart").onclick = function () {
    if (!L.startGame(app.s)) return;
    app.undo = null; save(); gameInit();
  };
  $("startBtn").onclick = startSetup;
  $("resume").onclick = resume;
  $("setupMenu").onclick = showMenu;
  $("menuBtn").onclick = showMenu;
  $("resetTally").onclick = function () {
    modal("Reset record", "<p>Clear your wins, losses and draws?</p>", [
      { label: "Reset", primary: true, fn: function () { store("del", KEY_TALLY); renderTally(); } }, { label: "Cancel" }]);
  };
  $("undoBtn").onclick = function () {
    if (!app.undo || app.busy || app.s.phase !== "play") return;
    app.s = JSON.parse(app.undo); app.undo = null; app.sel = null; app.last = null;
    var lg = app.s.log; if (lg.length) app.last = { from: lg[lg.length - 1].from, to: lg[lg.length - 1].to };
    save(); renderGame();
  };
  $("resignBtn").onclick = function () {
    modal("Resign?", "<p>This counts as a loss.</p>", [
      { label: "Resign", primary: true, fn: function () { L.resign(app.s, RED); app.busy = false; clearTimeout(app.timer); save(); finish(true); } },
      { label: "Keep playing" }]);
  };
  $("revealBtn").onclick = function () { app.reveal = true; save(); renderGame(); };
  $("againBtn").onclick = startSetup;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) $("modal").hidden = true; });

  fillRules();
  showMenu();
  // expose for tests and debugging
  window.__stratego = app;
})();
