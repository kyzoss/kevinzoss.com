"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../private/vine/logic.js");
const Q = require("../private/vine/quests.js");

const DASH = String.fromCharCode(0x2014);
const T = "2026-11-26";
const e = (over) => Object.assign({ id: Math.floor(Math.random() * 1e9), created_at: "2026-11-26T10:00:00.000Z", kind: "quest", date: T, chapter: 0, quest_id: null, note: "", thumb: null, feedback: null, xp: 0, meta: {} }, over);
const PNG = "data:image/png;base64," + Buffer.from("x".repeat(400)).toString("base64");

// ------------------------------------------------------------------ quest data
test("quest bank: 45+ quests, unique ids, valid chapters, prerequisites exist, no em dash", () => {
  assert.ok(Q.QUESTS.length >= 45, "quests: " + Q.QUESTS.length);
  const ids = new Set();
  const chapters = new Set(Q.CHAPTERS.map((c) => c.id));
  for (const q of Q.QUESTS) {
    assert.ok(!ids.has(q.id), "duplicate " + q.id); ids.add(q.id);
    assert.ok(chapters.has(q.chapter), q.id + " chapter");
    assert.ok(["none", "photo", "number", "checklist", "time"].includes(q.proof), q.id + " proof");
    assert.ok(q.xp > 0 && q.why && q.how.length, q.id + " fields");
    (q.unlock.requires || []).forEach((r) => assert.ok(Q.QUESTS.some((x) => x.id === r), q.id + " requires " + r));
    if (q.proof === "checklist") assert.ok(q.items && q.items.length, q.id + " items");
    if (q.proof === "time") assert.match(q.slot, /^\d\d:\d\d$/);
    assert.ok(!JSON.stringify(q).includes(DASH), "em dash in " + q.id);
  }
  assert.equal(Q.CHAPTERS.length, 7);
  assert.equal(Q.LEVELS[0].name, "Seed");
  assert.equal(Q.LEVELS[Q.LEVELS.length - 1].name, "Wall Master");
  for (let i = 1; i < Q.LEVELS.length; i++) assert.ok(Q.LEVELS[i].xp > Q.LEVELS[i - 1].xp);
});

test("quest prerequisites have no cycles and every chapter has quests", () => {
  const seen = {};
  const visit = (id, stack) => {
    assert.ok(!stack.includes(id), "cycle at " + id);
    if (seen[id]) return; seen[id] = true;
    (L.BY_ID[id].unlock.requires || []).forEach((r) => visit(r, stack.concat(id)));
  };
  Q.QUESTS.forEach((q) => visit(q.id, []));
  Q.CHAPTERS.forEach((c) => assert.ok(Q.QUESTS.some((q) => q.chapter === c.id), "chapter " + c.id));
});

// ------------------------------------------------------------------ xp and levels
test("level thresholds", () => {
  assert.equal(L.levelOf(0).name, "Seed");
  assert.equal(L.levelOf(119).name, "Seed");
  assert.equal(L.levelOf(120).name, "Sprout");
  assert.equal(L.levelOf(300).name, "Tendril");
  assert.equal(L.levelOf(600).name, "Climber");
  assert.equal(L.levelOf(1000).name, "Canopy");
  assert.equal(L.levelOf(1500).name, "Bloom");
  assert.equal(L.levelOf(2100).name, "Fruit");
  assert.equal(L.levelOf(3000).name, "Wall Master");
  assert.equal(L.levelOf(9999).next, null);
  const l = L.levelOf(60);
  assert.equal(l.toNext, 60);
  assert.ok(Math.abs(l.progress - 0.5) < 1e-9);
});

test("xp sums entry xp plus the clamped Claude bonus, ignores seed and settings", () => {
  const list = [
    e({ xp: 20 }),
    e({ kind: "growth", xp: 20, feedback: { xp_bonus: 50 } }),
    e({ kind: "settings", xp: 500 }),
    Object.assign({}, L.SEED_ENTRIES[0], { xp: 999 }),
  ];
  assert.equal(L.totalXp(list), 20 + 20 + 30);
  assert.equal(L.xpForQuest("posts_set"), 60);
  assert.equal(L.xpForQuest("nope"), 0);
});

