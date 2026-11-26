// Passionfruit Wall app. All state is the entry list (server rows mirrored to
// localStorage) plus settings entries; everything shown is derived by logic.js.
(function () {
  "use strict";
  var L = window.VineLogic;
  var $ = function (id) { return document.getElementById(id); };
  var KEY_CACHE = "kz.vine.cache.v1"; // mirror of the server list
  var KEY_LOCAL = "kz.vine.local.v1"; // local-only entries (no database)
  var KEY_DRAFT = "kz.vine.drafts.v1"; // checklist ticks before a quest is marked done
  var params = new URLSearchParams(location.search);
  var TODAY = /^\d{4}-\d{2}-\d{2}$/.test(params.get("today") || "") ? params.get("today") : L.dayKey(new Date());

  var state = { server: [], local: [], mode: "loading", drafts: {}, screen: "home" };

  // ------------------------------------------------------------ storage
  function load(key) { try { return L.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
  function save(key, list) { try { localStorage.setItem(key, L.serialize(list)); } catch (e) { /* quota or private mode */ } }
  function loadDrafts() { try { return JSON.parse(localStorage.getItem(KEY_DRAFT) || "{}") || {}; } catch (e) { return {}; } }
  function saveDrafts() { try { localStorage.setItem(KEY_DRAFT, JSON.stringify(state.drafts)); } catch (e) { /* ignore */ } }
  function entries() { return L.withSeed(L.mergeEntries(state.server, state.local)); }
  function addLocal(e) { state.local = L.mergeEntries(state.local, [e]); save(KEY_LOCAL, state.local); }
  function addServer(e) { state.server = L.mergeEntries(state.server, [e]); save(KEY_CACHE, state.server); }
  function absorb(res) {
    // A saved entry goes to the server mirror when stored, otherwise to the local list.
    if (!res || !res.entry) return;
    if (res.stored) addServer(res.entry); else addLocal(res.entry);
  }

  async function api(method, body) {
    var r = await fetch("/api/vine", { method: method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    var j = null;
    try { j = await r.json(); } catch (e) { j = { ok: false, reason: "bad_json" }; }
    if (r.status === 401) { j.reason = "unauthed"; }
    j.httpStatus = r.status;
    return j;
  }
  async function sync() {
    try {
      var j = await api("GET");
      if (j.ok) { state.server = L.sortNewest(j.entries || []); save(KEY_CACHE, state.server); state.mode = "db"; }
      else if (j.reason === "no_db") state.mode = "local";
      else if (j.reason === "unauthed") state.mode = "unauthed";
      else state.mode = "offline";
    } catch (e) { state.mode = "offline"; }
    render();
  }

  // ------------------------------------------------------------ helpers
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDay(k) { if (!k) return ""; var d = new Date(k.slice(0, 4), Number(k.slice(5, 7)) - 1, k.slice(8, 10)); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  var toastT = null;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600); }
  function chapterOf(id) { return L.CHAPTERS.filter(function (c) { return c.id === id; })[0]; }
  function chapterNum(q) { return q ? q.chapter : 0; }

  // ------------------------------------------------------------ render
  function render() {
    var list = entries();
    var s = L.summary(list, TODAY);
    renderHero(s);
    renderMode();
    renderHome(list, s);
    renderQuests(list);
    renderJournal(list);
    renderSun(list);
    renderSettings(s.settings);
  }

  function renderHero(s) {
    $("levelName").textContent = s.level.name;
    $("levelXp").textContent = s.xp + " XP";
    $("xpFill").style.width = Math.round(s.level.progress * 100) + "%";
    $("xpFill").parentNode.setAttribute("aria-valuenow", Math.round(s.level.progress * 100));
    $("levelNext").textContent = s.level.next ? s.level.toNext + " XP to " + s.level.next.name : "Top level reached";
    var prog = (s.level.index + s.level.progress) / (L.LEVELS.length - 1);
    drawMotif(prog);
  }
  function drawMotif(p) {
    var svg = $("motif");
    var items = L.vineMotif(p, 400);
    var out = ['<defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9BD28E"/><stop offset="1" stop-color="#3E7B4F"/></linearGradient></defs>'];
    items.forEach(function (it) {
      if (it.type === "stem") out.push('<path d="' + it.d + '" fill="none" stroke="#9BD28E" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>');
      else if (it.type === "leaf") out.push('<g transform="translate(' + it.x + ' ' + it.y + ') rotate(' + it.rot + ')"><path d="M0 0 C ' + it.r + ' -' + it.r + ', ' + it.r * 2 + ' 0, 0 ' + it.r * 1.6 + ' C -' + it.r * 2 + ' 0, -' + it.r + ' -' + it.r + ', 0 0 Z" fill="url(#gl)" opacity="0.95"/><path d="M0 0 L0 ' + it.r * 1.5 + '" stroke="#1F3A2A" stroke-width="0.7" opacity="0.6"/></g>');
      else if (it.type === "flower") { var petals = ""; for (var k = 0; k < 8; k++) petals += '<ellipse rx="2" ry="' + it.r + '" fill="#D9C7F0" transform="rotate(' + (k * 45) + ')"/>'; out.push('<g transform="translate(' + it.x + ' ' + it.y + ')">' + petals + '<circle r="2.6" fill="#5B2A86"/><circle r="1" fill="#E0B23A"/></g>'); }
      else if (it.type === "fruit") out.push('<g transform="translate(' + it.x + ' ' + it.y + ')"><ellipse rx="' + it.r + '" ry="' + (it.r * 1.15) + '" fill="#5B2A86"/><ellipse rx="' + (it.r * 0.45) + '" ry="' + (it.r * 0.6) + '" cx="-1.5" cy="-1.5" fill="#7A44A8" opacity="0.8"/></g>');
    });
    svg.innerHTML = out.join("");
  }
  function renderMode() {
    var m = $("mode");
    var msgs = {
      local: "No database configured: entries are kept on this phone only (kz.vine.local.v1).",
      offline: "Offline or the server did not answer. Showing the cached journal; new entries will need a connection.",
      unauthed: "Signed out. Go back to the games page and enter the passcode.",
    };
    m.hidden = !msgs[state.mode];
    m.textContent = msgs[state.mode] || "";
  }

  function renderHome(list, s) {
    var prog = L.chapterProgress(list, TODAY).filter(function (p) { return p.chapter.id === s.chapter.id; })[0];
    var cc = $("chapterCard");
    cc.innerHTML = '<div class="kicker">Chapter ' + s.chapter.id + ' &middot; ' + esc(s.chapter.when) + '</div><h2>' + esc(s.chapter.title) + '</h2><p>' + esc(s.chapter.blurb) + '</p>'
      + '<div class="bar"><i style="width:' + (prog ? Math.round(prog.done / prog.total * 100) : 0) + '%"></i></div><small>' + (prog ? prog.done + " of " + prog.total + " quests" : "") + '</small>';
    var tc = $("todayCard");
    tc.innerHTML = "<h2>Today</h2>";
    if (s.photoDue && s.settings.notifications !== false) { var d = el("div", "due", "Weekly growth photo is due this week."); tc.appendChild(d); }
    if (!s.next.length) tc.appendChild(el("p", "hint", "Nothing to do right now. Water, watch, wait."));
    s.next.forEach(function (q) {
      var row = el("div", "qrow");
      var t = el("div", "t"); t.appendChild(el("b", "", q.title)); t.appendChild(el("small", "", "Chapter " + q.chapter + " · " + q.xp + " XP · " + proofLabel(q)));
      var b = el("button", "btn small", "Open"); b.onclick = function () { openQuest(q); };
      row.appendChild(t); row.appendChild(b); tc.appendChild(row);
    });
    var wb = el("button", "btn wide", "Water today (+5 XP)");
    wb.onclick = function () { logWater(); };
    tc.appendChild(wb);
    var st = $("streaks");
    st.innerHTML = "";
    [["Weekly photos", s.weekly, "wk"], ["Watering", s.water, "days"], ["Check-ins", s.checkin, "days"]].forEach(function (c) {
      var ch = el("div", "chip"); ch.appendChild(el("b", "", String(c[1]))); ch.appendChild(el("span", "", c[0] + " streak, " + c[2])); st.appendChild(ch);
    });
    var heat = $("heat"); heat.innerHTML = "";
    L.heatStrip(list, TODAY, 84).forEach(function (d) {
      var i = el("i", d.count >= 3 ? "l3" : d.count === 2 ? "l2" : d.count === 1 ? "l1" : "");
      if (d.date === TODAY) i.classList.add("today");
      i.title = d.date + ": " + d.count; heat.appendChild(i);
    });
    var bd = $("badges"); bd.innerHTML = "";
    var icons = { sun_detective: "☀", three_posts: "|||", wired: "≡", bed_ready: "■", day_one: "1", named: "✎", ten_weeks: "10", water_week: "≈", first_flower: "✿", pollinator: "b", first_fruit: "●", half_wall: "½", full_wall: "█", wall_master: "★" };
    L.BADGES.forEach(function (b) {
      var on = s.badges.indexOf(b.id) >= 0;
      var n = el("div", "badge" + (on ? " on" : "")); n.title = b.how;
      n.appendChild(el("div", "ico", icons[b.id] || "?")); n.appendChild(el("div", "", b.name)); bd.appendChild(n);
    });
  }
  function proofLabel(q) { return { none: "mark done", photo: "photo", number: "enter a number", checklist: "checklist", time: "photo at " + (q.slot || "a set time") }[q.proof] || q.proof; }

  var openChapters = null;
  function renderQuests(list) {
    var wrap = $("chapters");
    var ql = L.questList(list, TODAY);
    var cur = L.currentChapter(list, TODAY);
    if (openChapters === null) { openChapters = {}; openChapters[cur.id] = true; }
    else wrap.querySelectorAll("details").forEach(function (d) { openChapters[d.dataset.ch] = d.open; });
    wrap.innerHTML = "";
    L.CHAPTERS.forEach(function (c) {
      var qs = ql.filter(function (x) { return x.quest.chapter === c.id; });
      var done = qs.filter(function (x) { return x.status === "done" || (x.quest.repeat && x.count > 0); }).length;
      var d = el("details", "chapter c" + c.id); d.dataset.ch = c.id; d.open = Boolean(openChapters[c.id]);
      var sm = el("summary");
      sm.appendChild(el("span", "num", String(c.id)));
      var ct = el("span", "ct"); ct.appendChild(el("b", "", c.title)); ct.appendChild(el("small", "", c.when)); sm.appendChild(ct);
      sm.appendChild(el("span", "cp", done + "/" + qs.length));
      d.appendChild(sm);
      d.appendChild(el("div", "blurb", c.blurb));
      var ul = el("ul", "qlist");
      qs.forEach(function (x) {
        var li = el("li");
        var b = el("button", "qitem " + x.status);
        b.appendChild(el("span", "dot", x.status === "done" ? "✓" : x.status === "locked" ? "○" : "▶"));
        var t = el("span", "qt"); t.appendChild(el("b", "", x.quest.title));
        t.appendChild(el("small", "", (x.quest.repeat ? "repeats " + x.quest.repeat + (x.count ? ", logged " + x.count : "") + " · " : "") + proofLabel(x.quest) + (x.status === "locked" ? " · locked" : "")));
        b.appendChild(t); b.appendChild(el("span", "xp", x.quest.xp + " XP"));
        b.onclick = function () { openQuest(x.quest); };
        li.appendChild(b); ul.appendChild(li);
      });
      d.appendChild(ul); wrap.appendChild(d);
    });
  }

  function renderJournal(list) {
    var growth = list.filter(function (e) { return e.kind === "growth" && e.thumb; });
    var before = growth[growth.length - 1], after = growth[0];
    $("cmpBefore").src = before ? before.thumb : "seed/yard-wide.jpg";
    $("cmpAfter").src = after ? after.thumb : "seed/yard-wide.jpg";
    $("cmpBefore").alt = before ? "Day 0, " + fmtDay(L.entryDay(before)) : "Day 0";
    $("cmpAfter").alt = after ? "Latest, " + fmtDay(L.entryDay(after)) : "Latest";
    drawChart(L.coverageSeries(list));
    var tl = $("timeline"); tl.innerHTML = "";
    tl.appendChild(el("h2", "", "Timeline"));
    list.filter(function (e) { return e.kind !== "settings"; }).forEach(function (e) {
      var b = el("button", "entry");
      if (e.thumb) { var im = el("img"); im.src = e.thumb; im.alt = ""; im.loading = "lazy"; b.appendChild(im); }
      else b.appendChild(el("div", "noimg", e.kind === "water" ? "≈" : "✓"));
      var t = el("div", "et");
      t.appendChild(el("small", "", fmtDay(L.entryDay(e)) + (e.seed ? " · Day 0 (built in)" : "")));
      var fb = e.feedback;
      t.appendChild(el("b", "", fb ? fb.headline : e.kind === "quest" ? "Quest done: " + ((L.BY_ID[e.quest_id] || {}).title || e.quest_id) : e.kind === "water" ? "Watered" : e.note || "Check-in"));
      var tags = el("div", "tags");
      tags.appendChild(el("span", "tag k-" + e.kind, e.kind));
      if (e.quest_id && L.BY_ID[e.quest_id]) tags.appendChild(el("span", "tag", L.BY_ID[e.quest_id].title));
      if (fb && typeof fb.health === "number") tags.appendChild(el("span", "tag", "health " + fb.health + "/10"));
      if (fb && typeof fb.coverage_pct === "number") tags.appendChild(el("span", "tag", "coverage " + fb.coverage_pct + "%"));
      if (!fb && (e.kind === "growth" || e.kind === "sun" || e.kind === "proof" || e.kind === "problem")) tags.appendChild(el("span", "tag pend", "review pending"));
      if (L.entryXp(e)) tags.appendChild(el("span", "tag", "+" + L.entryXp(e) + " XP"));
      t.appendChild(tags); b.appendChild(t);
      b.onclick = function () { openEntry(e); };
      tl.appendChild(b);
    });
  }
  function drawChart(series) {
    var svg = $("covChart"), W = 360, H = 140, px = 28, py = 14;
    var out = [];
    for (var g = 0; g <= 100; g += 25) { var y = py + (H - 2 * py) * (1 - g / 100); out.push('<line x1="' + px + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '" stroke="#E2D8C6" stroke-width="1"/><text x="' + (px - 4) + '" y="' + (y + 4) + '" font-size="9" text-anchor="end" fill="#7B7064">' + g + '%</text>'); }
    var ty = py + (H - 2 * py) * (1 - 0.9);
    out.push('<line x1="' + px + '" x2="' + (W - 8) + '" y1="' + ty + '" y2="' + ty + '" stroke="#E0B23A" stroke-dasharray="4 3"/><text x="' + (W - 8) + '" y="' + (ty - 3) + '" font-size="9" text-anchor="end" fill="#9C6F12">full wall</text>');
    if (series.length) {
      var t0 = new Date(series[0].date).getTime(), t1 = Math.max(new Date(series[series.length - 1].date).getTime(), t0 + 86400000 * 30);
      var pts = series.map(function (p) { var x = px + (W - px - 8) * ((new Date(p.date).getTime() - t0) / (t1 - t0)); var y = py + (H - 2 * py) * (1 - p.pct / 100); return [x, y, p]; });
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
      var area = d + " L" + pts[pts.length - 1][0].toFixed(1) + " " + (H - py) + " L" + pts[0][0].toFixed(1) + " " + (H - py) + " Z";
      out.push('<path d="' + area + '" fill="rgba(111,168,107,0.25)"/><path d="' + d + '" fill="none" stroke="#2F5A3C" stroke-width="2.5" stroke-linejoin="round"/>');
      pts.forEach(function (p) { out.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="#5B2A86" stroke="#fff" stroke-width="1.5"><title>' + esc(p[2].date) + ": " + p[2].pct + '%</title></circle>'); });
      out.push('<text x="' + px + '" y="' + (H - 2) + '" font-size="9" fill="#7B7064">' + esc(series[0].date) + '</text><text x="' + (W - 8) + '" y="' + (H - 2) + '" font-size="9" text-anchor="end" fill="#7B7064">' + esc(series[series.length - 1].date) + '</text>');
    } else out.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" font-size="12" text-anchor="middle" fill="#7B7064">No growth photos reviewed yet</text>');
    svg.innerHTML = out.join("");
  }

  function renderSun(list) {
    var slots = L.sunSlots(list);
    var wrap = $("slots"); wrap.innerHTML = "";
    var results = {};
    var labels = { "09:00": "9 am", "11:00": "11 am", "13:00": "1 pm", "15:00": "3 pm" };
    L.SLOTS.forEach(function (s) {
      var e = slots[s];
      var sun = e && e.feedback && e.feedback.sun;
      if (e) results[s] = sun ? { lit: sun.upper_fence_lit, hours: sun.estimated_summer_hours } : null;
      var b = el("button", "slot" + (sun ? (sun.upper_fence_lit ? " lit" : " shade") : ""));
      b.appendChild(el("b", "", labels[s]));
      if (e && e.thumb) { var im = el("img"); im.src = e.thumb; im.alt = "Sun audit " + labels[s]; b.appendChild(im); }
      else b.appendChild(el("div", "ph", "Tap to add the " + labels[s] + " photo"));
      b.appendChild(el("div", "r", sun ? (sun.upper_fence_lit ? "Upper fence lit" : "Upper fence shaded") + (typeof sun.estimated_summer_hours === "number" ? " · est. " + sun.estimated_summer_hours + " h summer" : "") : e ? (e.feedback ? "Reviewed, no sun read" : "Review pending") : "Not yet"));
      b.onclick = function () { if (e) openEntry(e); else openCheckin({ kind: "sun", slot: s, quest: L.BY_ID[L.SLOT_QUEST[s]] }); };
      wrap.appendChild(b);
    });
    var v = L.sunVerdict(results);
    var vc = $("sunVerdict");
    var txt = { pending: "No slots yet", go: "Go: plenty of sun", marginal: "Marginal: watch the afternoon", no: "Too shady here" }[v.verdict];
    vc.innerHTML = '<h2>Verdict</h2><div class="verdict ' + v.verdict + '">' + esc(txt) + '</div>'
      + '<p>' + (v.hours === null ? "Add the four slot photos for an estimate." : "Estimated <b>" + v.hours + " h</b> of summer sun on the upper fence against the " + v.target + " h target, from " + v.lit + " lit slot" + (v.lit === 1 ? "" : "s") + " of " + v.filled + (v.complete ? "." : " (incomplete audit).")) + '</p>'
      + '<div class="gauge"><i style="width:' + Math.min(100, (v.hours || 0) / 12 * 100) + '%"></i><em style="left:' + (v.target / 12 * 100) + '%"></em></div>'
      + '<p class="hint">Sun angle at midday: 35 degrees now (late November, 10.1 h daylight), 56 in March (12.1 h), 80 in June (14.4 h). Winter shade from low things mostly disappears by summer; shade from tall trees or the house does not.</p>';
  }

  function renderSettings(s) {
    if (document.activeElement && $("settings").contains(document.activeElement)) return;
    $("setName").value = s.vine_name || "";
    $("setBearing").value = s.bearing == null ? "" : s.bearing;
    $("setPlanted").value = s.planting_date || "";
    $("setNotify").checked = s.notifications !== false;
    $("storageNote").textContent = state.mode === "db" ? "Entries are stored on the server and mirrored to this phone. " + state.server.length + " server entries, " + state.local.length + " local only."
      : state.mode === "local" ? "No database configured. " + state.local.length + " entries live on this phone only." : "Showing cached entries (" + state.server.length + " server, " + state.local.length + " local).";
  }

  // ------------------------------------------------------------ plan
  function renderPlan() {
    var P = $("planBody");
    P.innerHTML = [
      '<div class="card plan"><h2>Goal</h2><p>A living passionfruit privacy wall, 10 to 12 ft wide centred on the bed, fence height, that also fruits and makes the hot tub corner feel tropical.</p>',
      '<h3>Site</h3><p>El Segundo, CA. White vinyl fence on a stucco wall, 7 to 8 ft total. A 4 x 2 x 1 ft galvanized oval raised bed on the lawn against the wall. String lights along the fence, hot tub to the right, utility lines above.</p>',
      '<h3>Variety</h3><p>One established Frederick passionfruit (Passiflora edulis Frederick) in a 5 gallon pot; purple passionfruit is the alternate. Self-fertile. Ideal 68 to 82 F. Wants 6+ hours of direct sun on the upper foliage in spring and summer; the base can be shaded.</p>',
      '<h3>Trellis</h3><p>Independent, not attached to the vinyl fence. Three anchored posts (metal or wood), 6 to 12 in clearance from the wall, galvanized or stainless wires every 12 to 16 in vertically, about fence height. Move the string lights off the growing area. Keep the vine away from the hot tub and the utility lines. Mature vines grow 15 to 20 ft a year and get heavy.</p>',
      '<h3>Bed</h3><p>4 x 2 x 1 ft is fine for one vine if open to the native soil underneath. Remove the grass inside, loosen native soil, drainage test (fill a hole with water, it should drain in a few hours), no plastic or landscape fabric below. Plant slightly above grade to avoid crown rot, mulch but keep a few inches clear of the stem.</p>',
      '<h3>Parts and fill</h3><table class="parts"><tr><td>Posts, 8 ft, metal or wood</td><td>3</td></tr><tr><td>Post anchors or concrete</td><td>3 anchors or 2 bags</td></tr><tr><td>Galvanized or stainless wire</td><td>about 60 ft</td></tr><tr><td>Turnbuckles and eye bolts</td><td>6</td></tr><tr><td>Organic raised bed soil</td><td>4 cu ft</td></tr><tr><td>Compost</td><td>2 cu ft</td></tr><tr><td>Pumice</td><td>1 cu ft</td></tr><tr><td>Mulch</td><td>1 cu ft</td></tr><tr><td>Organic fruit tree fertilizer</td><td>per package</td></tr><tr><td>Drip emitters</td><td>2</td></tr><tr><td>Frederick passionfruit, 5 gal</td><td>1</td></tr></table>',
      '<h3>Sun audit</h3><p>Before planting: photos at 9 am, 11 am, 1 pm and 3 pm, watching the top half of the fence, not the bed. Sun at midday: 35 degrees now (late Nov, 10.1 h daylight), 56 in March (12.1 h), 80 in June (14.4 h), 56 in September.</p>',
      '<h3>Timeline</h3><ul class="tl"><li><b>Nov 2026 to Feb 2027</b><span>Prep: sun audit, drainage, trellis, bed fill, drip.</span></li><li><b>Late Feb to Mar 2027</b><span>Plant one Frederick slightly above grade.</span></li><li><b>Apr to Jun 2027</b><span>Train one main stem up, then two laterals horizontally in opposite directions. Water regularly, start feeding.</span></li><li><b>Jul to Oct 2027</b><span>Heavy foliage, maybe first flowers and fruit.</span></li><li><b>Nov 2027 to Feb 2028</b><span>Winter rest: less water, prune late winter.</span></li><li><b>Summer to fall 2028</b><span>A full privacy wall and a real harvest.</span></li></ul>',
      '<h3>Care</h3><p>Water deeply 2 to 3 times a week in warm weather, much less in winter. Organic fruit tree fertilizer in spring and summer; excess nitrogen gives leaves, not fruit. Bees for pollination, hand pollinate if flowers do not set. Prune late winter or early spring, removing dead and tangled growth but keeping the main laterals. Harvest fruit when fully coloured, often when it drops.</p>',
      '<button id="icsBtn" class="btn primary wide">Reminders (.ics)</button><p class="hint">Sun audit tomorrow, trellis by Feb 1 2027, plant week Mar 1 2027, weekly photo on Sundays from Apr 2027, feed monthly Apr to Sep, prune Feb 2028.</p></div>'
    ].join("");
    $("icsBtn").onclick = function () {
      var blob = new Blob([L.icsText(TODAY)], { type: "text/calendar" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "passionfruit-wall.ics"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
  }

  // ------------------------------------------------------------ sheets
  function openSheet(title, body) { $("sheetTitle").textContent = title; var b = $("sheetBody"); b.innerHTML = ""; b.appendChild(body); $("sheet").hidden = false; $("sheet").scrollTop = 0; $("sheetClose").focus(); }
  function closeSheet() { $("sheet").hidden = true; }

  function openQuest(q) {
    var list = entries();
    var done = L.doneIds(list);
    var status = L.questStatus(q, done, TODAY);
    var body = el("div");
    body.appendChild(el("div", "hint", "Chapter " + q.chapter + " " + chapterOf(q.chapter).title + " · " + q.xp + " XP · " + status + (q.repeat ? " · repeats " + q.repeat : "")));
    body.appendChild(el("div", "why", q.why));
    body.appendChild(el("h3", "", "How"));
    var ol = el("ol"); q.how.forEach(function (h) { ol.appendChild(el("li", "", h)); }); body.appendChild(ol);
    if (q.tip) { body.appendChild(el("div", "tip", "Tip: " + q.tip)); }
    if (status === "locked") {
      var why = [];
      if (q.unlock.after && TODAY < q.unlock.after) why.push("opens " + fmtDay(q.unlock.after));
      (q.unlock.requires || []).forEach(function (r) { if (!done[r]) why.push("needs " + ((L.BY_ID[r] || {}).title || r)); });
      body.appendChild(el("p", "pending", "Locked: " + why.join(", ") + "."));
    } else {
      body.appendChild(el("h3", "", "Proof"));
      body.appendChild(proofControl(q, status));
    }
    openSheet(q.title, body);
  }
  function proofControl(q, status) {
    var box = el("div");
    var kind = q.proof;
    if (kind === "photo" || kind === "time") {
      var b = el("button", "btn purple wide", status === "done" && !q.repeat ? "Add another photo" : "Add photo proof");
      b.onclick = function () { openCheckin({ kind: kind === "time" ? "sun" : (q.id === "weekly_photo" || q.coverage || q.id === "day1_photo" || q.id === "scout_intro" || q.id === "winter_check" ? "growth" : "proof"), slot: q.slot, quest: q }); };
      box.appendChild(b);
      if (kind === "time") box.appendChild(el("p", "hint", "Best taken at " + q.slot.replace(":00", "") + ":00. The photo can be added any time; the slot is what matters."));
    } else if (kind === "number") {
      var f = el("label", "field"); f.appendChild(el("span", "", q.label || "Value")); var inp = el("input"); inp.type = "number"; inp.inputMode = "decimal"; inp.step = "any"; f.appendChild(inp); box.appendChild(f);
      var sb = el("button", "btn primary wide", status === "done" ? "Save again" : "Save and mark done");
      sb.onclick = function () { var v = Number(inp.value); if (!inp.value || !isFinite(v)) { toast("Enter a number first"); return; } completeQuest(q, { value: v, unit: q.unit }); };
      box.appendChild(sb);
      if (q.id === "bearing") box.appendChild(el("p", "hint", "135 to 225 degrees counts as south facing."));
    } else if (kind === "checklist") {
      var cl = el("div", "checklist");
      var draft = state.drafts[q.id] || [];
      var boxes = [];
      q.items.forEach(function (it, i) {
        var lab = el("label"); var cb = el("input"); cb.type = "checkbox"; cb.checked = status === "done" || draft.indexOf(i) >= 0;
        cb.onchange = function () { state.drafts[q.id] = boxes.map(function (c, k) { return c.checked ? k : -1; }).filter(function (k) { return k >= 0; }); saveDrafts(); mb.disabled = !boxes.every(function (c) { return c.checked; }); };
        lab.appendChild(cb); lab.appendChild(el("span", "", it)); cl.appendChild(lab); boxes.push(cb);
      });
      box.appendChild(cl);
      var mb = el("button", "btn primary wide", status === "done" ? "Done" : "Mark done");
      mb.disabled = status === "done" || !boxes.every(function (c) { return c.checked; });
      mb.onclick = function () { completeQuest(q, { items: q.items }); };
      box.appendChild(mb);
    } else {
      if (q.id === "name_vine") { var nb = el("button", "btn wide", "Open settings"); nb.onclick = function () { closeSheet(); showScreen("settings"); }; box.appendChild(nb); }
      var db = el("button", "btn primary wide", status === "done" && !q.repeat ? "Done" : q.id === "water_streak" ? "Log a watering" : "Mark done");
      db.disabled = status === "done" && !q.repeat;
      db.onclick = function () { if (q.id === "water_streak") logWater(); else completeQuest(q, null); };
      box.appendChild(db);
    }
    return box;
  }
  async function completeQuest(q, value) {
    var body = { action: "quest", quest_id: q.id, chapter: q.chapter, date: TODAY, xp: q.xp, value: value, note: "" };
    var res = await post(body);
    if (!res) return;
    absorb(res);
    delete state.drafts[q.id]; saveDrafts();
    closeSheet(); render(); toast("+" + q.xp + " XP: " + q.title);
  }
  async function logWater() {
    var body = { action: "quest", kind: "water", quest_id: "water_streak", chapter: 3, date: TODAY, xp: 5 };
    var res = await post(body);
    if (!res) return;
    absorb(res); render(); toast("Watering logged (+5 XP)");
  }
  // Posts and handles the no-database case by minting a local entry.
  async function post(body) {
    try {
      var j = await api("POST", body);
      if (j.ok) { if (!j.stored && j.reason === "no_db") state.mode = "local"; return j; }
      if (j.reason === "unauthed") { state.mode = "unauthed"; renderMode(); toast("Signed out: enter the passcode again"); return null; }
      toast("Could not save: " + (j.reason || j.httpStatus)); return null;
    } catch (e) {
      // offline: keep a local copy so nothing is lost
      var entry = { id: "local-" + Date.now().toString(36), created_at: new Date().toISOString(), kind: body.kind || (body.action === "quest" ? "quest" : body.action === "settings" ? "settings" : "growth"), date: body.date, chapter: body.chapter || 0, quest_id: body.quest_id || null, note: body.note || "", thumb: body.thumb || null, feedback: null, xp: body.xp || 0, meta: body.action === "settings" ? body.settings : { value: body.value, slot: body.slot } };
      state.mode = "offline"; renderMode(); toast("Offline: saved on this phone only");
      return { ok: true, stored: false, entry: entry };
    }
  }

  function openEntry(e) {
    var body = el("div");
    if (e.thumb) { var im = el("img"); im.src = e.thumb; im.alt = ""; im.style.borderRadius = "12px"; im.style.width = "100%"; body.appendChild(im); }
    body.appendChild(el("p", "hint", fmtDay(L.entryDay(e)) + " · " + e.kind + (e.quest_id && L.BY_ID[e.quest_id] ? " · " + L.BY_ID[e.quest_id].title : "") + (e.meta && e.meta.slot ? " · slot " + e.meta.slot : "")));
    if (e.note) body.appendChild(el("p", "", e.note));
    if (e.meta && e.meta.value != null && typeof e.meta.value !== "object") body.appendChild(el("p", "", "Value: " + e.meta.value + (e.meta.unit ? " " + e.meta.unit : "")));
    body.appendChild(reviewBlock(e));
    if (!e.seed) {
      var del = el("button", "linkbtn", "Delete entry");
      del.onclick = async function () {
        if (!confirm("Delete this entry?")) return;
        if (/^\d+$/.test(String(e.id))) { var j = await api("DELETE", { id: e.id }); if (!j.ok) { toast("Could not delete"); return; } state.server = state.server.filter(function (x) { return String(x.id) !== String(e.id); }); save(KEY_CACHE, state.server); }
        else { state.local = state.local.filter(function (x) { return String(x.id) !== String(e.id); }); save(KEY_LOCAL, state.local); }
        closeSheet(); render(); toast("Deleted");
      };
      body.appendChild(del);
    }
    openSheet(e.kind === "sun" ? "Sun audit" : e.kind === "growth" ? "Growth photo" : e.kind === "problem" ? "Problem report" : e.kind === "proof" ? "Quest proof" : "Entry", body);
  }
  function reviewBlock(e) {
    var r = el("div", "review");
    var fb = e.feedback;
    if (!fb) {
      if (e.kind === "quest" || e.kind === "water" || e.kind === "settings") return r;
      var reason = e.meta && e.meta.review_reason;
      r.appendChild(el("div", "pending", reason === "no_key" ? "Claude review pending: add ANTHROPIC_API_KEY in Vercel." : reason ? "Claude review failed (" + reason + (e.meta.review_message ? ": " + e.meta.review_message : "") + ")." : "Claude review pending."));
      var rb = el("button", "btn wide", "Retry review");
      rb.onclick = async function () {
        rb.disabled = true; rb.innerHTML = '<span class="spin"></span>Reviewing';
        var j = await api("POST", { action: "review", id: e.id, entry: /^\d+$/.test(String(e.id)) ? undefined : e, history: L.historyLines(entries(), 6) });
        if (j.ok && j.review && j.review.ok) { e.feedback = j.entry.feedback; e.meta = e.meta || {}; delete e.meta.review_reason; if (/^\d+$/.test(String(e.id))) addServer(e); else addLocal(e); closeSheet(); render(); openEntry(e); toast("Reviewed: +" + (e.feedback.xp_bonus || 0) + " bonus XP"); }
        else { e.meta = e.meta || {}; e.meta.review_reason = (j.review && j.review.reason) || j.reason || "error"; e.meta.review_message = j.review && j.review.message; if (/^\d+$/.test(String(e.id))) addServer(e); else addLocal(e); closeSheet(); openEntry(e); }
      };
      r.appendChild(rb);
      return r;
    }
    r.appendChild(el("div", "hl", fb.headline));
    var sc = el("div", "scores");
    if (typeof fb.health === "number") sc.appendChild(chipScore("Health", fb.health + "/10"));
    if (typeof fb.coverage_pct === "number") sc.appendChild(chipScore("Coverage", fb.coverage_pct + "%"));
    if (fb.stage) sc.appendChild(chipScore("Stage", fb.stage));
    if (fb.sun) sc.appendChild(chipScore("Upper fence", fb.sun.upper_fence_lit ? "lit" : "shaded"));
    if (fb.sun && typeof fb.sun.estimated_summer_hours === "number") sc.appendChild(chipScore("Summer est.", fb.sun.estimated_summer_hours + " h"));
    if (fb.xp_bonus) sc.appendChild(chipScore("Bonus", "+" + fb.xp_bonus + " XP"));
    sc.appendChild(chipScore("Confidence", fb.confidence));
    r.appendChild(sc);
    if (fb.observations && fb.observations.length) { r.appendChild(el("h3", "", "Observations")); var ul = el("ul"); fb.observations.forEach(function (o) { ul.appendChild(el("li", "", o)); }); r.appendChild(ul); }
    if (fb.concerns && fb.concerns.length) { r.appendChild(el("h3", "", "Concerns")); fb.concerns.forEach(function (c) { var d = el("div", "concern " + c.severity); d.appendChild(el("b", "", c.issue + " (" + c.severity + ")")); d.appendChild(el("div", "", c.fix)); r.appendChild(d); }); }
    if (fb.next_actions && fb.next_actions.length) { r.appendChild(el("h3", "", "Next")); var ol = el("ol"); fb.next_actions.forEach(function (o) { ol.appendChild(el("li", "", o)); }); r.appendChild(ol); }
    if (fb.praise) r.appendChild(el("p", "praise", fb.praise));
    return r;
  }
  function chipScore(k, v) { var s = el("span", "score"); s.appendChild(document.createTextNode(k + " ")); s.appendChild(el("b", "", String(v))); return s; }

  // ------------------------------------------------------------ check-in
  function openCheckin(pre) {
    pre = pre || {};
    var list = entries();
    var sum = L.summary(list, TODAY);
    var kind = pre.kind || "growth";
    var slot = pre.slot || "09:00";
    var quest = pre.quest || null;
    var file = null;
    var body = el("div");
    var pick = el("div", "pick");
    var kinds = [["growth", "Growth photo"], ["sun", "Sun audit"], ["proof", "Quest proof"], ["problem", "Problem report"]];
    var kbtns = {};
    kinds.forEach(function (k) { var b = el("button", "", k[1]); b.type = "button"; b.onclick = function () { kind = k[0]; syncKind(); }; pick.appendChild(b); kbtns[k[0]] = b; });
    body.appendChild(pick);
    var slotF = el("label", "field"); slotF.appendChild(el("span", "", "Time slot")); var slotS = el("select");
    L.SLOTS.forEach(function (s) { var o = el("option", "", { "09:00": "9 am", "11:00": "11 am", "13:00": "1 pm", "15:00": "3 pm" }[s]); o.value = s; slotS.appendChild(o); });
    slotS.value = slot; slotS.onchange = function () { slot = slotS.value; quest = L.BY_ID[L.SLOT_QUEST[slot]]; }; slotF.appendChild(slotS); body.appendChild(slotF);
    var questF = el("label", "field"); questF.appendChild(el("span", "", "Quest (optional)")); var questS = el("select");
    var none = el("option", "", "No quest"); none.value = ""; questS.appendChild(none);
    L.questList(list, TODAY).forEach(function (x) { if (x.status === "locked" || (x.quest.proof !== "photo" && x.quest.proof !== "time")) return; var o = el("option", "", x.quest.title + " (" + x.quest.xp + " XP)"); o.value = x.quest.id; questS.appendChild(o); });
    questS.value = quest ? quest.id : ""; questS.onchange = function () { quest = L.BY_ID[questS.value] || null; }; questF.appendChild(questS); body.appendChild(questF);
    var drop = el("label", "photo-drop");
    var inp = el("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment"); inp.id = "photoInput";
    var dropTxt = el("span", "", "Tap to take or choose a photo");
    drop.appendChild(inp); drop.appendChild(dropTxt); body.appendChild(drop);
    inp.onchange = function () { file = inp.files && inp.files[0]; if (!file) return; var url = URL.createObjectURL(file); drop.innerHTML = ""; var im = el("img"); im.src = url; im.alt = "Selected photo"; drop.appendChild(inp); drop.appendChild(im); };
    var noteF = el("label", "field"); noteF.appendChild(el("span", "", "Note")); var ta = document.createElement("textarea"); ta.maxLength = 1000; ta.placeholder = "What you did, what you noticed"; noteF.appendChild(ta); body.appendChild(noteF);
    var status = el("div"); body.appendChild(status);
    var go = el("button", "btn purple wide", "Send to Claude");
    body.appendChild(go);
    function syncKind() {
      Object.keys(kbtns).forEach(function (k) { kbtns[k].className = k === kind ? "on" : ""; });
      slotF.hidden = kind !== "sun";
      if (kind === "sun" && (!quest || !quest.slot)) { quest = L.BY_ID[L.SLOT_QUEST[slot]]; questS.value = quest.id; }
      if (kind === "growth" && !quest && sum.settings.planting_date) { quest = L.BY_ID.weekly_photo; questS.value = L.questStatus(quest, L.doneIds(list), TODAY) === "locked" ? "" : "weekly_photo"; if (!questS.value) quest = null; }
    }
    syncKind();
    go.onclick = async function () {
      if (!file) { toast("Add a photo first"); return; }
      go.disabled = true; go.innerHTML = '<span class="spin"></span>Resizing';
      try {
        var full = await resize(file, 1280, 0.7, 1024 * 1024);
        var thumb = await resize(file, 320, 0.7, 60 * 1024);
        go.innerHTML = '<span class="spin"></span>Claude is looking';
        var xp = quest ? (quest.repeat || L.questStatus(quest, L.doneIds(list), TODAY) !== "done" ? quest.xp : 5) : 10;
        var bodyReq = { action: "checkin", kind: kind, image: full, thumb: thumb, note: ta.value, quest_id: quest ? quest.id : null, questTitle: quest ? quest.title : null, chapter: quest ? quest.chapter : sum.chapter.id, chapterTitle: sum.chapter.title, date: TODAY, slot: kind === "sun" ? slot : null, xp: xp, vineName: sum.settings.vine_name || null, history: L.historyLines(list, 6) };
        var j = await post(bodyReq);
        if (!j) { go.disabled = false; go.textContent = "Send to Claude"; return; }
        var e = j.entry;
        if (!e.feedback) { e.meta = e.meta || {}; e.meta.review_reason = (j.review && j.review.reason) || "pending"; e.meta.review_message = j.review && j.review.message; }
        absorb(j);
        render();
        closeSheet();
        openEntry(e);
        toast(e.feedback ? "Saved and reviewed" : "Saved. Review pending.");
      } catch (err) {
        go.disabled = false; go.textContent = "Send to Claude"; status.innerHTML = ""; status.appendChild(el("div", "pending", "Could not process the photo: " + (err && err.message || err)));
      }
    };
    openSheet("New check-in", body);
  }
  // Resize an image file to a JPEG data URL no wider than max px and (roughly) under bytes.
  function resize(file, max, quality, bytes) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
          var c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          var q = quality, out = c.toDataURL("image/jpeg", q);
          while (out.length * 0.75 > bytes && q > 0.3) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
          while (out.length * 0.75 > bytes && w > 200) { w = Math.round(w * 0.8); h = Math.round(h * 0.8); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); out = c.toDataURL("image/jpeg", q); }
          URL.revokeObjectURL(url); resolve(out);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("not an image")); };
      img.src = url;
    });
  }

  // ------------------------------------------------------------ settings
  async function saveSettings() {
    var s = { vine_name: $("setName").value.trim(), bearing: $("setBearing").value === "" ? null : Number($("setBearing").value), planting_date: $("setPlanted").value || null, notifications: $("setNotify").checked };
    var res = await post({ action: "settings", settings: s, date: TODAY });
    if (!res) return;
    absorb(res);
    $("settingsNote").textContent = "Saved.";
    document.activeElement && document.activeElement.blur();
    render(); toast("Settings saved");
  }

  // ------------------------------------------------------------ screens and wiring
  function showScreen(name) {
    state.screen = name;
    ["home", "quests", "journal", "sun", "plan", "settings"].forEach(function (s) { $(s).hidden = s !== name; });
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.screen === name); });
    $("newBtn").hidden = name === "settings" || name === "plan";
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { showScreen(t.dataset.screen); }; });
  $("gearBtn").onclick = function () { showScreen("settings"); };
  $("newBtn").onclick = function () { openCheckin({}); };
  $("sheetClose").onclick = closeSheet;
  $("sheet").addEventListener("click", function (ev) { if (ev.target === $("sheet")) closeSheet(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("sheet").hidden) closeSheet(); });
  $("saveSettings").onclick = saveSettings;
  $("resetCache").onclick = function () {
    if (!confirm("Clear the cached journal on this phone? Server entries reload on the next sync; local-only entries are lost.")) return;
    try { localStorage.removeItem(KEY_CACHE); localStorage.removeItem(KEY_LOCAL); localStorage.removeItem(KEY_DRAFT); } catch (e) { /* ignore */ }
    state.server = []; state.local = []; state.drafts = {}; render(); sync(); toast("Cache cleared");
  };
  $("cmpRange").oninput = function () { var v = $("cmpRange").value; $("cmpAfterWrap").style.width = v + "%"; $("cmpLine").style.left = v + "%"; };
  // Keep the after image aligned with the before image regardless of the clip width.
  function sizeCompare() { var w = $("compare").clientWidth; $("cmpAfter").style.width = w + "px"; $("cmpAfter").style.maxWidth = "none"; }
  window.addEventListener("resize", sizeCompare);
  var ro = window.ResizeObserver ? new ResizeObserver(sizeCompare) : null; if (ro) ro.observe($("compare"));

  state.server = load(KEY_CACHE); state.local = load(KEY_LOCAL); state.drafts = loadDrafts();
  renderPlan();
  render();
  sizeCompare();
  var initial = params.get("screen");
  if (initial && $(initial)) showScreen(initial);
  sync();
  window.VineApp = { render: render, entries: entries, openCheckin: openCheckin, openQuest: openQuest, showScreen: showScreen, TODAY: TODAY };
})();
