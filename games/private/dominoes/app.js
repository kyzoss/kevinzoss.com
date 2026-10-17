// Dominoes UI. Rules, computer play and the table layout live in logic.js;
// this file draws the felt, the hands and the sheets, takes taps and paces
// the computer players. Pass and play shows a hand off screen between humans.
(function () {
  "use strict";
  var L = window.DominoesLogic;
  var SAVE_KEY = "kz.dominoes.save.v1", OPT_KEY = "kz.dominoes.opts.v1";
  var NUM = ["blank", "one", "two", "three", "four", "five", "six"];
  var END_NAME = { L: "left", R: "right", U: "up", D: "down", S: "table" };
  var U = 10; // svg units per layout cell
  var q = new URLSearchParams(location.search);
  var FAST = q.has("fast");
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // ------------------------------------------------------------ storage
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function readJSON(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var opts = { mode: "fives", players: 2, seats: "ai", target: 150 };
  (function () {
    var o = readJSON(OPT_KEY);
    if (o && typeof o === "object") {
      if (o.mode === "fives" || o.mode === "block") opts.mode = o.mode;
      if ([2, 3, 4].indexOf(o.players) >= 0) opts.players = o.players;
      if (o.seats === "ai" || o.seats === "pass") opts.seats = o.seats;
      if ([100, 150, 250].indexOf(o.target) >= 0) opts.target = o.target;
    }
  })();
  function saveOpts() { lsSet(OPT_KEY, JSON.stringify(opts)); }

  var st = null;
  var ui = { sel: null, anim: null, fresh: null, timer: 0, bump: null, sheetSeen: false };
  var firstSeed = q.has("seed") ? (parseInt(q.get("seed"), 10) || 1) : null;

  function save() { if (st) lsSet(SAVE_KEY, JSON.stringify({ v: 1, st: st })); }
  function validSave(o) {
    try {
      var s = o && o.st;
      return !!(s && s.v === 1 && s.hands && s.hands.length === s.n && s.scores && s.board && s.board.seq && s.phase && s.phase !== "gameover" && s.rng !== undefined && s.humans);
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ tile art
  var PIPS = [
    [], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]],
    [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]
  ];
  function pipsAt(cx, cy, v, horiz) {
    var s = "", g = 5.1;
    PIPS[v].forEach(function (p) {
      var px = cx + (horiz ? p[1] : p[0]) * g, py = cy + (horiz ? p[0] : p[1]) * g;
      s += '<circle cx="' + px + '" cy="' + py + '" r="2.15" fill="url(#dPip)"/>';
      s += '<circle cx="' + (px - 0.7) + '" cy="' + (py - 0.75) + '" r="0.6" fill="#fff" opacity=".55"/>';
    });
    return s;
  }
  // A tile centred on the origin: 40 by 20 units horizontal, 20 by 40 vertical.
  // v1 is the left (horizontal) or top (vertical) half.
  function tileMarkup(v1, v2, horiz, flat) {
    var w = horiz ? 40 : 20, h = horiz ? 20 : 40, x = -w / 2, y = -h / 2, r = 3.2;
    var s = "";
    if (!flat) s += '<rect x="' + (x + 0.6) + '" y="' + (y + 2.6) + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="#06120A" opacity=".42" filter="url(#dShadow)"/>';
    s += '<rect x="' + x + '" y="' + (y + 1.5) + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#dEdge)"/>';
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#dIvory)"/>';
    s += '<rect x="' + (x + 0.7) + '" y="' + (y + 0.7) + '" width="' + (w - 1.4) + '" height="' + (h - 1.4) + '" rx="' + (r - 0.6) + '" fill="none" stroke="url(#dBevel)" stroke-width="1"/>';
    if (horiz) {
      s += '<line x1="0" y1="' + (y + 2.6) + '" x2="0" y2="' + (y + h - 2.6) + '" stroke="#8E8268" stroke-width=".7" opacity=".9"/>';
      s += '<line x1=".7" y1="' + (y + 2.6) + '" x2=".7" y2="' + (y + h - 2.6) + '" stroke="#fff" stroke-width=".6" opacity=".8"/>';
    } else {
      s += '<line x1="' + (x + 2.6) + '" y1="0" x2="' + (x + w - 2.6) + '" y2="0" stroke="#8E8268" stroke-width=".7" opacity=".9"/>';
      s += '<line x1="' + (x + 2.6) + '" y1=".7" x2="' + (x + w - 2.6) + '" y2=".7" stroke="#fff" stroke-width=".6" opacity=".8"/>';
    }
    s += '<circle cx="0" cy="0" r="1.25" fill="url(#dBrass)" stroke="#5E4410" stroke-width=".25"/>';
    if (horiz) s += pipsAt(-10, 0, v1, true) + pipsAt(10, 0, v2, true);
    else s += pipsAt(0, -10, v1, false) + pipsAt(0, 10, v2, false);
    return s;
  }
  function tileSVG(v1, v2, horiz, cls) {
    var vb = horiz ? "-21 -11 42 24" : "-11 -21 24 44";
    return '<svg class="' + (cls || "") + '" viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + tileMarkup(v1, v2, horiz) + "</svg>";
  }
  function tileName(t) { return t[0] === t[1] ? "double " + NUM[t[0]] : NUM[t[0]] + " " + NUM[t[1]]; }
  function tileShort(t) { return t[0] + "-" + t[1]; }

  // ------------------------------------------------------------ helpers
  function who(seat) { return st.names[seat]; }
  function isHumanTurn() { return st && st.phase === "play" && st.humans[st.turn]; }
  function viewSeat() {
    if (!st) return 0;
    var hc = L.humanCount(st);
    if (hc === 1) return st.humans.indexOf(true);
    if (st.humans[st.turn]) return st.turn;
    return st.lastHuman >= 0 ? st.lastHuman : st.humans.indexOf(true);
  }
  function endsFor(key) {
    return L.legalMoves(st).filter(function (m) { return L.key(m.tile) === key; });
  }
  function delay(kind) {
    if (FAST) return 30;
    if (kind === "draw") return 520;
    if (kind === "think") return 900;
    if (kind === "sheet") return 1100;
    return 700;
  }
  function describe(a) {
    if (!a) return "";
    var n = who(a.seat);
    if (a.type === "play") {
      var m = a.move, where = m.end === "S" ? "to open" : "on the " + END_NAME[m.end];
      return n + " played <b>" + tileShort(m.tile) + "</b> " + where + (a.points ? " for <b>" + a.points + "</b>" : "") + ".";
    }
    if (a.type === "draw") return n + " drew from the boneyard.";
    if (a.type === "pass") return n + " passed.";
    return "";
  }

  // ------------------------------------------------------------ game flow
  function freshSeed() {
    if (firstSeed !== null) { var s = firstSeed; firstSeed = null; return s; }
    return (Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) | 0;
  }
  function startGame() {
    clearTimeout(ui.timer);
    st = L.newGame({ players: opts.players, mode: opts.mode, target: opts.target, seed: freshSeed(), humans: opts.seats === "pass" ? "all" : "one" });
    ui = { sel: null, anim: null, fresh: null, timer: 0, bump: null, sheetSeen: false };
    closeModal(); save(); render(); afterAction();
  }
  function resumeGame(s) {
    clearTimeout(ui.timer);
    st = s;
    ui = { sel: null, anim: null, fresh: null, timer: 0, bump: null, sheetSeen: false };
    closeModal(); render(); afterAction();
  }
  function afterAction() {
    clearTimeout(ui.timer);
    if (!st) return;
    if (st.phase === "roundover") {
      if (!ui.sheetSeen) ui.timer = setTimeout(function () { showRoundOver(); }, delay("sheet"));
      return;
    }
    if (st.phase === "gameover") { showGameOver(); return; }
    if (st.handoff) return;
    if (!st.humans[st.turn]) ui.timer = setTimeout(aiTick, delay(st.lastAction && st.lastAction.type === "draw" && st.lastAction.seat === st.turn ? "draw" : "think"));
  }
  function aiTick() {
    if (!st || st.phase !== "play" || st.humans[st.turn]) return;
    var a = L.aiStep(st);
    if (!a) return;
    if (a.type === "play") { ui.anim = L.key(a.move.tile); ui.bump = st.lastAction.points ? st.lastAction.seat : null; }
    save(); render(); afterAction();
  }
  function doPlay(move) {
    if (!L.play(st, move)) return;
    ui.sel = null; ui.anim = L.key(move.tile); ui.fresh = null;
    ui.bump = st.lastAction.points ? st.lastAction.seat : null;
    save(); render(); afterAction();
  }
  function doDraw() {
    if (!L.draw(st)) return;
    ui.fresh = L.key(st.lastAction.tile); ui.sel = null;
    save(); render(); afterAction();
  }
  function doPass() {
    if (!L.pass(st)) return;
    ui.sel = null;
    save(); render(); afterAction();
  }
  function nextHand() {
    L.nextRound(st);
    ui.sel = null; ui.anim = null; ui.sheetSeen = false; ui.bump = null;
    closeModal(); save(); render(); afterAction();
  }

  // ------------------------------------------------------------ render
  function render() {
    if (!st) return;
    renderStrip(); renderStatus(); renderBoard(); renderChips(); renderPanel(); renderHand(); renderHandoff();
    ui.anim = null;
  }

  function renderStrip() {
    var el = $("strip"), top = Math.max.apply(null, st.scores), me = viewSeat();
    el.style.setProperty("--n", st.n);
    var h = "";
    for (var i = 0; i < st.n; i++) {
      var cls = "pl" + (st.turn === i && st.phase === "play" ? " turn" : "");
      var hidden = L.humanCount(st) > 1 || !st.humans[i];
      h += '<div class="' + cls + '" aria-label="' + esc(who(i)) + ": " + st.scores[i] + " points, " + st.hands[i].length + ' tiles">';
      if (i === me && L.humanCount(st) === 1) h += '<span class="me-tag">You</span>';
      if (ui.bump === i && st.lastAction && st.lastAction.points) h += '<span class="bump">+' + st.lastAction.points + "</span>";
      h += '<div class="nm">' + esc(who(i)) + "</div>";
      h += '<div class="pts' + (st.scores[i] === top && top > 0 ? " lead" : "") + '">' + st.scores[i] + "</div>";
      h += '<div class="sub">' + st.hands[i].length + (st.hands[i].length === 1 ? " tile" : " tiles") + "</div>";
      if (hidden) {
        h += '<div class="stack" aria-hidden="true">';
        for (var k = 0; k < Math.min(st.hands[i].length, 9); k++) h += '<span class="bk"></span>';
        h += "</div>";
      }
      h += "</div>";
    }
    el.innerHTML = h;
  }

  function renderStatus() {
    var s = "";
    var last = describe(st.lastAction);
    if (st.phase === "play") {
      if (st.humans[st.turn]) s = (L.humanCount(st) > 1 ? "<b>" + esc(who(st.turn)) + "</b> to play." : "<b>Your turn.</b>") + (last ? " " + last : "");
      else s = (last ? last + " " : "") + esc(who(st.turn)) + " is thinking.";
    } else if (st.phase === "roundover") {
      var r = st.roundResult;
      s = r.kind === "domino" ? "<b>" + esc(who(r.winner)) + "</b> dominoed." : "The hand is <b>blocked</b>.";
    } else s = "Game over.";
    $("status").innerHTML = s;
  }

  function tableBounds() {
    var tw = $("table").clientWidth || 360;
    return tw < 560 ? { bx: 12, by: 10 } : { bx: 14, by: 12 };
  }
  function renderBoard() {
    var svg = $("board"), lay = L.layoutBoard(st, tableBounds()), bb = lay.bbox;
    var pad = 16, x0 = bb.x0 * U - pad, y0 = bb.y0 * U - pad, w = (bb.x1 - bb.x0) * U + pad * 2, h = (bb.y1 - bb.y0) * U + pad * 2;
    var minW = 200, minH = 120;
    if (w < minW) { x0 -= (minW - w) / 2; w = minW; }
    if (h < minH) { y0 -= (minH - h) / 2; h = minH; }
    svg.setAttribute("viewBox", x0 + " " + y0 + " " + w + " " + h);
    var m = "";
    var newest = st.lastAction && st.lastAction.type === "play" ? L.key(st.lastAction.move.tile) : null;
    if (!lay.tiles.length) m += '<text class="empty" x="0" y="3">' + (isHumanTurn() ? "Lead any tile" : "Open table") + "</text>";
    lay.tiles.forEach(function (t) {
      var inner = "";
      if (t.key === ui.anim && !reduce) {
        var sx = t.arm === "L" ? -16 : t.arm === "R" ? 16 : 0, sy = t.arm === "U" ? -16 : t.arm === "D" ? 16 : 0;
        inner = '<g class="slide" style="--sx:' + sx + "px;--sy:" + sy + 'px">';
      } else inner = "<g>";
      m += '<g transform="translate(' + t.cx * U + " " + t.cy * U + ')">' + inner + tileMarkup(t.v1, t.v2, t.horiz);
      if (t.key === newest) {
        var rw = (t.horiz ? 40 : 20) + 3, rh = (t.horiz ? 20 : 40) + 3;
        m += '<rect class="ring" x="' + (-rw / 2) + '" y="' + (-rh / 2) + '" width="' + rw + '" height="' + rh + '" rx="4.4"/>';
      }
      m += "</g></g>";
    });
    // glowing targets for the selected tile
    if (ui.sel && isHumanTurn()) {
      var legal = endsFor(ui.sel), byEnd = {};
      legal.forEach(function (mv) { byEnd[mv.end] = mv; });
      lay.heads.forEach(function (hd) {
        if (!byEnd[hd.end]) return;
        var gw = hd.horiz ? 40 : 20, gh = hd.horiz ? 20 : 40, hw = Math.max(gw, 46), hh = Math.max(gh, 46);
        m += '<g class="ghost" data-end="' + hd.end + '" tabindex="0" role="button" aria-label="Play on the ' + END_NAME[hd.end] + " end, " + NUM[hd.value] + '">';
        m += '<rect class="hit" x="' + (hd.cx * U - hw / 2) + '" y="' + (hd.cy * U - hh / 2) + '" width="' + hw + '" height="' + hh + '"/>';
        m += '<rect class="g" x="' + (hd.cx * U - gw / 2) + '" y="' + (hd.cy * U - gh / 2) + '" width="' + gw + '" height="' + gh + '" rx="3.2"/>';
        m += '<text x="' + hd.cx * U + '" y="' + hd.cy * U + '">' + hd.value + "</text></g>";
      });
    }
    svg.innerHTML = m;
  }

  function renderChips() {
    var c = "";
    if (st.mode === "fives") c += '<span class="chip">Ends <b>' + L.endsSum(st) + "</b></span>";
    c += '<span class="chip">Hand <b>' + st.round + "</b></span>";
    c += '<span class="chip">To <b>' + st.target + "</b></span>";
    $("chips").innerHTML = c;
    var y = '<div class="cnt" aria-label="Boneyard: ' + st.boneyard.length + ' tiles">Boneyard<b>' + st.boneyard.length + "</b></div>";
    y += '<div class="pile" aria-hidden="true">';
    for (var i = 0; i < Math.min(3, st.boneyard.length); i++) y += '<span style="transform:translate(' + i * 2 + "px," + -i * 2 + 'px)"></span>';
    y += "</div>";
    if (isHumanTurn() && L.canDraw(st)) y += '<button class="btn draw" type="button" data-act="draw">Draw</button>';
    $("yard").innerHTML = y;
  }

  function renderPanel() {
    var h = "";
    if (st.phase === "play" && st.humans[st.turn]) {
      var moves = L.legalMoves(st);
      if (ui.sel) {
        var legal = endsFor(ui.sel), t = legal[0].tile;
        h += '<div class="msg">Play <b>' + tileShort(t) + "</b> where?</div>";
        h += '<div class="btns">';
        legal.forEach(function (mv) {
          var ev = L.openEnds(st).filter(function (e) { return e.end === mv.end; })[0];
          h += '<button class="btn end" type="button" data-end="' + mv.end + '">' + END_NAME[mv.end].charAt(0).toUpperCase() + END_NAME[mv.end].slice(1) + " <b>" + (ev ? ev.value : "") + "</b></button>";
        });
        h += '<button class="btn end" type="button" data-act="cancel">Cancel</button></div>';
      } else if (moves.length) {
        var nEnds = L.openEnds(st).length;
        h += '<div class="msg">' + (st.board.main.length ? "Tap a lifted tile" + (nEnds > 1 ? ", then a glowing end." : ".") : "Lead any tile to open the table.") + "</div>";
      } else if (L.canDraw(st)) {
        h += '<div class="msg">No play. <span class="dim">Draw from the boneyard until you can.</span></div>';
        h += '<div class="btns"><button class="btn primary" type="button" data-act="draw">Draw a tile</button></div>';
      } else {
        h += '<div class="msg">No play and the boneyard is closed.</div>';
        h += '<div class="btns"><button class="btn primary" type="button" data-act="pass">Pass</button></div>';
      }
    } else if (st.phase === "play") {
      h += '<div class="msg"><span class="dim">' + esc(who(st.turn)) + " is choosing a tile.</span></div>";
    } else if (st.phase === "roundover") {
      h += '<div class="msg">Hand ' + st.round + " is over.</div>";
      h += '<div class="btns"><button class="btn primary" type="button" data-act="results">Show results</button></div>';
    } else {
      h += '<div class="msg">' + esc(who(st.winner)) + " wins the game.</div>";
      h += '<div class="btns"><button class="btn primary" type="button" data-act="gameover">Show final score</button></div>';
    }
    $("panel").innerHTML = h;
  }

  function renderHand() {
    var seat = viewSeat(), hand = st.hands[seat] || [], mine = st.phase === "play" && st.turn === seat && st.humans[seat];
    var legalKeys = {};
    if (mine) L.legalMoves(st).forEach(function (m) { legalKeys[L.key(m.tile)] = true; });
    $("meLabel").textContent = (L.humanCount(st) > 1 ? who(seat) + ": " : "Your hand: ") + hand.length + (hand.length === 1 ? " tile" : " tiles") + ", " + L.pipCount(hand) + " pips";
    var h = "";
    hand.forEach(function (t) {
      var k = L.key(t), cls = "ht";
      if (mine) cls += legalKeys[k] ? (ui.sel === k ? " legal sel" : " legal") : " dim";
      else cls += " idle";
      if (ui.fresh === k) cls += " fresh";
      var lbl = tileName(t) + (mine ? (legalKeys[k] ? ", playable" : ", no place to play") : "");
      h += '<button class="' + cls + '" type="button" data-tile="' + k + '" aria-label="' + esc(lbl) + '"' + (mine && !legalKeys[k] ? ' aria-disabled="true"' : "") + ">" + tileSVG(t[0], t[1], false) + "</button>";
    });
    $("hand").innerHTML = h;
  }

  function renderHandoff() {
    var el = $("handoff");
    if (ui.booting || !st.handoff || st.phase !== "play") { el.hidden = true; return; }
    var n = who(st.turn), last = describe(st.lastAction);
    $("handoffCard").innerHTML = '<h2 id="handoff-title">Pass the phone</h2><div class="who">' + esc(n) + "</div>" +
      (last ? '<div class="lastmove">' + last + "</div>" : "") +
      "<p>Only " + esc(n) + " should look at the next screen.</p>" +
      '<button class="btn primary" type="button" data-act="handoff">I am ' + esc(n) + ", show my tiles</button>";
    el.hidden = false;
    var b = el.querySelector("button");
    if (b) b.focus();
  }

  // ------------------------------------------------------------ modal
  var modalKind = "";
  function openModal(html, kind) {
    modalKind = kind || "";
    $("sheet").innerHTML = html;
    $("modal").hidden = false;
    var f = $("sheet").querySelector("button.primary, button");
    if (f) f.focus();
  }
  function closeModal() { $("modal").hidden = true; modalKind = ""; }

  function miniTiles(hand) {
    if (!hand.length) return '<span class="none">out</span>';
    return '<div class="left">' + hand.map(function (t) { return tileSVG(t[0], t[1], false); }).join("") + "</div>";
  }
  function showRoundOver() {
    if (!st || st.phase !== "roundover") return;
    ui.sheetSeen = true;
    var r = st.roundResult, h = "";
    h += '<h2 id="modal-title">Hand ' + r.round + (r.kind === "domino" ? ": domino" : ": blocked") + "</h2>";
    if (r.kind === "domino") h += "<p><b>" + esc(who(r.winner)) + "</b> went out and collects the pips left in the other hands" + (st.mode === "fives" ? ", rounded to the nearest five" : "") + ".</p>";
    else if (r.winner >= 0) h += "<p>Nobody could play. <b>" + esc(who(r.winner)) + "</b> holds the fewest pips and collects the rest" + (st.mode === "fives" ? ", rounded to the nearest five" : "") + ".</p>";
    else h += "<p>Nobody could play and the low counts are tied, so nobody scores this hand.</p>";
    h += '<table class="res"><thead><tr><th style="text-align:left">Player</th><th>Tiles left</th><th>Pips</th><th>Hand</th><th>Total</th></tr></thead><tbody>';
    for (var i = 0; i < st.n; i++) {
      h += '<tr class="' + (i === r.winner ? "win" : "") + '"><td class="n">' + esc(who(i)) + "</td><td>" + miniTiles(r.hands[i]) + "</td><td>" + r.pips[i] + '</td><td class="pts">' + (i === r.winner && r.points ? "+" + r.points : "") + "</td><td>" + r.scores[i] + "</td></tr>";
    }
    h += "</tbody></table>";
    if (r.winner >= 0) h += '<p class="note">' + (r.kind === "domino" ? "Others' pips " : "Others' pips ") + r.raw + (st.mode === "fives" ? " rounds to " + r.points : "") + ". First to " + st.target + " wins.</p>";
    h += '<div class="row"><button class="btn primary" type="button" data-act="next">' + (r.final ? "See the winner" : "Next hand") + "</button></div>";
    openModal(h, "round");
  }
  function showGameOver() {
    if (!st || st.phase !== "gameover") return;
    var w = st.winner, h = '<h2 id="modal-title">Game over</h2>';
    h += '<div class="winner">' + esc(who(w)) + (L.humanCount(st) === 1 && st.humans[w] ? " win" : " wins") + "</div>";
    h += '<div class="big">' + st.scores.map(function (x, i) { return esc(who(i)) + " " + x; }).join(" &middot; ") + "</div>";
    h += "<p>" + (st.mode === "fives" ? "All Fives" : "Block") + ", " + st.n + " players, first to " + st.target + ", " + st.round + (st.round === 1 ? " hand" : " hands") + ".</p>";
    h += '<div class="row"><button class="btn primary" type="button" data-act="again">Play again</button><button class="btn" type="button" data-act="menu">New game</button></div>';
    openModal(h, "over");
  }

  function seg(name, items, cur) {
    return '<div class="seg" role="group" aria-label="' + name + '">' + items.map(function (it) {
      return '<button type="button" data-opt="' + name + '" data-val="' + it[0] + '" class="' + (String(cur) === String(it[0]) ? "on" : "") + '" aria-pressed="' + (String(cur) === String(it[0])) + '">' + it[1] + "</button>";
    }).join("") + "</div>";
  }
  function showMenu(kind) {
    var inGame = st && st.phase !== "gameover";
    var h = '<h2 id="modal-title">' + (kind === "start" ? "New game" : "Menu") + "</h2>";
    h += '<div class="opt"><div class="lbl">Mode<small>' + (opts.mode === "fives" ? "Score when the ends make a multiple of five" : "Go out first; no scoring during the hand") + "</small></div>" + seg("mode", [["fives", "All Fives"], ["block", "Block"]], opts.mode) + "</div>";
    h += '<div class="opt"><div class="lbl">Players<small>' + (opts.players === 2 ? "7 tiles each" : "5 tiles each") + "</small></div>" + seg("players", [[2, "2"], [3, "3"], [4, "4"]], opts.players) + "</div>";
    h += '<div class="opt"><div class="lbl">Seats<small>' + (opts.seats === "ai" ? "You against " + (opts.players - 1) + " computer " + (opts.players - 1 === 1 ? "player" : "players") : "Everyone shares this phone") + "</small></div>" + seg("seats", [["ai", "Computer"], ["pass", "Pass and play"]], opts.seats) + "</div>";
    h += '<div class="opt"><div class="lbl">Target<small>Game ends after the hand in which someone reaches it</small></div>' + seg("target", [[100, "100"], [150, "150"], [250, "250"]], opts.target) + "</div>";
    h += '<div class="row"><button class="btn primary" type="button" data-act="start">' + (inGame ? "Start a new game" : "Deal") + "</button>";
    if (inGame) h += '<button class="btn" type="button" data-act="close">Back to the table</button>';
    h += '<button class="btn" type="button" data-act="rules">Rules</button></div>';
    openModal(h, kind || "menu");
  }
  var RULES = '<h2 id="modal-title">How to play</h2>' +
    "<p>A double six set of 28 tiles. Two players take 7 tiles each, three or four take 5; the rest are the boneyard. Tiles are laid end to end so touching halves match. Doubles sit across the line.</p>" +
    "<h3>All Fives (Muggins)</h3><ul>" +
    "<li>The first double played is the <b>spinner</b>. Once tiles have been played on both of its sides, its other two sides open as well, so the line can have up to four ends.</li>" +
    "<li>After each tile, add up the open ends. If the total is a multiple of five you score that many points. A double at an end counts both halves, and a lone spinner counts both halves until it is played on both sides.</li>" +
    "<li>When a player goes out (dominoes), they score the pips left in the other hands, rounded to the nearest five. If nobody can play, the lowest pip count wins the hand and scores the same way; a tie scores nothing.</li>" +
    "<li>First to the target (150 by default) after a hand wins.</li></ul>" +
    "<h3>Block</h3><ul>" +
    "<li>No spinner and no scoring during the hand. The line has two ends only.</li>" +
    "<li>Whoever goes out, or holds the fewest pips when the hand is blocked, scores the exact pips left in the other hands. First to 100 wins.</li></ul>" +
    "<h3>Turns</h3><ul>" +
    "<li>Round one opens with the highest double held (any tile may be led). After that the winner of the last hand leads.</li>" +
    "<li>If you cannot play, draw from the boneyard until you can. The last two tiles stay in the boneyard; once it is down to two you pass instead.</li>" +
    "<li>Tap a lifted tile, then a glowing end. When only one end fits, the tile plays straight away. Passes are public: the computer remembers which suits you could not play.</li>" +
    "<li>Pass and play hides each hand behind a hand off screen between turns.</li></ul>" +
    '<div class="row"><button class="btn primary" type="button" data-act="close">Close</button></div>';
  function showRules() { openModal(RULES, "rules"); }
  function showWelcome(o) {
    var s = o.st;
    openModal('<h2 id="modal-title">Welcome back</h2><p>A game in progress was saved: ' + (s.mode === "fives" ? "All Fives" : "Block") + ", hand " + s.round + ", scores " + s.scores.map(function (x, i) { return esc(s.names[i]) + " " + x; }).join(", ") + ".</p>" +
      '<div class="row"><button class="btn primary" type="button" data-act="resume">Resume</button><button class="btn" type="button" data-act="menu">New game</button></div>', "welcome");
  }

  // ------------------------------------------------------------ events
  function onTile(key) {
    if (!isHumanTurn()) return;
    var legal = endsFor(key);
    if (!legal.length) return;
    if (ui.sel === key) { ui.sel = null; render(); return; }
    if (legal.length === 1) { doPlay(legal[0]); return; }
    ui.sel = key; render();
  }
  function onEnd(end) {
    if (!ui.sel || !isHumanTurn()) return;
    var mv = endsFor(ui.sel).filter(function (m) { return m.end === end; })[0];
    if (mv) doPlay(mv);
  }
  function act(a) {
    switch (a) {
      case "draw": if (isHumanTurn()) doDraw(); break;
      case "pass": if (isHumanTurn()) doPass(); break;
      case "cancel": ui.sel = null; render(); break;
      case "results": showRoundOver(); break;
      case "gameover": showGameOver(); break;
      case "next": nextHand(); break;
      case "again": startGame(); break;
      case "start": startGame(); break;
      case "menu": showMenu(st && st.phase !== "gameover" ? "menu" : "start"); break;
      case "rules": showRules(); break;
      case "resume": resumeGame(pendingSave.st); pendingSave = null; break;
      case "handoff": L.confirmHandoff(st); save(); render(); afterAction(); break;
      case "close": if (modalKind !== "start") closeModal(); break;
    }
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-act],[data-tile],[data-end],[data-opt]") : null;
    if (!t) return;
    if (t.hasAttribute("data-opt")) {
      var k = t.getAttribute("data-opt"), v = t.getAttribute("data-val");
      if (k === "players" || k === "target") v = parseInt(v, 10);
      opts[k] = v;
      if (k === "mode" && !q.has("target")) opts.target = v === "fives" ? 150 : 100;
      saveOpts(); showMenu(modalKind); return;
    }
    if (t.hasAttribute("data-tile")) { onTile(t.getAttribute("data-tile")); return; }
    if (t.hasAttribute("data-end")) { onEnd(t.getAttribute("data-end")); return; }
    act(t.getAttribute("data-act"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      var g = e.target.closest ? e.target.closest("g.ghost") : null;
      if (g) { e.preventDefault(); onEnd(g.getAttribute("data-end")); }
    }
    if (e.key === "Escape") {
      if (!$("modal").hidden && modalKind !== "start" && modalKind !== "welcome") closeModal();
      else if (ui.sel) { ui.sel = null; render(); }
    }
  });
  $("modal").addEventListener("click", function (e) {
    if (e.target === $("modal") && modalKind !== "start" && modalKind !== "welcome" && modalKind !== "over") closeModal();
  });
  $("btn-rules").addEventListener("click", showRules);
  $("btn-menu").addEventListener("click", function () { showMenu(st && st.phase !== "gameover" ? "menu" : "start"); });
  window.addEventListener("resize", function () { if (st) renderBoard(); });

  // ------------------------------------------------------------ boot
  var pendingSave = readJSON(SAVE_KEY);
  if (firstSeed !== null) { pendingSave = null; lsDel(SAVE_KEY); }
  if (q.has("mode") && (q.get("mode") === "fives" || q.get("mode") === "block")) opts.mode = q.get("mode");
  if (q.has("players") && [2, 3, 4].indexOf(parseInt(q.get("players"), 10)) >= 0) opts.players = parseInt(q.get("players"), 10);
  if (q.has("seats") && (q.get("seats") === "ai" || q.get("seats") === "pass")) opts.seats = q.get("seats");
  if (q.has("target") && [100, 150, 250].indexOf(parseInt(q.get("target"), 10)) >= 0) opts.target = parseInt(q.get("target"), 10);
  if (pendingSave && validSave(pendingSave)) {
    ui.booting = true; st = pendingSave.st; render(); showWelcome(pendingSave);
  } else if (q.has("autostart")) {
    startGame();
  } else {
    showMenu("start");
  }

  window.__dominoes = {
    L: L, get st() { return st; }, set st(v) { st = v; render(); }, opts: opts, ui: ui,
    startGame: startGame, play: doPlay, draw: doDraw, pass: doPass, render: render, nextHand: nextHand,
    aiTick: aiTick, showRoundOver: showRoundOver, showGameOver: showGameOver, showMenu: showMenu
  };
})();