// ------------------------------------------------------------------ unlock rules
test("chapter unlock by date and by prerequisite", () => {
  const done = {};
  const trellis = L.BY_ID.trellis_plan;
  assert.equal(L.questStatus(trellis, done, "2026-11-26"), "locked", "date gate");
  assert.equal(L.questStatus(trellis, done, "2026-12-01"), "available");
  const parts = L.BY_ID.parts_list;
  assert.equal(L.questStatus(parts, {}, "2027-01-01"), "locked", "prereq gate");
  assert.equal(L.questStatus(parts, { trellis_plan: true }, "2027-01-01"), "available");
  assert.equal(L.questStatus(parts, { trellis_plan: true, parts_list: true }, "2027-01-01"), "done");
  const weekly = L.BY_ID.weekly_photo;
  assert.equal(L.questStatus(weekly, { plant_done: true, weekly_photo: true }, "2027-05-01"), "available", "repeating quests never read done");
});

test("doneIds reads quest, photo and sun entries, and coverage quests only at the threshold", () => {
  const list = [
    e({ quest_id: "bearing", meta: { value: 180 } }),
    e({ kind: "growth", quest_id: "coverage_25", feedback: { coverage_pct: 10 } }),
    e({ kind: "growth", quest_id: "coverage_50", feedback: { coverage_pct: 55 } }),
    e({ kind: "sun", quest_id: "sun_9", meta: { slot: "09:00" } }),
    e({ kind: "water", quest_id: "water_streak" }),
  ];
  const d = L.doneIds(list);
  assert.equal(d.bearing, true);
  assert.equal(d.coverage_25, undefined);
  assert.equal(d.coverage_50, true);
  assert.equal(d.sun_9, true);
  assert.equal(d.water_streak, undefined);
});

test("current chapter and next quests follow the date and progress", () => {
  assert.equal(L.currentChapter([], "2026-11-26").id, 0);
  const next = L.nextQuests([], "2026-11-26", 3);
  assert.equal(next.length, 3);
  next.forEach((q) => assert.equal(q.chapter, 0));
  assert.equal(L.currentChapter([], "2027-01-15").id, 0, "scout still open and unfinished");
  const scoutDone = Q.QUESTS.filter((q) => q.chapter === 0).map((q) => e({ quest_id: q.id }));
  assert.equal(L.currentChapter(scoutDone, "2027-01-15").id, 1);
  const prog = L.chapterProgress(scoutDone, "2027-01-15");
  assert.equal(prog[0].done, prog[0].total);
});

// ------------------------------------------------------------------ streaks
test("weekly photo streak across date gaps", () => {
  const g = (d) => e({ kind: "growth", date: d, created_at: d + "T10:00:00.000Z" });
  assert.equal(L.weeklyStreak([], "2027-05-20"), 0);
  // weeks of May 3, May 10, May 17 (Mondays)
  assert.equal(L.weeklyStreak([g("2027-05-04"), g("2027-05-12"), g("2027-05-18")], "2027-05-20"), 3);
  // today's week empty still counts last week's run
  assert.equal(L.weeklyStreak([g("2027-05-04"), g("2027-05-12")], "2027-05-18"), 2);
  // a gap week breaks it
  assert.equal(L.weeklyStreak([g("2027-04-27"), g("2027-05-12"), g("2027-05-18")], "2027-05-20"), 2);
  // two weeks of silence: zero
  assert.equal(L.weeklyStreak([g("2027-05-04")], "2027-05-25"), 0);
  // ten in a row earns the badge
  const ten = []; for (let i = 0; i < 10; i++) ten.push(g(L.addDays("2027-04-05", i * 7)));
  assert.equal(L.weeklyStreak(ten, "2027-06-08"), 10);
  assert.ok(L.badgesEarned(ten, "2027-06-08").includes("ten_weeks"));
});

