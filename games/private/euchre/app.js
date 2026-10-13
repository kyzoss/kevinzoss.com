// Euchre UI. All rules and computer play live in logic.js; this file draws the
// table, takes the human's clicks (South) and paces the computer players.
(function () {
  "use strict";
  var L = window.EuchreLogic;
  var HUMAN = 0;
  var SAVE_KEY = "euchre.save.v1", TALLY_KEY = "euchre.tally.v1", OPT_KEY = "euchre.opts.v1";
  var SUIT_NAME = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
  var SUIT_ONE = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
  var RANK_NAME = { "9": "Nine", T: "Ten", J: "Jack", Q: "Queen", K: "King", A: "Ace" };
  var NAMES = ["You", "West", "North", "East"];
  var q = new URLSearchParams(location.search);
  var FAST = q.has("fast");
  var coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // ------------------------------------------------------------ storage
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function readJSON(k) { try { var s = lsGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  var opts = { stick: true, confirm: coarse };
  (function () {
    var o = readJSON(OPT_KEY);
    if (o && typeof o === "object") {
      if (typeof o.stick === "boolean") opts.stick = o.stick;
      if (typeof o.confirm === "boolean") opts.confirm = o.confirm;
    }
  })();
  var tally = { w: 0, l: 0 };
  (function () {
    var t = readJSON(TALLY_KEY);
    if (t && typeof t.w === "number" && typeof t.l === "number") tally = { w: t.w, l: t.l };
  })();

  var G = null;        // { st, tallied }
  var ui = { sel: null, alone: false, timer: 0 };
  var firstSeed = q.has("seed") ? (parseInt(q.get("seed"), 10) || 1) : null;

  function save() {
    if (!G) return;
    lsSet(SAVE_KEY, JSON.stringify({ v: 1, st: G.st, tallied: G.tallied }));
  }
  function saveTally() { lsSet(TALLY_KEY, JSON.stringify(tally)); }
  function saveOpts() { lsSet(OPT_KEY, JSON.stringify(opts)); }

  function validSave(o) {
    try {
      var st = o && o.st;
      return !!(st && st.hands && st.hands.length === 4 && st.scores && st.phase && st.phase !== "gameover" && st.rng !== undefined && st.opts);
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ game flow
  function freshSeed() {
    if (firstSeed !== null) { var s = firstSeed; firstSeed = null; return s; }
    return (Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) | 0;
  }
  function newGame() {
    clearTimeout(ui.timer);
    var st = L.newGame(freshSeed(), { stick: opts.stick });
    G = { st: st, tallied: false };
    ui.sel = null; ui.alone = false;
    save();
    closeModal();
    render();
    schedule();
  }
  function resumeGame(o) {
    clearTimeout(ui.timer);
    G = { st: o.st, tallied: !!o.tallied };
    ui.sel = null; ui.alone = false;
    closeModal();
    render();
    schedule();
  }

  function delay(kind) {
    if (FAST) return 25;
    if (kind === "trick") return 1250;
    if (kind === "bid") return 850;
    return 800;
  }

  function schedule() {
    clearTimeout(ui.timer);
    var st = G.st;
    if (st.phase === "gameover" || st.phase === "handdone") return;
    if (st.phase === "trickdone") {
      ui.timer = setTimeout(function () { L.collect(st); after(); }, delay("trick"));
      return;
    }
    var a = L.actor(st);
    if (a !== HUMAN) {
      var kind = st.phase === "play" ? "play" : "bid";
      ui.timer = setTimeout(function () { L.aiStep(st); after(); }, delay(kind));
    }
  }

  function after() {
    var st = G.st;
    ui.sel = null;
    if (st.phase === "gameover" && !G.tallied) {
      G.tallied = true;
      if (st.winner === 0) tally.w++; else tally.l++;
      saveTally();
      save();
      render();
      showGameOver(st);
      return;
    }
    save();
    render();
    schedule();
  }

  // ------------------------------------------------------------ card drawing
  function isRed(s) { return s === "H" || s === "D"; }
  function pip(s) { return '<svg class="pip" aria-hidden="true"><use href="#s-' + s + '"/></svg>'; }
  function cardName(c) { return RANK_NAME[c[0]] + " of " + SUIT_ONE[c[1]]; }
  function cardHTML(c, o) {
    o = o || {};
    var r = c[0] === "T" ? "10" : c[0], s = c[1], tr = G && G.st.trump;
    var tag = "";
    if (tr && c === "J" + tr) tag = "RIGHT";
    else if (tr && c === "J" + L.leftSuit(tr)) tag = "LEFT";
    var cls = "card " + (isRed(s) ? "red" : "blk") + (o.cls ? " " + o.cls : "");
    var inner = '<span class="idx"><b>' + r + "</b>" + pip(s) + "</span>" +
      '<svg class="big" aria-hidden="true"><use href="#s-' + s + '"/></svg>' +
      '<span class="tag' + (tag ? " on" : "") + '">' + tag + "</span>";
    if (o.btn) {
      return '<button type="button" class="' + cls + '" data-card="' + c + '" aria-label="' + cardName(c) + (tag ? ", " + tag.toLowerCase() + " bower" : "") + '"' + (o.disabled ? ' aria-disabled="true"' : "") + ">" + inner + "</button>";
    }
    return '<div class="' + cls + '" role="img" aria-label="' + cardName(c) + '">' + inner + "</div>";
  }
  function backsHTML(n) {
    var h = "";
    for (var i = 0; i < n; i++) h += '<span class="back-card"></span>';
    return '<div class="backs" aria-hidden="true">' + h + "</div>";
  }

  // ------------------------------------------------------------ render
  function seatLabel(s) {
    return s === 0 ? "You" : s === 2 ? "North" : s === 1 ? "West" : "East";
  }
  function who(s) { return s === 0 ? "You" : NAMES[s]; }

  function render() {
    if (!G) return;
    var st = G.st;
    renderScore(st);
    for (var s = 1; s <= 3; s++) renderSeat(st, s);
    renderCenter(st);
    renderPanel(st);
    renderHand(st);
    $("tally").textContent = "Record " + tally.w + "-" + tally.l;
    $("tally").title = "Games won and lost";
  }

  function renderScore(st) {
    var mk = st.maker >= 0 ? L.teamOf(st.maker) : -1;
    var playing = st.phase === "play" || st.phase === "trickdone" || st.phase === "handdone" || st.phase === "gameover";
    var trick = function (t) { return playing ? "Tricks " + st.tricksWon[t] : "Tricks 0"; };
    var trumpHTML = st.trump
      ? '<div class="trumpline ' + (isRed(st.trump) ? "red" : "w") + '">' + pip(st.trump) + " " + SUIT_NAME[st.trump] + "</div>"
      : '<div class="trumpline w">Bidding</div>';
    var makerHTML = st.maker >= 0
      ? '<div class="who">Maker: ' + who(st.maker) + (st.alone ? " (alone)" : "") + "</div>"
      : '<div class="who">Hand ' + st.handNo + " &middot; Dealer " + who(st.dealer) + "</div>";
    $("score").innerHTML =
      '<div class="side us ' + (st.scores[0] > st.scores[1] ? "lead" : "") + '"><div class="lbl">N/S (you)</div><div class="pts">' + st.scores[0] + '</div><div class="tr">' + trick(0) + "</div></div>" +
      '<div class="mid"><div class="k">Trump</div>' + trumpHTML + makerHTML + "</div>" +
      '<div class="side them ' + (st.scores[1] > st.scores[0] ? "lead" : "") + '"><div class="lbl">E/W</div><div class="pts">' + st.scores[1] + '</div><div class="tr">' + trick(1) + "</div></div>";
  }

  function bidText(b) {
    if (b.type === "pass") return "Pass";
    if (b.type === "order") return "Order up" + (b.alone ? " alone" : "");
    return SUIT_NAME[b.suit] + (b.alone ? " alone" : "");
  }

  function renderSeat(st, s) {
    var el = $("seat-" + s);
    var out = st.sitOut === s;
    var bidding = st.phase === "bid1" || st.phase === "bid2" || st.phase === "discard";
    var turn = L.actor(st) === s && st.phase !== "gameover" && st.phase !== "handdone";
    var badges = "";
    if (st.dealer === s) badges += '<span class="badge d">DEALER</span>';
    if (st.maker === s) badges += '<span class="badge m">MAKER</span>';
    var bubble = "";
    if (bidding) {
      var last = null;
      st.bids.forEach(function (b) { if (b.seat === s) last = b; });
      if (last) bubble = '<div class="bubble ' + (last.type !== "pass" ? "call" : "") + '">' + esc(bidText(last)) + "</div>";
    }
    var sub = s === 2 ? "partner" : "";
    if (out) sub = "sitting out";
    var count = out ? 0 : st.hands[s].length;
    el.className = "seat s-" + ["", "w", "n", "e"][s] + (turn ? " turn" : "") + (out ? " out" : "");
    el.innerHTML = '<div class="nm">' + NAMES[s] + '</div><div class="sub">' + sub + "</div>" +
      '<div class="badges">' + badges + "</div>" + bubble + backsHTML(count);
  }

  function renderCenter(st) {
    var c = $("center");
    if (st.phase === "bid1" || st.phase === "discard") {
      var cap = st.phase === "bid1"
        ? who(st.dealer) + (st.dealer === 0 ? " deal" : " deals") + ". The " + cardName(st.upcard) + " is turned up. " + (st.turn === 0 ? "Your call." : "")
        : who(st.maker) + " ordered up " + SUIT_NAME[st.trump] + ". " + who(st.dealer) + (st.dealer === 0 ? " pick" : " picks") + " up the card and discards.";
      c.innerHTML = '<div class="upwrap">' + cardHTML(st.upcard) + '<div class="cap">' + esc(cap) + "</div></div>";
      return;
    }
    if (st.phase === "bid2") {
      c.innerHTML = '<div class="upwrap"><div class="card back ghost" style="--cw:72px"></div><div class="cap">' +
        SUIT_NAME[st.turnedDown] + " (" + cardName(st.upcard) + ") was turned down. Name another suit or pass." + "</div></div>";
      return;
    }
    var cards = st.trick, note = "";
    var ghost = false;
    if (!cards.length && st.lastTrick && (st.phase === "handdone" || st.phase === "gameover")) {
      cards = st.lastTrick.cards; ghost = true; note = "Last trick";
    }
    var pos = { 0: "s", 1: "w", 2: "n", 3: "e" };
    var h = '<div class="trick">';
    cards.forEach(function (t) {
      var cls = "sm";
      if (ghost) cls += " ghost";
      if (st.phase === "trickdone" && t.seat === st.trickWinner) cls += " win";
      else if (!ghost && st.last && st.last.seat === t.seat && st.last.card === t.card && st.phase !== "trickdone") cls += " latest";
      h += '<div class="p-' + pos[t.seat] + '">' + cardHTML(t.card, { cls: cls }) + "</div>";
    });
    if (st.phase === "trickdone") note = who(st.trickWinner) + (st.trickWinner === 0 ? " take" : " takes") + " the trick";
    else if (!cards.length && !note) note = "Trick " + (st.trickNo + 1) + " of 5";
    if (st.alone && st.sitOut >= 0 && !ghost) note += (note ? "<br>" : "") + who(st.sitOut) + (st.sitOut === 0 ? " sit" : " sits") + " out";
    h += '<div class="mid-note">' + note + "</div></div>";
    c.innerHTML = h;
  }

  function renderHand(st) {
    var hand = st.hands[HUMAN];
    var sorted = L.sortHand(hand, st.trump);
    var legal = null, canAct = false;
    if (st.phase === "play" && st.turn === HUMAN) { legal = L.legalPlays(st, HUMAN); canAct = true; }
    if (st.phase === "discard" && st.dealer === HUMAN) canAct = true;
    var out = st.sitOut === HUMAN;
    var h = "";
    sorted.forEach(function (c) {
      var cls = "";
      var dis = false;
      if (legal && legal.indexOf(c) < 0) { cls += " disabled"; dis = true; }
      else if (canAct) cls += " legal";
      else cls += " idle";
      if (ui.sel === c) cls += " sel";
      h += cardHTML(c, { btn: true, cls: cls, disabled: dis });
    });
    var hd = $("hand");
    hd.className = "hand" + (out ? " out" : "");
    hd.innerHTML = h;
    var lab = "";
    if (out) lab = "Your partner is going alone. You sit this hand out.";
    else if (st.dealer === HUMAN) lab = "You are the dealer";
    $("me-label").textContent = lab;
    var me = $("me");
    me.className = "me" + (L.actor(st) === HUMAN ? " turn" : "");
  }

  function renderPanel(st) {
    var p = $("panel");
    var msg = "", btns = "";
    var ph = st.phase;
    if (ph === "bid1") {
      if (st.turn === HUMAN) {
        msg = "Order up <b>" + pip(st.upcard[1]) + " " + SUIT_NAME[st.upcard[1]] + "</b> as trump" +
          (st.dealer === HUMAN ? " (you pick it up)" : st.dealer === 2 ? " (your partner picks it up)" : " (" + NAMES[st.dealer] + " picks it up)") + "?";
        btns = '<button class="btn" data-act="pass" type="button">Pass</button>' +
          '<button class="btn primary" data-act="order" type="button">Order up</button>' +
          '<button class="btn alone" data-act="order-alone" type="button">Go alone</button>';
      } else msg = NAMES[st.turn] + ' is deciding<span class="dim">...</span>';
      if (st.notice && !st.bids.length) msg = esc(st.notice) + "<br>" + msg;
    } else if (ph === "bid2") {
      if (st.turn === HUMAN) {
        var stuck = st.opts.stick && st.dealer === HUMAN;
        msg = (stuck ? "Everyone passed to you. <b>You must name a suit.</b>" : "Name a trump suit, or pass.") + ' <span class="dim">' + SUIT_NAME[st.turnedDown] + " is out.</span>";
        L.SUITS.forEach(function (s) {
          if (s === st.turnedDown) return;
          btns += '<button class="btn suitbtn ' + (isRed(s) ? "red" : "blk") + '" data-act="call" data-suit="' + s + '" type="button">' + pip(s) + " " + SUIT_NAME[s] + "</button>";
        });
        btns += '<label class="chk"><input type="checkbox" id="alone-chk"' + (ui.alone ? " checked" : "") + "> Go alone</label>";
        if (!stuck) btns += '<button class="btn" data-act="pass" type="button">Pass</button>';
      } else msg = NAMES[st.turn] + ' is deciding<span class="dim">...</span>';
    } else if (ph === "discard") {
      if (st.dealer === HUMAN) {
        msg = "You picked up the " + cardName(st.upcard) + ". Tap a card to discard.";
        btns = '<button class="btn primary" data-act="discard" type="button"' + (ui.sel ? "" : " disabled") + ">" + (ui.sel ? "Discard " + cardName(ui.sel) : "Pick a card") + "</button>";
      } else msg = NAMES[st.dealer] + " picks up and discards.";
    } else if (ph === "play") {
      if (st.turn === HUMAN) {
        if (!st.trick.length) msg = "<b>Your lead.</b>" + (opts.confirm ? " Tap a card, then tap it again to play." : " Tap a card to play it.");
        else {
          var led = L.effSuit(st.trick[0].card, st.trump);
          var must = st.hands[HUMAN].some(function (c) { return L.effSuit(c, st.trump) === led; });
          msg = "<b>Your turn.</b> " + (must ? "Follow " + pip(led) + " " + SUIT_NAME[led] + "." : "No " + SUIT_ONE[led] + ", play any card.");
          if (opts.confirm) msg += " Tap, then tap again.";
        }
        if (opts.confirm && ui.sel) btns = '<button class="btn primary" data-act="play" type="button">Play ' + cardName(ui.sel) + "</button>";
      } else msg = NAMES[st.turn] + ' is playing<span class="dim">...</span>';
    } else if (ph === "trickdone") {
      msg = who(st.trickWinner) + (st.trickWinner === 0 ? " take" : " takes") + " the trick.";
    } else if (ph === "handdone" || ph === "gameover") {
      var r = st.result;
      var mk = r.makerTeam === 0 ? "You and North" : "East and West";
      var us = r.team === 0;
      var line;
      if (r.euchre) line = "<b>Euchred!</b> " + mk + " took only " + r.makerTricks + ". " + (us ? "You score " : "East and West score ") + r.points + ".";
      else if (r.alone && r.march) line = "<b>Alone and all five tricks!</b> " + (us ? "You score " : "East and West score ") + r.points + ".";
      else if (r.march) line = "<b>March!</b> " + mk + " took all five tricks. " + (us ? "You score " : "East and West score ") + r.points + ".";
      else line = mk + " made it with " + r.makerTricks + " tricks. " + (us ? "You score " : "East and West score ") + r.points + ".";
      msg = line;
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
    if (f) f.focus();
  }
  function closeModal() { $("modal").hidden = true; modalKind = ""; }

  function showGameOver(st) {
    if (modalKind === "over") return;
    var win = st.winner === 0;
    openModal('<h2 id="modal-title">' + (win ? "You win!" : "You lose") + '</h2><div class="big">' + st.scores[0] + " to " + st.scores[1] + "</div>" +
      "<p>" + (win ? "You and North took the game." : "East and West took the game.") + " Record: " + tally.w + " wins, " + tally.l + " losses.</p>" +
      '<div class="row"><button class="btn primary" data-act="newgame" type="button">New game</button><button class="btn" data-act="close" type="button">Review table</button></div>', "over");
  }

  var RULES = '<h2 id="modal-title">How to play</h2>' +
    "<p>Euchre is a trick-taking game for four players in two partnerships. You are South, partnered with North, against West and East. First side to 10 points wins.</p>" +
    "<h3>The deck</h3><p>24 cards, nine through ace in four suits. Each player gets 5. Four cards are left in the kitty and the top one is turned face up.</p>" +
    "<h3>Bidding</h3><ul><li><b>Round 1:</b> starting left of the dealer, each player passes or orders up the turned-up suit as trump. The dealer then picks up that card and discards one.</li>" +
    "<li><b>Round 2:</b> if all pass, the turned-up suit is out. Each player in turn passes or names a different suit as trump.</li>" +
    "<li><b>Stick the dealer</b> (on by default): if everyone passes in round 2, the dealer must name a suit. Off: the deal is thrown in and passes left.</li>" +
    "<li><b>Going alone:</b> the player who names trump may play without their partner, who sits out.</li></ul>" +
    "<h3>Card ranking</h3><ul><li>Trump, high to low: <b>right bower</b> (jack of trump), <b>left bower</b> (the other jack of the same colour), then A, K, Q, 10, 9.</li>" +
    "<li>The left bower counts as trump, not as its printed suit. Both bowers are marked on the card.</li>" +
    "<li>Other suits: A, K, Q, J, 10, 9.</li></ul>" +
    "<h3>Play</h3><p>The player left of the dealer leads. You must follow the led suit if you can; otherwise play anything. Highest trump wins the trick, or the highest card of the led suit if no trump was played. The winner leads next. Five tricks per hand.</p>" +
    "<h3>Scoring</h3><ul><li>Makers take 3 or 4 tricks: 1 point.</li><li>Makers take all 5 (a march): 2 points.</li>" +
    "<li>Alone and all 5: 4 points. Alone with 3 or 4: 1 point.</li>" +
    "<li>Makers take fewer than 3 (euchred): the defenders score 2.</li></ul>" +
    "<h3>Rules used here</h3><ul><li>The deal rotates clockwise. If a player orders up alone and the dealer is their partner, the dealer sits out and does not pick up the card.</li>" +
    "<li>On a phone, plays can use a tap to select and a second tap to confirm (see Menu).</li>" +
    "<li>Your game saves after every move and you can resume it later. Add ?seed=N to the address to replay the same deals.</li></ul>" +
    '<div class="row"><button class="btn primary" data-act="close" type="button">Got it</button></div>';

  function showRules() { openModal(RULES, "rules"); }

  function showMenu() {
    var st = G.st;
    var inGame = st.phase !== "gameover";
    openModal('<h2 id="modal-title">Menu</h2>' +
      '<div class="opt"><div>Stick the dealer<small>On: the dealer must name trump in round 2. Off: all pass turns the deal.</small></div><label class="chk"><input type="checkbox" id="opt-stick"' + (opts.stick ? " checked" : "") + '><span>' + (opts.stick ? "On" : "Off") + "</span></label></div>" +
      '<div class="opt"><div>Tap twice to play<small>First tap selects a card, second tap plays it. Avoids misplays on a phone.</small></div><label class="chk"><input type="checkbox" id="opt-confirm"' + (opts.confirm ? " checked" : "") + '><span>' + (opts.confirm ? "On" : "Off") + "</span></label></div>" +
      '<p>Record: ' + tally.w + " wins, " + tally.l + " losses.</p>" +
      '<div class="row"><button class="btn" data-act="rules" type="button">How to play</button><button class="btn primary" data-act="newgame-confirm" type="button">New game</button><button class="btn" data-act="close" type="button">Close</button></div>', "menu");
  }

  // ------------------------------------------------------------ input
  function humanBid(a) {
    var st = G.st;
    if ((st.phase !== "bid1" && st.phase !== "bid2") || st.turn !== HUMAN) return;
    try { L.bid(st, a); } catch (e) { return; }
    ui.alone = false;
    after();
  }

  function playSelected() {
    var st = G.st;
    if (!ui.sel) return;
    var c = ui.sel;
    if (st.phase === "play" && st.turn === HUMAN) {
      if (L.legalPlays(st, HUMAN).indexOf(c) < 0) return;
      L.play(st, c); after();
    }
  }

  function onCard(c) {
    var st = G.st;
    if (st.phase === "play" && st.turn === HUMAN) {
      if (L.legalPlays(st, HUMAN).indexOf(c) < 0) { flash("That card does not follow suit."); return; }
      if (opts.confirm && ui.sel !== c) { ui.sel = c; render(); return; }
      L.play(st, c); after();
    } else if (st.phase === "discard" && st.dealer === HUMAN) {
      ui.sel = ui.sel === c ? null : c;
      render();
    }
  }

  var flashT = 0;
  function flash(t) {
    var m = $("panel").querySelector(".msg");
    if (!m) return;
    var old = m.innerHTML;
    m.innerHTML = '<b style="color:var(--hot)">' + esc(t) + "</b>";
    clearTimeout(flashT);
    flashT = setTimeout(function () { if (G && G.st) renderPanel(G.st); }, 1300);
    void old;
  }

  function action(act, el) {
    var st = G && G.st;
    switch (act) {
      case "pass": humanBid({ type: "pass" }); break;
      case "order": humanBid({ type: "order", alone: false }); break;
      case "order-alone": humanBid({ type: "order", alone: true }); break;
      case "call": humanBid({ type: "call", suit: el.getAttribute("data-suit"), alone: !!ui.alone }); break;
      case "discard":
        if (st.phase === "discard" && st.dealer === HUMAN && ui.sel) { L.discard(st, ui.sel); after(); }
        break;
      case "play": playSelected(); break;
      case "next": if (st.phase === "handdone") { L.nextHand(st); after(); } break;
      case "newgame": newGame(); break;
      case "newgame-confirm":
        if (st.phase === "gameover" || st.handNo === 1 && st.scores[0] + st.scores[1] === 0 && st.phase === "bid1") newGame();
        else {
          el.textContent = "Tap again to abandon this game";
          el.setAttribute("data-act", "newgame");
        }
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
    var t = e.target;
    if (t.id === "alone-chk") ui.alone = t.checked;
    else if (t.id === "opt-stick") {
      opts.stick = t.checked; saveOpts();
      if (G) { G.st.opts.stick = opts.stick; save(); }
      t.nextElementSibling.textContent = t.checked ? "On" : "Off";
      if (G) render();
    } else if (t.id === "opt-confirm") {
      opts.confirm = t.checked; saveOpts(); ui.sel = null;
      t.nextElementSibling.textContent = t.checked ? "On" : "Off";
      if (G) render();
    }
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
      // draw something behind the dialog, but do not run the clock until a choice is made
      openModal('<h2 id="modal-title">Welcome back</h2><p>A game in progress was saved: you and North ' + st.scores[0] + ", East and West " + st.scores[1] + ".</p>" +
        '<div class="row"><button class="btn primary" data-act="resume" type="button">Resume game</button><button class="btn" data-act="newgame" type="button">New game</button></div>', "start");
      $("tally").textContent = "Record " + tally.w + "-" + tally.l;
    } else newGame();
  }
  start();
})();
