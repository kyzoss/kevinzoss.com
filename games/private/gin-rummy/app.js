// Gin Rummy UI. All rules live in logic.js; this file draws state and sends actions.
(function () {
  "use strict";
  var L = window.GinLogic;
  var SAVE = "kz-gin-rummy-save-v1", TALLY = "kz-gin-rummy-tally-v1", PREFS = "kz-gin-rummy-prefs-v1";
  var GROUP = ["var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)", "var(--g5)", "#6B7F3A"];
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EMPTY_SVG = "";

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function $(id) { return document.getElementById(id); }

  var st = null, tallied = false, sel = null, flash = "", cpuNote = "", timer = null;
  var prefs = { bigGin: false };
  var tally = { w: 0, l: 0 };
  var drag = null, geom = { step: 0, off: 0, w: 52 };

  try { var p = JSON.parse(lsGet(PREFS) || "null"); if (p && typeof p === "object") prefs.bigGin = !!p.bigGin; } catch (e) {}
  try { var t = JSON.parse(lsGet(TALLY) || "null"); if (t && typeof t.w === "number" && typeof t.l === "number") tally = t; } catch (e) {}

  var q = new URLSearchParams(window.location.search);
  var urlSeed = q.has("seed") ? (parseInt(q.get("seed"), 10) || 1) : null;

  // ---------------------------------------------------------------- save

  function save() {
    if (!st) return;
    lsSet(SAVE, JSON.stringify({ v: 1, st: st, tallied: tallied }));
  }
  function loadSave() {
    try {
      var o = JSON.parse(lsGet(SAVE) || "null");
      if (!o || o.v !== 1 || !o.st || !Array.isArray(o.st.hands) || o.st.hands.length !== 2 || typeof o.st.phase !== "string") return null;
      if (!Array.isArray(o.st.stock) || !Array.isArray(o.st.discard) || typeof o.st.rng !== "number") return null;
      return o;
    } catch (e) { return null; }
  }
  function saveTally() { lsSet(TALLY, JSON.stringify(tally)); }

  function freshSeed() { return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1; }

  function startGame(seed) {
    clearTimeout(timer);
    st = L.newGame(seed, { bigGin: prefs.bigGin });
    tallied = false; sel = null; flash = ""; cpuNote = "";
    save();
    render();
    schedule();
  }

  // ---------------------------------------------------------------- card html

  function rankLabel(c) { return c[0] === "T" ? "10" : c[0]; }
  function isRed(c) { return c[1] === "H" || c[1] === "D"; }
  function pip(s, cls) { return '<svg class="' + (cls || "pip") + '" aria-hidden="true"><use href="#s-' + s + '"/></svg>'; }
  var SUITNAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
  var RANKNAME = { A: "ace", T: "10", J: "jack", Q: "queen", K: "king" };
  function label(c) { return (RANKNAME[c[0]] || c[0]) + " of " + SUITNAME[c[1]]; }

  function miniHtml(c, isNew) {
    return '<span class="mini' + (isRed(c) ? " red" : "") + (isNew ? " new" : "") + '" role="img" aria-label="' + label(c) + '"><span class="r">' + rankLabel(c) + "</span>" + pip(c[1], "pip p") + pip(c[1], "big") + "</span>";
  }
  function faceHtml(c) {
    return '<span class="face cardface' + (isRed(c) ? " red" : "") + '" role="img" aria-label="' + label(c) + '"><span class="r">' + rankLabel(c) + "</span>" + pip(c[1], "pip p") + pip(c[1], "big") + "</span>";
  }

  // ---------------------------------------------------------------- derived

  function human() { return st.turn === 0; }
  function canUseHand() { return !!st; }
  function myPhase() {
    if (!st) return "";
    if (st.phase === "handover" || st.phase === "gameover") return st.phase;
    return st.turn === 0 ? st.phase : "cpu";
  }

  function stat(title, text, cpu) {
    $("status").className = "status" + (cpu ? " cpu" : "");
    $("status").innerHTML = "<b>" + title + "</b><span>" + text + "</span>";
  }

  // ---------------------------------------------------------------- render

  function render() {
    if (!st) return;
    renderScore();
    renderOpp();
    renderTable();
    renderMelds();
    renderHand();
    renderActions();
    renderLog();
    var ph = myPhase();
    if (ph === "cpu") { /* computer note */ }
    if (st.phase === "gameover" && !tallied) {
      tallied = true;
      if (st.final.winner === 0) tally.w++; else tally.l++;
      saveTally(); save();
    }
  }

  function renderScore() {
    var s = st.scores, b = st.boxes;
    var h = "";
    [0, 1].forEach(function (i) {
      h += '<div class="who"><span class="nm">' + (i === 0 ? "You" : "Computer") + (st.turn === i && st.phase !== "handover" && st.phase !== "gameover" ? ' <span class="turnmark">&bull;</span>' : "") + '</span><span class="pts">' + s[i] + "</span></div>";
    });
    h += '<div class="sub">Boxes won: ' + b[0] + " (+" + b[0] * L.BOX_BONUS + ")</div>";
    h += '<div class="sub" style="text-align:right">Boxes won: ' + b[1] + " (+" + b[1] * L.BOX_BONUS + ")</div>";
    h += '<div class="rule"><span>Hand ' + st.handNo + " &middot; first to " + L.GAME_TO + "</span><span>Game +" + L.GAME_BONUS + ", box +" + L.BOX_BONUS + " each hand won</span><span>Record " + tally.w + "-" + tally.l + "</span></div>";
    $("score").innerHTML = h;
  }

  function renderOpp() {
    var n = st.hands[1].length, h = "";
    var step = Math.min(22, 200 / Math.max(1, n));
    var backs = "";
    for (var i = 0; i < n; i++) backs += '<span class="back-card" style="left:' + Math.round(i * step) + 'px"></span>';
    h += '<div class="lab"><b>Computer</b>' + n + " cards" + (st.taken[1].length ? ", took " + st.taken[1].length + " from discards" : "") + '</div><div class="backs">' + backs + "</div>";
    $("opp").innerHTML = h;
  }

  function renderTable() {
    var ph = myPhase();
    var top = st.discard[st.discard.length - 1];
    var live = ph === "draw" && !st.mustStock;
    var stockLive = ph === "draw";
    var h = "";
    h += '<button type="button" class="pile' + (stockLive ? " live" : "") + (flash === "stock" ? " flash" : "") + '" id="pile-stock" aria-label="Stock, ' + st.stock.length + ' cards"' + (stockLive ? "" : " disabled") + '><span class="face down"></span><span class="cnt">Stock ' + st.stock.length + "</span></button>";
    var dLive = live || (ph === "first");
    h += '<button type="button" class="pile' + (dLive ? " live" : "") + (flash === "discard" || flash === "discardTop" ? " flash" : "") + '" id="pile-discard" aria-label="Discard pile"' + (dLive ? "" : " disabled") + ">" + (top ? faceHtml(top) : '<span class="face empty"></span>') + '<span class="cnt">Discard ' + st.discard.length + "</span></button>";
    h += '<div class="status" id="status"></div>';
    $("table").innerHTML = h;
    var sb = $("pile-stock"), db = $("pile-discard");
    sb.addEventListener("click", function () { act("draw", "stock"); });
    db.addEventListener("click", function () { act("draw", "discard"); });
    statusText();
  }

  function statusText() {
    var ph = myPhase(), r = st.result;
    if (ph === "first") {
      var up = st.discard[st.discard.length - 1];
      var dealerNote = st.dealer === 0 ? "You dealt." : "Computer dealt.";
      stat("Your turn", dealerNote + " Take the " + label(up) + " or pass.");
    } else if (ph === "draw") {
      stat("Your turn", st.mustStock ? "Both passed. Draw from the stock." : "Draw from the stock or take the top discard.");
    } else if (ph === "discard") {
      stat("Your turn", "Discard one card, or knock if your deadwood is " + L.KNOCK_MAX + " or less.");
    } else if (ph === "layoff") {
      stat("Layoff", "Computer knocked with " + st.knock.dw + ". Lay off cards onto its melds, then tap Done.");
    } else if (ph === "cpu") {
      stat("Computer", cpuNote || "Thinking...", true);
    } else if (ph === "handover" || ph === "gameover") {
      stat(r && r.type === "draw" ? "Draw" : (r && r.winner === 0 ? "You win the hand" : "Computer wins the hand"), r ? r.text : "");
    }
  }

  function meldHtml(m, idx, live, newCards) {
    return '<button type="button" class="meld' + (live ? " live" : "") + '" data-m="' + idx + '"' + (live ? "" : " tabindex=\"-1\"") + ">" + m.map(function (c) { return miniHtml(c, newCards && newCards.indexOf(c) >= 0); }).join("") + "</button>";
  }

  function renderMelds() {
    var el = $("meldsPanel"), ph = myPhase(), h = "";
    if ((ph === "layoff" || ph === "handover" || ph === "gameover" || (st.knock && ph === "cpu")) && st.knock) {
      var k = st.knock, live = ph === "layoff" && sel;
      var laidCards = k.laid.map(function (x) { return x.card; });
      h += "<div><h2>" + (k.by === 0 ? "Your" : "Computer's") + " melds" + (k.gin ? " (gin)" : "") + " &middot; deadwood " + k.dw + "</h2><div class=\"mrow\">";
      k.melds.forEach(function (m, i) {
        var can = live && L.canLayoff(m, sel);
        h += meldHtml(m, i, can, laidCards);
      });
      if (k.dead.length) h += '<span class="meld dead">' + k.dead.map(function (c) { return miniHtml(c); }).join("") + "</span>";
      h += "</div></div>";
      if (ph === "handover" || ph === "gameover") {
        var r = st.result;
        if (r && r.type !== "draw") {
          var opp = 1 - k.by;
          h += "<div><h2>" + (opp === 0 ? "Your" : "Computer's") + " hand &middot; deadwood " + r.oDw + (r.laid ? " after laying off " + r.laid : "") + '</h2><div class="mrow">';
          r.oppMelds.forEach(function (m) { h += '<span class="meld">' + m.map(function (c) { return miniHtml(c); }).join("") + "</span>"; });
          if (r.oppDead.length) h += '<span class="meld dead">' + r.oppDead.map(function (c) { return miniHtml(c); }).join("") + "</span>";
          h += "</div></div>";
        }
      }
    }
    el.hidden = !h;
    el.innerHTML = h;
  }

  function cardMetrics() {
    var hand = $("hand"), avail = hand.clientWidth || 340;
    var cs = getComputedStyle(document.documentElement);
    var w = parseFloat(cs.getPropertyValue("--cw")) || 52;
    var n = st.hands[0].length;
    var step = n > 1 ? Math.min(w + 8, (avail - w) / (n - 1)) : 0;
    var off = Math.max(0, (avail - (w + step * (n - 1))) / 2);
    geom = { step: step, off: off, w: w };
  }

  function renderHand() {
    var hand = st.hands[0], ph = myPhase();
    var best = L.bestMelds(hand);
    var group = {};
    best.melds.forEach(function (m, gi) { m.forEach(function (c) { group[c] = gi; }); });
    var forbid = L.forbidden(st);
    cardMetrics();
    var h = "", i;
    var showDead = true;
    for (i = 0; i < hand.length; i++) {
      var c = hand[i];
      var left = Math.round(geom.off + i * geom.step);
      var isSel = sel === c;
      var cls = "card slot" + (isRed(c) ? " red" : "") + (isSel ? " sel" : "") + (st.drawn && st.drawn.card === c && st.turn === 0 && st.phase === "discard" ? " fresh" : "");
      if (ph === "layoff" && L.layoffTarget(st, c) >= 0) cls += " canlay";
      if (c === forbid && st.turn === 0) cls += " locked";
      h += '<div class="' + cls + '" role="button" tabindex="0" data-i="' + i + '" aria-label="' + label(c) + (isSel ? ", selected" : "") + '" style="left:' + left + "px;z-index:" + (i + 1) + '"><span class="r">' + rankLabel(c) + "</span>" + pip(c[1], "pip p") + pip(c[1], "big") + "</div>";
      var tag;
      if (c in group) tag = '<i style="background:' + GROUP[group[c] % GROUP.length] + '"></i>';
      else tag = L.points(c);
      h += '<div class="tag" style="left:' + left + 'px">' + tag + "</div>";
    }
    $("hand").innerHTML = h;

    // deadwood readout
    var dw, note = "";
    if (hand.length === 11) {
      var bd = L.bestDiscard(hand, forbid);
      dw = bd ? bd.dw : best.dw;
      note = "after best discard";
    } else dw = best.dw;
    var small = best.melds.length + " meld" + (best.melds.length === 1 ? "" : "s") + ", " + (hand.length - best.dead.length ? "" : "") + best.deadwood.length + " unmatched";
    $("meTop").innerHTML = '<div class="dw' + (dw <= L.KNOCK_MAX ? " ok" : "") + '">Deadwood<strong>' + dw + "</strong></div><div class=\"sm\">" + (note ? note + "<br>" : "") + small + "</div>";
  }

  function hintText() {
    var ph = myPhase(), hand = st.hands[0];
    if (ph === "discard") {
      if (sel) {
        var chk = L.knockCheck(st, sel);
        if (sel === L.forbidden(st)) return "You cannot discard the card you just took from the discard pile.";
        var rest = hand.filter(function (c) { return c !== sel; });
        var dw = L.deadwood(rest);
        return "Discarding " + L.cardName(sel) + " leaves " + dw + " deadwood" + (chk.ok ? (dw === 0 ? ": gin!" : ": you can knock.") : ".") + " Tap another card to move it there.";
      }
      return "Tap a card to select it, then Discard or Knock.";
    }
    if (ph === "layoff") return sel ? "Tap a highlighted meld above, or use Lay off all." : "Tap a card with a gold outline to lay it off.";
    if (ph === "first") return "Cards with a colored bar are in melds. Others show their points.";
    if (sel) return "Tap another card to move the selected card there, or drag it.";
    return "Tap a card, then tap where it should go. Or drag it.";
  }

  function btn(id, text, cls, dis, extra) {
    return '<button type="button" class="btn ' + (cls || "") + '" id="' + id + '"' + (dis ? " disabled" : "") + (extra || "") + ">" + text + "</button>";
  }

  function renderActions() {
    var ph = myPhase(), h = "", hand = st.hands[0];
    $("hint").textContent = (st.phase === "handover" || st.phase === "gameover") ? "" : hintText();
    var idx = sel ? hand.indexOf(sel) : -1;
    if (ph === "handover") {
      h += btn("b-next", "Deal next hand", "primary wide");
      h += btn("b-sort2", "Sort", "");
    } else if (ph === "gameover") {
      h += btn("b-final", "See final score", "primary wide");
      h += btn("b-newgame", "New game", "");
    } else {
      h += btn("b-left", "&#9664;", "mv", idx <= 0, ' aria-label="Move card left"');
      h += btn("b-right", "&#9654;", "mv", idx < 0 || idx >= hand.length - 1, ' aria-label="Move card right"');
      h += btn("b-sort", "Auto-sort", "");
      if (ph === "first") {
        h += btn("b-take", "Take upcard", "primary");
        h += btn("b-pass", "Pass", "");
      } else if (ph === "discard") {
        var chk = sel ? L.knockCheck(st, sel) : { ok: false };
        var disD = !sel || sel === L.forbidden(st);
        h += btn("b-discard", "Discard", "primary", disD);
        var kl = chk.ok ? (chk.dw === 0 ? "Gin!" : "Knock (" + chk.dw + ")") : "Knock";
        h += btn("b-knock", kl, chk.ok ? "gold" : "", !chk.ok);
        if (st.options.bigGin && L.deadwood(hand) === 0) h += btn("b-big", "Big gin (+" + L.BIG_GIN_BONUS + ")", "gold");
      } else if (ph === "layoff") {
        var any = hand.some(function (c) { return L.layoffTarget(st, c) >= 0; });
        h += btn("b-layall", "Lay off all", "", !any);
        h += btn("b-done", "Done", "primary");
      }
    }
    $("actions").innerHTML = h;
    wire("b-left", function () { nudge(-1); });
    wire("b-right", function () { nudge(1); });
    wire("b-sort", doSort);
    wire("b-sort2", doSort);
    wire("b-take", function () { act("draw", "discard"); });
    wire("b-pass", function () { act("pass"); });
    wire("b-discard", function () { if (sel) act("discard", sel); });
    wire("b-knock", function () { if (sel) act("knock", sel); });
    wire("b-big", function () { act("knock", null); });
    wire("b-layall", function () { act("layall"); });
    wire("b-done", function () { act("done"); });
    wire("b-next", function () { act("next"); });
    wire("b-newgame", function () { openMenu(); });
    wire("b-final", function () { openFinal(); });
  }
  function wire(id, fn) { var e = $(id); if (e) e.addEventListener("click", fn); }

  function renderLog() {
    var lg = $("log"), tail = st.log.slice(-8);
    lg.innerHTML = tail.map(function (x) { return "<div>" + x.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</div>"; }).join("");
    lg.scrollTop = lg.scrollHeight;
  }

  // ---------------------------------------------------------------- actions

  function doSort() {
    L.sortHand(st, 0);
    save(); render();
  }
  function nudge(d) {
    if (!sel) return;
    var i = st.hands[0].indexOf(sel);
    L.moveCard(st, 0, i, i + d);
    save(); render();
  }

  function act(kind, arg) {
    if (!st) return;
    var r = { ok: true };
    flash = "";
    cpuNote = "";
    if (kind === "draw") {
      if (st.turn !== 0) return;
      r = L.draw(st, arg);
    } else if (kind === "pass") r = L.pass(st);
    else if (kind === "discard") { if (st.turn !== 0) return; r = L.discard(st, arg); if (r.ok) { sel = null; flash = "discardTop"; } }
    else if (kind === "knock") { r = L.knock(st, arg); if (r.ok) sel = null; }
    else if (kind === "layall") { L.autoLayoff(st, 0); sel = null; }
    else if (kind === "done") { r = L.finishLayoff(st); sel = null; }
    else if (kind === "layoff") { r = L.layoff(st, arg.card, arg.meld); if (r.ok) sel = null; }
    else if (kind === "next") { r = L.nextHand(st); sel = null; }
    if (!r.ok) { $("hint").textContent = r.error; return; }
    save(); render(); schedule();
  }

  // ---------------------------------------------------------------- tap and drag

  function tapCard(i) {
    var c = st.hands[0][i];
    if (st.phase === "layoff") { sel = sel === c ? null : c; render(); return; }
    if (!sel) sel = c;
    else if (sel === c) sel = null;
    else {
      var from = st.hands[0].indexOf(sel);
      L.moveCard(st, 0, from, i);
      sel = null;
      save();
    }
    render();
  }

  function wireHand() {
    var hand = $("hand");
    hand.addEventListener("pointerdown", function (e) {
      var c = e.target.closest(".card");
      if (!c || !st) return;
      drag = { el: c, idx: +c.dataset.i, x0: e.clientX, left0: parseFloat(c.style.left) || 0, moved: false, id: e.pointerId };
    });
    hand.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id || st.phase === "layoff") return;
      var dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) > 8) {
        drag.moved = true;
        drag.el.classList.add("dragging");
        try { drag.el.setPointerCapture(e.pointerId); } catch (x) {}
      }
      if (drag.moved) drag.el.style.left = (drag.left0 + dx) + "px";
    });
    function end(e, cancel) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (cancel) { render(); return; }
      if (d.moved) {
        var left = parseFloat(d.el.style.left) || 0;
        var to = geom.step ? Math.round((left - geom.off) / geom.step) : 0;
        to = Math.max(0, Math.min(st.hands[0].length - 1, to));
        L.moveCard(st, 0, d.idx, to);
        sel = null; save(); render();
      } else tapCard(d.idx);
    }
    hand.addEventListener("pointerup", function (e) { end(e, false); });
    hand.addEventListener("pointercancel", function (e) { end(e, true); });
    hand.addEventListener("keydown", function (e) {
      var c = e.target.closest(".card");
      if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tapCard(+c.dataset.i); }
    });
    $("meldsPanel").addEventListener("click", function (e) {
      var m = e.target.closest(".meld.live");
      if (!m || !sel || st.phase !== "layoff") return;
      act("layoff", { card: sel, meld: +m.dataset.m });
    });
    window.addEventListener("resize", function () { if (st) render(); });
  }

  // ---------------------------------------------------------------- computer

  function schedule() {
    clearTimeout(timer);
    if (!st) return;
    if (st.phase === "handover" || st.phase === "gameover") return;
    if (st.turn !== 1) return;
    var delay = reduced ? 450 : (st.phase === "layoff" ? 1100 : 950);
    timer = setTimeout(cpuStep, delay);
  }

  function cpuStep() {
    if (!st || st.turn !== 1 || st.phase === "handover" || st.phase === "gameover") return;
    var ev = L.aiStep(st);
    cpuNote = ev.text || "";
    flash = "";
    if (ev.type === "draw") flash = st.drawn && st.drawn.from === "discard" ? "discard" : "stock";
    else if (ev.type === "discard") flash = "discardTop";
    save();
    render();
    schedule();
  }

  // ---------------------------------------------------------------- modal

  var modal = $("modal"), sheet = $("sheet");
  var lastFocus = null;
  function openModal(html) {
    lastFocus = document.activeElement;
    sheet.innerHTML = html;
    modal.hidden = false;
    var f = sheet.querySelector("button, input");
    if (f) f.focus();
  }
  function closeModal() { modal.hidden = true; sheet.innerHTML = ""; if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} } }
  modal.addEventListener("click", function (e) { if (e.target === modal && !modal.dataset.lock) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden && !modal.dataset.lock) closeModal(); });

  function rulesHtml() {
    return "<h2>How to play</h2>" +
      "<ul>" +
      "<li><b>Goal:</b> form melds and keep your leftover cards (deadwood) low. A set is 3 or 4 cards of one rank. A run is 3 or more cards in sequence in one suit. Ace is low only: A-2-3 is a run, Q-K-A is not, and there is no wraparound.</li>" +
      "<li><b>Card values:</b> ace 1, 2 to 10 face value, jack, queen and king 10.</li>" +
      "<li><b>Deal:</b> 10 cards each, one card turned up to start the discard pile, the rest is the stock. The non-dealer may take the first upcard or pass. If both pass, the non-dealer draws from the stock.</li>" +
      "<li><b>Your turn:</b> draw the top of the stock or the top of the discard pile, then discard one card. You cannot discard the card you just took from the discard pile.</li>" +
      "<li><b>Knock:</b> when your deadwood after discarding is 10 or less you may knock. Your knock card goes on the pile and the hand ends. <b>Gin</b> is 0 deadwood.</li>" +
      "<li><b>Layoff:</b> after a knock (not gin) the other player may lay off cards onto the knocker's melds: a fourth card on a set, or a card at either end of a run. Then deadwood is compared.</li>" +
      "<li><b>Scoring:</b> the knocker scores the difference. If the opponent's deadwood is equal or lower, that is an <b>undercut</b>: the opponent scores the difference plus 25. Gin scores the opponent's deadwood plus 25 and cannot be laid off on.</li>" +
      "<li><b>Big gin</b> (all 11 cards melded, no discard) scores the opponent's deadwood plus 31. It is an option, off by default: turn it on from New game. With it off, you gin by discarding one card.</li>" +
      "<li><b>Draw:</b> if only 2 cards remain in the stock after a discard, the hand is a draw: no score, same dealer.</li>" +
      "<li><b>Game:</b> hand points add up. First to 100 wins the game and gets 100 bonus points. Each hand won earns a box, worth 25 points to whoever won it, added at the end for both players.</li>" +
      "<li><b>Your hand:</b> tap a card to select it, then tap another card to move it into that spot, or use the arrows, or drag. Auto-sort groups runs and sets and puts deadwood last. A colored bar under a card means it is in a meld, otherwise its point value is shown.</li>" +
      "<li>Your game saves after every move and can be resumed. Add ?seed=N to the address to replay the same deal.</li>" +
      '</ul><div class="row"><button type="button" class="btn primary wide" id="m-close">Got it</button></div>';
  }

  function openRules() { delete modal.dataset.lock; openModal(rulesHtml()); $("m-close").addEventListener("click", closeModal); }

  function openMenu() {
    delete modal.dataset.lock;
    openModal('<h2>New game</h2><p>Start a fresh game to 100. Your current game will be replaced.</p>' +
      '<label class="opt"><input type="checkbox" id="m-big"' + (prefs.bigGin ? " checked" : "") + "> Allow big gin (11 melded cards, bonus " + L.BIG_GIN_BONUS + ")</label>" +
      '<div class="row"><button type="button" class="btn primary wide" id="m-new">Start new game</button><button type="button" class="btn wide" id="m-cancel">Cancel</button></div>');
    $("m-cancel").addEventListener("click", closeModal);
    $("m-new").addEventListener("click", function () {
      prefs.bigGin = $("m-big").checked;
      lsSet(PREFS, JSON.stringify(prefs));
      closeModal();
      startGame(freshSeed());
    });
  }

  function openFinal() {
    var f = st.final;
    if (!f) return;
    var rows = "";
    rows += "<tr><td>Hand points</td><td>" + st.scores[0] + "</td><td>" + st.scores[1] + "</td></tr>";
    rows += "<tr><td>Game bonus</td><td>" + (f.winner === 0 ? f.gameBonus : 0) + "</td><td>" + (f.winner === 1 ? f.gameBonus : 0) + "</td></tr>";
    rows += "<tr><td>Box bonus (" + st.boxes[0] + " / " + st.boxes[1] + ")</td><td>" + f.boxBonus[0] + "</td><td>" + f.boxBonus[1] + "</td></tr>";
    rows += "<tr><th>Total</th><th>" + f.totals[0] + "</th><th>" + f.totals[1] + "</th></tr>";
    modal.dataset.lock = "1";
    openModal("<h2>" + (f.winner === 0 ? "You win" : "Computer wins") + "</h2><table><tr><th></th><th>You</th><th>Computer</th></tr>" + rows + "</table><p>Record: " + tally.w + " won, " + tally.l + ' lost.</p><div class="row"><button type="button" class="btn primary wide" id="m-again">Play again</button><button type="button" class="btn wide" id="m-x">Close</button></div>');
    $("m-again").addEventListener("click", function () { delete modal.dataset.lock; closeModal(); startGame(freshSeed()); });
    $("m-x").addEventListener("click", function () { delete modal.dataset.lock; closeModal(); });
  }

  function openResume(saved) {
    modal.dataset.lock = "1";
    var s = saved.st;
    openModal("<h2>Welcome back</h2><p>You have a game in progress: hand " + s.handNo + ", you " + s.scores[0] + " and computer " + s.scores[1] + ".</p>" +
      '<div class="row"><button type="button" class="btn primary wide" id="m-res">Resume</button><button type="button" class="btn wide" id="m-fresh">New game</button></div>');
    $("m-res").addEventListener("click", function () {
      delete modal.dataset.lock; closeModal();
      st = saved.st; tallied = !!saved.tallied; sel = null;
      render(); schedule();
    });
    $("m-fresh").addEventListener("click", function () { delete modal.dataset.lock; closeModal(); startGame(freshSeed()); });
  }

  // ---------------------------------------------------------------- boot

  $("btn-rules").addEventListener("click", openRules);
  $("btn-menu").addEventListener("click", openMenu);
  wireHand();

  var saved = loadSave();
  if (urlSeed !== null) startGame(urlSeed);
  else if (saved && saved.st.phase !== "gameover") {
    st = saved.st; tallied = !!saved.tallied; sel = null;
    render();
    openResume(saved);
  } else startGame(freshSeed());
})();