test("watering and check-in streaks are day based and forgive today", () => {
  const w = (d) => e({ kind: "water", date: d, created_at: d + "T07:00:00.000Z" });
  const list = [w("2027-05-01"), w("2027-05-02"), w("2027-05-03"), w("2027-05-05"), w("2027-05-06"), w("2027-05-07")];
  assert.equal(L.waterStreak(list, "2027-05-07"), 3);
  assert.equal(L.waterStreak(list, "2027-05-08"), 3, "yesterday counts");
  assert.equal(L.waterStreak(list, "2027-05-09"), 0);
  assert.equal(L.checkinStreak(list, "2027-05-03"), 3);
  const seven = []; for (let i = 0; i < 7; i++) seven.push(w(L.addDays("2027-05-01", i)));
  assert.ok(L.badgesEarned(seven, "2027-05-07").includes("water_week"));
  const heat = L.heatStrip(list, "2027-05-07", 14);
  assert.equal(heat.length, 14);
  assert.equal(heat[13].date, "2027-05-07");
  assert.equal(heat[13].count, 1);
  assert.equal(heat[10].count, 0);
});

test("weekly photo due only after planting and from April 2027", () => {
  const settings = e({ kind: "settings", meta: { planting_date: "2027-03-05" } });
  assert.equal(L.weeklyPhotoDue([settings], "2027-03-20"), false);
  assert.equal(L.weeklyPhotoDue([settings], "2027-04-07"), true);
  assert.equal(L.weeklyPhotoDue([settings, e({ kind: "growth", date: "2027-04-06" })], "2027-04-07"), false);
  assert.equal(L.weeklyPhotoDue([], "2027-04-07"), false);
});

// ------------------------------------------------------------------ badges
test("badge rules", () => {
  const list = [
    e({ quest_id: "posts_set", kind: "proof" }), e({ quest_id: "wires_strung", kind: "proof" }), e({ quest_id: "bed_filled", kind: "proof" }),
    e({ quest_id: "day1_photo", kind: "growth" }), e({ kind: "settings", meta: { vine_name: "Freddie" } }),
    e({ quest_id: "first_flower", kind: "proof" }), e({ quest_id: "hand_pollinate", kind: "proof" }), e({ quest_id: "first_fruit", kind: "proof" }),
    e({ kind: "growth", feedback: { coverage_pct: 92 } }),
  ];
  const b = L.badgesEarned(list, T);
  ["three_posts", "wired", "bed_ready", "day_one", "named", "first_flower", "pollinator", "first_fruit", "half_wall", "full_wall"].forEach((id) => assert.ok(b.includes(id), id));
  assert.ok(!b.includes("sun_detective"));
  assert.ok(!b.includes("wall_master"));
  const sun = L.SLOTS.map((s) => e({ kind: "sun", meta: { slot: s } }));
  assert.ok(L.badgesEarned(sun, T).includes("sun_detective"));
  assert.ok(L.badgesEarned([e({ xp: 3000 })], T).includes("wall_master"));
  assert.deepEqual(L.badgesEarned([], T), []);
});

// ------------------------------------------------------------------ coverage, sun
test("coverage series is sorted, clamped and only from growth photos", () => {
  const list = [
    e({ kind: "growth", date: "2027-06-01", feedback: { coverage_pct: 140, health: 8 } }),
    e({ kind: "growth", date: "2027-05-01", feedback: { coverage_pct: 10 } }),
    e({ kind: "growth", date: "2027-05-15", feedback: { coverage_pct: null } }),
    e({ kind: "proof", date: "2027-05-20", feedback: { coverage_pct: 50 } }),
  ];
  const s = L.coverageSeries(list);
  assert.deepEqual(s.map((p) => [p.date, p.pct]), [["2027-05-01", 10], ["2027-06-01", 100]]);
  assert.equal(s[1].health, 8);
  assert.equal(L.latestCoverage(list), 100);
  assert.equal(L.latestCoverage([]), null);
});

