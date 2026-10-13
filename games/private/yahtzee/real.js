// Real dice mode: the players roll physical dice, this is the scorekeeper.
(function () {
  "use strict";
  var L = window.YahtzeeLogic;
  var KEY = "yahtzee.real.save.v1", NAMES = "yahtzee.names.v1", PATH = "yahtzee.real.path.v1", DM = "yahtzee.dicemode.v1";
  var Y = function () { return window.YZ; };
  var $ = function (id) { return document.getElementById(id); };
  var R = { b: null, path: "dice", dice: [0, 0, 0, 0, 0], sel: null, count: 2, msg: "" };
  var active = false;

  function loadNames() {
    try { var n = JSON.parse(Y().store("get", NAMES)); if (Array.isArray(n)) return n; } catch (e) {}
    return [];
  }
  function nameFor(i, saved) {
    var v = saved[i];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 14) : "Player " + (i + 1);
  }
  function save() {
    if (R.b) Y().store("set", KEY, JSON.stringify(R.b));
  }
  function loadSaved() {
    try { var b = JSON.parse(Y().store("get", KEY)); if (L.validBoard(b) && !b.over) { L.boardRecalc(b); return b; } } catch (e) {}
    return null;
  }

  // ------------------------------------------------------------ menu
  function buildNames() {
    var saved = loadNames(), box = $("nameInputs"), html = "";
    for (var i = 0; i < R.count; i++) {
      html += '<input type="text" maxlength="14" autocomplete="off" aria-label="Player ' + (i + 1) + ' name" data-i="' + i + '" placeholder="Player ' + (i + 1) + '" value="' +
        Y().esc(typeof saved[i] === "string" ? saved[i] : "") + '" />';
    }
    box.innerHTML = html;
  }
  function currentNames() {
    var saved = loadNames(), inputs = $("nameInputs").querySelectorAll("input"), out = [];
    for (var i = 0; i < 6; i++) {
      var inp = inputs[i];
      if (inp) saved[i] = inp.value.trim();
      out.push(nameFor(i, saved));
    }
    Y().store("set", NAMES, JSON.stringify(saved.slice(0, 6)));
    return out.slice(0, R.count);
  }
  function setDiceMode(m) {
    Array.prototype.forEach.call($("diceMode").children, function (c) { c.classList.toggle("on", c.dataset.m === m); });
    $("virtualSetup").hidden = m !== "virtual"; $("realSetup").hidden = m !== "real";
    Y().store("set", DM, m);
  }
  function init() {
    $("diceMode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setDiceMode(b.dataset.m); });
    $("realCount").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      currentNames();
      R.count = +b.dataset.n;
      Array.prototype.forEach.call($("realCount").children, function (c) { c.classList.toggle("on", c === b); });
      buildNames();
    });
    $("nameInputs").addEventListener("input", function () { currentNames(); });
    $("startReal").addEventListener("click", function () { start(currentNames()); });
    $("resumeReal").addEventListener("click", function () {
      var b = loadSaved(); if (!b) return;
      R.b = b; resetEntry(); enter();
    });
    $("rUndo").addEventListener("click", undo);
    $("rRules").addEventListener("click", Y().showRules);
    $("rNew").addEventListener("click", confirmNew);
    $("rPath").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      R.path = b.dataset.p; Y().store("set", PATH, R.path); resetEntry(); render();
    });
    $("rEntry").addEventListener("click", entryClick);
    $("rCard").addEventListener("click", cardClick);
    document.addEventListener("keydown", keydown);
    var p = Y().store("get", PATH); if (p === "score" || p === "dice") R.path = p;
    var m = Y().store("get", DM);
    var n = loadNames().length; if (n >= 1 && n <= 6) R.count = Math.max(1, n);
    Array.prototype.forEach.call($("realCount").children, function (c) { c.classList.toggle("on", +c.dataset.n === R.count); });
    buildNames();
    setDiceMode(m === "real" ? "real" : "virtual");
  }
  function showMenu() {
    active = false; $("real").hidden = true;
    var sv = loadSaved(), rb = $("resumeReal");
    if (sv) {
      rb.hidden = false;
      rb.textContent = "Resume real dice game (" + sv.players.length + " player" + (sv.players.length > 1 ? "s" : "") + ", round " + sv.round + " of 13)";
    } else rb.hidden = true;
  }

  // ------------------------------------------------------------ start / flow
  function resetEntry() { R.dice = [0, 0, 0, 0, 0]; R.sel = null; }
  function start(names) {
    R.b = L.newBoard(names); resetEntry(); save(); enter();
  }
  function enter() {
    active = true;
    Y().closeOverlay();
    $("menu").hidden = true; $("game").hidden = true; $("real").hidden = false;
    window.scrollTo(0, 0);
    render();
  }
  function cur() { return R.b.players[R.b.current]; }
  function diceFull() { return R.dice.every(function (v) { return v > 0; }); }

  function undo() {
    if (!R.b || !L.boardUndo(R.b)) return;
    resetEntry(); save(); Y().closeOverlay(); R.msg = "Undid the last entry"; render();
  }
  function after(msg) {
    resetEntry(); R.msg = msg || "";
    var b = R.b;
    if (b.over) { finish(); } else { save(); render(); }
  }
  function finish() {
    var b = R.b;
    if (!b.counted) {
      b.counted = true;
      var st = Y().loadStats(); st.played++;
      if (b.players.length === 1) { var t = L.totals(b.players[0]).total; if (t > st.best) st.best = t; }
      Y().saveStats(st);
    }
    Y().store("del", KEY);
    render(); showEnd();
  }
  function rankLabel(x, all) {
    var tied = all.filter(function (y) { return y.rank === x.rank; }).length > 1;
    return (tied ? "T" : "") + x.rank;
  }
  function showEnd() {
    var b = R.b, st = L.boardStandings(b), w = L.boardWinners(b), multi = b.players.length > 1;
    var title = !multi ? "Final score" : w.length > 1 ? "It is a tie" : b.players[w[0]].name + " wins";
    var tieNote = multi && w.length > 1 ? "<p>Tied for first: " + w.map(function (i) { return Y().esc(b.players[i].name); }).join(", ") + "</p>" : "";
    var list = st.map(function (x) {
      return "<li><span>" + rankLabel(x, st) + ". " + Y().esc(x.name) + "</span><span>" + x.total + "</span></li>";
    }).join("");
    var o = $("overlay"); o.hidden = false;
    o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><h2>' + Y().esc(title) + '</h2><ul class="standings">' + list + "</ul>" + tieNote +
      '<button class="btn primary" id="rmBtn">Rematch (same players)</button><button class="btn" id="rvBtn">View scorecard</button><button class="btn" id="rmenuBtn">Menu</button></div>';
    $("rmBtn").addEventListener("click", function () { start(R.b.players.map(function (p) { return p.name; })); });
    $("rvBtn").addEventListener("click", Y().closeOverlay);
    $("rmenuBtn").addEventListener("click", function () { Y().closeOverlay(); Y().renderMenu(); });
    $("rmBtn").focus();
  }
  function confirmNew() {
    var o = $("overlay"); o.hidden = false;
    o.innerHTML = '<div class="sheet pass" role="dialog" aria-modal="true"><h2>New game?</h2><p>The current scores will be lost.</p>' +
      '<button class="btn primary" id="nSame">Same players</button><button class="btn" id="nMenu">Change players (menu)</button><button class="btn" id="nNo">Keep playing</button></div>';
    $("nSame").addEventListener("click", function () { start(R.b.players.map(function (p) { return p.name; })); });
    $("nMenu").addEventListener("click", function () { Y().store("del", KEY); Y().closeOverlay(); Y().renderMenu(); });
    $("nNo").addEventListener("click", Y().closeOverlay);
  }

  // ------------------------------------------------------------ rendering
  var PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function pipHTML(v) {
    var s = "", on = PIPS[v] || [];
    for (var i = 1; i <= 9; i++) s += '<span class="pip' + (on.indexOf(i) >= 0 ? " on" : "") + '"></span>';
    return s;
  }
  function render() {
    var b = R.b, esc = Y().esc, i;
    $("rRound").textContent = b.over ? "Game over" : "Round " + b.round + "/13";
    $("rUndo").disabled = !b.history.length;
    $("rUndo").style.opacity = b.history.length ? 1 : 0.4;
    Array.prototype.forEach.call($("rPath").children, function (c) { c.classList.toggle("on", c.dataset.p === R.path); });
    var p = cur(), multi = b.players.length > 1, who = multi ? "<b>" + esc(p.name) + "</b>: " : "";
    var st = $("rStatus"), en = $("rEntry"), h = "";
    if (b.over) {
      st.textContent = "Game over";
      en.innerHTML = '<button class="btn primary" data-act="results">Show results</button>';
    } else if (R.path === "dice") {
      st.innerHTML = who + (diceFull() ? "tap a box below to score it" : "enter the five dice you ended with");
      h += '<div class="entered">';
      for (i = 0; i < 5; i++) {
        var v = R.dice[i];
        h += '<button type="button" class="die mini ' + (v ? "" : "slot ") + (R.sel === i ? "sel" : "") + '" data-die="' + i + '" aria-label="Die ' + (i + 1) + (v ? ": " + v + ", tap to change" : ": empty") + '">' + (v ? pipHTML(v) : "") + "</button>";
      }
      h += '</div><div class="padrow">';
      for (i = 1; i <= 6; i++) h += '<button class="pad" data-n="' + i + '" aria-label="Enter ' + i + '">' + i + "</button>";
      h += '</div><div class="entrybtns"><button class="btn" data-act="clear">Clear dice</button></div>';
      en.innerHTML = h;
    } else {
      st.innerHTML = who + "tap an open box in your column, then pick the score";
      var bonusOk = p.scores[L.YAHTZEE] === 50;
      en.innerHTML = '<div class="entrybtns"><button class="btn" data-act="bonus"' + (bonusOk ? "" : " disabled") + '>Yahtzee bonus +100' +
        (p.bonus ? " (" + p.bonus + ")" : "") + "</button></div>";
    }
    // leaderboard strip
    var ranks = L.boardStandings(b);
    $("rBoard").innerHTML = ranks.map(function (x) {
      return '<div class="chip' + (!b.over && x.index === b.current ? " cur" : "") + '"><div class="n">' + esc(x.name) + '</div><div class="t">' + x.total + '</div><div class="r">' + rankLabel(x, ranks) + "</div></div>";
    }).join("");
    renderCard();
    $("rHint").textContent = (R.msg ? R.msg + ". " : "") + "Tap any scored box to edit or clear it.";
  }
  function renderCard() {
    var b = R.b, esc = Y().esc, cats = L.CATS;
    var pot = (!b.over && R.path === "dice" && diceFull()) ? L.boardPotentials(b, R.dice) : null;
    var forced = pot && L.jokerApplies(cur(), R.dice);
    var tots = b.players.map(L.totals), c = b.over ? -1 : b.current;
    var h = "<thead><tr><th></th>";
    b.players.forEach(function (p, i) { h += '<th class="' + (i === c ? "cur" : "") + '">' + esc(p.name) + "</th>"; });
    h += "</tr></thead><tbody>";
    function cell(pi, ci) {
      var p = b.players[pi], s = p.scores[ci], cls = "val" + (pi === c ? " cur" : "");
      if (s !== null) return '<td class="' + cls + ' edit" data-edit="' + pi + "," + ci + '">' + s + "</td>";
      if (pi === c && pot && pot[ci] !== null) {
        return '<td class="' + cls + '"><button class="pot' + (pot[ci] === 0 ? " zero" : "") + (forced ? " forced" : "") + '" data-dcat="' + ci + '" aria-label="Score ' + pot[ci] + " in " + cats[ci].name + '">' + pot[ci] + "</button></td>";
      }
      if (pi === c && !b.over && R.path === "score") {
        return '<td class="' + cls + '"><button class="pot zero" data-scat="' + ci + '" aria-label="Enter score for ' + cats[ci].name + '">+</button></td>';
      }
      return '<td class="' + cls + ' open"></td>';
    }
    function row(ci) {
      var r = "<tr><td>" + cats[ci].short + "</td>";
      b.players.forEach(function (p, pi) { r += cell(pi, ci); });
      return r + "</tr>";
    }
    function sub(label, f) {
      var r = '<tr class="sub"><td>' + label + "</td>";
      b.players.forEach(function (p, pi) { r += '<td class="' + (pi === c ? "cur" : "") + '">' + f(p, pi) + "</td>"; });
      return r + "</tr>";
    }
    var i;
    for (i = 0; i < 6; i++) h += row(i);
    h += sub("Upper total", function (p, pi) { return tots[pi].upper; });
    h += sub("Bonus (63+)", function (p, pi) { return tots[pi].upperBonus ? "+35" : L.bonusToGo(p) + " to go"; });
    for (i = 6; i < 13; i++) h += row(i);
    h += sub("Yahtzee bonus", function (p, pi) { return tots[pi].yahtzeeBonus || ""; });
    h += '<tr class="total"><td>Total</td>';
    b.players.forEach(function (p, pi) { h += '<td class="' + (pi === c ? "cur" : "") + '">' + tots[pi].total + "</td>"; });
    h += "</tr></tbody>";
    $("rCard").innerHTML = h;
  }

  // ------------------------------------------------------------ input
  function placeDie(n) {
    if (R.sel !== null) { R.dice[R.sel] = n; R.sel = null; return; }
    var i = R.dice.indexOf(0);
    if (i >= 0) R.dice[i] = n;
  }
  function entryClick(e) {
    var b = R.b;
    var t = e.target.closest("button"); if (!t) return;
    if (t.dataset.n) { placeDie(+t.dataset.n); render(); }
    else if (t.dataset.die !== undefined) { var i = +t.dataset.die; R.sel = R.sel === i ? null : i; render(); }
    else if (t.dataset.act === "clear") { resetEntry(); render(); }
    else if (t.dataset.act === "results") showEnd();
    else if (t.dataset.act === "bonus") {
      try { L.boardAddBonus(b); } catch (err) { return; }
      R.msg = cur().name + " got +100 Yahtzee bonus"; save(); render();
    }
  }
  function cardClick(e) {
    var b = R.b, t = e.target.closest("button,td"); if (!t) return;
    if (t.dataset.dcat !== undefined) {
      var ev;
      try { ev = L.boardEnterDice(b, R.dice, +t.dataset.dcat); } catch (err) { return; }
      after(ev.player + " scored " + ev.points + " in " + L.CATS[ev.cat].name + (ev.joker ? " (Joker)" : "") + (ev.yahtzeeBonus ? " and +100 bonus" : ""));
    } else if (t.dataset.scat !== undefined) pickSheet(+t.dataset.scat);
    else if (t.dataset.edit) { var q = t.dataset.edit.split(","); editSheet(+q[0], +q[1]); }
  }
  function grid(cat, curVal) {
    return '<div class="pickgrid">' + L.validScoresFor(cat).map(function (v) {
      return '<button class="pad" data-v="' + v + '"' + (v === curVal ? ' style="border-color:var(--hot)"' : "") + ">" + v + "</button>";
    }).join("") + "</div>";
  }
  function pickSheet(cat) {
    var p = cur(), o = $("overlay"); o.hidden = false;
    o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><h2>' + L.CATS[cat].name + "<small>" + Y().esc(p.name) + ": pick the score</small></h2>" + grid(cat, null) +
      '<button class="btn" id="cancelPick">Cancel</button></div>';
    $("cancelPick").addEventListener("click", Y().closeOverlay);
    o.querySelector(".pickgrid").addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      var ev;
      try { ev = L.boardEnter(R.b, cat, +t.dataset.v); } catch (err) { return; }
      Y().closeOverlay();
      after(ev.player + " scored " + ev.points + " in " + L.CATS[cat].name);
    });
  }
  function editSheet(pi, cat) {
    var p = R.b.players[pi], o = $("overlay"), esc = Y().esc, old = p.scores[cat]; o.hidden = false;
    o.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><h2>' + L.CATS[cat].name + "<small>" + esc(p.name) + ": currently " + old + "</small></h2>" + grid(cat, old) +
      '<button class="btn" id="clearBox">Clear this box</button><button class="btn" id="cancelEdit">Cancel</button></div>';
    $("cancelEdit").addEventListener("click", Y().closeOverlay);
    function confirm(newVal) {
      o.innerHTML = '<div class="sheet pass" role="dialog" aria-modal="true"><h2>Are you sure?</h2><p>' +
        (newVal === null ? "Clear " : "Change ") + esc(p.name) + "'s " + L.CATS[cat].name + (newVal === null ? " (" + old + ")." : " from " + old + " to " + newVal + ".") +
        '</p><button class="btn primary" id="yesEdit">Confirm</button><button class="btn" id="noEdit">Back</button></div>';
      $("noEdit").addEventListener("click", function () { editSheet(pi, cat); });
      $("yesEdit").addEventListener("click", function () {
        L.boardEdit(R.b, pi, cat, newVal);
        Y().closeOverlay(); resetEntry(); R.msg = "Edited " + p.name + "'s " + L.CATS[cat].name;
        if (R.b.over) { finish(); } else { save(); render(); }
      });
    }
    $("clearBox").addEventListener("click", function () { confirm(null); });
    o.querySelector(".pickgrid").addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (+t.dataset.v === old) return Y().closeOverlay();
      confirm(+t.dataset.v);
    });
  }
  function keydown(e) {
    if (!active || $("real").hidden || !$("overlay").hidden || R.b.over) return;
    if (e.ctrlKey || e.metaKey || e.altKey || R.path !== "dice") return;
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.key >= "1" && e.key <= "6") { placeDie(+e.key); render(); }
    else if (e.key === "Backspace") {
      for (var i = 4; i >= 0; i--) if (R.dice[i]) { R.dice[i] = 0; break; }
      R.sel = null; render();
    }
  }

  window.YZReal = { init: init, showMenu: showMenu, active: function () { return active; }, afterRules: function () {} };
})();
