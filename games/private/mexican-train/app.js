// Mexican Train UI. Rules and computer play live in logic.js, SVG art in
// art.js; this file draws the table, takes taps and paces the computer seats.
(function () {
  "use strict";
  var L = window.MexicanTrainLogic, A = window.MexicanTrainArt;
  var SAVE_KEY = "kz.mexican-train.save.v1", OPT_KEY = "kz.mexican-train.opts.v1";
  var q = new URLSearchParams(location.search);
  var FAST = q.has("fast");
  var REDUCED = false;
  try { REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var HUB_R = 82, GAP = 3, TL = A.TL, TW = A.TW;
  // Straight stem and lane length (in tiles) before a train snakes back on itself.
  function stemFor(spokes) { return spokes <= 5 ? 2 : spokes <= 7 ? 3 : 5; }
  function laneFor(spokes) { return spokes <= 5 ? 3 : 4; }

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // ------------------------------------------------------------ storage
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function readJSON(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var opts = { players: 4, mode: "ai", rounds: 13, blank: 50, names: [] };
  (function () {
    var o = readJSON(OPT_KEY);
    if (!o || typeof o !== "object") return;
    if (o.players >= 2 && o.players <= 8) opts.players = o.players | 0;
    if (o.mode === "ai" || o.mode === "pass") opts.mode = o.mode;
    if (o.rounds === 13 || o.rounds === 7 || o.rounds === 4) opts.rounds = o.rounds;
    if (o.blank === 0 || o.blank === 50) opts.blank = o.blank;
    if (Array.isArray(o.names)) opts.names = o.names.map(function (n) { return String(n || "").slice(0, 14); });
  })();
  function saveOpts() { lsSet(OPT_KEY, JSON.stringify(opts)); }

  var G = null; // { st, mode, shownSeat, sort }
  var ui = { sel: null, selTrain: null, view: { k: 1, tx: 0, ty: 0, auto: true }, timer: 0, lastMsg: "", newTile: null, justDrew: null, sheetTimer: 0 };
  var firstSeed = q.has("seed") ? (parseInt(q.get("seed"), 10) || 1) : null;

  function save() { if (G) lsSet(SAVE_KEY, JSON.stringify({ v: 1, st: G.st, mode: G.mode, shownSeat: G.shownSeat, sort: G.sort })); }
  function loadSave() {
    var o = readJSON(SAVE_KEY);
    try {
      var st = o && o.st;
      if (!st || !st.hands || !st.trains || st.trains.length !== st.players + 1 || !st.names || st.phase === "gameOver") return null;
      return o;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ helpers
  function freshSeed() {
    if (firstSeed !== null) { var s = firstSeed; firstSeed = null; return s; }
    return (Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) | 0;
  }
  function st() { return G.st; }
  function human(seat) { return !!G.st.humans[seat]; }
  function humanTurn() { return G.st.phase === "play" && human(G.st.turn) && G.st.turn === G.shownSeat; }
  function tileName(t) { return A.PIP_NAMES[Math.max(t[0], t[1])] + " " + A.PIP_NAMES[Math.min(t[0], t[1])]; }
  function tileLabel(t) { return Math.max(t[0], t[1]) + "-" + Math.min(t[0], t[1]); }
  function trainName(idx, seat) {
    var s = G.st;
    if (idx === s.players) return "the Mexican train";
    if (idx === seat) return "your train";
    return s.names[idx] + "'s train";
  }
  function possessive(seat) { return G.st.names[seat] === "You" ? "your" : G.st.names[seat] + "'s"; }
  // Spokes are spread evenly, then squeezed towards the board's long axis so
  // the whole layout has roughly the board's aspect ratio and fits larger.
  function spokeAngle(idx, aspect) {
    var t = (90 + idx * (360 / (G.st.players + 1))) * Math.PI / 180;
    return Math.atan2(Math.sin(t), (aspect || 1) * Math.cos(t)) * 180 / Math.PI;
  }
  function aspectFor(W, H, spokes) {
    var ar = W / Math.max(1, H);
    if (spokes <= 5) return Math.max(0.45, Math.min(2.2, Math.pow(ar, 1.2)));
    if (spokes <= 6) return Math.max(0.55, Math.min(1.8, Math.pow(ar, 0.8)));
    return Math.max(0.67, Math.min(1.5, Math.pow(ar, 0.5)));
  }
  function delay(kind) {
    if (FAST) return 20;
    if (kind === "run") return 420;
    if (kind === "draw") return 520;
    if (kind === "pass") return 650;
    return REDUCED ? 600 : 820;
  }

  // ------------------------------------------------------------ layout
  // Walk a train out from the hub: a straight stem, then serpentine lanes
  // that turn with two corner tiles, so long trains stay compact.
  function layoutTrain(tiles, ang, spokes) {
    var STEM = stemFor(spokes || 5), LANE = laneFor(spokes || 5);
    var rad = ang * Math.PI / 180, U = [Math.cos(rad), Math.sin(rad)], V = [-Math.sin(rad), Math.cos(rad)];
    var P = [HUB_R + 5, 0], D = [1, 0];
    var out = [], laneCount = 0, cap = STEM + LANE, corner = 0, prevU = 1;
    function world(p) { return [p[0] * U[0] + p[1] * V[0], p[0] * U[1] + p[1] * V[1]]; }
    function rotOf(d) { return ang + Math.atan2(d[1], d[0]) * 180 / Math.PI; }
    function turn(Dn, t) {
      var mh = [P[0] + D[0] * TW / 2, P[1] + D[1] * TW / 2];
      var c = world([mh[0] + Dn[0] * TL / 4, mh[1] + Dn[1] * TL / 4]);
      out.push({ x: c[0], y: c[1], rot: rotOf(Dn), a: t[0], b: t[1] });
      P = [mh[0] + Dn[0] * (TL / 2 + GAP), mh[1] + Dn[1] * (TL / 2 + GAP)];
      D = Dn;
    }
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (corner === 1) { prevU = D[0]; turn([0, 1], t); corner = 2; continue; }
      if (corner === 2) { turn([-prevU, 0], t); corner = 0; laneCount = 0; cap = LANE; continue; }
      var c, rot;
      if (t[0] === t[1]) {
        c = world([P[0] + D[0] * TW / 2, P[1] + D[1] * TW / 2]); rot = rotOf(D) + 90;
        P = [P[0] + D[0] * (TW + GAP), P[1] + D[1] * (TW + GAP)];
      } else {
        c = world([P[0] + D[0] * TL / 2, P[1] + D[1] * TL / 2]); rot = rotOf(D);
        P = [P[0] + D[0] * (TL + GAP), P[1] + D[1] * (TL + GAP)];
      }
      out.push({ x: c[0], y: c[1], rot: rot, a: t[0], b: t[1] });
      laneCount++;
      if (laneCount >= cap) corner = 1;
    }
    var n = world([P[0] + D[0] * TL / 2, P[1] + D[1] * TL / 2]);
    return { tiles: out, next: { x: n[0], y: n[1], rot: rotOf(D) } };
  }

  function boundsOf(lays) {
    var b = { x0: -HUB_R - 14, y0: -HUB_R - 14, x1: HUB_R + 14, y1: HUB_R + 14 };
    function add(x, y, m) { b.x0 = Math.min(b.x0, x - m); b.y0 = Math.min(b.y0, y - m); b.x1 = Math.max(b.x1, x + m); b.y1 = Math.max(b.y1, y + m); }
    lays.forEach(function (ly, i) {
      ly.tiles.forEach(function (t) { add(t.x, t.y, 28); });
      var n = ly.next;
      add(n.x, n.y, 24);
      b.y1 = Math.max(b.y1, n.y + 42); // name label under the target
      b.y0 = Math.min(b.y0, n.y - (ly.mex ? 48 : 24)); // locomotive above the Mexican target
    });
    return b;
  }
  function fitView(b, W, H) {
    var padX = W * 0.06, padY = H * 0.06;
    var k = Math.min((W - 2 * padX) / (b.x1 - b.x0), (H - 2 * padY) / (b.y1 - b.y0));
    k = Math.min(k, 2.4);
    ui.view.k = k;
    ui.view.tx = W / 2 - k * (b.x0 + b.x1) / 2;
    ui.view.ty = H / 2 - k * (b.y0 + b.y1) / 2;
  }
  function zoomAt(f, sx, sy) {
    var v = ui.view;
    var k2 = Math.max(0.12, Math.min(3.2, v.k * f));
    f = k2 / v.k;
    v.tx = sx - (sx - v.tx) * f;
    v.ty = sy - (sy - v.ty) * f;
    v.k = k2;
    v.auto = false;
    applyView();
  }
  function applyView() {
    var w = $("world");
    if (w) w.setAttribute("transform", "translate(" + ui.view.tx.toFixed(2) + "," + ui.view.ty.toFixed(2) + ") scale(" + ui.view.k.toFixed(4) + ")");
  }

  // ------------------------------------------------------------ render: table
  function legalTrainSet() {
    var set = {};
    if (!humanTurn()) return set;
    L.legalMoves(G.st, G.st.turn).forEach(function (m) {
      if (ui.sel && L.tileKey(m.tile) !== ui.sel) return;
      set[m.train] = (set[m.train] || 0) + 1;
    });
    return set;
  }

  function renderTable() {
    var s = G.st, svg = $("table");
    var W = svg.clientWidth || 360, H = svg.clientHeight || 300;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var lays = [], K = s.players + 1, aspect = aspectFor(W, H, K);
    for (var i = 0; i < s.trains.length; i++) { lays.push(layoutTrain(s.trains[i].tiles, spokeAngle(i, aspect), K)); lays[i].mex = i === s.players; }
    if (ui.view.auto) fitView(boundsOf(lays), W, H);
    var legal = legalTrainSet();
    var spokes = [];
    var initials = s.names.map(function (n) { return n.charAt(0).toUpperCase(); });
    var distinct = new Set(initials).size === initials.length;
    for (i = 0; i < s.trains.length; i++) {
      var mex = i === s.players;
      spokes.push({ angle: spokeAngle(i, aspect), mex: mex, marker: !mex && s.trains[i].open, label: mex ? "" : esc(distinct ? initials[i] : String(i + 1)) });
    }
    var h = A.defs() + '<g id="world">';
    h += A.hubSVG(s.engine, spokes, HUB_R);
    for (i = 0; i < lays.length; i++) {
      var ly = lays[i];
      h += '<g class="train">';
      for (var j = 0; j < ly.tiles.length; j++) {
        var t = ly.tiles[j];
        var isNew = ui.newTile && ui.newTile.train === i && ui.newTile.index === j && !REDUCED;
        h += '<g transform="translate(' + t.x.toFixed(2) + ',' + t.y.toFixed(2) + ') rotate(' + t.rot.toFixed(2) + ')"><g class="tile' + (isNew ? " drop" : "") + '">' + A.tileSVG(t.a, t.b) + "</g></g>";
      }
      var tr = s.trains[i];
      var cls = "tgt" + (legal[i] ? " legal" : "") + (ui.selTrain === i ? " sel" : "") + (tr.mex ? " mex" : "") + (tr.open && !tr.mex ? " open" : "");
      var nm = tr.mex ? "Mexican" : s.names[i];
      var lab = (tr.mex ? "Mexican train" : s.names[i] + "'s train") + ", open end " + A.PIP_NAMES[tr.end] + (legal[i] ? ", you can play here" : "");
      h += '<g class="' + cls + '" data-train="' + i + '" role="button" tabindex="0" aria-label="' + esc(lab) + '" transform="translate(' + ly.next.x.toFixed(2) + ',' + ly.next.y.toFixed(2) + ')">' +
        '<circle class="halo" r="34"/>' +
        '<circle class="ring" r="19"/>' +
        '<text class="endnum" y="4.5" text-anchor="middle">' + tr.end + "</text>" +
        '<text class="tgtname" y="33" text-anchor="middle">' + esc(nm) + "</text>" +
        (tr.mex ? '<g transform="translate(0,-33) scale(0.75)">' + A.locoSVG("#F3E3B2", "#2B2622") + "</g>" : "") +
        "</g>";
      h += "</g>";
    }
    h += "</g>";
    svg.innerHTML = h;
    applyView();
    ui.newTile = null;
  }

  // ------------------------------------------------------------ render: rest
  function renderStrip() {
    var s = G.st, h = "";
    var last = s.scores.length ? s.scores[s.scores.length - 1] : null;
    for (var i = 0; i < s.players; i++) {
      var cls = "chip" + (s.phase === "play" && s.turn === i ? " cur" : "") + (s.trains[i].open ? " open" : "") + (human(i) ? " human" : "");
      h += '<div class="' + cls + '" role="listitem" aria-label="' + esc(s.names[i]) + ", " + s.hands[i].length + " tiles, total " + s.totals[i] + (s.trains[i].open ? ", train open" : "") + '">' +
        '<div class="nm">' + (s.trains[i].open ? '<svg class="mk" viewBox="-13 -13 26 26" aria-hidden="true">' + A.markerSVG() + "</svg>" : "") + esc(s.names[i]) + "</div>" +
        '<div class="cnt"><b>' + s.hands[i].length + "</b> tile" + (s.hands[i].length === 1 ? "" : "s") + "</div>" +
        '<div class="sc"><span>last ' + (last ? last[i] : "-") + "</span><span>total <b>" + s.totals[i] + "</b></span></div>" +
        "</div>";
    }
    $("strip").innerHTML = h;
    var strip = $("strip"), cur = strip.querySelector(".cur");
    if (cur) {
      var l = cur.offsetLeft - strip.offsetLeft, r = l + cur.offsetWidth;
      if (l < strip.scrollLeft) strip.scrollLeft = Math.max(0, l - 8);
      else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 8;
    }
    $("roundTag").textContent = "Round " + s.round + " of " + s.rounds + " · Engine " + s.engine;
  }

  function instruction() {
    var s = G.st, seat = s.turn;
    if (s.phase !== "play") return "";
    if (!human(seat)) return s.names[seat] + " is thinking...";
    if (seat !== G.shownSeat) return "Pass the phone to " + s.names[seat] + ".";
    var moves = L.legalMoves(s, seat);
    var any = moves.length > 0;
    if (ui.sel) {
      var dests = moves.filter(function (m) { return L.tileKey(m.tile) === ui.sel; });
      if (!dests.length) return "That tile does not fit anywhere right now. Pick another.";
      return "Tap a glowing train end to place the " + tileLabel(dests[0].tile) + ".";
    }
    if (ui.selTrain !== null) return "Pick a tile for " + trainName(ui.selTrain, seat) + ".";
    if (s.pending) {
      if (any) return "Play a " + s.pending.pip + " onto the double on " + trainName(s.pending.train, seat) + ".";
      if (L.canDraw(s)) return "You cannot satisfy the double " + s.pending.pip + ". Draw a tile.";
      return "Still nothing for the double. Pass; your train opens.";
    }
    if (s.firstTurn[seat]) {
      if (!s.played) return any ? "First turn: lay a run from the " + s.engine + " on your own train, one tile at a time." : (L.canDraw(s) ? "Nothing in your hand starts from the " + s.engine + ". Draw a tile." : "Nothing fits. Pass; your train opens.");
      return any ? "Keep the run going on your train, or end your turn." : "Run finished. End your turn.";
    }
    if (any) return "Your turn. Play on your train, the Mexican train or any open train.";
    if (L.canDraw(s)) return "No play. Draw a tile.";
    if (s.drew) return "Still nothing. Pass; your train opens.";
    return "The boneyard is empty and nothing fits. Pass.";
  }

  function renderStatus() {
    var s = G.st;
    var now = instruction();
    $("status").innerHTML = (ui.lastMsg ? '<span class="last">' + esc(ui.lastMsg) + "</span> " : "") + '<span class="now">' + esc(now) + "</span>";
    var b = $("banner");
    if (s.phase === "play" && s.pending) {
      b.hidden = false;
      b.innerHTML = "<b>Double " + s.pending.pip + " must be satisfied</b> on " + esc(trainName(s.pending.train, G.shownSeat)) + ".";
    } else b.hidden = true;
  }

  function renderHand() {
    var s = G.st, seat = G.shownSeat;
    var hand = seat >= 0 && seat < s.players ? L.sortHand(s.hands[seat], G.sort) : [];
    // Pass and play: keep the previous player's tiles off screen until the hand-off is confirmed.
    if (G.mode === "pass" && s.phase === "play" && s.turn !== seat) hand = [];
    var legal = {};
    if (humanTurn()) L.legalMoves(s, seat).forEach(function (m) { if (ui.selTrain === null || m.train === ui.selTrain) legal[L.tileKey(m.tile)] = true; });
    var h = "";
    for (var i = 0; i < hand.length; i++) {
      var t = hand[i], k = L.tileKey(t);
      var cls = "htile" + (legal[k] ? " legal" : "") + (ui.sel === k ? " sel" : "") + (ui.justDrew === k ? " drew" : "");
      h += '<button type="button" class="' + cls + '" data-key="' + k + '" aria-label="' + tileName(t) + (legal[k] ? ", playable" : "") + '" aria-pressed="' + (ui.sel === k) + '">' + A.tileStandalone(t[0], t[1], 48) + "</button>";
    }
    $("hand").innerHTML = h;
    $("hand").setAttribute("aria-label", (seat >= 0 ? s.names[seat] : "") + " hand, " + hand.length + " tiles");
    var ht = humanTurn();
    $("drawBtn").disabled = !(ht && L.canDraw(s));
    $("passBtn").disabled = !(ht && L.canPass(s));
    $("passBtn").textContent = s.phase === "play" && s.firstTurn[s.turn] && s.played && !s.pending ? "End turn" : "Pass";
    $("boneCount").textContent = "Boneyard " + s.boneyard.length;
    $("sortBtn").textContent = "Sort: " + (G.sort === "pips" ? "pips" : "number");
  }

  function render() {
    if (!G) return;
    renderStrip();
    renderStatus();
    renderTable();
    renderHand();
  }

  // ------------------------------------------------------------ flow
  function show(id) {
    ["menu", "game"].forEach(function (k) { $(k).hidden = k !== id; });
    window.scrollTo(0, 0);
  }

  function startGame() {
    clearTimeout(ui.timer); clearTimeout(ui.sheetTimer);
    var humans = [], names = [];
    for (var i = 0; i < opts.players; i++) {
      humans.push(opts.mode === "pass" ? true : i === 0);
      names.push(opts.mode === "pass" ? (opts.names[i] || "") : "");
    }
    G = { st: L.newGame({ players: opts.players, rounds: opts.rounds, seed: freshSeed(), humans: humans, doubleBlank: opts.blank, names: names }), mode: opts.mode, shownSeat: opts.mode === "pass" ? -1 : 0, sort: "number" };
    ui.sel = null; ui.selTrain = null; ui.lastMsg = ""; ui.view.auto = true; ui.justDrew = null;
    save();
    show("game");
    closeModal();
    render();
    afterAction(true);
  }
  function resumeGame(o) {
    clearTimeout(ui.timer); clearTimeout(ui.sheetTimer);
    G = { st: o.st, mode: o.mode === "pass" ? "pass" : "ai", shownSeat: o.mode === "pass" ? -1 : 0, sort: o.sort === "pips" ? "pips" : "number" };
    ui.sel = null; ui.selTrain = null; ui.lastMsg = ""; ui.view.auto = true; ui.justDrew = null;
    show("game");
    closeModal();
    render();
    afterAction(true);
  }

  // Called after every state change: saves, renders, then hands off, shows
  // the round sheet or paces the computer.
  function afterAction(silent) {
    var s = G.st;
    save();
    render();
    if (s.phase !== "play") {
      ui.sheetTimer = setTimeout(showRoundSheet, silent || FAST ? 50 : 900);
      return;
    }
    if (human(s.turn)) {
      if (s.turn !== G.shownSeat) {
        if (G.mode === "pass") ui.sheetTimer = setTimeout(showHandoff, silent || FAST ? 30 : 500);
      }
      return;
    }
    schedule();
  }
  function schedule() {
    clearTimeout(ui.timer);
    var s = G.st;
    if (s.phase !== "play" || human(s.turn)) return;
    var kind = s.firstTurn[s.turn] && s.played ? "run" : "play";
    ui.timer = setTimeout(aiStep, delay(kind));
  }
  function aiStep() {
    var s = G.st;
    if (s.phase !== "play" || human(s.turn)) return;
    var seat = s.turn, name = s.names[seat];
    var act = L.aiMove(s);
    if (act.type === "play") {
      var tr = act.move.train;
      var before = s.trains[tr].tiles.length;
      L.play(s, act.move);
      ui.newTile = { train: tr, index: before };
      ui.lastMsg = name + " plays " + tileLabel(act.move.tile) + " on " + (tr === seat ? "their own train" : trainName(tr, G.shownSeat)) + ".";
    } else if (act.type === "draw") {
      L.draw(s);
      ui.lastMsg = name + " draws a tile.";
    } else {
      var hadPlayed = s.played;
      L.pass(s);
      ui.lastMsg = hadPlayed ? name + " ends their turn." : name + " cannot play; their train is open.";
    }
    afterAction();
  }

  // ------------------------------------------------------------ human actions
  function doPlay(move) {
    var s = G.st;
    var before = s.trains[move.train].tiles.length;
    if (!L.play(s, move)) return false;
    ui.newTile = { train: move.train, index: before };
    ui.sel = null; ui.selTrain = null; ui.justDrew = null; ui.lastMsg = "";
    afterAction();
    return true;
  }
  function onTrainTap(idx) {
    if (!humanTurn()) return;
    var s = G.st;
    var moves = L.legalMoves(s, s.turn).filter(function (m) { return m.train === idx; });
    if (ui.sel) {
      var m = moves.filter(function (x) { return L.tileKey(x.tile) === ui.sel; })[0];
      if (m) { doPlay(m); return; }
      flashStatus("The " + ui.sel.split("-").reverse().join("-") + " does not fit on " + trainName(idx, s.turn) + " (needs a " + s.trains[idx].end + ").");
      return;
    }
    if (moves.length === 1) { doPlay(moves[0]); return; }
    if (moves.length === 0) {
      var why = s.pending && s.pending.train !== idx ? "The double " + s.pending.pip + " must be satisfied first." :
        (!s.trains[idx].mex && idx !== s.turn && !s.trains[idx].open ? "That train is not open." : "Nothing in your hand matches the " + s.trains[idx].end + ".");
      flashStatus(why);
      return;
    }
    ui.selTrain = ui.selTrain === idx ? null : idx;
    render();
  }
  function onHandTap(key) {
    if (!humanTurn()) return;
    var s = G.st;
    var moves = L.legalMoves(s, s.turn).filter(function (m) { return L.tileKey(m.tile) === key; });
    if (ui.selTrain !== null) {
      var m = moves.filter(function (x) { return x.train === ui.selTrain; })[0];
      if (m) { doPlay(m); return; }
    }
    if (ui.sel === key) {
      if (moves.length === 1) { doPlay(moves[0]); return; }
      ui.sel = null; render(); return;
    }
    ui.sel = key; ui.selTrain = null;
    render();
  }
  function flashStatus(msg) {
    ui.lastMsg = msg;
    renderStatus();
  }
  function onDraw() {
    if (!humanTurn()) return;
    var s = G.st;
    var t = L.draw(s);
    if (!t) return;
    ui.justDrew = L.tileKey(t);
    ui.sel = null; ui.selTrain = null;
    var plays = L.legalMoves(s, s.turn).length > 0;
    ui.lastMsg = "You drew the " + tileLabel(t) + (plays ? ". It plays!" : ".");
    afterAction();
  }
  function onPass() {
    if (!humanTurn()) return;
    var s = G.st, seat = s.turn, hadPlayed = s.played;
    if (!L.pass(s)) return;
    ui.sel = null; ui.selTrain = null; ui.justDrew = null;
    ui.lastMsg = hadPlayed && !s.trains[seat].open ? "" : "Your train is open: a marker is on your spoke.";
    afterAction();
  }

  // ------------------------------------------------------------ overlays
  function openModal(title, body, btns) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    var h = "";
    btns.forEach(function (b, i) { h += '<button type="button" class="btn ' + (b.primary ? "primary" : "") + '" data-i="' + i + '">' + esc(b.label) + "</button>"; });
    $("modalBtns").innerHTML = h;
    $("modal").hidden = false;
    $("modal").__btns = btns;
    var first = $("modalBtns").querySelector("button");
    if (first) first.focus();
  }
  function closeModal() { $("modal").hidden = true; $("modal").__btns = null; }
  $("modalBtns").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var def = ($("modal").__btns || [])[b.getAttribute("data-i") | 0];
    if (def && def.onClick) def.onClick(); else closeModal();
  });

  function showHandoff() {
    var s = G.st;
    if (s.phase !== "play" || !human(s.turn) || s.turn === G.shownSeat) return;
    var name = s.names[s.turn];
    $("handoffTitle").textContent = "Pass the phone to " + name;
    $("handoffText").textContent = "Round " + s.round + " of " + s.rounds + ". " + name + " has " + s.hands[s.turn].length + " tiles" + (s.firstTurn[s.turn] ? " and still gets a first-turn run." : ".");
    $("handoffBtn").textContent = "I'm " + name + ", show my hand";
    $("handoff").querySelector(".handoffArt").innerHTML = '<svg viewBox="-14 -14 28 28" aria-hidden="true">' + A.defs() + A.markerSVG() + "</svg>";
    $("handoff").hidden = false;
    $("handoffBtn").focus();
  }
  $("handoffBtn").addEventListener("click", function () {
    G.shownSeat = G.st.turn;
    ui.sel = null; ui.selTrain = null;
    $("handoff").hidden = true;
    save(); render();
  });

  function scoreTable(s, hiRound) {
    var rows = L.standings(s);
    var last = s.scores[s.scores.length - 1] || [];
    var h = '<table class="scores"><thead><tr><th>Player</th><th>' + (hiRound ? "Round " + s.lastRound.round : "Round") + "</th><th>Total</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      h += '<tr class="' + (r.rank === 1 ? "lead" : "") + '"><td>' + esc(r.name) + (s.phase === "gameOver" && r.rank === 1 ? ' <span class="crown">wins</span>' : "") + "</td><td>" + (last[r.seat] === undefined ? "" : last[r.seat]) + "</td><td><b>" + r.total + "</b></td></tr>";
    });
    return h + "</tbody></table>";
  }
  function showRoundSheet() {
    var s = G.st;
    if (s.phase === "roundOver") {
      var lr = s.lastRound;
      var why = lr.reason === "out" ? esc(s.names[lr.winner]) + " played their last tile." : "The round was blocked: the boneyard is empty and nobody can play.";
      openModal("Round " + lr.round + " over", "<p>" + why + " Everyone else scores the pips left in hand" + (s.doubleBlank === 50 ? " (double blank is 50)" : "") + ".</p>" + scoreTable(s, true),
        [{ label: s.round + 1 <= s.rounds ? "Next round: engine " + L.engineFor(s.round + 1) : "Final standings", primary: true, onClick: function () {
          L.nextRound(G.st);
          ui.sel = null; ui.selTrain = null; ui.lastMsg = ""; ui.view.auto = true;
          if (G.mode === "pass") G.shownSeat = -1;
          closeModal();
          afterAction(true);
        } }]);
    } else if (s.phase === "gameOver") {
      lsDel(SAVE_KEY);
      var w = L.standings(s)[0];
      openModal("Game over", "<p>" + esc(w.name) + " " + (w.name === "You" ? "win" : "wins") + " with " + w.total + " points after " + s.rounds + " rounds.</p>" + scoreTable(s, false),
        [{ label: "New game", primary: true, onClick: function () { closeModal(); G = null; showMenu(); } },
         { label: "Look at the table", onClick: function () { closeModal(); } }]);
    }
  }

  function showGameMenu() {
    openModal("Menu", '<p class="hint">Round ' + G.st.round + " of " + G.st.rounds + ". Your game is saved automatically.</p>", [
      { label: "Continue", primary: true },
      { label: "Fit the table", onClick: function () { ui.view.auto = true; closeModal(); renderTable(); } },
      { label: "How to play", onClick: function () { showRules(); } },
      { label: "Back to main menu", onClick: function () { closeModal(); showMenu(); } },
      { label: "Abandon game", onClick: function () {
        openModal("Abandon this game?", "<p>The saved game will be deleted.</p>", [
          { label: "Keep playing" },
          { label: "Abandon", onClick: function () { lsDel(SAVE_KEY); G = null; closeModal(); showMenu(); } }]);
      } }
    ]);
  }

  // ------------------------------------------------------------ rules
  function rulesHtml() {
    var sample = '<span class="rtile">' + A.tileStandalone(9, 4, 26) + "</span>";
    return '<div class="rules">' +
      "<h3>Goal</h3><p>Be the player with the fewest points after all rounds. Each round you try to empty your hand; pips left in hand are added to your total.</p>" +
      "<h3>Set and deal</h3><ul>" +
      "<li>Double-twelve set: 91 tiles from 0-0 to 12-12. The engine double for the round sits in the hub and is not dealt.</li>" +
      "<li>Hand sizes: 2 to 4 players draw 15 tiles, 5 to 6 players 12, 7 to 8 players 10. The rest is the boneyard.</li>" +
      "<li>A full game is 13 rounds: the engine starts at double 12 and counts down to double blank. Shorter games of 7 or 4 rounds start at double 12 and stop early (engines 12 to 6, or 12 to 9).</li>" +
      "<li>The first player rotates each round: the seat after last round's starter begins.</li></ul>" +
      "<h3>Trains</h3><ul>" +
      "<li>Every player has a personal train leading out from their spoke on the hub. There is one shared Mexican train (the locomotive spoke) that anyone may start or extend at any time.</li>" +
      "<li>A tile may be placed on a train when one of its numbers matches that train's open end; an empty train's open end is the engine. " + sample + " fits on a 9 or a 4.</li>" +
      "<li>You may play on your own train, the Mexican train, or any opponent's train that carries a marker (an <b>open</b> train).</li></ul>" +
      "<h3>The first turn</h3><ul>" +
      "<li>On your very first turn of a round you may lay as many tiles as you can in one continuous run, but only on your own train. Lay them one at a time and press End turn when you stop, or when nothing continues the run.</li>" +
      "<li>If a double is pending when your first turn comes you must deal with it first; afterwards you still get your run.</li>" +
      "<li>From your second turn on you play one tile per turn.</li></ul>" +
      "<h3>Drawing and markers</h3><ul>" +
      "<li>If you cannot play, draw one tile from the boneyard. If it fits you play it at once (any legal train). If it does not, you pass and a brass marker goes on your spoke: your train is open and anyone may play on it.</li>" +
      "<li>Your marker comes off the moment you play a tile on your own train.</li>" +
      "<li>If the boneyard is empty and you cannot play, you pass and your train opens.</li></ul>" +
      "<h3>Doubles (this table's variant)</h3><ul>" +
      "<li>A double is laid crosswise. Whoever plays a double must immediately play another tile, and it must go onto that double: a double is satisfied by the very next tile played at the table.</li>" +
      "<li>Until it is satisfied the only legal play for everyone is onto that double. If you cannot satisfy it, you draw; if the drawn tile does not satisfy it, you pass and your train opens, and the duty moves to the next player.</li>" +
      "<li>Satisfying a double with another double hands the same duty on again. A double played as your last tile ends the round at once.</li>" +
      "<li>A double still unsatisfied when the round ends is scored normally in whoever's hand the matching tiles sit.</li></ul>" +
      "<h3>End of a round and scoring</h3><ul>" +
      "<li>The round ends when someone plays their last tile, or when the boneyard is empty and a full lap of the table passes with no tile played (blocked).</li>" +
      "<li>Each player adds up the pips left in hand. The double blank counts 50 (or 0, chosen in the menu).</li>" +
      "<li>After the last round the lowest total wins.</li></ul>" +
      "<h3>The computer players</h3><p>They see only their own hand, the trains, the markers and the size of the boneyard. They search for the longest first-turn run, shed heavy tiles, play doubles when they can satisfy them, close their own marker when they can and avoid opening their train.</p>" +
      "<h3>Controls</h3><ul><li>Tap a tile, then a glowing train end. Or tap a train end first and then a tile. Tapping a selected tile again plays it when it only fits one train.</li>" +
      "<li>Pinch or scroll to zoom the table, drag to pan, and use Fit to see everything.</li>" +
      "<li>Pass and play: everyone shares one phone; a hand-off screen hides each hand between turns.</li></ul>" +
      "</div>";
  }
  function showRules() { openModal("How to play", rulesHtml(), [{ label: "Close", primary: true }]); }

  // ------------------------------------------------------------ menu
  function renderMenu() {
    var h = "";
    for (var n = 2; n <= 8; n++) h += '<button type="button" data-v="' + n + '"' + (opts.players === n ? ' class="on"' : "") + ">" + n + "</button>";
    $("optPlayers").innerHTML = h;
    segSet("optMode", opts.mode);
    segSet("optRounds", String(opts.rounds));
    segSet("optBlank", String(opts.blank));
    var nb = $("nameBox");
    if (opts.mode === "pass") {
      nb.hidden = false;
      var nh = '<div class="optlbl">Names</div><div class="namegrid">';
      for (var i = 0; i < opts.players; i++) nh += '<input type="text" maxlength="14" data-i="' + i + '" placeholder="Player ' + (i + 1) + '" value="' + esc(opts.names[i] || "") + '" aria-label="Name of player ' + (i + 1) + '" />';
      nb.innerHTML = nh + "</div>";
    } else nb.hidden = true;
    var hs = L.handSize(opts.players);
    $("optHint").textContent = opts.players + " players, " + hs + " tiles each, " + opts.rounds + " round" + (opts.rounds === 1 ? "" : "s") + ": engine double " + 12 + " down to double " + L.engineFor(opts.rounds) + ". " + (opts.mode === "ai" ? "You sit at the bottom against " + (opts.players - 1) + " computer player" + (opts.players === 2 ? "" : "s") + "." : "Everyone shares this phone.");
  }
  function segSet(id, v) {
    var bs = $(id).querySelectorAll("button");
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-v") === v);
  }
  function segClick(id, fn) {
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]");
      if (!b) return;
      fn(b.getAttribute("data-v"));
      saveOpts(); renderMenu();
    });
  }
  segClick("optPlayers", function (v) { opts.players = v | 0; });
  segClick("optMode", function (v) { opts.mode = v; });
  segClick("optRounds", function (v) { opts.rounds = v | 0; });
  segClick("optBlank", function (v) { opts.blank = v | 0; });
  $("nameBox").addEventListener("input", function (e) {
    var i = e.target.getAttribute("data-i");
    if (i === null) return;
    opts.names[i | 0] = e.target.value.slice(0, 14);
    saveOpts();
  });

  function showMenu() {
    clearTimeout(ui.timer); clearTimeout(ui.sheetTimer);
    $("handoff").hidden = true;
    show("menu");
    renderMenu();
    var sv = loadSave(), b = $("resumeBtn");
    if (sv) {
      b.hidden = false;
      b.textContent = "Resume game (round " + sv.st.round + " of " + sv.st.rounds + ")";
      b.onclick = function () { resumeGame(sv); };
    } else b.hidden = true;
    renderHero();
  }
  function renderHero() {
    var el = $("hero");
    if (el.childElementCount) return;
    var W = 600, H = 300;
    var saveG = G;
    G = { st: { players: 3, names: ["You", "Mabel", "Otis"], trains: [] }, shownSeat: 0 };
    var demo = [[[12, 7], [7, 7], [7, 2], [2, 10]], [[12, 3], [3, 11]], [[12, 12], [12, 5], [5, 9], [9, 1], [1, 6]], [[12, 0], [0, 8], [8, 8], [8, 4]]];
    var h = '<svg viewBox="0 0 ' + W + " " + H + '" class="herosvg" aria-hidden="true">' + A.defs() +
      '<rect width="' + W + '" height="' + H + '" fill="url(#mtFelt)"/>' +
      '<g transform="translate(300,150) scale(0.72)">' +
      A.hubSVG(12, [{ angle: 90, label: "Y" }, { angle: 180, label: "M", marker: true }, { angle: 270, label: "O" }, { angle: 0, mex: true }], HUB_R);
    for (var i = 0; i < 4; i++) {
      var ly = layoutTrain(demo[i], 90 + i * 90, 4);
      ly.tiles.forEach(function (t) { h += '<g transform="translate(' + t.x.toFixed(1) + "," + t.y.toFixed(1) + ") rotate(" + t.rot.toFixed(1) + ')">' + A.tileSVG(t.a, t.b) + "</g>"; });
    }
    h += "</g></svg>";
    el.innerHTML = h;
    G = saveG;
  }

  // ------------------------------------------------------------ table input
  (function () {
    var svg = $("table");
    var ptrs = {}, count = 0, moved = false, tapTarget = null, pinch = null, startX = 0, startY = 0;
    function pos(e) { var r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    svg.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      var p = pos(e);
      ptrs[e.pointerId] = p; count++;
      if (count === 1) { moved = false; startX = p.x; startY = p.y; tapTarget = e.target.closest ? e.target.closest("[data-train]") : null; }
      if (count === 2) {
        var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        moved = true;
      }
      e.preventDefault();
    });
    svg.addEventListener("pointermove", function (e) {
      if (!ptrs[e.pointerId]) return;
      var p = pos(e), prev = ptrs[e.pointerId];
      ptrs[e.pointerId] = p;
      if (count === 1) {
        if (!moved && Math.hypot(p.x - startX, p.y - startY) > 7) moved = true;
        if (moved) { ui.view.tx += p.x - prev.x; ui.view.ty += p.y - prev.y; ui.view.auto = false; applyView(); }
      } else if (count === 2 && pinch) {
        var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (pinch.d > 0) {
          ui.view.tx += mx - pinch.mx; ui.view.ty += my - pinch.my;
          zoomAt(d / pinch.d, mx, my);
        }
        pinch = { d: d, mx: mx, my: my };
      }
    });
    function up(e) {
      if (!ptrs[e.pointerId]) return;
      delete ptrs[e.pointerId]; count = Math.max(0, count - 1);
      if (count < 2) pinch = null;
      if (count === 0 && !moved && tapTarget) onTrainTap(tapTarget.getAttribute("data-train") | 0);
      if (count === 0) tapTarget = null;
    }
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var p = pos(e);
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });
    svg.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var t = e.target.closest ? e.target.closest("[data-train]") : null;
      if (!t) return;
      e.preventDefault();
      onTrainTap(t.getAttribute("data-train") | 0);
    });
    $("zoomIn").addEventListener("click", function () { zoomAt(1.25, svg.clientWidth / 2, svg.clientHeight / 2); });
    $("zoomOut").addEventListener("click", function () { zoomAt(1 / 1.25, svg.clientWidth / 2, svg.clientHeight / 2); });
    $("fitBtn").addEventListener("click", function () { ui.view.auto = true; if (G) renderTable(); });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { if (G && !$("game").hidden) renderTable(); });
      ro.observe($("tablewrap"));
    } else window.addEventListener("resize", function () { if (G && !$("game").hidden) renderTable(); });
  })();

  $("hand").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-key]");
    if (b) onHandTap(b.getAttribute("data-key"));
  });
  $("drawBtn").addEventListener("click", onDraw);
  $("passBtn").addEventListener("click", onPass);
  $("sortBtn").addEventListener("click", function () { G.sort = G.sort === "pips" ? "number" : "pips"; save(); renderHand(); });
  $("menuBtn").addEventListener("click", showGameMenu);
  $("rulesBtn").addEventListener("click", showRules);
  $("rulesBtn2").addEventListener("click", showRules);
  $("startBtn").addEventListener("click", function () {
    if (loadSave()) {
      openModal("Start a new game?", "<p>Your saved game will be replaced.</p>", [{ label: "Keep saved game" }, { label: "New game", primary: true, onClick: startGame }]);
    } else startGame();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("modal").hidden) {
      var btns = $("modal").__btns || [];
      var lastIsRound = G && G.st.phase !== "play" && btns.length === 1;
      if (!lastIsRound) closeModal();
    }
  });

  window.__mexicanTrain = {
    get state() { return G && G.st; },
    get game() { return G; },
    ui: ui, opts: opts, L: L, A: A,
    startGame: startGame, render: render, aiStep: aiStep, showMenu: showMenu, showRoundSheet: showRoundSheet,
    load: function (st, mode, shownSeat) { resumeGame({ st: st, mode: mode || "ai", sort: "number" }); if (shownSeat !== undefined) { G.shownSeat = shownSeat; render(); } }
  };

  showMenu();
})();