test("sun audit verdict from four slot results", () => {
  assert.equal(L.sunVerdict({}).verdict, "pending");
  const all = { "09:00": { lit: true, hours: 8 }, "11:00": { lit: true, hours: 8 }, "13:00": { lit: true, hours: 8 }, "15:00": { lit: true, hours: 8 } };
  const v = L.sunVerdict(all);
  assert.equal(v.verdict, "go"); assert.equal(v.complete, true); assert.equal(v.lit, 4); assert.equal(v.hours, 8.5);
  const two = { "09:00": { lit: false, hours: null }, "11:00": { lit: true, hours: null }, "13:00": { lit: true, hours: null }, "15:00": { lit: false, hours: null } };
  const v2 = L.sunVerdict(two);
  assert.equal(v2.hours, 4); assert.equal(v2.verdict, "marginal");
  const none = { "09:00": { lit: false }, "11:00": { lit: false }, "13:00": { lit: false }, "15:00": { lit: false } };
  assert.equal(L.sunVerdict(none).verdict, "no");
  const partial = L.sunVerdict({ "13:00": { lit: true, hours: 7 } });
  assert.equal(partial.complete, false); assert.equal(partial.filled, 1); assert.equal(partial.hours, 4.5);
});

test("sunSlots picks the newest entry per slot, by meta or by quest id", () => {
  const list = [
    e({ kind: "sun", quest_id: "sun_9", created_at: "2026-11-27T09:00:00Z", note: "old" }),
    e({ kind: "sun", meta: { slot: "09:00" }, created_at: "2026-11-28T09:00:00Z", note: "new" }),
    e({ kind: "sun", quest_id: "sun_3", created_at: "2026-11-28T15:00:00Z" }),
  ];
  const s = L.sunSlots(list);
  assert.equal(s["09:00"].note, "new");
  assert.ok(s["15:00"]); assert.equal(s["11:00"], null);
});

// ------------------------------------------------------------------ json and merging
test("serialize and parse round trip drop seed rows and junk", () => {
  const list = L.withSeed([e({ id: 5, note: "a" })]);
  assert.equal(list.length, 3);
  const back = L.parse(L.serialize(list));
  assert.equal(back.length, 1); assert.equal(back[0].note, "a");
  assert.deepEqual(L.parse("garbage"), []);
  assert.deepEqual(L.parse("[1, null, {\"id\": 2}]"), [{ id: 2 }]);
});

test("mergeEntries: server wins by id, local-only rows survive, newest first", () => {
  const m = L.mergeEntries([{ id: 1, created_at: "2026-11-20T00:00:00Z", note: "server" }], [{ id: 1, created_at: "2026-11-20T00:00:00Z", note: "stale" }, { id: "local-x", created_at: "2026-11-25T00:00:00Z", note: "local" }, L.SEED_ENTRIES[0]]);
  assert.equal(m.length, 2);
  assert.equal(m[0].note, "local"); assert.equal(m[1].note, "server");
  assert.deepEqual(L.flattenRow({ id: 9, created_at: "x", entry: { kind: "growth", xp: 2 } }), { kind: "growth", xp: 2, id: 9, created_at: "x" });
});

test("settings fold newest over oldest; seed entries are always present", () => {
  const s = L.settingsOf([e({ kind: "settings", created_at: "2026-11-27T00:00:00Z", meta: { vine_name: "B" } }), e({ kind: "settings", created_at: "2026-11-26T00:00:00Z", meta: { vine_name: "A", bearing: 180 } })]);
  assert.deepEqual(s, { vine_name: "B", bearing: 180 });
  const w = L.withSeed([]);
  assert.equal(w.length, 2); assert.ok(w.every((x) => x.seed));
  assert.equal(L.totalXp(w), 0);
  const sum = L.summary(w, T);
  assert.equal(sum.level.name, "Seed"); assert.equal(sum.chapter.id, 0); assert.equal(sum.coverage, null, "seed coverage is not real data");
  assert.ok(L.historyLines(w, 6).length === 0, "seed rows are not sent as history");
});

