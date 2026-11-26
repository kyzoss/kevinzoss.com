// Passionfruit Wall pure logic. No DOM, no clock reads: every function takes the
// entry list (plain JSON rows) and "today" as arguments, so the whole game state
// is the entries plus settings and everything else is derived.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.VineQuests);
  else root.VineLogic = factory(root.VineQuests);
})(typeof self !== "undefined" ? self : this, function (preloaded) {
  "use strict";
  var Q = preloaded || (typeof require === "function" ? require("./quests.js") : null);
  var QUESTS = Q.QUESTS, CHAPTERS = Q.CHAPTERS, LEVELS = Q.LEVELS, BADGES = Q.BADGES;
  var BY_ID = {};
  QUESTS.forEach(function (x) { BY_ID[x.id] = x; });

  var SUN_TARGET_H = 6;
  var SLOTS = ["09:00", "11:00", "13:00", "15:00"];
  var SLOT_QUEST = { "09:00": "sun_9", "11:00": "sun_11", "13:00": "sun_1", "15:00": "sun_3" };

  // Built-in Day 0 entries. Shown even when the server has nothing yet; never written to the DB.
  var SEED_ENTRIES = [
    { id: "seed-1", seed: true, created_at: "2026-11-25T23:42:00.000Z", kind: "growth", date: "2026-11-25", chapter: 0, quest_id: "scout_intro", note: "Day 0. The wall from the lawn at 3:42 pm: white vinyl on stucco, string lights, hot tub to the right, utility lines above.", thumb: "seed/yard-wide.jpg", xp: 0, meta: { seed: true },
      feedback: { headline: "A blank wall with real potential", health: null, coverage_pct: 0, stage: "Site, nothing planted", observations: ["Low late November sun is already over the roof line at 3:42 pm, lighting the upper fence.", "String lights cross the exact growing area and will need to move.", "Hot tub sits close to the right end of the target span.", "Utility lines run above the fence: the vine must stop below them."], concerns: [{ issue: "String lights in the growing area", severity: "low", fix: "Re-route them above or beside the span before the posts go in." }], next_actions: ["Run the four slot sun audit on the upper fence.", "Confirm the wall bearing with the phone compass.", "Do the drainage test inside the bed footprint."], praise: "Good spot: open lawn access, a solid wall behind and room for an independent trellis.", sun: null, xp_bonus: 0, confidence: "med" } },
    { id: "seed-2", seed: true, created_at: "2026-11-25T23:43:00.000Z", kind: "growth", date: "2026-11-25", chapter: 0, quest_id: "measure_bed", note: "Day 0. The 4 x 2 x 1 ft galvanized oval bed on the lawn against the wall.", thumb: "seed/bed-closeup.jpg", xp: 0, meta: { seed: true },
      feedback: { headline: "Bed is placed, empty and open to the soil", health: null, coverage_pct: 0, stage: "Empty bed", observations: ["Oval galvanized bed sits directly on turf with no liner visible.", "The bed is centred under a fence panel with a post to the right: a natural centre for the trellis.", "Grass inside the bed needs removing before fill."], concerns: [], next_actions: ["Remove the turf inside the oval and loosen the native soil.", "Drainage test before buying fill."], praise: "Right size for one vine as long as the bottom stays open.", sun: null, xp_bonus: 0, confidence: "med" } }
  ];

  // ------------------------------------------------------------ dates
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(d) {
    if (typeof d === "string") return d.slice(0, 10);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function parseDay(key) { var p = key.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function addDays(key, n) { var d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
  function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  // ISO-ish week key: the Monday that starts the week containing key.
  function weekStart(key) { var d = parseDay(key); var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return dayKey(d); }
  function entryDay(e) { return e.date ? String(e.date).slice(0, 10) : (e.created_at ? String(e.created_at).slice(0, 10) : ""); }

  // ------------------------------------------------------------ entries
  function isReal(e) { return e && !e.seed && e.kind !== "settings"; }
  function settingsOf(entries) {
    var s = {};
    entries.slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); })
      .forEach(function (e) { if (e.kind === "settings" && e.meta) for (var k in e.meta) s[k] = e.meta[k]; });
    return s;
  }
  function sortNewest(entries) {
    return entries.slice().sort(function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")); });
  }
  function withSeed(entries) {
    var real = entries.filter(function (e) { return !e.seed; });
    return sortNewest(real.concat(SEED_ENTRIES));
  }
  // Merge a server list with a local list by id, server wins. Local-only rows (ids starting "local-") are kept.
  function mergeEntries(server, local) {
    var byId = {};
    (local || []).forEach(function (e) { if (e && e.id != null) byId[String(e.id)] = e; });
    (server || []).forEach(function (e) { if (e && e.id != null) byId[String(e.id)] = e; });
    return sortNewest(Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (e) { return !e.seed; }));
  }
  // Flatten a Supabase row {id, created_at, entry} into a flat entry.
  function flattenRow(row) {
    if (!row) return null;
    if (row.entry && typeof row.entry === "object") {
      var e = {}; for (var k in row.entry) e[k] = row.entry[k];
      e.id = row.id; e.created_at = row.created_at || e.created_at; return e;
    }
    return row;
  }

  // ------------------------------------------------------------ quests
  function doneIds(entries) {
    var done = {};
    entries.forEach(function (e) {
      if (!isReal(e) || !e.quest_id || !BY_ID[e.quest_id]) return;
      var qd = BY_ID[e.quest_id];
      if (qd.coverage) {
        var pct = e.feedback && typeof e.feedback.coverage_pct === "number" ? e.feedback.coverage_pct : null;
        if (pct !== null && pct >= qd.coverage) done[e.quest_id] = true;
        return;
      }
      if (e.kind === "quest" || e.kind === "growth" || e.kind === "sun" || e.kind === "proof") done[e.quest_id] = true;
    });
    return done;
  }
  function unlocked(quest, done, today) {
    var u = quest.unlock || {};
    if (u.after && today < u.after) return false;
    if (u.requires) for (var i = 0; i < u.requires.length; i++) if (!done[u.requires[i]]) return false;
    return true;
  }
  function questStatus(quest, done, today) {
    if (done[quest.id] && !quest.repeat) return "done";
    if (!unlocked(quest, done, today)) return "locked";
    return "available";
  }
  function questList(entries, today) {
    var done = doneIds(entries);
    return QUESTS.map(function (qd) {
      var st = questStatus(qd, done, today);
      return { quest: qd, status: st, count: countFor(entries, qd.id) };
    });
  }
  function countFor(entries, id) { return entries.filter(function (e) { return isReal(e) && e.quest_id === id && e.kind !== "water"; }).length; }
  function chapterProgress(entries, today) {
    var list = questList(entries, today);
    return CHAPTERS.map(function (c) {
      var qs = list.filter(function (x) { return x.quest.chapter === c.id; });
      var done = qs.filter(function (x) { return x.status === "done" || (x.quest.repeat && x.count > 0); }).length;
      return { chapter: c, total: qs.length, done: done, open: today >= c.from && today <= c.to };
    });
  }
  function currentChapter(entries, today) {
    var prog = chapterProgress(entries, today);
    var open = prog.filter(function (p) { return p.open && p.done < p.total; });
    if (open.length) return open[0].chapter;
    var unfinished = prog.filter(function (p) { return p.done < p.total; });
    if (unfinished.length) return unfinished[0].chapter;
    return CHAPTERS[CHAPTERS.length - 1];
  }
  function nextQuests(entries, today, n) {
    var list = questList(entries, today).filter(function (x) { return x.status === "available"; });
    // repeating quests already logged this week drop to the back
    var wk = weekStart(today);
    list.sort(function (a, b) {
      var ra = a.quest.repeat && lastDay(entries, a.quest.id) >= wk ? 1 : 0;
      var rb = b.quest.repeat && lastDay(entries, b.quest.id) >= wk ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return a.quest.chapter - b.quest.chapter;
    });
    return list.slice(0, n || 3).map(function (x) { return x.quest; });
  }
  function lastDay(entries, id) {
    var best = "";
    entries.forEach(function (e) { if (isReal(e) && e.quest_id === id) { var d = entryDay(e); if (d > best) best = d; } });
    return best;
  }

  // ------------------------------------------------------------ xp and levels
  function entryXp(e) {
    if (!isReal(e)) return 0;
    var x = Number(e.xp) || 0;
    if (e.feedback && typeof e.feedback.xp_bonus === "number") x += Math.max(0, Math.min(30, e.feedback.xp_bonus));
    return x;
  }
  function totalXp(entries) {
    var sum = 0;
    entries.forEach(function (e) { sum += entryXp(e); });
    return sum;
  }
  function xpForQuest(id) { var qd = BY_ID[id]; return qd ? qd.xp : 0; }
  function levelOf(xp) {
    var i = 0;
    for (var k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k;
    var cur = LEVELS[i], nxt = LEVELS[i + 1] || null;
    var progress = nxt ? (xp - cur.xp) / (nxt.xp - cur.xp) : 1;
    return { index: i, name: cur.name, xp: xp, next: nxt, toNext: nxt ? nxt.xp - xp : 0, progress: Math.max(0, Math.min(1, progress)) };
  }

  // ------------------------------------------------------------ streaks
  function daySet(entries, pred) {
    var s = {};
    entries.forEach(function (e) { if (isReal(e) && pred(e)) s[entryDay(e)] = true; });
    return s;
  }
  function isGrowth(e) { return e.kind === "growth"; }
  function isWater(e) { return e.kind === "water"; }
  // Consecutive weeks (ending this week or last week) with at least one growth photo.
  function weeklyStreak(entries, today) {
    var weeks = {};
    Object.keys(daySet(entries, isGrowth)).forEach(function (d) { weeks[weekStart(d)] = true; });
    var w = weekStart(today);
    if (!weeks[w]) w = addDays(w, -7);
    var n = 0;
    while (weeks[w]) { n++; w = addDays(w, -7); }
    return n;
  }
  // Consecutive days (ending today or yesterday) with a watering check-in.
  function waterStreak(entries, today) {
    var days = daySet(entries, isWater);
    var d = today;
    if (!days[d]) d = addDays(d, -1);
    var n = 0;
    while (days[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  // Check-in streak counts any real entry, consecutive days.
  function checkinStreak(entries, today) {
    var days = daySet(entries, function () { return true; });
    var d = today;
    if (!days[d]) d = addDays(d, -1);
    var n = 0;
    while (days[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  function heatStrip(entries, today, days) {
    days = days || 84;
    var counts = {};
    entries.forEach(function (e) { if (isReal(e)) { var d = entryDay(e); counts[d] = (counts[d] || 0) + 1; } });
    var out = [];
    for (var i = days - 1; i >= 0; i--) { var d = addDays(today, -i); out.push({ date: d, count: counts[d] || 0 }); }
    return out;
  }
  function weeklyPhotoDue(entries, today) {
    var planted = settingsOf(entries).planting_date;
    if (!planted || today < "2027-04-01") return false;
    var wk = weekStart(today);
    var has = Object.keys(daySet(entries, isGrowth)).some(function (d) { return weekStart(d) === wk; });
    return !has;
  }

  // ------------------------------------------------------------ coverage and sun
  function coverageSeries(entries) {
    var pts = [];
    entries.forEach(function (e) {
      if (!e || e.kind !== "growth" || !e.feedback) return;
      var pct = e.feedback.coverage_pct;
      if (typeof pct !== "number") return;
      pts.push({ date: entryDay(e), pct: Math.max(0, Math.min(100, pct)), health: typeof e.feedback.health === "number" ? e.feedback.health : null });
    });
    pts.sort(function (a, b) { return a.date.localeCompare(b.date); });
    return pts;
  }
  function latestCoverage(entries) { var s = coverageSeries(entries.filter(isReal)); return s.length ? s[s.length - 1].pct : null; }
  function sunSlots(entries) {
    var slots = {};
    SLOTS.forEach(function (s) { slots[s] = null; });
    sortNewest(entries).forEach(function (e) {
      if (!isReal(e) || e.kind !== "sun") return;
      var slot = (e.meta && e.meta.slot) || null;
      if (!slot && e.quest_id) for (var s in SLOT_QUEST) if (SLOT_QUEST[s] === e.quest_id) slot = s;
      if (slot && slots[slot] === null) slots[slot] = e;
    });
    return slots;
  }
  // Verdict from four slot results: each {lit: bool, hours: number|null} or null.
  // Each lit slot stands for about 2 h of the 9 to 5 band; Claude's own estimate
  // (if given) is averaged in. Summer multiplier: the sun is 80 degrees in June
  // against 35 now, so winter shade from low things mostly disappears.
  function sunVerdict(results) {
    var lit = 0, filled = 0, est = [], out = {};
    SLOTS.forEach(function (s) {
      var r = results && results[s];
      if (!r) return;
      filled++;
      if (r.lit) lit++;
      if (typeof r.hours === "number") est.push(r.hours);
    });
    var fromSlots = lit * 2 + (lit >= 3 ? 1 : 0);
    var hours = fromSlots;
    if (est.length) { var mean = est.reduce(function (a, b) { return a + b; }, 0) / est.length; hours = (fromSlots + mean) / 2; }
    hours = Math.round(hours * 10) / 10;
    out.filled = filled; out.lit = lit; out.hours = filled ? hours : null; out.target = SUN_TARGET_H;
    out.complete = filled === SLOTS.length;
    if (!filled) out.verdict = "pending";
    else if (hours >= SUN_TARGET_H) out.verdict = "go";
    else if (hours >= 4) out.verdict = "marginal";
    else out.verdict = "no";
    return out;
  }

  // ------------------------------------------------------------ badges
  function badgesEarned(entries, today) {
    var done = doneIds(entries);
    var got = {};
    var sun = sunSlots(entries);
    if (SLOTS.every(function (s) { return sun[s]; })) got.sun_detective = true;
    if (done.posts_set) got.three_posts = true;
    if (done.wires_strung) got.wired = true;
    if (done.bed_filled) got.bed_ready = true;
    if (done.day1_photo) got.day_one = true;
    if (settingsOf(entries).vine_name) got.named = true;
    if (weeklyStreak(entries, today) >= 10) got.ten_weeks = true;
    if (waterStreak(entries, today) >= 7) got.water_week = true;
    if (done.first_flower) got.first_flower = true;
    if (done.pollinator_watch || done.hand_pollinate) got.pollinator = true;
    if (done.first_fruit) got.first_fruit = true;
    var cov = 0;
    coverageSeries(entries.filter(isReal)).forEach(function (p) { if (p.pct > cov) cov = p.pct; });
    if (cov >= 50) got.half_wall = true;
    if (cov >= 90) got.full_wall = true;
    if (levelOf(totalXp(entries)).name === "Wall Master") got.wall_master = true;
    return BADGES.filter(function (b) { return got[b.id]; }).map(function (b) { return b.id; });
  }

  // ------------------------------------------------------------ summary and json
  function summary(entries, today) {
    var xp = totalXp(entries);
    return {
      xp: xp, level: levelOf(xp), chapter: currentChapter(entries, today),
      badges: badgesEarned(entries, today), weekly: weeklyStreak(entries, today), water: waterStreak(entries, today), checkin: checkinStreak(entries, today),
      coverage: latestCoverage(entries), next: nextQuests(entries, today, 3), photoDue: weeklyPhotoDue(entries, today), settings: settingsOf(entries)
    };
  }
  function serialize(entries) { return JSON.stringify(entries.filter(function (e) { return !e.seed; })); }
  function parse(text) {
    try { var v = JSON.parse(text); return Array.isArray(v) ? v.filter(function (e) { return e && typeof e === "object"; }) : []; } catch (e) { return []; }
  }
  // Short history lines for the model (no images).
  function historyLines(entries, n) {
    return sortNewest(entries.filter(isReal)).slice(0, n || 6).map(function (e) {
      var fb = e.feedback || {};
      return entryDay(e) + " " + e.kind + (e.quest_id ? " (" + e.quest_id + ")" : "") + ": " + (fb.headline || e.note || "").slice(0, 140)
        + (typeof fb.coverage_pct === "number" ? " cov " + fb.coverage_pct + "%" : "") + (typeof fb.health === "number" ? " health " + fb.health : "");
    });
  }

  // ------------------------------------------------------------ reminders (.ics)
  function icsEvents(today) {
    var ev = [
      { d: addDays(today, 1), t: "Passionfruit: sun audit (9, 11, 1, 3)", desc: "Photograph the top half of the fence at each slot." },
      { d: "2027-02-01", t: "Passionfruit: trellis done", desc: "Three posts, wires, lights moved, drip placed." },
      { d: "2027-03-01", t: "Passionfruit: plant week", desc: "One Frederick in a 5 gallon pot. Plant slightly above grade." },
      { d: "2027-04-04", t: "Passionfruit: weekly photo", desc: "Same spot every Sunday.", rrule: "FREQ=WEEKLY;BYDAY=SU;UNTIL=20281029T000000Z" },
      { d: "2027-04-15", t: "Passionfruit: monthly feed", desc: "Organic fruit tree fertilizer, April to September.", rrule: "FREQ=MONTHLY;BYMONTH=4,5,6,7,8,9;UNTIL=20280930T000000Z" },
      { d: "2028-02-15", t: "Passionfruit: prune", desc: "Remove dead and tangled growth, keep the two laterals." }
    ];
    return ev;
  }
  function icsText(today) {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//kevinzoss//passionfruit-wall//EN", "CALSCALE:GREGORIAN"];
    icsEvents(today).forEach(function (e, i) {
      var d = e.d.replace(/-/g, "");
      lines.push("BEGIN:VEVENT", "UID:vine-" + i + "-" + d + "@kevinzoss", "DTSTAMP:" + today.replace(/-/g, "") + "T000000Z", "DTSTART;VALUE=DATE:" + d, "SUMMARY:" + e.t, "DESCRIPTION:" + e.desc);
      if (e.rrule) lines.push("RRULE:" + e.rrule);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  // ------------------------------------------------------------ vine motif (procedural, pure)
  // Returns a list of SVG path/circle specs for the hero as a function of progress 0..1.
  function vineMotif(progress, width) {
    width = width || 400;
    var p = Math.max(0, Math.min(1, progress));
    var segs = 2 + Math.floor(p * 10);
    var items = [];
    var x = 0, y = 34, dir = 1;
    var d = "M0 " + y;
    for (var i = 0; i < segs; i++) {
      var nx = x + width / 12, ny = y + dir * 10;
      d += " Q" + (x + width / 24) + " " + (y + dir * 18) + " " + nx + " " + ny;
      items.push({ type: "leaf", x: nx, y: ny, r: 7 + (i % 3), rot: dir * 40 + i * 13 });
      if (p > 0.45 && i % 3 === 1) items.push({ type: "flower", x: nx + 6, y: ny - dir * 12, r: 6 });
      if (p > 0.75 && i % 4 === 2) items.push({ type: "fruit", x: nx - 8, y: ny + dir * 14, r: 6 });
      x = nx; y = ny; dir = -dir;
    }
    items.unshift({ type: "stem", d: d });
    return items;
  }

  return {
    QUESTS: QUESTS, CHAPTERS: CHAPTERS, LEVELS: LEVELS, BADGES: BADGES, BY_ID: BY_ID, SEED_ENTRIES: SEED_ENTRIES, SLOTS: SLOTS, SLOT_QUEST: SLOT_QUEST, SUN_TARGET_H: SUN_TARGET_H,
    dayKey: dayKey, addDays: addDays, daysBetween: daysBetween, weekStart: weekStart, entryDay: entryDay,
    settingsOf: settingsOf, sortNewest: sortNewest, withSeed: withSeed, mergeEntries: mergeEntries, flattenRow: flattenRow, isReal: isReal,
    doneIds: doneIds, unlocked: unlocked, questStatus: questStatus, questList: questList, chapterProgress: chapterProgress, currentChapter: currentChapter, nextQuests: nextQuests, countFor: countFor,
    entryXp: entryXp, totalXp: totalXp, xpForQuest: xpForQuest, levelOf: levelOf,
    weeklyStreak: weeklyStreak, waterStreak: waterStreak, checkinStreak: checkinStreak, heatStrip: heatStrip, weeklyPhotoDue: weeklyPhotoDue,
    coverageSeries: coverageSeries, latestCoverage: latestCoverage, sunSlots: sunSlots, sunVerdict: sunVerdict,
    badgesEarned: badgesEarned, summary: summary, serialize: serialize, parse: parse, historyLines: historyLines,
    icsEvents: icsEvents, icsText: icsText, vineMotif: vineMotif
  };
});
