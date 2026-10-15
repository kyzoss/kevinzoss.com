// Hearts UI. All rules and computer play live in logic.js; this file draws the
// table, takes the human's taps (South) and paces the computer players.
(function () {
  "use strict";
  var L = window.HeartsLogic;
  var HUMAN = 0;
  var SAVE_KEY = "hearts.save.v1", TALLY_KEY = "hearts.tally.v1", OPT_KEY = "hearts.opts.v1";
  var SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
  var SUIT_ONE = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
  var RANK_NAME = { "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine", T: "Ten", J: "Jack", Q: "Queen", K: "King", A: "Ace" };
  var NAMES = ["You", "West", "North", "East"];
  var DIR_TEXT = { left: "left", right: "right", across: "across", none: "none" };
  var q = new URLSearchParams(location.search);
  var FAST = q.has("fast");
  var coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // ------------------------------------------------------------ storage
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function readJSON(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var opts = { moon: "others", jd: false, confirm: coarse };
  (function () {
    var o = readJSON(OPT_KEY);
    if (o && typeof o === "object") {
      if (o.moon === "others" || o.moon === "self") opts.moon = o.moon;
      if (typeof o.jd === "boolean") opts.jd = o.jd;
      if (typeof o.confirm === "boolean") opts.confirm = o.confirm;
    }
  })();
  var tally = { w: 0, l: 0 };
  (function () {
    var t = readJSON(TALLY_KEY);
    if (t && typeof t.w === "number" && typeof t.l === "number") tally = { w: t.w, l: t.l };
  })();

  var G = null;        // { st, tallied }
  var ui = { sel: [], timer: 0 };
  var firstSeed = q.has("seed") ? (parseInt(q.get("seed"), 10) || 1) : null;

  function save() { if (G) lsSet(SAVE_KEY, JSON.stringify({ v: 1, st: G.st, tallied: G.tallied })); }
  function saveTally() { lsSet(TALLY_KEY, JSON.stringify(tally)); }
  function saveOpts() { lsSet(OPT_KEY, JSON.stringify(opts)); }

  function validSave(o) {
    try {
      var st = o && o.st;
      return !!(st && st.hands && st.hands.length === 4 && st.scores && st.scores.length === 4 && st.phase && st.phase !== "gameover" && st.rng !== undefined && st.opts && st.passSel && st.taken);
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ game flow
  function freshSeed() {
    if (firstSeed !== null) { var s = firstSeed; firstSeed = null; return s; }
    return (Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) | 0;
  }
  function newGame() {
    clearTimeout(ui.timer);
    G = { st: L.newGame(freshSeed(), { moon: opts.moon, jd: opts.jd }), tallied: false };
    ui.sel = [];
    save(); closeModal(); render(); schedule();
  }
  function resumeGame(o) {
    clearTimeout(ui.timer);
    G = { st: o.st, tallied: !!o.tallied };
    ui.sel = [];
    closeModal(); render(); schedule();
  }

  function delay(kind) {
    if (FAST) return 25;
    if (kind === "trick") return 1300;
    if (kind === "pass") return 700;
    return 850;
  }

  function schedule() {
    clearTimeout(ui.timer);
    var st = G.st;
    if (st.phase === "gameover" || st.phase === "handdone") return;
    if (st.phase === "trickdone") { ui.timer = setTimeout(function () { L.collect(st); after(); }, delay("trick")); return; }
    if (st.phase === "pass") {
      if (st.passSel[HUMAN]) ui.timer = setTimeout(function () { L.aiStep(st); after(); }, delay("pass"));
      return;
    }
    if (L.actor(st) !== HUMAN) ui.timer = setTimeout(function () { L.aiStep(st); after(); }, delay("play"));
  }

  function after() {
    var st = G.st;
    ui.sel = [];
    if (st.phase === "gameover" && !G.tallied) {
      G.tallied = true;
      if (st.winner === HUMAN) tally.w++; else tally.l++;
      saveTally(); save(); render(); showGameOver(st);
      return;
    }
    save(); render(); schedule();
  }

  // ------------------------------------------------------------ card drawing
  function isRed(s) { return s === "H" || s === "D"; }
  function pip(s) { return '<svg class="pip" aria-hidden="true"><use href="#s-' + s + '"/></svg>'; }
  function cardName(c) { return RANK_NAME[c[0]] + " of " + SUIT_ONE[c[1]]; }
  function cardHTML(c, o) {
    o = o || {};
    var r = c[0] === "T" ? "10" : c[0], s = c[1];
    var tag = "", tcls = "";
    if (c === "QS") tag = "13 pts";
    else if (c === "JD" && G && G.st.opts.jd) { tag = "-10"; tcls = " good"; }
    var cls = "card " + (isRed(s) ? "red" : "blk") + (o.cls ? " " + o.cls : "");
    var inner = '<span class="idx"><b>' + r + "</b>" + pip(s) + "</span>" +
      '<svg class="big" aria-hidden="true"><use href="#s-' + s + '"/></svg>' +
      '<span class="tag' + (tag ? " on" : "") + tcls + '">' + tag + "</span>";
    if (o.btn) {
      return '<button type="button" class="' + cls + '" data-card="' + c + '" aria-label="' + cardName(c) + '"' + (o.disabled ? ' aria-disabled="true"' : "") + (o.pressed ? ' aria-pressed="true"' : "") + ">" + inner + "</button>";
    }
    return '<div class="' + cls + '" role="img" aria-label="' + cardName(c) + '">' + inner + "</div>";
  }
  function backsHTML(n) {
    var h = "", k = Math.min(n, 7);
    for (var i = 0; i < k; i++) h += '<span class="back-card"></span>';
    return '<div class="backs" aria-hidden="true">' + h + "</div>";
  }

  // ------------------------------------------------------------ render
  function who(s) { return NAMES[s]; }
  function handPts(st, s) {
    var n = 0;
    for (var i = 0; i < st.taken[s].length; i++) n += L.cardPoints(st.taken[s][i], st.opts.jd);
    return n;
  }
  function dirLabel(st) {
    if (st.passDir === "none") return "No passing";
    var to = L.passTarget(HUMAN, st.passDir);
    return "Passing " + DIR_TEXT[st.passDir] + (st.passDir === "across" ? " (North)" : " (" + who(to) + ")");
  }

  function render() {
    if (!G) return;
    var st = G.st;
    renderScore(st);
    for (var s = 1; s <= 3; s++) renderSeat(st, s);
    renderCenter(st);
    renderPanel(st);
    renderHand(st);
    $("tally").textContent = "W-L " + tally.w + "-" + tally.l;
  }

  function renderScore(st) {
    var lowest = Math.min.apply(null, st.scores), highest = Math.max.apply(null, st.scores);
    var h = "";
    for (var s = 0; s < 4; s++) {
      var cls = "pl" + (s === 0 ? " you" : "") + (st.scores[s] === lowest && highest !== lowest ? " low" : "") + (st.scores[s] === highest && highest !== lowest ? " high" : "");
      var hp = st.phase === "pass" ? "" : "Hand " + handPts(st, s);
      h += '<div class="' + cls + '"><div class="lbl">' + who(s) + '</div><div class="pts">' + st.scores[s] + '</div><div class="hp">' + hp + "</div></div>";
    }
    $("score").innerHTML = h;
    var info = "Hand " + st.handNo + " &middot; <b>" + dirLabel(st) + "</b>";
    if (st.phase !== "pass") info += " &middot; Hearts " + (st.broken ? "<b>broken</b>" : "not broken");
    info += " &middot; First to 100 ends it";
    $("info").innerHTML = info;
  }

  function renderSeat(st, s) {
    var el = $("seat-" + s);
    var turn = (st.phase === "play" && st.turn === s) || (st.phase === "trickdone" && st.trickWinner === s);
    var sub = "";
    if (st.phase === "pass") sub = st.passSel[s] ? "passed" : "choosing";
    else if (st.leader === s && st.trickNo === 0 && st.phase !== "handdone") sub = "leads";
    el.className = "seat s-" + ["", "w", "n", "e"][s] + (turn ? " turn" : "");
    el.innerHTML = '<div class="nm">' + NAMES[s] + '</div><div class="sub">' + sub + "</div>" + backsHTML(st.hands[s].length);
  }

  function renderCenter(st) {
    var c = $("center");
    var cards = st.trick, note = "";
    if (st.phase === "pass") {
      note = st.passDir === "none" ? "" : "Choose 3 cards to pass " + DIR_TEXT[st.passDir];
      c.innerHTML = '<div class="trick"><div class="mid-note">' + esc(note) + "</div></div>";
      return;
    }
    var pos = { 0: "s", 1: "w", 2: "n", 3: "e" };
    var h = '<div class="trick">';
    cards.forEach(function (t) {
      var cls = "sm";
      if (st.phase === "trickdone" && t.seat === st.trickWinner) cls += " win";
      else if (st.last && st.last.seat === t.seat && st.last.card === t.card && st.phase !== "trickdone") cls += " latest";
      h += '<div class="p-' + pos[t.seat] + '">' + cardHTML(t.card, { cls: cls }) + "</div>";
    });
    if (st.phase === "trickdone") {
      var pts = 0;
      st.trick.forEach(function (t) { pts += L.cardPoints(t.card, st.opts.jd); });
      note = "<b>" + who(st.trickWinner) + (st.trickWinner === 0 ? " take" : " takes") + "</b> the trick" + (pts ? "<br>" + (pts > 0 ? "+" : "") + pts + " pts" : "");
    } else if (!cards.length) {
      if (st.phase === "handdone" || st.phase === "gameover") note = "Hand over";
      else note = "Trick " + (st.trickNo + 1) + " of 13";
    }
    h += '<div class="mid-note">' + note + "</div></div>";
    c.innerHTML = h;
  }

  function renderHand(st) {
    var hand = L.sortHand(st.hands[HUMAN]);
    var legal = null, canAct = false, passing = st.phase === "pass" && !st.passSel[HUMAN];
    if (st.phase === "play" && st.turn === HUMAN) { legal = L.legalPlays(st, HUMAN); canAct = true; }
    if (passing) canAct = true;
    var h = "";
    hand.forEach(function (c) {
      var cls = "", dis = false;
      if (legal && legal.indexOf(c) < 0) { cls += " disabled"; dis = true; }
      else if (canAct) cls += " legal";
      else cls += " idle";
      var sel = ui.sel.indexOf(c) >= 0;
      if (sel) cls += " sel";
      if (st.trickNo <= 1 && st.phase !== "pass" && st.received[HUMAN].indexOf(c) >= 0) cls += " new";
      h += cardHTML(c, { btn: true, cls: cls, disabled: dis, pressed: sel });
    });
    $("hand").innerHTML = h;
    var lab = "";
    if (st.phase !== "pass" && st.trickNo <= 1 && st.received[HUMAN].length) lab = "Cards you received are outlined: " + st.received[HUMAN].map(cardName).join(", ");
    $("me-label").textContent = lab;
  }

  function renderPanel(st) {
    var p = $("panel"), msg = "", btns = "", ph = st.phase;
    if (ph === "pass") {
      if (!st.passSel[HUMAN]) {
        var n = ui.sel.length;
        msg = "<b>Pass 3 cards " + DIR_TEXT[st.passDir] + "</b> to " + who(L.passTarget(HUMAN, st.passDir)) + ". Tap cards to select (" + n + " of 3).";
        btns = '<button class="btn primary" data-act="pass" type="button"' + (n === 3 ? "" : " disabled") + ">" + (n === 3 ? "Pass these 3 cards" : "Select " + (3 - n) + " more") + "</button>";
      } else msg = 'Passing cards<span class="dim">...</span>';
    } else if (ph === "play") {
      if (st.turn === HUMAN) {
        if (!st.trick.length) {
          if (st.trickNo === 0) msg = "<b>You hold the 2 of clubs.</b> Lead it.";
          else msg = "<b>Your lead.</b> " + (st.broken ? "" : "Hearts are not broken yet. ");
        } else {
          var led = st.trick[0].card[1];
          var must = st.hands[HUMAN].some(function (c) { return c[1] === led; });
          msg = "<b>Your turn.</b> " + (must ? "Follow " + pip(led) + " " + SUIT_NAME[led] + "." : "No " + SUIT_ONE[led] + ", play any card" + (st.trickNo === 0 ? " (no hearts or Queen of spades if you can avoid it)" : "") + ".");
        }
        msg += opts.confirm ? " Tap a card, then tap it again to play." : " Tap a card to play it.";
        if (opts.confirm && ui.sel.length === 1) btns = '<button class="btn primary" data-act="play" type="button">Play ' + cardName(ui.sel[0]) + "</button>";
      } else msg = NAMES[st.turn] + ' is playing<span class="dim">...</span>';
    } else if (ph === "trickdone") {
      msg = who(st.trickWinner) + (st.trickWinner === 0 ? " take" : " takes") + " the trick.";
    } else if (ph === "handdone" || ph === "gameover") {
      var r = st.result, t = '<table class="res"><tr><th></th>';
      for (var s = 0; s < 4; s++) t += "<th>" + who(s) + "</th>";
      t += "</tr><tr><td class=\"n\">This hand</td>";
      for (s = 0; s < 4; s++) t += "<td>" + (r.delta[s] > 0 ? "+" : "") + r.delta[s] + "</td>";
      t += '</tr><tr><td class="n">Total</td>';
      for (s = 0; s < 4; s++) t += "<td><b>" + st.scores[s] + "</b></td>";
      t += "</tr></table>";
      var head = "";
      if (r.moon >= 0) head = "<b>" + who(r.moon) + " shot" + " the moon!</b> " + (st.opts.moon === "self" ? "Shooter scores -26." : "Everyone else scores 26.") + "<br>";
      msg = head + t + (st.notice ? "<br>" + esc(st.notice) : "");
      if (ph === "handdone") btns = '<button class="btn primary" data-act="next" type="button">Next hand</button>';
      else btns = '<button class="btn primary" data-act="newgame" type="button">New game</button>';
    }
    p.innerHTML = '<div class="msg">' + msg + "</div>" + (btns ? '<div class="btns">' + btns + "</div>" : "");
  }

  // ------------------------------------------------------------ modal
  var modalKind = "";
  function openModal(html, kind) {
    modalKind = kind || "";
    $("sheet").innerHTML = html;
    $("modal").hidden = false;
    var f = $("sheet").querySelector("button");
    if (f) f.focus({ preventScroll: true });
    $("sheet").scrollTop = 0;
  }
  function closeModal() { $("modal").hidden = true; modalKind = ""; }

  function showGameOver(st) {
    if (modalKind === "over") return;
    var win = st.winner === HUMAN;
    var lowTxt = win ? "You finished with the lowest score." : who(st.winner) + " finished with the lowest score.";
    openModal('<h2 id="modal-title">' + (win ? "You win!" : "Game over") + '</h2><div class="big">' + st.scores.map(function (x, i) { return who(i) + " " + x; }).join(", ") + "</div>" +
      "<p>" + lowTxt + " Record: " + tally.w + " wins, " + tally.l + " losses.</p>" +
      '<div class="row"><button class="btn primary" data-act="newgame" type="button">New game</button><button class="btn" data-act="close" type="button">Review table</button></div>', "over");
  }

  var RULES = '<h2 id="modal-title">How to play</h2>' +
    "<p>Hearts is a trick-taking game for four. You are South against West, North and East. Everyone plays for themselves and <b>points are bad</b>: the lowest score wins.</p>" +
    "<h3>The deal</h3><p>52 cards, 13 each. Before play, each hand starts with a pass of 3 cards: left on hand 1, right on hand 2, across on hand 3, and no pass on hand 4. Then it repeats.</p>" +
    "<h3>Play</h3><ul><li>The player holding the <b>2 of clubs</b> leads it to start the first trick.</li>" +
    "<li>You must follow the led suit if you can. If not, play any card.</li>" +
    "<li>On the first trick you cannot play a heart or the Queen of spades unless you have nothing else.</li>" +
    "<li>Hearts cannot be led until a heart has been played (hearts are \"broken\"), unless the leader holds only hearts. The Queen of spades can be led at any time and does not break hearts.</li>" +
    "<li>Highest card of the led suit wins the trick and leads next. There is no trump.</li></ul>" +
    "<h3>Scoring</h3><ul><li>Each heart you take is <b>1 point</b>. The Queen of spades is <b>13 points</b>. A hand holds 26 points in all.</li>" +
    "<li><b>Shooting the moon:</b> if one player takes all 13 hearts and the Queen of spades, that player scores 0 and every other player scores 26. Option in the menu: the shooter scores -26 instead and the others score 0.</li>" +
    "<li><b>Jack of diamonds</b> (option, off by default): taking it is worth -10.</li>" +
    "<li>The game ends when anyone reaches 100 or more points at the end of a hand. The lowest total wins. If the lowest total is tied, one more hand is played.</li></ul>" +
    "<h3>This version</h3><ul><li>The computer players pass dangerous cards, track what has been played and who is out of a suit, duck tricks, dump the Queen of spades and high hearts when they can, and sometimes try to shoot the moon or stop you from doing it.</li>" +
    "<li>On a phone, a tap selects a card and a second tap plays it (change in the menu). Cards that are not legal are dimmed.</li>" +
    "<li>Your game saves after every move and you can resume it later. Add ?seed=N to the address to replay the same deals.</li></ul>" +
    '<div class="row"><button class="btn primary" data-act="close" type="button">Got it</button></div>';

  function showRules() { openModal(RULES, "rules"); }

  function toggleRow(id, title, small, on, label) {
    return '<div class="opt"><div>' + title + "<small>" + small + '</small></div><label class="chk"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span>" + label(on) + "</span></label></div>";
  }
  function showMenu() {
    var onoff = function (b) { return b ? "On" : "Off"; };
    openModal('<h2 id="modal-title">Menu</h2>' +
      toggleRow("opt-moon", "Moon: shooter scores -26", "Off (default): the shooter scores 0 and the others get 26. Applies to the next new game.", opts.moon === "self", onoff) +
      toggleRow("opt-jd", "Jack of diamonds is -10", "Off by default. Applies to the next new game.", opts.jd, onoff) +
      toggleRow("opt-confirm", "Tap twice to play", "First tap selects a card, second tap plays it. Avoids misplays on a phone.", opts.confirm, onoff) +
      "<p>Record: " + tally.w + " wins, " + tally.l + " losses.</p>" +
      '<div class="row"><button class="btn" data-act="rules" type="button">How to play</button><button class="btn primary" data-act="newgame-confirm" type="button">New game</button><button class="btn" data-act="close" type="button">Close</button></div>', "menu");
  }

  // ------------------------------------------------------------ input
  function onCard(c) {
    var st = G.st;
    if (st.phase === "pass" && !st.passSel[HUMAN]) {
      var i = ui.sel.indexOf(c);
      if (i >= 0) ui.sel.splice(i, 1);
      else if (ui.sel.length < 3) ui.sel.push(c);
      render();
      return;
    }
    if (st.phase === "play" && st.turn === HUMAN) {
      if (L.legalPlays(st, HUMAN).indexOf(c) < 0) { flash(explainIllegal(st, c)); return; }
      if (opts.confirm && ui.sel[0] !== c) { ui.sel = [c]; render(); return; }
      L.play(st, c); after();
    }
  }

  function explainIllegal(st, c) {
    if (st.trick.length) {
      var led = st.trick[0].card[1];
      if (c[1] !== led) return "You must follow " + SUIT_ONE[led] + ".";
      return "That card is not allowed.";
    }
    if (st.trickNo === 0) return "Lead the 2 of clubs.";
    if (c[1] === "H" && !st.broken) return "Hearts are not broken yet.";
    return "That card is not allowed.";
  }

  function doPass() {
    var st = G.st;
    if (st.phase !== "pass" || st.passSel[HUMAN] || ui.sel.length !== 3) return;
    try { L.submitPass(st, HUMAN, ui.sel.slice()); } catch (e) { return; }
    ui.sel = [];
    save(); render(); schedule();
  }

  var flashT = 0;
  function flash(t) {
    var m = $("panel").querySelector(".msg");
    if (!m) return;
    m.innerHTML = '<b style="color:var(--red)">' + esc(t) + "</b>";
    clearTimeout(flashT);
    flashT = setTimeout(function () { if (G && G.st) renderPanel(G.st); }, 1500);
  }

  function action(act, el) {
    var st = G && G.st;
    switch (act) {
      case "pass": doPass(); break;
      case "play":
        if (st.phase === "play" && st.turn === HUMAN && ui.sel.length === 1 && L.legalPlays(st, HUMAN).indexOf(ui.sel[0]) >= 0) { L.play(st, ui.sel[0]); after(); }
        break;
      case "next": if (st.phase === "handdone") { L.nextHand(st); after(); } break;
      case "newgame": newGame(); break;
      case "newgame-confirm":
        if (st.phase === "gameover" || (st.handNo === 1 && st.phase === "pass" && !st.passSel[HUMAN] && !ui.sel.length)) newGame();
        else { el.textContent = "Tap again to abandon this game"; el.setAttribute("data-act", "newgame"); }
        break;
      case "rules": showRules(); break;
      case "resume": resumeGame(pendingSave); break;
      case "close": closeModal(); break;
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-act],[data-card],#btn-rules,#btn-menu") : null;
    if (!t) return;
    if (t.id === "btn-rules") { showRules(); return; }
    if (t.id === "btn-menu") { if (G) showMenu(); return; }
    if (t.hasAttribute("data-card")) { if (G) onCard(t.getAttribute("data-card")); return; }
    if (G || t.getAttribute("data-act") === "resume" || t.getAttribute("data-act") === "newgame") action(t.getAttribute("data-act"), t);
  });
  document.addEventListener("change", function (e) {
    var t = e.target, lab = function (b) { return b ? "On" : "Off"; };
    if (t.id === "opt-moon") opts.moon = t.checked ? "self" : "others";
    else if (t.id === "opt-jd") opts.jd = t.checked;
    else if (t.id === "opt-confirm") { opts.confirm = t.checked; ui.sel = []; if (G) render(); }
    else return;
    saveOpts();
    t.nextElementSibling.textContent = lab(t.checked);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("modal").hidden && modalKind !== "start") closeModal();
  });
  $("modal").addEventListener("click", function (e) {
    if (e.target === $("modal") && modalKind !== "start" && modalKind !== "over") closeModal();
  });

  // ------------------------------------------------------------ start
  var pendingSave = null;
  function start() {
    var o = readJSON(SAVE_KEY);
    if (validSave(o)) {
      pendingSave = o;
      G = null;
      var st = o.st;
      openModal('<h2 id="modal-title">Welcome back</h2><p>A game in progress was saved: hand ' + st.handNo + ", scores " + st.scores.map(function (x, i) { return who(i) + " " + x; }).join(", ") + ".</p>" +
        '<div class="row"><button class="btn primary" data-act="resume" type="button">Resume game</button><button class="btn" data-act="newgame" type="button">New game</button></div>', "start");
      $("tally").textContent = "W-L " + tally.w + "-" + tally.l;
    } else newGame();
  }
  start();
})();