test("ics has the key reminders and the motif grows with progress", () => {
  const ics = L.icsText("2026-11-26");
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261127\r\nSUMMARY:Passionfruit: sun audit/);
  assert.match(ics, /20270201/); assert.match(ics, /20270301/); assert.match(ics, /FREQ=WEEKLY;BYDAY=SU/); assert.match(ics, /FREQ=MONTHLY/); assert.match(ics, /20280215/);
  assert.ok(!ics.includes(DASH));
  assert.ok(L.vineMotif(1).length > L.vineMotif(0).length);
  assert.ok(L.vineMotif(1).some((i) => i.type === "fruit"));
  assert.ok(!L.vineMotif(0.2).some((i) => i.type === "flower"));
});

// ------------------------------------------------------------------ API
const { createServer } = require("../dev");
process.env.GAMES_PASSCODE = "open sesame";
const auth = require("../lib/auth");
const V = require("../lib/vine");
let server, base, cookie;
test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  cookie = auth.issueCookie().split(";")[0];
});
test.after(() => server.close());
const realFetch = global.fetch;
const call = (method, body, extra) => realFetch(base + "/api/vine", { method, headers: Object.assign({ "Content-Type": "application/json", cookie }, extra || {}), body: body ? JSON.stringify(body) : undefined });

test("api: unauthenticated requests get 401", async () => {
  const r = await realFetch(base + "/api/vine");
  assert.equal(r.status, 401);
  assert.equal((await r.json()).reason, "unauthed");
  const p = await realFetch(base + "/api/vine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkin" }) });
  assert.equal(p.status, 401);
});

test("api: no database reports no_db on GET and still answers a quest post locally", async () => {
  delete process.env.SUPABASE_URL;
  const r = await call("GET");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, false); assert.equal(j.reason, "no_db");
  const q = await (await call("POST", { action: "quest", quest_id: "bearing", value: 180, xp: 20, date: T })).json();
  assert.equal(q.ok, true); assert.equal(q.stored, false); assert.equal(q.reason, "no_db");
  assert.match(String(q.entry.id), /^local-/); assert.equal(q.entry.xp, 20); assert.equal(q.entry.meta.value, 180);
  const s = await (await call("POST", { action: "settings", settings: { vine_name: "Freddie", bearing: 180, junk: 1 } })).json();
  assert.equal(s.entry.kind, "settings"); assert.deepEqual(s.entry.meta, { vine_name: "Freddie", bearing: 180 });
});

test("api: rejects oversize bodies and bad images", async () => {
  // content-length over the limit short-circuits before any work (direct handler call: undici will not send a fake length)
  const handler = require("../api/vine");
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s; } };
  await handler({ method: "POST", headers: { cookie, "content-length": String(2 * 1024 * 1024) }, body: { action: "checkin", image: PNG } }, res);
  assert.equal(res.statusCode, 413);
  const big = await call("POST", { action: "checkin", image: "data:image/png;base64," + "A".repeat(1.6 * 1024 * 1024) });
  assert.equal(big.status, 413);
  const gif = await call("POST", { action: "checkin", image: "data:image/gif;base64," + "A".repeat(400) });
  assert.equal(gif.status, 400); assert.equal((await gif.json()).reason, "bad_image");
  const none = await call("POST", { action: "checkin" });
  assert.equal(none.status, 400);
  assert.equal(V.imageOk("data:image/jpeg;base64," + "A".repeat(400)), true);
  assert.equal(V.imageOk("data:image/svg+xml;base64," + "A".repeat(400)), false);
});

test("api: checkin without ANTHROPIC_API_KEY saves with the review pending (no_key)", async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.VINE_FAKE_AI;
  const j = await (await call("POST", { action: "checkin", kind: "growth", image: PNG, thumb: "data:image/jpeg;base64,AAAA", note: "hi", date: T, xp: 20 })).json();
  assert.equal(j.ok, true); assert.equal(j.review.ok, false); assert.equal(j.review.reason, "no_key");
  assert.equal(j.entry.feedback, null); assert.equal(j.entry.note, "hi"); assert.equal(j.entry.kind, "growth");
  assert.equal((await V.review({ image: PNG })).reason, "no_key");
});

