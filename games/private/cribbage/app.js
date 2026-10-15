// Cribbage UI. All rules live in logic.js; this file draws the state, takes
// clicks, runs the computer's turns on a short delay, and saves after every move.
(function () {
  "use strict";
  var L = window.CribbageLogic;

  var SAVE_KEY = "kz-cribbage-save";
  var TALLY_KEY = "kz-cribbage-tally";
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var PIP = {
    S: "M12 1.5C12 1.5 3 8.4 3 14.2c0 2.9 2.2 4.6 4.5 4.6 1.5 0 2.8-.7 3.6-1.8-.1 2.6-.9 4.1-3.1 5.5h8c-2.2-1.4-3-2.9-3.1-5.5.8 1.1 2.1 1.8 3.6 1.8 2.3 0 4.5-1.7 4.5-4.6C21 8.4 12 1.5 12 1.5z",
    H: "M12 22C5 16.6 2 12.8 2 8.8 2 5.7 4.4 3.4 7.2 3.4c2 0 3.9 1.1 4.8 3 .9-1.9 2.8-3 4.8-3C19.6 3.4 22 5.7 22 8.8c0 4-3 7.8-10 13.2z",
    D: "M12 1 20.5 12 12 23 3.5 12z",
    C: "M12 1.8a4.5 4.5 0 0 0-3.4 7.5A4.8 4.8 0 1 0 10.8 17c-.1 2.4-.9 3.9-3.1 5.2h8.6c-2.2-1.3-3-2.8-3.1-5.2a4.8 4.8 0 1 0 2.2-7.7A4.5 4.5 0 0 0 12 1.8z"
  };
  var SUIT_WORD = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
  var RANK_WORD = { A: "ace", T: "10", J: "jack", Q: "queen", K: "king" };
  function pip(s, cls) { return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + PIP[s] + '"/></svg>'; }

  function cardHtml(c, opts) {
    opts = opts || {};
    var red = c[1] === "H" || c[1] === "D";
    var cls = "card" + (red ? " red" : "") + (opts.cls ? " " + opts.cls : "");
    var label = (RANK_WORD[c[0]] || c[0]) + " of " + SUIT_WORD[c[1]];
    var inner = '<span class="idx"><b>' + L.rankName(c) + "</b>" + pip(c[1], "pip") + "</span>" + pip(c[1], "bigpip");
    if (opts.button) return '<button type="button" class="' + cls + '" data-c="' + c + '" aria-label="' + label + '"' + (opts.disabled ? ' aria-disabled="true"' : "") + ">" + inner + "</button>";
    return '<div class="' + cls + '" role="img" aria-label="' + label + '">' + inner + "</div>";
  }
  function backs(n) { var h = ""; for (var i = 0; i < n; i++) h += '<span class="back-card"></span>'; return '<div class="backs" aria-label="' + n + ' hidden cards">' + h + "</div>"; }

  // ------------------------------------------------------------ board svg

  var BX0 = 28, ROWY = [16, 58, 100], LANE = { 0: 0, 1: 12 };
  function holeX(idx) { return BX0 + idx * 8 + Math.floor(idx / 5) * 3.6; }
  function pegPos(n, lane) {
    if (n <= 0) return { x: 12, y: ROWY[0] + LANE[lane] };
    if (n >= 121) return { x: 386, y: ROWY[2] + LANE[lane] };
    var r = Math.floor((n - 1) / 40), idx = (n - 1) % 40;
    if (r % 2 === 1) idx = 39 - idx;
    return { x: holeX(idx), y: ROWY[r] + LANE[lane] };
  }
  function buildBoard() {
    var svg = $("board"), h = "";
    for (var r = 0; r < 3; r++) {
      h += '<rect x="4" y="' + (ROWY[r] - 9) + '" width="392" height="30" rx="6" fill="#efe2c6" stroke="#cdb98f" stroke-width=".8"/>';
      for (var lane = 0; lane < 2; lane++) for (var i = 0; i < 40; i++) {
        var n = r % 2 === 1 ? r * 40 + (40 - i) : r * 40 + i + 1;
        var mark = n % 5 === 0;
        h += '<circle class="hole' + (mark ? " mark" : "") + '" cx="' + holeX(i).toFixed(1) + '" cy="' + (ROWY[r] + LANE[lane]) + '" r="' + (mark ? 2.1 : 1.7) + '"/>';
      }
      for (var k = 1; k <= 4; k++) {
        var nn = r * 40 + k * 10, ii = r % 2 === 1 ? 40 - k * 10 : k * 10 - 1;
        h += '<text class="num" x="' + holeX(ii).toFixed(1) + '" y="' + (ROWY[r] + 21) + '">' + nn + "</text>";
      }
    }
    h += '<circle class="startend" cx="12" cy="' + ROWY[0] + '" r="4"/><circle class="startend" cx="12" cy="' + (ROWY[0] + 12) + '" r="4"/>';
    h += '<circle class="startend" cx="386" cy="' + ROWY[2] + '" r="4.6"/><circle class="startend" cx="386" cy="' + (ROWY[2] + 12) + '" r="4.6"/>';
    h += '<text class="num" x="386" y="' + (ROWY[2] + 21) + '">121</text><text class="num" x="12" y="' + (ROWY[0] + 21) + '">start</text>';
    [["me", 0, 0], ["me", 0, 1], ["cpu", 1, 0], ["cpu", 1, 1]].forEach(function (d, ix) {
      h += '<g class="peg ' + d[0] + (d[2] ? " back" : "") + '" id="peg-' + d[1] + "-" + d[2] + '" style="transform:translate(12px,' + (ROWY[0] + LANE[d[1]]) + 'px)"><circle r="' + (d[2] ? 3.4 : 4.3) + '"/></g>';
    });
    svg.innerHTML = h;
  }
  function placePegs() {
    for (var p = 0; p < 2; p++) {
      var f = pegPos(st.scores[p], p), b = pegPos(st.prev[p], p);
      $("peg-" + p + "-0").style.transform = "translate(" + f.x + "px," + f.y + "px)";
      $("peg-" + p + "-1").style.transform = "translate(" + b.x + "px," + b.y + "px)";
    }
  }

  // ---------------------------------------------------------------- state

  var st = null;
  var ui = { sel: [], timer: null, ghost: null, modal: null };

  function loadTally() {
    var t = { w: 0, l: 0, sw: 0, sl: 0, dw: 0, dl: 0 };
    try { var j = JSON.parse(lsGet(TALLY_KEY) || "null"); if (j && typeof j === "object") for (var k in t) if (typeof j[k] === "number") t[k] = j[k]; } catch (e) {}
    return t;
  }
  var tally = loadTally();
  function saveTally() { lsSet(TALLY_KEY, JSON.stringify(tally)); }
  function save() { if (st) lsSet(SAVE_KEY, JSON.stringify(st)); }

  function seedNow() { return (Date.now() % 2147483647) >>> 0; }
  var q = new URLSearchParams(window.location.search);
  var forcedSeed = q.has("seed") ? ((parseInt(q.get("seed"), 10) >>> 0) || 1) : null;

  function newGame(seed) {
    clearTimeout(ui.timer); ui.timer = null;
    ui.sel = []; ui.ghost = null; ui.modal = null;
    st = L.newGame(seed == null ? seedNow() : seed);
    closeModal();
    afterAction();
  }

  function validState(s) {
    return s && typeof s === "object" && s.v === 1 && Array.isArray(s.scores) && Array.isArray(s.hands) && typeof s.phase === "string";
  }

  function recordResult() {
    if (st.phase !== "over" || st.tallied) return;
    st.tallied = true;
    if (st.winner === 0) { tally.w++; if (st.skunk === 1) tally.sw++; if (st.skunk === 2) tally.dw++; }
    else { tally.l++; if (st.skunk === 1) tally.sl++; if (st.skunk === 2) tally.dl++; }
    saveTally();
  }

  function afterAction() {
    recordResult();
    save();
    render();
    schedule();
    if (st.phase === "over" && !ui.modal) showOver();
  }

  function delay() { return reduce ? 250 : 950; }
  function schedule() {
    if (ui.timer || !st) return;
    if (st.phase === "play" && st.turn === 1) {
      ui.timer = setTimeout(function () { ui.timer = null; aiAct(); }, delay());
    }
  }
  function snapshotGhost(before, card) {
    ui.ghost = st.pile.length === 0 && st.phase === "play" ? { cards: before.concat([card]), p: st.lastPlay ? st.lastPlay.p : 0 } : (st.phase === "play" ? null : ui.ghost);
  }
  function aiAct() {
    if (!st || st.phase !== "play" || st.turn !== 1) return;
    var before = st.pile.slice();
    if (!L.aiStep(st)) return;
    snapshotGhost(before, st.lastPlay.card);
    afterAction();
  }
  function humanPlay(card) {
    if (st.phase !== "play" || st.turn !== 0) return;
    var before = st.pile.slice();
    if (!L.play(st, 0, card)) return;
    snapshotGhost(before, card);
    afterAction();
  }

  // -------------------------------------------------------------- render

  function lastLog() { return st.log.length ? st.log[st.log.length - 1] : null; }

  function render() {
    var active = document.activeElement, focusIdx = -1;
    var hc = $("hand");
    if (active && active.classList && active.classList.contains("card") && hc.contains(active)) focusIdx = Array.prototype.indexOf.call(hc.children, active);

    $("tally").textContent = tally.w + "-" + tally.l;
    renderScores();
    placePegs();
    renderStatus();
    renderTable();
    renderPanel();
    renderHand();
    renderLog();

    if (focusIdx >= 0) {
      var cs = hc.querySelectorAll(".card");
      if (cs.length) cs[Math.min(focusIdx, cs.length - 1)].focus();
    }
  }

  function renderScores() {
    $("scores").innerHTML =
      '<div class="sc me"><span class="dot"></span><span class="lbl">You</span><b>' + st.scores[0] + "</b></div>" +
      '<div class="lbl" style="align-self:center">First to 121</div>' +
      '<div class="sc cpu"><b>' + st.scores[1] + '</b><span class="lbl">Computer</span><span class="dot"></span></div>';
  }

  function renderStatus() {
    var d = st.dealer === 0 ? "You" : "Computer";
    var ph = { discard: "Choose your crib cards", play: "Pegging", count: "Counting", over: "Game over" }[st.phase];
    $("status").innerHTML = "<span>Hand " + st.round + " &middot; Dealer <b>" + d + '</b> <span class="chip' + (st.dealer === 1 ? " cpu" : "") + '">' + (st.dealer === 0 ? "your crib" : "computer's crib") + "</span></span><span>" + ph + "</span>";
  }

  function pileHtml(cards, p, ghost) {
    var h = '<div class="pile' + (ghost ? " ghost" : "") + '">';
    cards.forEach(function (c, i) {
      var last = i === cards.length - 1;
      h += cardHtml(c, { cls: last && !ghost ? (p === 1 ? "cpuplay" : "latest") : "" });
    });
    return h + "</div>";
  }

  function itemsHtml(cur) {
    var h = '<ul class="items">';
    if (!cur.items.length) h += '<li class="none">No points</li>';
    cur.items.forEach(function (it) {
      h += "<li><span>" + esc(it.label) + "</span><span>" + it.cards.map(L.cardName).join(" ") + "</span></li>";
    });
    return h + '<li class="sum"><span>Total</span><span>' + cur.total + "</span></li></ul>";
  }

  function renderTable() {
    var t = $("table"), h = "";
    var cribMine = st.dealer === 0;
    t.className = "table" + (st.phase === "count" || st.phase === "over" ? " counting" : "");
    if (st.phase === "count" || st.phase === "over") {
      var cur = st.count.current;
      if (!cur && st.phase === "over") {
        h += '<div class="countbox"><h3>Game over</h3><div class="note">' + (st.winner === 0 ? "You reached 121 first." : "The computer reached 121 first.") + "</div></div>";
      } else if (!cur) {
        h += '<div class="countbox"><h3>Pegging is over</h3><div class="countcards">' + cardHtml(st.starter) + '</div><div class="note">Starter card. Next, hands are counted: ' + (st.dealer === 0 ? "the computer's, yours, then your crib." : "yours, the computer's, then the computer's crib.") + "</div></div>";
      } else {
        var title = cur.kind === "crib" ? (cur.who === 0 ? "Your crib" : "Computer's crib") : (cur.who === 0 ? "Your hand" : "Computer's hand");
        h += '<div class="countbox"><h3>' + title + " counts " + cur.total + '</h3><div class="countcards">' +
          cur.cards.map(function (c) { return cardHtml(c); }).join("") + '<span class="plus">+</span>' + cardHtml(st.starter, { cls: "" }) +
          "</div>" + itemsHtml(cur) + "</div>";
      }
    } else {
      var oppN = st.phase === "play" ? st.pegHands[1].length : st.hands[1].length;
      h += '<div class="opp"><span class="nm">Computer</span>' + backs(oppN) + "</div>";
      h += '<div class="mid"><div class="side">';
      if (st.starter) h += '<div>' + cardHtml(st.starter) + '<div class="cap" style="margin-top:4px">Starter</div></div>';
      var cribN = st.crib.length;
      h += '<div><div class="cribstack">' + (cribN ? '<span class="back-card"></span><span class="back-card"></span>' : "") + '</div><div class="cap" style="margin-top:6px">' + (cribMine ? "Your crib" : "Computer's crib") + " (" + cribN + ")</div></div>";
      h += '</div><div class="pilecol">';
      if (st.phase === "discard") {
        h += '<div class="note" style="margin-top:34px">Pick two cards from your hand to send to ' + (cribMine ? "your own crib." : "the computer's crib.") + '<br><br>' + (cribMine ? "Keep points in hand, and give your crib helpful cards." : "Keep points in hand, and avoid feeding the computer's crib.") + "</div>";
      } else {
        h += '<div class="total">' + st.total + "<small>Count (max 31)</small></div>";
        if (st.pile.length) h += pileHtml(st.pile, st.lastPlay ? st.lastPlay.p : 0, false);
        else if (ui.ghost) h += pileHtml(ui.ghost.cards, ui.ghost.p, true) + '<div class="note">Count reset to 0</div>';
        else h += '<div class="note">' + (st.turn === 0 ? "You lead." : "Computer leads.") + "</div>";
      }
      h += "</div></div>";
    }
    t.innerHTML = h;
  }

  function renderPanel() {
    var p = $("panel"), h = "", ll = lastLog();
    if (ll) h += '<div class="banner ' + (ll.who === 0 ? "me" : ll.who === 1 ? "cpu" : "") + '">' + esc(ll.text) + "</div>";
    if (st.phase === "discard") {
      h += '<div class="msg">Select 2 cards (' + ui.sel.length + "/2)</div>";
      h += '<div class="btns"><button class="btn primary" id="act" type="button"' + (ui.sel.length === 2 ? "" : " disabled") + ">Send to the crib</button></div>";
    } else if (st.phase === "play") {
      if (st.turn === 0) h += '<div class="msg">Your turn: play a card<small>Count is ' + st.total + ". Cards that would go over 31 are dimmed.</small></div>";
      else h += '<div class="msg">Computer is thinking&hellip;</div>';
    } else if (st.phase === "count") {
      var c = st.count;
      var label = c.step === 0 ? "Count hands" : c.step === 1 ? "Next: " + (st.dealer === 0 ? "your hand" : "computer's hand") : c.step === 2 ? "Next: " + (st.dealer === 0 ? "your crib" : "computer's crib") : "Deal the next hand";
      h += '<div class="btns"><button class="btn primary" id="act" type="button">' + label + "</button></div>";
    } else {
      h += '<div class="btns"><button class="btn primary" id="act" type="button">New game</button></div>';
    }
    p.innerHTML = h;
    var a = $("act");
    if (a) a.onclick = onAct;
  }

  function onAct() {
    if (!st) return;
    if (st.phase === "discard") {
      if (ui.sel.length !== 2) return;
      var pick = ui.sel.slice(); ui.sel = [];
      L.discard(st, 0, pick);
      ui.ghost = null;
      afterAction();
    } else if (st.phase === "count") {
      L.countNext(st);
      ui.ghost = null; ui.sel = [];
      afterAction();
    } else if (st.phase === "over") {
      newGame();
    }
  }

  function renderHand() {
    var el = $("hand"), h = "", cards = [];
    if (st.phase === "discard") cards = st.hands[0];
    else if (st.phase === "play") cards = st.pegHands[0];
    el.className = "hand" + (cards.length ? "" : " empty");
    var legal = st.phase === "play" && st.turn === 0 ? L.legalPlays(st, 0) : [];
    cards.forEach(function (c, i) {
      var cls = "", dis = false;
      if (st.phase === "discard") cls = ui.sel.indexOf(c) >= 0 ? "sel" : "";
      else if (st.turn === 0) { if (legal.indexOf(c) < 0) { cls = "disabled"; dis = true; } }
      else cls = "idle";
      h += cardHtml(c, { button: true, cls: cls, disabled: dis });
    });
    el.innerHTML = h;
  }

  function renderLog() {
    var h = "";
    st.log.slice(-40).forEach(function (e) { h += '<li class="' + (e.who === 0 ? "me" : e.who === 1 ? "cpu" : "") + '">' + esc(e.text) + "</li>"; });
    var ol = $("log");
    ol.innerHTML = h;
    ol.scrollTop = ol.scrollHeight;
  }

  $("hand").addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest(".card") : null;
    if (!b || !st) return;
    var c = b.getAttribute("data-c");
    if (st.phase === "discard") {
      var i = ui.sel.indexOf(c);
      if (i >= 0) ui.sel.splice(i, 1);
      else if (ui.sel.length < 2) ui.sel.push(c);
      else { ui.sel.shift(); ui.sel.push(c); }
      renderPanel(); renderHand();
      var cs = $("hand").querySelectorAll(".card");
      for (var k = 0; k < cs.length; k++) if (cs[k].getAttribute("data-c") === c) cs[k].focus();
    } else if (st.phase === "play" && st.turn === 0) {
      humanPlay(c);
    }
  });

  // --------------------------------------------------------------- modals

  function openModal(html) {
    $("sheet").innerHTML = html;
    $("modal").hidden = false;
    ui.modal = true;
    var b = $("sheet").querySelector("button");
    if (b) b.focus({ preventScroll: true });
    $("sheet").scrollTop = 0;
  }
  function closeModal() { $("modal").hidden = true; ui.modal = null; }
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });

  function showRules() {
    openModal(
      '<h2 id="modal-title">How to play</h2>' +
      "<p>Cribbage is a race to <b>121 points</b>, pegged on the board above. You play the computer. The game ends the moment anyone reaches 121, even in the middle of a count.</p>" +
      "<h3>Each hand</h3><ul>" +
      "<li>The deal alternates. Each player gets 6 cards and sends 2 to the <b>crib</b>, which belongs to the dealer and is counted last.</li>" +
      "<li>The starter card is cut from the deck. If it is a jack, the dealer pegs <b>2 for his heels</b>.</li>" +
      "<li>Card values: ace 1, 2 to 10 face value, jack, queen and king 10.</li></ul>" +
      "<h3>The play (pegging)</h3><ul>" +
      "<li>The player without the crib leads. Players take turns laying one card, announcing a running total that may never go over 31.</li>" +
      "<li>If you cannot play without going over 31 you say go and the other player keeps playing. Whoever plays the last card gets <b>1 for go</b> (or 1 for the last card). Then the count restarts at 0 and the other player leads.</li>" +
      "<li>Making exactly 15 scores <b>2</b>. Making exactly 31 scores <b>2</b> (and no extra point for go).</li>" +
      "<li>Pairs in a row: pair <b>2</b>, three of a kind <b>6</b>, four of a kind <b>12</b>.</li>" +
      "<li>Runs: the latest 3 or more cards form a run in any order, scoring the length (3, 4, 5, 6 or 7). Ace is low only, there is no wrap from king to ace.</li></ul>" +
      "<h3>The show (counting)</h3><ul>" +
      "<li>Hands are counted in this order: the player without the crib, the dealer, then the crib (dealer). Each uses the 4 kept cards plus the starter.</li>" +
      "<li>Each combination of cards totalling 15 scores 2. Each pair scores 2. Runs of 3 or more score their length, once for every different way of making the longest run (a double run of 3 is 6, a triple is 9, a double double is 12).</li>" +
      "<li>Flush: 4 cards of one suit in your hand scores 4, or 5 if the starter matches too. In the crib only a 5 card flush scores.</li>" +
      "<li>His nobs: a jack in your hand (or the crib) of the same suit as the starter scores 1.</li>" +
      "<li>The best possible hand is 29: three 5s and a jack, with the fourth 5 as the starter and the jack matching its suit.</li></ul>" +
      "<h3>Skunks</h3><p>Win while the loser is below 91 for a skunk, below 61 for a double skunk. These are kept in your tally.</p>" +
      "<h3>The computer</h3><p>It keeps the four cards with the best average score over every possible starter, adjusted for the value of the crib it gives away or receives. In the play it takes 15s, 31s, pairs and runs, avoids leaving totals where you can easily make 15 or 31, and leads low cards (never a 5 if it can help it).</p>" +
      "<h3>Controls</h3><p>Tap a card to select or play it. Keys 1 to 6 pick the nth card, Enter presses the main button. The log lists every score so you can check the count. Add ?seed=N to the address to replay the same deals.</p>" +
      '<div class="row"><button class="btn primary" id="m-close" type="button">Got it</button></div>');
    $("m-close").onclick = closeModal;
  }

  function showMenu() {
    var inProgress = st && st.phase !== "over";
    openModal(
      '<h2 id="modal-title">Menu</h2>' +
      '<div class="stat"><span>Wins</span><b>' + tally.w + '</b></div><div class="stat"><span>Losses</span><b>' + tally.l + "</b></div>" +
      '<div class="stat"><span>Skunks you gave</span><b>' + tally.sw + ' (double ' + tally.dw + ')</b></div><div class="stat"><span>Skunks you took</span><b>' + tally.sl + ' (double ' + tally.dl + ")</b></div>" +
      '<p style="color:#7B7064;font-size:12px">Game seed ' + (st ? st.seed : "") + ". Add ?seed=" + (st ? st.seed : "N") + " to the address to replay this game's deals.</p>" +
      '<div class="row"><button class="btn primary" id="m-new" type="button">New game</button><button class="btn" id="m-reset" type="button">Reset tally</button><button class="btn" id="m-close" type="button">Close</button></div>');
    $("m-close").onclick = closeModal;
    $("m-reset").onclick = function () { tally = { w: 0, l: 0, sw: 0, sl: 0, dw: 0, dl: 0 }; saveTally(); render(); showMenu(); };
    $("m-new").onclick = function () {
      if (inProgress && !window.confirm("Abandon this game and start a new one?")) return;
      newGame();
    };
  }

  function showOver() {
    var won = st.winner === 0;
    var sk = st.skunk === 2 ? (won ? "Double skunk! The computer finished below 61." : "Double skunk. You finished below 61.") : st.skunk === 1 ? (won ? "Skunk! The computer finished below 91." : "Skunk. You finished below 91.") : "";
    openModal(
      '<h2 id="modal-title">' + (won ? "You win" : "Computer wins") + "</h2>" +
      '<div class="big">' + st.scores[0] + " &ndash; " + st.scores[1] + "</div>" + (sk ? "<p>" + sk + "</p>" : "") +
      "<p>Record: " + tally.w + (tally.w === 1 ? " win, " : " wins, ") + tally.l + (tally.l === 1 ? " loss." : " losses.") + "</p>" +
      '<div class="row"><button class="btn primary" id="m-new" type="button">Play again</button><button class="btn" id="m-close" type="button">Close</button></div>');
    $("m-new").onclick = function () { newGame(); };
    $("m-close").onclick = closeModal;
  }

  function showResume(saved) {
    openModal(
      '<h2 id="modal-title">Welcome back</h2><p>You have a game in progress (' + saved.scores[0] + " to " + saved.scores[1] + ", hand " + saved.round + ").</p>" +
      '<div class="row"><button class="btn primary" id="m-res" type="button">Resume</button><button class="btn" id="m-new" type="button">New game</button></div>');
    $("m-res").onclick = function () { closeModal(); st = saved; afterAction(); };
    $("m-new").onclick = function () { newGame(); };
  }

  $("btn-rules").onclick = showRules;
  $("btn-menu").onclick = showMenu;

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ui.modal) { closeModal(); return; }
    if (ui.modal || !st || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-6]$/.test(e.key)) {
      var cs = $("hand").querySelectorAll(".card");
      var c = cs[parseInt(e.key, 10) - 1];
      if (c) { c.click(); e.preventDefault(); }
    } else if (e.key === "Enter") {
      var t = e.target;
      if (t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
      var a = $("act");
      if (a && !a.disabled) { a.click(); e.preventDefault(); }
    }
  });

  // ---------------------------------------------------------------- boot

  buildBoard();
  var saved = null;
  try { saved = JSON.parse(lsGet(SAVE_KEY) || "null"); } catch (e) { saved = null; }
  if (forcedSeed != null) {
    newGame(forcedSeed);
  } else if (validState(saved) && saved.phase !== "over") {
    st = saved;
    render();
    showResume(saved);
  } else {
    newGame();
  }
  window.__cribbage = { get st() { return st; }, newGame: newGame };
})();
