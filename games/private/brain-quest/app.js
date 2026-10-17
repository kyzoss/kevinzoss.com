(function () {
  "use strict";
  var L = window.BrainQuestLogic;
  var KEY_SAVE = "kz.brain-quest.save.v1", KEY_SEEN = "kz.brain-quest.seen.v1", KEY_PLAYERS = "kz.brain-quest.players.v1", KEY_RECORD = "kz.brain-quest.record.v1", KEY_PREF = "kz.brain-quest.pref.v1";
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var canSpeak = false;
  try { canSpeak = !!(window.speechSynthesis && window.SpeechSynthesisUtterance); } catch (e) { canSpeak = false; }

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
  function jset(k, v) { store("set", k, JSON.stringify(v)); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var seedFromUrl = null;
  try {
    var m = /[?&]seed=(-?\d+)/.exec(window.location.search);
    if (m) seedFromUrl = parseInt(m[1], 10) | 0;
  } catch (e) {}
  var seedUses = 0;
  function pickSeed() { return seedFromUrl !== null ? (seedFromUrl + seedUses++) | 0 : (Date.now() & 0x7fffffff); }

  var CAT_ICON = { count: "🔢", letters: "🔤", shapes: "🔷", animals: "🦉", life: "🏡", think: "💡", math: "➕", language: "📚", science: "🔬", social: "🌍", brain: "🧩", history: "🏛️", nature: "🌿", geo: "🧭", arts: "🎭", sports: "🏆", food: "🍽️", words: "✒️", logic: "🧮" };
  var SAVE_V = 2;
  var KEYS = ["A", "B", "C", "D"];

  var app = { s: null, pref: jget(KEY_PREF, { level: 5, count: 10 }), screen: "menu", speaking: false, lastResult: null, recorded: false, thinkTimer: 0 };
  app.pref.level = L.normLevel(app.pref.level);
  if (app.pref.count !== 20) app.pref.count = 10;

  // ---------- owl mascot (SVG, pose swaps) ----------
  function owl(pose, key) {
    var k = key || "m";
    var eyes, wings, extra = "";
    if (pose === "happy") {
      eyes = '<path d="M34 50 q8 -10 16 0" stroke="#2B2622" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M62 50 q8 -10 16 0" stroke="#2B2622" stroke-width="4" fill="none" stroke-linecap="round"/>';
      wings = wing(k, 16, 50, 48) + wing(k, 96, 50, -48);
      extra = '<g fill="#C99A2E"><path d="M10 18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M100 10 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/></g>';
    } else if (pose === "think") {
      eyes = eyeAt(42, 50, -1, -4) + eyeAt(70, 50, -1, -4);
      wings = wing(k, 22, 74, 12) + wing(k, 76, 66, -62);
      extra = '<g><circle cx="100" cy="22" r="11" fill="#FBF8F2" stroke="#E2D8C6"/><text x="100" y="27" text-anchor="middle" font-size="15" font-weight="600" fill="#C99A2E">?</text></g>';
    } else if (pose === "oops") {
      eyes = eyeAt(42, 52, 0, 2) + eyeAt(70, 52, 0, 2) + '<path d="M32 38 l18 6" stroke="#5A3F2A" stroke-width="3" stroke-linecap="round"/><path d="M80 38 l-18 6" stroke="#5A3F2A" stroke-width="3" stroke-linecap="round"/>';
      wings = wing(k, 18, 80, 28) + wing(k, 94, 80, -28);
    } else {
      eyes = eyeAt(42, 50, 0, 0) + eyeAt(70, 50, 0, 0);
      wings = wing(k, 22, 74, 12) + wing(k, 90, 74, -12);
    }
    return '<svg viewBox="0 0 112 124" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="' + k + 'b" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#B07A4A"/><stop offset="1" stop-color="#6E4524"/></radialGradient>' +
      '<linearGradient id="' + k + 'w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8F5E34"/><stop offset="1" stop-color="#5B3819"/></linearGradient>' +
      '<radialGradient id="' + k + 'y" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF6DF"/><stop offset="1" stop-color="#EAD8B6"/></radialGradient></defs>' +
      '<ellipse cx="56" cy="116" rx="34" ry="5" fill="rgba(43,38,34,0.18)"/>' +
      '<g class="' + (pose === "happy" ? "happy" : "bob") + '">' +
      '<path d="M26 34 l-8 -22 18 12z" fill="url(#' + k + 'w)"/><path d="M86 34 l8 -22 -18 12z" fill="url(#' + k + 'w)"/>' +
      '<ellipse cx="56" cy="68" rx="38" ry="44" fill="url(#' + k + 'b)"/>' +
      wings +
      '<ellipse cx="56" cy="82" rx="24" ry="26" fill="url(#' + k + 'y)"/>' +
      '<g fill="none" stroke="#C9A36E" stroke-width="1.5" opacity="0.8"><path d="M44 74 q6 6 12 0 q6 6 12 0"/><path d="M40 86 q6 6 12 0 q6 6 12 0 q6 6 12 0"/><path d="M44 98 q6 6 12 0 q6 6 12 0"/></g>' +
      '<circle cx="42" cy="50" r="16" fill="#FBF8F2"/><circle cx="70" cy="50" r="16" fill="#FBF8F2"/>' +
      '<circle cx="42" cy="50" r="17" fill="none" stroke="#5B3819" stroke-width="2.5"/><circle cx="70" cy="50" r="17" fill="none" stroke="#5B3819" stroke-width="2.5"/>' +
      eyes +
      '<path d="M50 60 l6 10 6 -10z" fill="#E0A23A" stroke="#B57A1E" stroke-width="1"/>' +
      '<path d="M46 110 l-4 8 M50 110 l0 9 M54 110 l3 8 M58 110 l-3 8 M62 110 l0 9 M66 110 l4 8" stroke="#E0A23A" stroke-width="3" stroke-linecap="round"/>' +
      extra + '</g></svg>';
  }
  function wing(k, cx, cy, rot) {
    return '<g transform="rotate(' + rot + " " + cx + " " + cy + ')"><ellipse cx="' + cx + '" cy="' + cy + '" rx="9" ry="21" fill="url(#' + k + 'w)"/><path d="M' + (cx - 4) + " " + (cy - 10) + " q4 10 0 22 M" + cx + " " + (cy - 12) + ' q5 12 1 26" fill="none" stroke="rgba(43,38,34,0.25)" stroke-width="1.5"/></g>';
  }
  function eyeAt(cx, cy, dx, dy) {
    return '<circle cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="8" fill="#2B2622"/><circle cx="' + (cx + dx + 3) + '" cy="' + (cy + dy - 3) + '" r="2.6" fill="#fff"/>';
  }
  function setMascot(pose) { $("mascot").innerHTML = owl(pose, "m"); }

  // ---------- screens ----------
  function show(name) {
    ["menu", "setupTwo", "setupCat", "game", "results"].forEach(function (id) { $(id).hidden = id !== name; });
    app.screen = name;
    try { window.scrollTo(0, 0); } catch (e) {}
    if (name !== "game") stopSpeaking();
  }
  function savePref() { jset(KEY_PREF, app.pref); }
  function levelName(lv) { return L.LEVEL_NAMES[L.normLevel(lv)]; }
  function parseLevel(v) { return L.normLevel(v === "adult" ? "adult" : parseInt(v, 10)); }

  // ---------- menu ----------
  function renderMenu() {
    document.querySelectorAll("[data-level]").forEach(function (b) {
      var on = parseLevel(b.getAttribute("data-level")) === app.pref.level;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-count]").forEach(function (b) {
      var on = parseInt(b.getAttribute("data-count"), 10) === app.pref.count;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var sv = loadSave();
    var r = $("resume");
    if (sv) {
      var s = sv.s, lab = s.mode === "two" ? "two player game" : s.mode === "practice" ? "practice" : "quiz";
      r.hidden = false;
      r.textContent = "Resume " + lab + " (" + (s.mode === "two" ? s.players.length + " players" : levelName(s.level)) + ", question " + (s.i + 1) + (s.count ? " of " + s.count : "") + ")";
    } else r.hidden = true;
    renderRecord();
    $("seedNote").textContent = seedFromUrl !== null ? "Fixed seed " + seedFromUrl : "";
  }
  function blankRec() { return { runs: 0, stars: 0, three: 0, correct: 0, answered: 0 }; }
  // Record is kept per level: {5: {...}, 8: {...}, adult: {...}}. An older
  // single-object record is folded into Age 5.
  function record() {
    var t = jget(KEY_RECORD, null), out = {};
    if (t && typeof t.runs === "number") t = { 5: t };
    L.LEVELS.forEach(function (lv) { out[lv] = (t && t[lv] && typeof t[lv].runs === "number") ? t[lv] : blankRec(); });
    return out;
  }
  function renderRecord() {
    var t = record();
    $("record").innerHTML = L.LEVELS.map(function (lv) {
      var r = t[lv], pct = r.answered ? Math.round(100 * r.correct / r.answered) : 0;
      return '<div class="recrow"><span class="rl">' + levelName(lv) + "</span><div><b>" + r.runs + "</b>quizzes</div><div><b>" + r.stars + "</b>stars</div><div><b>" + r.three + "</b>perfect</div><div><b>" + pct + "%</b>right</div></div>";
    }).join("");
  }

  // ---------- seen tracking ----------
  function seenAll() { var all = jget(KEY_SEEN, {}); return all && typeof all === "object" && !Array.isArray(all) ? all : {}; }
  function saveSeenAll(map) { jset(KEY_SEEN, map); }

  // ---------- save/resume ----------
  function save() { if (app.s && !app.s.done) jset(KEY_SAVE, { s: app.s, recorded: app.recorded }); else store("del", KEY_SAVE); }
  function loadSave() {
    var sv = jget(KEY_SAVE, null);
    if (!sv || !sv.s || sv.s.v !== SAVE_V || !Array.isArray(sv.s.qs) || sv.s.done) return null;
    return sv;
  }

  // ---------- starting runs ----------
  function startRun(opts) {
    opts.seed = pickSeed();
    opts.seen = seenAll();
    app.s = L.newRun(opts);
    app.recorded = false;
    app.lastResult = null;
    save();
    show("game");
    renderGame(true);
  }
  function startQuiz() { startRun({ level: app.pref.level, mode: "quiz", count: app.pref.count }); }
  function startPractice(cat) { startRun({ level: app.pref.level, mode: "practice", category: cat }); }
  function startTwo() {
    var ps = app.two.players.map(function (p, k) { return { name: (p.name || "").trim() || ("Player " + (k + 1)), emoji: p.emoji, level: p.level }; });
    jset(KEY_PLAYERS, ps);
    startRun({ level: app.pref.level, mode: "two", count: app.two.count, players: ps });
  }

  // ---------- two player setup (2 to 4 players, each with a level) ----------
  app.two = { players: [], count: 10 };
  function freeAvatar(k) {
    var used = app.two.players.map(function (p, j) { return j === k ? null : p.emoji; });
    for (var i = 0; i < L.AVATARS.length; i++) if (used.indexOf(L.AVATARS[i]) < 0) return L.AVATARS[i];
    return L.AVATARS[0];
  }
  function openTwo() {
    var saved = jget(KEY_PLAYERS, null);
    app.two.players = [];
    if (Array.isArray(saved) && saved.length >= 2) {
      saved.slice(0, L.MAX_PLAYERS).forEach(function (p, k) {
        app.two.players.push({ name: String((p && p.name) || ""), emoji: (p && L.AVATARS.indexOf(p.emoji) >= 0) ? p.emoji : null, level: L.normLevel(p && p.level !== undefined ? p.level : app.pref.level) });
      });
    } else {
      app.two.players.push({ name: "", emoji: null, level: app.pref.level }, { name: "", emoji: null, level: app.pref.level });
    }
    app.two.players.forEach(function (p, k) { if (!p.emoji) p.emoji = freeAvatar(k); });
    app.two.count = app.pref.count;
    renderTwo();
    show("setupTwo");
  }
  function renderTwo() {
    var n = app.two.players.length;
    $("roster").innerHTML = app.two.players.map(function (p, k) {
      var taken = app.two.players.map(function (o, j) { return j === k ? null : o.emoji; });
      return '<div class="card prow" data-p="' + k + '"><div class="phead"><h2>Player ' + (k + 1) + "</h2>" + (n > 2 ? '<button type="button" class="removeP" data-rm="' + k + '">Remove</button>' : "") + "</div>" +
        '<label class="field"><span>Name</span><input data-name="' + k + '" maxlength="16" placeholder="Player ' + (k + 1) + '" autocomplete="off" value="' + esc(p.name) + '" /></label>' +
        '<div class="lvlpick" role="group" aria-label="Player ' + (k + 1) + ' level">' + L.LEVELS.map(function (lv) {
          var on = lv === p.level;
          return '<button type="button" data-lv="' + lv + '" data-lp="' + k + '" class="' + (on ? "on" : "") + '" aria-pressed="' + on + '">' + levelName(lv) + "</button>";
        }).join("") + "</div>" +
        '<div class="avatars" role="group" aria-label="Player ' + (k + 1) + ' animal">' + L.AVATARS.map(function (e) {
          var on = e === p.emoji, busy = taken.indexOf(e) >= 0;
          return '<button type="button" data-av="' + k + '" data-e="' + e + '" class="' + (on ? "on" : "") + '" aria-pressed="' + on + '" aria-label="' + e + (busy ? " (taken)" : "") + '"' + (busy ? ' disabled style="opacity:.35"' : "") + ">" + e + "</button>";
        }).join("") + "</div></div>";
    }).join("");
    $("addPlayer").hidden = n >= L.MAX_PLAYERS;
    document.querySelectorAll("[data-count2]").forEach(function (b) {
      var on = parseInt(b.getAttribute("data-count2"), 10) === app.two.count;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var per = Math.ceil(app.two.count / n);
    $("twoHint").textContent = n + " players take turns, " + per + " questions each" + (per * n !== app.two.count ? " (" + per * n + " in total so turns come out even)" : "") + ". Each player's cards come from their own level.";
  }

  // ---------- category setup ----------
  function openCat() {
    var cats = L.CATS[app.pref.level], counts = L.counts(app.pref.level), i = 0, html = "";
    $("catLevel").textContent = levelName(app.pref.level);
    Object.keys(cats).forEach(function (k) {
      html += '<button type="button" class="catbtn tint' + (i % 6) + '" data-cat="' + k + '"><span class="ci">' + CAT_ICON[k] + "</span><span>" + esc(cats[k]) + "</span><small>" + counts[k] + (k === { 5: "count", 8: "math", adult: "logic" }[app.pref.level] ? "+ questions" : " questions") + "</small></button>";
      i++;
    });
    $("catGrid").innerHTML = html;
    show("setupCat");
  }

  // ---------- game rendering ----------
  function catName(s, k, lv) { var t = L.CATS[lv || s.level]; return (t && t[k]) || k; }
  function isEmojiOnly(t) { return !/[A-Za-z0-9]/.test(t); }
  // Runs of two or more emoji become a wrapping flex group so counting
  // questions break into tidy rows instead of splitting mid-sentence.
  var EMO_RUN = /((?:\p{Extended_Pictographic}\uFE0F?){2,})(\s*[?.!]?)/gu;
  function questionHtml(t) {
    return esc(t).replace(EMO_RUN, function (all, run, tail) {
      var parts = Array.from(run.replace(/\uFE0F/g, "")).map(function (e) { return "<span>" + e + "</span>"; });
      if (tail.trim()) parts[parts.length - 1] = parts[parts.length - 1].replace("</span>", tail.trim() + "</span>");
      return '<span class="erun">' + parts.join("") + "</span>";
    });
  }
  function renderGame(fresh) {
    var s = app.s, q = L.current(s);
    if (!q) return;
    var i, html;
    // players
    if (s.mode === "two") {
      var pe = $("players");
      pe.hidden = false;
      pe.className = "players n" + s.players.length;
      pe.style.setProperty("--n", s.players.length);
      pe.innerHTML = s.players.map(function (p, k) {
        return '<div class="pl' + (L.turnOf(s) === k && !s.done ? " turn" : "") + '"><span class="av">' + p.emoji + '</span><div><div class="nm">' + esc(p.name) + '</div><span class="lv">' + levelName(p.level) + '</span><div class="sc">' + p.score + " right</div></div></div>";
      }).join("");
    } else $("players").hidden = true;
    // progress
    if (s.mode === "practice") {
      $("progress").innerHTML = '<span class="pcount">Question ' + (s.i + 1) + " &middot; " + s.score + " right" + (s.streak >= 2 ? " &middot; streak " + s.streak : "") + "</span>";
      $("stopBtn").hidden = false; $("topSpacer").hidden = true;
    } else {
      html = "";
      for (i = 0; i < s.count; i++) {
        var cls = "dot";
        if (i < s.history.length) cls += s.history[i] ? " ok" : " no";
        else if (i === s.i) cls += " cur";
        html += '<span class="' + cls + '"></span>';
      }
      $("progress").innerHTML = html;
      $("stopBtn").hidden = true; $("topSpacer").hidden = false;
    }
    // status
    var who = s.mode === "two" ? s.players[L.turnOf(s)].name + ", your turn. " : "";
    if (s.mode === "practice") $("status").textContent = esc(catName(s, s.cat)) + " practice" + (s.streak >= 3 ? ". Streak " + s.streak + "!" : "");
    else $("status").textContent = who + "Question " + (s.i + 1) + " of " + s.count + (s.mode !== "two" && s.streak >= 3 ? ". Streak " + s.streak + "!" : "");
    // card
    $("qcat").textContent = catName(s, q.cat, q.level);
    if (s.mode === "two") {
      var cp = s.players[L.turnOf(s)];
      $("qwho").hidden = false;
      $("qwho").textContent = cp.emoji + " " + cp.name + " \u00b7 " + levelName(cp.level);
    } else $("qwho").hidden = true;
    var qt = $("qtext");
    qt.innerHTML = questionHtml(q.q);
    qt.classList.toggle("big", q.q.length <= 24 && /[\u{1F300}-\u{1FAFF}]/u.test(q.q));
    $("speakBtn").hidden = !canSpeak;
    $("speakBtn").classList.remove("on");
    var card = $("qcard");
    if (fresh && !reduceMotion) { card.classList.remove("flip"); void card.offsetWidth; card.classList.add("flip"); }
    // answers
    var ansEl = $("answers");
    ansEl.classList.toggle("three", q.a.length === 3);
    ansEl.innerHTML = q.a.map(function (t, k) {
      var cls = "ans t" + k, dis = "";
      if (s.picked !== null) {
        dis = " disabled";
        if (k === q.c) cls += k === s.picked ? " right" : " reveal";
        else if (k === s.picked) cls += " wrong";
        else cls += " dim";
      }
      return '<button type="button" class="' + cls + '" data-ans="' + k + '"' + dis + ' aria-label="' + esc(KEYS[k] + ". " + t) + '"><span class="key" aria-hidden="true">' + KEYS[k] + '</span><span class="at' + (isEmojiOnly(t) ? " emo" : "") + '">' + esc(t) + "</span></button>";
    }).join("");
    // feedback
    if (s.picked !== null) {
      var ok = s.history[s.history.length - 1];
      $("feedback").hidden = false;
      $("fbText").textContent = ok ? praise(s) : "Not quite. The answer is " + q.a[q.c] + ".";
      $("fbText").className = "fbtext " + (ok ? "good" : "bad");
      if (q.fun) { $("fbFun").hidden = false; $("fbFun").innerHTML = "<b>Did you know?</b> " + esc(q.fun); } else $("fbFun").hidden = true;
      $("nextBtn").textContent = s.mode !== "practice" && s.i + 1 >= s.count ? "See results" : "Next";
      setMascot(ok ? "happy" : "oops");
    } else {
      $("feedback").hidden = true;
      setMascot(fresh ? "idle" : "think");
    }
  }
  var PRAISE = ["Yes!", "Correct!", "Great job!", "You got it!", "Brilliant!", "Super!", "Nice one!", "Exactly right!"];
  function praise(s) {
    var k = s.history.length % PRAISE.length;
    var st = s.mode === "two" ? s.players[L.turnOf(s)].streak : s.streak;
    return PRAISE[k] + (st >= 3 ? " " + st + " in a row!" : "");
  }

  function onAnswer(k) {
    var s = app.s;
    if (!s || s.picked !== null) return;
    clearTimeout(app.thinkTimer);
    var res = L.answer(s, k);
    if (!res) return;
    app.lastResult = res;
    stopSpeaking();
    renderGame(false);
    var btn = $("answers").querySelector('[data-ans="' + k + '"]');
    if (btn && !reduceMotion) btn.classList.add(res.correct ? "pop" : "shake");
    save();
    var focusTo = $("nextBtn");
    try { focusTo.focus({ preventScroll: true }); } catch (e) {}
  }
  function onNext() {
    var s = app.s;
    if (!s || s.picked === null) return;
    L.next(s);
    if (s.done) { finishRun(); return; }
    save();
    renderGame(true);
    clearTimeout(app.thinkTimer);
    app.thinkTimer = setTimeout(function () { if (app.s && app.s.picked === null) setMascot("think"); }, reduceMotion ? 0 : 900);
  }
  function finishRun() {
    var s = app.s;
    if (!s.done) L.finishPractice(s);
    // seen memory
    saveSeenAll(L.seenAfter(s, seenAll()));
    // record, per level
    if (!app.recorded && s.history.length) {
      var t = record();
      if (s.mode === "two") {
        s.players.forEach(function (p, k) {
          var r = t[p.level], n = 0;
          for (var i = 0; i < s.history.length; i++) if (L.turnOf(s, i) === k) n++;
          r.correct += p.score; r.answered += n;
        });
      } else {
        var r = t[s.level];
        if (s.mode === "quiz") { r.runs++; var st = L.stars(s); r.stars += st; if (st === 3) r.three++; }
        r.correct += s.score; r.answered += s.history.length;
      }
      jset(KEY_RECORD, t);
      app.recorded = true;
    }
    store("del", KEY_SAVE);
    renderResults();
    show("results");
  }

  // ---------- results ----------
  function renderResults() {
    var s = app.s, n = s.history.length, st = L.stars(s), html = "";
    $("stars").innerHTML = [1, 2, 3].map(function (k) { return '<span class="st' + (k <= st ? " lit" : "") + '">&#9733;</span>'; }).join("");
    $("stars").setAttribute("aria-label", st + " of 3 stars");
    $("stars").hidden = s.mode === "two";
    $("resOwl").innerHTML = "";
    if (s.mode === "two") {
      var w = L.winner(s), lead = L.leaders(s);
      $("resTitle").textContent = w < 0 ? "It is a tie!" : s.players[w].name + " wins!";
      html = s.players.map(function (p, k) {
        return '<div class="pline' + (lead.indexOf(k) >= 0 ? " win" : "") + '"><span class="av">' + p.emoji + "</span><span>" + esc(p.name) + " <small>" + levelName(p.level) + "</small></span><b>" + p.score + "</b><span>of " + L.questionsFor(s, k) + "</span></div>";
      }).join("");
      $("resOwl").innerHTML = owl(w < 0 ? "think" : "happy", "r");
    } else {
      $("resTitle").textContent = st === 3 ? "Amazing!" : st === 2 ? "Well done!" : n ? "Good try!" : "No questions answered";
      html = "<p>You got <b>" + s.score + "</b> of <b>" + n + "</b> right" + (s.best >= 2 ? ", best streak <b>" + s.best + "</b>" : "") + ".</p>";
      if (s.mode === "practice") html += '<p class="hint">' + esc(catName(s, s.cat)) + " practice, " + levelName(s.level) + "</p>";
      else html += '<p class="hint">' + levelName(s.level) + (s.seenReset && s.seenReset[s.level] ? ". You have seen every card at this level, so the deck was shuffled fresh." : "") + "</p>";
      $("resOwl").innerHTML = owl(st === 3 ? "happy" : st === 1 ? "oops" : "idle", "r");
    }
    $("resBody").innerHTML = html;
    $("confetti").innerHTML = "";
    if ((st === 3 || (s.mode === "two" && n >= s.count)) && !reduceMotion && st >= 2) confetti();
  }
  function confetti() {
    var cols = ["#C99A2E", "#D9663A", "#4E8A5C", "#3A5C8A", "#F6E3A6", "#CFE3F4"], html = "", i;
    for (i = 0; i < 70; i++) {
      html += '<i style="--x:' + (Math.random() * 100).toFixed(1) + "%;--d:" + (2.2 + Math.random() * 1.8).toFixed(2) + "s;--delay:" + (Math.random() * 0.8).toFixed(2) + "s;--r:" + Math.floor(Math.random() * 360) + "deg;--c:" + cols[i % cols.length] + ";width:" + (7 + Math.random() * 7).toFixed(0) + 'px"></i>';
    }
    $("confetti").innerHTML = html;
    setTimeout(function () { $("confetti").innerHTML = ""; }, 5000);
  }

  // ---------- speech ----------
  function stopSpeaking() {
    if (!canSpeak) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    app.speaking = false;
    var b = $("speakBtn"); if (b) b.classList.remove("on");
  }
  function speakQuestion() {
    if (!canSpeak || !app.s) return;
    if (app.speaking) { stopSpeaking(); return; }
    var q = L.current(app.s);
    if (!q) return;
    try {
      var text = q.q + ". " + q.a.map(function (t, k) { return KEYS[k] + ": " + t; }).join(". ");
      var u = new window.SpeechSynthesisUtterance(text);
      u.rate = 0.9; u.lang = "en-US";
      u.onend = function () { app.speaking = false; $("speakBtn").classList.remove("on"); };
      u.onerror = u.onend;
      app.speaking = true;
      $("speakBtn").classList.add("on");
      window.speechSynthesis.speak(u);
    } catch (e) { app.speaking = false; }
  }

  // ---------- modal ----------
  function modal(title, body, btns) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    $("modalBtns").innerHTML = btns.map(function (b, i) { return '<button type="button" class="btn' + (b.primary ? " primary" : "") + '" data-mb="' + i + '">' + esc(b.label) + "</button>"; }).join("");
    $("modal").hidden = false;
    $("modalBtns").querySelectorAll("button").forEach(function (el) {
      el.addEventListener("click", function () { $("modal").hidden = true; var b = btns[parseInt(el.getAttribute("data-mb"), 10)]; if (b.fn) b.fn(); });
    });
    try { $("modalBtns").querySelector("button").focus(); } catch (e) {}
  }
  function quit() {
    var s = app.s;
    if (!s || !s.history.length) { app.s = null; store("del", KEY_SAVE); show("menu"); renderMenu(); return; }
    modal("Leave the game?", "<p>Your place is saved. You can resume from the menu" + (s.mode === "practice" ? ", or finish now to see your score" : "") + ".</p>", [
      { label: "Keep playing" },
      { label: s.mode === "practice" ? "Finish now" : "Save and leave", primary: true, fn: function () { if (s.mode === "practice") finishRun(); else { save(); show("menu"); renderMenu(); } } }
    ]);
  }

  // ---------- events ----------
  function bind() {
    document.querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { app.pref.level = parseLevel(b.getAttribute("data-level")); savePref(); renderMenu(); });
    });
    document.querySelectorAll("[data-count]").forEach(function (b) {
      b.addEventListener("click", function () { app.pref.count = parseInt(b.getAttribute("data-count"), 10); savePref(); renderMenu(); });
    });
    document.querySelectorAll("[data-count2]").forEach(function (b) {
      b.addEventListener("click", function () { app.two.count = parseInt(b.getAttribute("data-count2"), 10); renderTwo(); });
    });
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        var mode = b.getAttribute("data-mode");
        var go = function () { if (mode === "quiz") startQuiz(); else if (mode === "two") openTwo(); else openCat(); };
        if (loadSave() && mode === "quiz") modal("Start a new quiz?", "<p>This replaces your saved game.</p>", [{ label: "Cancel" }, { label: "Start new", primary: true, fn: go }]);
        else go();
      });
    });
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { show("menu"); renderMenu(); });
    });
    $("resume").addEventListener("click", function () {
      var sv = loadSave();
      if (!sv) { renderMenu(); return; }
      app.s = sv.s; app.recorded = !!sv.recorded;
      show("game"); renderGame(true);
    });
    $("roster").addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b || b.disabled) return;
      if (b.hasAttribute("data-av")) { app.two.players[parseInt(b.getAttribute("data-av"), 10)].emoji = b.getAttribute("data-e"); renderTwo(); }
      else if (b.hasAttribute("data-lp")) { app.two.players[parseInt(b.getAttribute("data-lp"), 10)].level = parseLevel(b.getAttribute("data-lv")); renderTwo(); }
      else if (b.hasAttribute("data-rm") && app.two.players.length > 2) { app.two.players.splice(parseInt(b.getAttribute("data-rm"), 10), 1); renderTwo(); }
    });
    $("roster").addEventListener("input", function (ev) {
      var i = ev.target.closest("[data-name]"); if (!i) return;
      app.two.players[parseInt(i.getAttribute("data-name"), 10)].name = i.value;
    });
    $("addPlayer").addEventListener("click", function () {
      if (app.two.players.length >= L.MAX_PLAYERS) return;
      app.two.players.push({ name: "", emoji: null, level: app.pref.level });
      app.two.players[app.two.players.length - 1].emoji = freeAvatar(app.two.players.length - 1);
      renderTwo();
      try { $("roster").querySelector('[data-name="' + (app.two.players.length - 1) + '"]').focus(); } catch (e) {}
    });
    $("startTwo").addEventListener("click", startTwo);
    $("catGrid").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cat]"); if (!b) return;
      startPractice(b.getAttribute("data-cat"));
    });
    $("answers").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-ans]"); if (!b || b.disabled) return;
      onAnswer(parseInt(b.getAttribute("data-ans"), 10));
    });
    $("nextBtn").addEventListener("click", onNext);
    $("speakBtn").addEventListener("click", speakQuestion);
    $("quitBtn").addEventListener("click", quit);
    $("stopBtn").addEventListener("click", function () {
      if (!app.s) return;
      if (app.s.picked !== null) L.next(app.s);
      finishRun();
    });
    $("againBtn").addEventListener("click", function () {
      var s = app.s;
      if (!s) { show("menu"); renderMenu(); return; }
      if (s.mode === "two") startRun({ level: s.level, mode: "two", count: s.count > 10 ? 20 : 10, players: s.players.map(function (p) { return { name: p.name, emoji: p.emoji, level: p.level }; }) });
      else if (s.mode === "practice") startRun({ level: s.level, mode: "practice", category: s.cat });
      else startRun({ level: s.level, mode: "quiz", count: s.count });
    });
    document.addEventListener("keydown", function (ev) {
      if (app.screen !== "game" || !app.s) return;
      if (ev.key === "Enter" && app.s.picked !== null && document.activeElement !== $("nextBtn")) { onNext(); ev.preventDefault(); return; }
      var k = "1234".indexOf(ev.key) >= 0 ? "1234".indexOf(ev.key) : "abcdABCD".indexOf(ev.key) % 4;
      if (k >= 0 && ev.key.length === 1 && /[1-4a-dA-D]/.test(ev.key) && app.s.picked === null) {
        var q = L.current(app.s);
        if (q && k < q.a.length) onAnswer(k);
      }
    });
    $("modal").addEventListener("click", function (ev) { if (ev.target === $("modal")) $("modal").hidden = true; });
  }

  // ---------- boot ----------
  function boot() {
    $("heroOwl").innerHTML = owl("idle", "h");
    bind();
    renderMenu();
    show("menu");
  }
  boot();
  window.__brain_quest = { app: app, L: L, owl: owl, renderGame: renderGame, show: show, startRun: startRun };
})();