test("review: forwards the image block, system prompt, model and version header; parses fenced JSON", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  let seen = null;
  const fetchStub = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: "text", text: "Here you go:\n```json\n" + JSON.stringify({ headline: "Looks good", health: 7, coverage_pct: 12.6, stage: "young", observations: ["a"], concerns: [{ issue: "x", severity: "high", fix: "y" }], next_actions: ["1", "2", "3", "4", "5"], praise: "nice", sun: { upper_fence_lit: true, estimated_summer_hours: 7.5 }, xp_bonus: 99, confidence: "high" }) + "\n```" }] }) };
  };
  const r = await V.review({ image: "data:image/jpeg;base64," + "QUJD".repeat(50), kind: "sun", slot: "09:00", date: T, chapter: 0, note: "note", history: ["h1"] }, { fetch: fetchStub });
  assert.equal(r.ok, true);
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.opts.headers["anthropic-version"], "2023-06-01");
  assert.equal(seen.opts.headers["x-api-key"], "sk-test");
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.equal(body.max_tokens, 900);
  assert.match(body.system, /El Segundo/); assert.match(body.system, /Frederick/); assert.match(body.system, /STRICT JSON/); assert.match(body.system, /09:00/); assert.match(body.system, /h1/);
  assert.equal(body.messages[0].role, "user");
  assert.deepEqual(body.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD".repeat(50) } });
  assert.match(body.messages[0].content[1].text, /note/);
  const fb = r.feedback;
  assert.equal(fb.headline, "Looks good"); assert.equal(fb.health, 7); assert.equal(fb.coverage_pct, 12.6); assert.equal(fb.xp_bonus, 30, "bonus clamped");
  assert.equal(fb.next_actions.length, 4); assert.equal(fb.concerns[0].severity, "high"); assert.equal(fb.sun.estimated_summer_hours, 7.5);
});

test("review: falls back to plain text on garbage, reports API errors and exceptions", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const garbage = await V.review({ image: PNG, date: T }, { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: "text", text: "I cannot see a vine here, sorry." }] }) }) });
  assert.equal(garbage.ok, true); assert.equal(garbage.feedback.unparsed, true); assert.match(garbage.feedback.observations[0], /cannot see/);
  const err = await V.review({ image: PNG, date: T }, { fetch: async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: "rate limited" } }) }) });
  assert.equal(err.ok, false); assert.equal(err.reason, "api_error"); assert.equal(err.status, 429); assert.equal(err.message, "rate limited");
  const boom = await V.review({ image: PNG, date: T }, { fetch: async () => { throw new Error("socket"); } });
  assert.equal(boom.ok, false); assert.equal(boom.reason, "exception"); assert.match(boom.message, /socket/);
  assert.equal(V.parseReview("nope"), null);
  assert.equal(V.parseReview("[1,2]"), null);
  assert.equal(V.parseReview("{\"headline\": \"x\", \"health\": \"12\"}").health, 10);
});

test("api: VINE_FAKE_AI=1 returns the canned review through the parser, and review re-runs on a thumb", async () => {
  process.env.VINE_FAKE_AI = "1"; delete process.env.ANTHROPIC_API_KEY;
  const j = await (await call("POST", { action: "checkin", kind: "sun", slot: "09:00", image: PNG, thumb: "data:image/jpeg;base64," + "QUJD".repeat(50), date: T, xp: 25, quest_id: "sun_9" })).json();
  assert.equal(j.review.ok, true); assert.equal(j.entry.feedback.headline, V.FAKE_REVIEW.headline); assert.equal(j.entry.feedback.health, null, "null health stays null"); assert.equal(j.entry.meta.slot, "09:00");
  const again = await (await call("POST", { action: "review", entry: { id: "local-1", kind: "growth", thumb: "data:image/jpeg;base64," + "QUJD".repeat(50), meta: {} } })).json();
  assert.equal(again.ok, true); assert.equal(again.entry.feedback.xp_bonus, 12);
  const bad = await (await call("POST", { action: "review", entry: { id: "local-2", kind: "growth", thumb: null, meta: {} } })).json();
  assert.equal(bad.reason, "bad_image");
  delete process.env.VINE_FAKE_AI;
});

