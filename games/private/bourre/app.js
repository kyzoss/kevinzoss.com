(function () {
  "use strict";
  var L = window.BourreLogic;
  var HUMAN = 0;
  var q = new URLSearchParams(location.search);
  var FAST = q.has("fast");
  var SAVE_KEY = "kz_bourre_save_v1", TALLY_KEY = "kz_bourre_tally_v1", OPT_KEY = "kz_bourre_opts_v1";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
  var SUIT_PATH = {
    S: "M12 1.5C12 1.5 3 8.4 3 14.2c0 2.9 2.2 4.6 4.5 4.6 1.5 0 2.8-.7 3.6-1.8-.1 2.6-.9 4.1-3.1 5.5h8c-2.2-1.4-3-2.9-3.1-5.5.8 1.1 2.1 1.8 3.6 1.8 2.3 0 4.5-1.7 4.5-4.6C21 8.4 12 1.5 12 1.5z",
    H: "M12 22C5 16.6 2 12.8 2 8.8 2 5.7 4.4 3.4 7.2 3.4c2 0 3.9 1.1 4.8 3 .9-1.9 2.8-3 4.8-3C19.6 3.4 22 5.7 22 8.8c0 4-3 7.8-10 13.2z",
    D: "M12 1 20.5 12 12 23 3.5 12z",
    C: "M12 1.8a4.5 4.5 0 0 0-3.4 7.5A4.8 4.8 0 1 0 10.8 17c-.1 2.4-.9 3.9-3.1 5.2h8.6c-2.2-1.3-3-2.8-3.1-5.2a4.8 4.8 0 1 0 2.2-7.7A4.5 4.5 0 0 0 12 1.8z"
  };
  function suitSvg(s, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + SUIT_PATH[s] + '"/></svg>';
  }
  function rankLabel(c) { return c[0] === "T" ? "10" : c[0]; }
  function cardName(c) { var r = { T: "10", J: "Jack", Q: "Queen", K: "King", A: "Ace" }[c[0]] || c[0]; return r + " of " + SUIT_NAME[c[1]]; }
  function isRed(c) { return c[1] === "H" || c[1] === "D"; }

  // ------------------------------------------------------------ storage
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function readJSON(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var opts = { opponents: 3, aceForced: true, raise: true };
  (function () {
    var o = readJSON(OPT_KEY);
    if (o && typeof o === "object") {
      if (typeof o.opponents === "number" && o.opponents >= 2 && o.opponents <= 5) opts.opponents = o.opponents | 0;
      if (typeof o.aceForced === "boolean") opts.aceForced = o.aceForced;
      if (typeof o.raise === "boolean") opts.raise = o.raise;
    }
  })();
  var tally = { net: 0, games: 0, wins: 0 };
  (function () {
    var t = readJSON(TALLY_KEY);
    if (t && typeof t.net === "number") tally = { net: t.net | 0, games: t.games | 0, wins: t.wins | 0 };
  })();

  var G = null; // { st, tallied }
  var ui = { sel: [], timer: 0, lastTrickLen: 0 };
  var seedOnce = q.has("seed") ? (parseInt(q.get("seed"), 10) || 1) : null;

  function save() { if (G) lsSet(SAVE_KEY, JSON.stringify({ v: 1, st: G.st, tallied: G.tallied })); }
  function saveTally() { lsSet(TALLY_KEY, JSON.stringify(tally)); }
  function saveOpts() { lsSet(OPT_KEY, JSON.stringify(opts)); }
  function validSave(o) {
    try {
      var st = o && o.st;
      return !!(st && st.v === 1 && st.hands && st.chips && st.n === st.chips.length && st.phase && st.phase !== "gameover" && typeof st.rng === "number" && st.opts);
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ flow
  function freshSeed() {
    if (seedOnce !== null) { var s = seedOnce; seedOnce = null; return s; }
    return (Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) | 0;
  }
  function abandonTally() {
    if (G && !G.tallied && G.st.handNo > 1) {
      G.tallied = true;
      tally.net += G.st.chips[HUMAN] - G.st.startChips;
      tally.games++;
      saveTally();
    }
  }
  function newGame() {
    clearTimeout(ui.timer);
    abandonTally();
    G = { st: L.newGame(freshSeed(), { opponents: opts.opponents, aceForced: opts.aceForced, raise: opts.raise }), tallied: false };
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
    if (FAST) return 20;
    return kind === "trick" ? 1300 : kind === "decl" ? 800 : 900;
  }
  function schedule() {
    clearTimeout(ui.timer);
    var st = G.st;
    if (st.phase === "trickdone") { ui.timer = setTimeout(function () { L.collect(st); after(); }, delay("trick")); return; }
    var a = L.actor(st);
    if (a >= 0 && a !== HUMAN) {
      ui.timer = setTimeout(function () { L.aiStep(st); after(); }, delay(st.phase === "play" ? "play" : "decl"));
    }
  }
  function after() {
    var st = G.st;
    ui.sel = [];
    if (st.phase === "gameover" && !G.tallied) {
      G.tallied = true;
      tally.net += st.chips[HUMAN] - st.startChips;
      tally.games++;
      if (st.winner === HUMAN) tally.wins++;
      saveTally();
      lsDel(SAVE_KEY);
      render();
      showGameOver();
      return;
    }
    save(); render(); schedule();
  }

  // ------------------------------------------------------------ human actions
  function doDeclare(choice) { var st = G.st; if (st.phase === "declare" && st.turn === HUMAN && L.declare(st, choice)) after(); }
  function doDraw() {
    var st = G.st;
    if (st.phase === "draw" && st.turn === HUMAN && L.draw(st, ui.sel.slice())) after();
  }
  function doPlay(c) { var st = G.st; if (st.phase === "play" && st.turn === HUMAN && L.play(st, c)) after(); }
  function doNext() {
    var st = G.st;
    if (st.phase !== "handdone") return;
    L.nextHand(st);
    after();
  }

  // ------------------------------------------------------------ views
  function cardHtml(c, size, extra) {
    var st = G.st;
    var cls = "card" + (size ? " " + size : "") + (isRed(c) ? " red" : "") + (st.trump && c[1] === st.trump ? " trump" : "") + (extra || "");
    return { cls: cls, inner: '<span class="c-tl"><span>' + rankLabel(c) + "</span>" + suitSvg(c[1]) + "</span>" + suitSvg(c[1], "c-big") };
  }
  function cardDiv(c, size, extra) {
    var h = cardHtml(c, size, extra);
    return '<div class="' + h.cls + '" role="img" aria-label="' + cardName(c) + '">' + h.inner + "</div>";
  }

  function chipStack(pot) {
    var n = Math.min(pot, 15), cols = 3, per = 5, cw = 74, out = "";
    var colors = ["#C99A2E", "#D9663A", "#2F4B35"];
    var counts = [0, 0, 0];
    for (var i = 0; i < n; i++) counts[i % cols]++;
    for (var c = 0; c < cols; c++) {
      var x = 4 + c * 23, k;
      for (k = 0; k < Math.min(counts[c], per); k++) {
        var y = 52 - k * 8;
        out += '<ellipse cx="' + (x + 11) + '" cy="' + (y + 4) + '" rx="11" ry="5" fill="' + colors[c] + '" stroke="#2B2622" stroke-opacity=".35"/>' +
          '<rect x="' + x + '" y="' + y + '" width="22" height="4" fill="' + colors[c] + '"/>' +
          '<ellipse cx="' + (x + 11) + '" cy="' + y + '" rx="11" ry="5" fill="' + colors[c] + '" stroke="#2B2622" stroke-opacity=".35"/>' +
          '<ellipse cx="' + (x + 11) + '" cy="' + y + '" rx="7" ry="3" fill="none" stroke="#FBF8F2" stroke-opacity=".6" stroke-dasharray="3 2"/>';
      }
    }
    if (!n) out = '<text x="' + cw / 2 + '" y="40" text-anchor="middle" font-size="11" fill="#7B7064">empty</text>';
    return '<svg class="stack" viewBox="0 0 74 64" role="img" aria-label="Pot of ' + pot + ' chips">' + out + "</svg>";
  }

  function seatHtml(p) {
    var st = G.st, d = st.decl[p];
    var cls = "seat" + (st.bust[p] ? " bust" : "") + (d === "out" ? " out" : "");
    var act = (st.phase === "declare" || st.phase === "draw" || st.phase === "play") && st.turn === p;
    if (act) cls += " active";
    var tags = "";
    if (st.bust[p]) tags += '<span class="tag bust">BUST</span>';
    else if (d === "in") tags += '<span class="tag">IN</span>';
    else if (d === "out") tags += '<span class="tag out">OUT</span>';
    if (st.dealer === p && !st.bust[p]) tags += '<span class="tag dealer">DEALER</span>';
    var pips = "";
    if (d === "in" && (st.phase === "play" || st.phase === "trickdone" || st.phase === "handdone")) {
      pips = '<span class="pips" aria-label="' + st.tricksWon[p] + ' tricks">';
      for (var i = 0; i < 5; i++) pips += '<span class="pip' + (i < st.tricksWon[p] ? " on" : "") + '"></span>';
      pips += "</span>";
    }
    return '<div class="' + cls + '" id="seat-' + p + '"><div class="nm"><span>' + L.NAMES[p] + '</span></div><div class="ch">' + st.chips[p] + ' <small>chips</small></div><div class="st">' + tags + pips + "</div></div>";
  }

  function fmtNet(v) { return '<span class="' + (v >= 0 ? "pos" : "neg") + '">' + (v > 0 ? "+" : "") + v + "</span>"; }

  function render() {
    var st = G.st;
    $("strip").innerHTML = "<span>Hand <b>" + st.handNo + "</b> &middot; Ante <b>" + st.ante + "</b>" + (st.opts.raise ? " (rises every " + L.RAISE_EVERY + " hands)" : "") + "</span>" +
      "<span>This game " + fmtNet(st.chips[HUMAN] - st.startChips) + " &middot; Chips won overall " + fmtNet(tally.net + (G.tallied ? 0 : st.chips[HUMAN] - st.startChips)) + "</span>";
    var s = "";
    for (var p = 1; p < st.n; p++) s += seatHtml(p);
    $("seats").innerHTML = s;

    // pot
    var cur = (st.phase === "play" || st.phase === "trickdone") ? st.trickNo : -1;
    var w = "";
    for (var t = 0; t < 5; t++) {
      var done = t < st.trickWinners.length, wc = done ? " done" : (t === cur ? " cur" : "");
      var who = done ? L.NAMES[st.trickWinners[t]].charAt(0) : "&nbsp;";
      w += '<div class="worth' + wc + '" title="Trick ' + (t + 1) + ' is worth ' + st.trickValues[t] + '"><b>' + st.trickValues[t] + "</b>" + who + "</div>";
    }
    $("pot").innerHTML = chipStack(st.pot) + '<div class="pt"><div class="lbl">Pot</div><div class="big">' + st.pot + '</div><div class="sub">Each trick wins its share of the pot</div><div class="worths" aria-label="Value of each trick">' + w + "</div></div>";
    $("trumpbox").innerHTML = st.upcard ? '<div class="lbl">Trump</div>' + cardDiv(st.upcard, "small") + '<div class="tn">' + SUIT_NAME[st.trump] + "</div>" : "";

    // trick
    var th = "";
    if (st.phase === "play" || st.phase === "trickdone") {
      if (!st.trick.length) th = '<div class="empty">' + esc(L.NAMES[st.turn]) + (st.turn === HUMAN ? " lead" : " leads") + " trick " + (st.trickNo + 1) + "</div>";
      var win = st.phase === "trickdone" ? st.lastWinner : -1;
      st.trick.forEach(function (pl, i) {
        var fresh = i === st.trick.length - 1 && st.trick.length !== ui.lastTrickLen ? " enter" : "";
        th += '<div class="slot' + (pl.p === win ? " win" : "") + '">' + cardDiv(pl.card, "small", fresh) + "<span>" + L.NAMES[pl.p] + "</span></div>";
      });
      ui.lastTrickLen = st.trick.length;
    } else {
      th = '<div class="empty">' + (st.phase === "declare" ? "Declaring" : st.phase === "draw" ? "The draw" : st.phase === "handdone" ? "Hand over" : "") + "</div>";
      ui.lastTrickLen = 0;
    }
    $("trick").innerHTML = th;

    renderPanel();
    renderHand();
    var me = [];
    if (st.dealer === HUMAN) me.push("Dealer");
    if (st.decl[HUMAN] === "in") me.push("IN");
    if (st.decl[HUMAN] === "out") me.push("OUT");
    if (st.decl[HUMAN] === "in" && (st.phase === "play" || st.phase === "trickdone" || st.phase === "handdone")) me.push(st.tricksWon[HUMAN] + " of 5 tricks");
    $("me-label").innerHTML = "<span>You &middot; " + st.chips[HUMAN] + " chips</span><span>" + me.join(" &middot; ") + "</span>";
    document.querySelector(".me").className = "me" + (L.actor(st) === HUMAN ? " active" : "");
    var lg = $("log"), was = lg.parentNode.open;
    lg.innerHTML = st.log.slice(-40).map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("");
    if (was) lg.scrollTop = lg.scrollHeight;
  }

  function renderHand() {
    var st = G.st, h = st.hands[HUMAN] || [];
    var turn = L.actor(st) === HUMAN;
    var legal = st.phase === "play" && turn ? L.legalPlays(st, HUMAN) : null;
    var html = "";
    var show = st.decl[HUMAN] !== "out" || st.phase === "declare";
    if (!show) { $("hand").innerHTML = '<div class="small" style="color:#7B7064;align-self:center">You folded this hand.</div>'; return; }
    h.forEach(function (c) {
      var hh = cardHtml(c, "");
      if (st.phase === "draw" && turn) {
        var sel = ui.sel.indexOf(c) >= 0;
        html += '<button type="button" class="' + hh.cls + (sel ? " sel" : "") + '" data-card="' + c + '" data-act="toggle" aria-pressed="' + sel + '" aria-label="' + cardName(c) + (sel ? ", discarding" : "") + '">' + hh.inner + "</button>";
      } else if (legal) {
        var ok = legal.indexOf(c) >= 0;
        html += '<button type="button" class="' + hh.cls + (ok ? " legal" : "") + '" data-card="' + c + '" data-act="play"' + (ok ? "" : " disabled") + ' aria-label="' + cardName(c) + (ok ? "" : ", not playable") + '">' + hh.inner + "</button>";
      } else {
        html += '<div class="' + hh.cls + '" role="img" aria-label="' + cardName(c) + '">' + hh.inner + "</div>";
      }
    });
    $("hand").innerHTML = html;
  }

  function ruleHint(st) {
    var h = st.hands[HUMAN], trick = st.trick;
    if (!trick.length) return st.trickNo === 0 && h.some(function (c) { return c[1] === st.trump; }) ? "First lead must be a trump." : "You lead. Play any card.";
    var led = trick[0].card[1];
    if (h.some(function (c) { return c[1] === led; })) return "Follow suit and play higher than the best " + SUIT_NAME[led].toLowerCase() + " if you can.";
    if (h.some(function (c) { return c[1] === st.trump; })) return trick.some(function (x) { return x.card[1] === st.trump; }) ? "You are out of " + SUIT_NAME[led].toLowerCase() + ": trump, and overtrump if you can." : "You are out of " + SUIT_NAME[led].toLowerCase() + ": you must trump.";
    return "No " + SUIT_NAME[led].toLowerCase() + " and no trump: play anything.";
  }

  function renderPanel() {
    var st = G.st, el = $("panel"), nm = function (p) { return "<b>" + esc(L.NAMES[p]) + "</b>"; };
    var html = "";
    el.style.borderColor = "";
    if (st.phase === "declare") {
      if (st.turn === HUMAN) {
        var forced = L.mustStay(st, HUMAN);
        html = '<div class="msg">Trump is <b>' + SUIT_NAME[st.trump] + "</b>. Pot <b>" + st.pot + "</b>. Are you in" + (st.dealer === HUMAN ? " (you decide last)" : "") + "?" +
          (forced ? '</div><div class="small">You hold the ace of trump, so you must stay in.</div>' : "</div>") +
          '<div class="row"><button class="btn primary" type="button" data-act="in">Stay IN</button><button class="btn" type="button" data-act="out"' + (forced ? " disabled" : "") + ">Fold</button></div>";
      } else html = '<div class="msg">' + nm(st.turn) + " is deciding&hellip;</div>";
    } else if (st.phase === "draw") {
      if (st.turn === HUMAN) {
        var mx = L.maxDiscard(st), n = ui.sel.length;
        html = '<div class="msg">Draw round. Tap cards to discard, up to ' + mx + ". The turned trump is not drawn.</div>" +
          '<div class="row"><button class="btn primary" type="button" data-act="draw">' + (n ? "Discard " + n + " and draw" : "Stand pat") + "</button></div>";
      } else html = '<div class="msg">' + nm(st.turn) + " is drawing&hellip;</div>";
    } else if (st.phase === "play") {
      if (st.turn === HUMAN) html = '<div class="msg"><b>Your play.</b> Tap a card.</div><div class="small">' + ruleHint(st) + "</div>";
      else html = '<div class="msg">' + nm(st.turn) + " plays&hellip;</div>";
    } else if (st.phase === "trickdone") {
      html = '<div class="msg">' + nm(st.lastWinner) + " wins trick " + (st.trickNo + 1) + ", worth <b>" + st.trickValues[st.trickNo] + "</b>.</div>";
    } else if (st.phase === "handdone") {
      html = handSummary(st);
      if (st.result.penalties.some(function (x) { return x.p === HUMAN; })) el.style.borderColor = "#D9663A";
    } else if (st.phase === "gameover") {
      html = '<div class="msg">Game over.</div><div class="row"><button class="btn primary" type="button" data-act="newgame">New game</button></div>';
    }
    el.innerHTML = html;
  }

  function handSummary(st) {
    var r = st.result, out = "";
    if (r.kind === "solo") {
      out += '<div class="msg"><b>' + esc(L.NAMES[r.winner]) + "</b> " + (r.winner === HUMAN ? "take" : "takes") + " the whole pot of <b>" + r.amount + "</b> (everyone else folded).</div>";
    } else {
      var lines = [];
      for (var p = 0; p < st.n; p++) if (r.won[p] > 0) lines.push(esc(L.NAMES[p]) + " +" + r.won[p]);
      out += '<div class="msg">Hand over. Pot paid out: ' + lines.join(", ") + ".</div>";
      r.penalties.forEach(function (x) {
        out += '<div class="msg" style="color:#D9663A"><b>' + (x.p === HUMAN ? "You are BOURRE" : esc(L.NAMES[x.p]) + " is BOURRE") + "</b> and " + (x.p === HUMAN ? "put" : "puts") + " " + x.paid + " into the next pot" + (x.bust ? " (cannot cover it: bust)" : "") + ".</div>";
      });
      if (!r.penalties.length) out += '<div class="small">No one was set.</div>';
    }
    return out + '<div class="row"><button class="btn primary" type="button" data-act="next">' + (st.bust[HUMAN] ? "See result" : "Next hand") + "</button></div>";
  }

  // ------------------------------------------------------------ modal
  function openModal(html) { $("sheet").innerHTML = html; $("modal").hidden = false; $("sheet").setAttribute("tabindex", "-1"); $("sheet").scrollTop = 0; try { $("sheet").focus({ preventScroll: true }); } catch (e) {} }
  function closeModal() { $("modal").hidden = true; $("sheet").innerHTML = ""; }

  function rulesHtml() {
    return '<h2 id="modal-title">How to play Bourre</h2>' +
      "<p>Louisiana Bourre (also Booray). Play money only, no real money. You and 2 to 5 computer players start with 100 chips.</p>" +
      "<h3>The deal</h3><ul><li>52 cards, 5 each. Everyone antes into the pot (1 chip to start).</li><li>The dealer turns up the next card. Its suit is trump.</li></ul>" +
      "<h3>In or out</h3><ul><li>Starting left of the dealer, each player says IN (play the hand) or OUT (fold). The dealer decides last.</li><li>House rule (on by default): if you hold the ace of trump you must stay in.</li><li>If everyone else folds, the last player left takes the whole pot with no play. If the dealer is left alone, the dealer wins it.</li></ul>" +
      "<h3>The draw</h3><ul><li>Players who stay in may discard 0 to 5 cards and draw replacements. The turned trump card is not drawn. If the deck runs short, discards are limited to what is left.</li></ul>" +
      "<h3>Five tricks</h3><ul><li>The first player in, left of the dealer, leads. After that the winner of a trick leads the next.</li><li>On the first trick the leader must lead a trump if they hold one.</li><li>You must follow suit. When you can, you must also play higher than the highest card of that suit already in the trick (head the trick).</li><li>If you cannot follow suit you must play a trump, and if a trump is already in the trick you must overtrump when able.</li><li>Highest trump wins the trick, otherwise the highest card of the suit led.</li><li>Each trick wins one fifth of the pot. If the pot does not divide by 5, the extra chips go to the earliest tricks, so every chip is paid out.</li></ul>" +
      "<h3>Bourre (set)</h3><ul><li>A player who stayed in and won no trick is bourre. They must put an amount equal to the pot at the start of the hand (the whole pot as it stood, including any carry) into the next pot.</li><li>Folded players pay nothing. Penalties carry into the next hand, where everyone antes again.</li></ul>" +
      "<h3>Going bust</h3><ul><li>A player who cannot cover the ante, or a bourre penalty (they pay what they have), is bust and out. The game ends when you bust or only you remain.</li><li>House option (on by default): the ante rises by 1 every " + L.RAISE_EVERY + " hands so games finish. Turn it off in the menu for a flat ante.</li></ul>" +
      '<div class="row"><button class="btn primary" type="button" data-act="close">Got it</button></div>';
  }
  function menuHtml() {
    var sel = '<select id="o-opp" aria-label="Opponents">';
    for (var i = 2; i <= 5; i++) sel += '<option value="' + i + '"' + (opts.opponents === i ? " selected" : "") + ">" + i + " opponents</option>";
    sel += "</select>";
    return '<h2 id="modal-title">Menu</h2>' +
      '<p>Chips won overall: <b>' + fmtNet(tally.net) + "</b> over " + tally.games + " game" + (tally.games === 1 ? "" : "s") + " (" + tally.wins + " won).</p>" +
      '<h3>Next new game</h3><label class="opt">' + sel + "</label>" +
      '<label class="opt"><input type="checkbox" id="o-ace"' + (opts.aceForced ? " checked" : "") + '> Ace of trump must stay in</label>' +
      '<label class="opt"><input type="checkbox" id="o-raise"' + (opts.raise ? " checked" : "") + "> Ante rises every " + L.RAISE_EVERY + " hands</label>" +
      '<p class="small" style="color:#7B7064">Starting stack 100 chips each. Options apply when you start a new game.</p>' +
      '<div class="row"><button class="btn primary" type="button" data-act="newgame">New game</button><button class="btn" type="button" data-act="close">Close</button></div>' +
      '<div class="row"><button class="btn warn" type="button" data-act="resettally">Reset chips-won tally</button></div>';
  }
  function showGameOver() {
    var st = G.st, d = st.chips[HUMAN] - st.startChips;
    openModal('<h2 id="modal-title">' + (st.winner === HUMAN ? "You cleaned them out" : "You are bust") + "</h2>" +
      "<p>" + (st.winner === HUMAN ? "Every opponent went bust." : "You could not cover the ante or a bourre.") + " After " + st.handNo + " hands you finished with <b>" + st.chips[HUMAN] + "</b> chips (" + fmtNet(d) + "). Chips won overall: " + fmtNet(tally.net) + ".</p>" +
      '<div class="row"><button class="btn primary" type="button" data-act="newgame">New game</button><button class="btn" type="button" data-act="close">Close</button></div>');
  }
  function showStart(saved) {
    var st = saved.st;
    openModal('<h2 id="modal-title">Welcome back</h2><p>You have a game in progress: hand ' + st.handNo + ", " + st.chips[HUMAN] + " chips, " + (st.n - 1) + " opponents.</p>" +
      '<div class="row"><button class="btn primary" type="button" data-act="resume">Resume</button><button class="btn" type="button" data-act="newgame">New game</button></div>');
  }

  // ------------------------------------------------------------ events
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    var a = t.getAttribute("data-act");
    if (a === "in" || a === "out") doDeclare(a);
    else if (a === "draw") doDraw();
    else if (a === "next") doNext();
    else if (a === "play") doPlay(t.getAttribute("data-card"));
    else if (a === "toggle") {
      var c = t.getAttribute("data-card"), i = ui.sel.indexOf(c);
      if (i >= 0) ui.sel.splice(i, 1); else if (ui.sel.length < L.maxDiscard(G.st)) ui.sel.push(c);
      render();
    }
    else if (a === "close") closeModal();
    else if (a === "newgame") { readOpts(); newGame(); }
    else if (a === "resume") { var o = readJSON(SAVE_KEY); if (validSave(o)) resumeGame(o); else newGame(); }
    else if (a === "resettally") { tally = { net: 0, games: 0, wins: 0 }; saveTally(); openModal(menuHtml()); render(); }
  });
  function readOpts() {
    var a = $("o-opp");
    if (a) {
      opts.opponents = parseInt(a.value, 10) || 3;
      opts.aceForced = $("o-ace").checked;
      opts.raise = $("o-raise").checked;
      saveOpts();
    }
  }
  $("btn-rules").addEventListener("click", function () { openModal(rulesHtml()); });
  $("btn-menu").addEventListener("click", function () { openModal(menuHtml()); });
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });

  // ------------------------------------------------------------ boot
  var saved = readJSON(SAVE_KEY);
  if (validSave(saved)) {
    G = { st: saved.st, tallied: !!saved.tallied };
    render();
    showStart(saved);
  } else {
    if (saved) lsDel(SAVE_KEY);
    newGame();
  }
  window.__bourre = { get st() { return G.st; }, L: L };
})();