test("api: with Supabase env the RPCs are called with the token and rows are flattened", async () => {
  process.env.SUPABASE_URL = "https://db.example"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.KZ_DB_TOKEN = "tok"; process.env.VINE_FAKE_AI = "1";
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).startsWith("https://db.example")) {
      const body = JSON.parse(opts.body);
      calls.push({ url: String(url), body, apikey: opts.headers.apikey, auth: opts.headers.Authorization });
      const name = String(url).split("/rpc/")[1];
      const reply = name === "kz_vine_list" ? [{ id: 7, created_at: "2026-11-26T00:00:00Z", entry: { kind: "growth", xp: 20 } }]
        : name === "kz_vine_add" ? { id: 8, created_at: "2026-11-26T01:00:00Z", entry: body.p_entry }
        : name === "kz_vine_update" ? { id: body.p_id } : true;
      return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
    }
    return realFetch(url, opts);
  };
  try {
    const g = await (await call("GET")).json();
    assert.equal(g.ok, true); assert.deepEqual(g.entries, [{ kind: "growth", xp: 20, id: 7, created_at: "2026-11-26T00:00:00Z" }]);
    assert.equal(calls[0].body.p_token, "tok"); assert.equal(calls[0].body.p_limit, 500); assert.equal(calls[0].apikey, "anon"); assert.equal(calls[0].auth, "Bearer anon");
    const c = await (await call("POST", { action: "checkin", kind: "growth", image: PNG, date: T, xp: 20 })).json();
    assert.equal(c.stored, true); assert.equal(c.entry.id, 8); assert.equal(c.entry.feedback.headline, V.FAKE_REVIEW.headline);
    const names = calls.map((x) => x.url.split("/rpc/")[1]);
    assert.deepEqual(names.slice(1), ["kz_vine_add", "kz_vine_update"]);
    assert.equal(calls[2].body.p_id, 8); assert.equal(calls[2].body.p_patch.feedback.headline, V.FAKE_REVIEW.headline);
    const d = await (await call("DELETE", { id: 8 })).json();
    assert.equal(d.ok, true); assert.equal(calls[3].body.p_id, 8);
    const badDel = await call("DELETE", { id: "x" });
    assert.equal(badDel.status, 400);
  } finally {
    global.fetch = realFetch;
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.KZ_DB_TOKEN; delete process.env.VINE_FAKE_AI;
  }
});

// ------------------------------------------------------------------ page contract
test("page contract: base href, noindex, relative assets, no em dash, no external URLs, seed images shipped", () => {
  const dir = path.join(__dirname, "..", "private", "vine");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(html.includes('<base href="/play/vine/"'));
  const head = html.slice(html.indexOf("<head>") + 6);
  assert.match(head.replace(/\s+/g, " ").trim(), /^<meta charset="utf-8" \/> <base href="\/play\/vine\/" \/>/);
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes('href="/play/"'));
  assert.ok(html.includes("<title>Passionfruit Wall</title>"));
  for (const f of fs.readdirSync(dir)) {
    if (f === "seed") continue;
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!txt.includes(DASH), "em dash in " + f);
    assert.ok(!/https?:\/\//.test(txt.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "external URL in " + f);
  }
  assert.ok(!fs.readFileSync(__filename, "utf8").includes(DASH));
  assert.ok(!fs.readFileSync(path.join(dir, "logic.js"), "utf8").match(/document\.|window\./), "logic has no DOM access");
  assert.ok(!fs.readFileSync(path.join(dir, "quests.js"), "utf8").match(/document\.|window\./), "quests has no DOM access");
  for (const f of ["yard-wide.jpg", "bed-closeup.jpg"]) {
    const st = fs.statSync(path.join(dir, "seed", f));
    assert.ok(st.size > 60 * 1024 && st.size < 170 * 1024, f + " size " + st.size);
  }
  assert.ok(L.SEED_ENTRIES.every((s) => fs.existsSync(path.join(dir, s.thumb))));
});
