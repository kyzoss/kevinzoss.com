import * as S from "./store.js";
import * as SC from "./scoring.js";
import { TEAMS, TEAM_LIST, teamLogo, logoAttrs, teamColor, teamName } from "./teams.js";
import { fetchWeek } from "./espn.js";
import { fetchSpreads } from "./odds.js";
import { esc, fmtKick, fmtDayHeading, dayKey, fmtRange, toLocalInput, toast, openModal, closeModal, modalOpen, modalHead, icon } from "./ui.js";

const cfg = window.POOL_CONFIG;
const app = document.getElementById("app");

let savedUntil = 0;
let savedTimer = null;
/** Flash "Saved" in the header so an entry visibly lands. */
function flashSaved() {
  savedUntil = Date.now() + 1800;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(render, 1900);
}

const ui = {
  tab: "week",
  week: currentWeek(),
  busy: false,
  pickingAs: null, // commissioner can act for someone else
};

// ---- helpers ------------------------------------------------------------------
function currentWeek() {
  const start = new Date(cfg.week1Tuesday + "T00:00:00");
  const diff = Math.floor((Date.now() - start.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  return Math.min(Math.max(diff, 1), cfg.weeks);
}
const player = (id) => S.getState().players.find((p) => p.id === id);
const me = () => S.getMe();
const commish = () => S.isCommish();
/** Who a pick action applies to. */
function actor() {
  if (commish() && ui.pickingAs) return ui.pickingAs;
  return me();
}
function nameOf(id) { return player(id)?.name || id; }
function avatar(id, size = "") {
  const p = player(id);
  if (!p) return "";
  return `<span class="avatar ${size}" style="--c:${esc(p.color)}">${esc(p.short || p.name.slice(0, 2))}</span>`;
}
function ordinal(n) { return n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"); }
function gameById(week, id) { return SC.weekGames(S.getState(), week).find((g) => g.id === id); }
function anyPickOn(wk, gameId) { return Object.values(wk.picks || {}).some((p) => p && p[gameId]); }

// ---- data pulls ---------------------------------------------------------------
async function pullSlate(week, { lines = true, forceLines = false, quiet = false } = {}) {
  if (ui.busy) return;
  ui.busy = true; render();
  let fetched = null, odds = null, oddsErr = null;
  try {
    fetched = await fetchWeek(cfg.season, week);
  } catch (e) {
    ui.busy = false; render();
    if (!quiet) toast(`ESPN unavailable: ${e.message}`, { bad: true });
    return;
  }
  if (lines && cfg.oddsApiKey) {
    try { odds = await fetchSpreads(cfg.oddsApiKey, cfg.oddsBooks || []); }
    catch (e) { oddsErr = e; }
  }
  let added = 0, lined = 0;
  const locked = SC.linesLocked(S.getState(), week, cfg);
  S.update((d) => {
    const wk = S.ensureWeek(d, week);
    for (const f of fetched) {
      const id = S.gameId(f);
      let g = wk.games.find((x) => x.id === id) || wk.games.find((x) => x.espnId === f.espnId);
      if (!g) { g = { id, spread: null, manualSpread: false }; wk.games.push(g); added++; }
      g.id = id;
      Object.assign(g, {
        espnId: f.espnId, kickoff: f.kickoff, home: f.home, away: f.away, status: f.status,
        homeScore: f.homeScore, awayScore: f.awayScore, clock: f.clock, homeRecord: f.homeRecord, awayRecord: f.awayRecord, broadcast: f.broadcast,
      });
      // Lines: the pool plays one number. It freezes once anyone has picked the game,
      // once the commissioner locks the week, or once the game kicks off.
      const frozen = locked || g.manualSpread || anyPickOn(wk, g.id) || g.status !== "pre";
      const canSet = forceLines || !frozen || g.spread == null;
      if (!canSet) continue;
      const o = odds?.games.find((x) => x.home === g.home && x.away === g.away && Math.abs(new Date(x.commence) - new Date(g.kickoff)) < 3 * 86400e3);
      if (o && o.spread != null) { if (g.spread !== o.spread) lined++; g.spread = o.spread; g.book = o.book; }
      else if (g.spread == null && f.spread != null) { g.spread = f.spread; g.book = "ESPN"; lined++; }
    }
    wk.games.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    wk.lastPull = Date.now();
    if (lines) wk.lastLinesPull = Date.now();
  });
  ui.busy = false; render();
  if (quiet) return;
  const bits = [`${fetched.length} games`];
  if (added) bits.push(`${added} new`);
  if (lines) {
    if (odds) bits.push(`${lined} lines from ${odds.games.find((x) => x.book)?.book || "the book"}${odds.remaining != null ? ` · ${odds.remaining} calls left` : ""}`);
    else if (oddsErr) bits.push(`lines: ${oddsErr.message}`);
  }
  toast(bits.join(" · "));
}

/**
 * Fetch what a week is missing without burning odds calls: the schedule whenever it
 * is absent, and lines only for the current week, when a game has no number and
 * nobody has pulled in the last hour (the timestamp is shared, so one pull serves all).
 */
function autoPull(week) {
  const state = S.getState();
  const wk = state.weeks?.[week];
  const games = wk?.games || [];
  const needSchedule = !games.length;
  const needLines = week === currentWeek() && !SC.linesLocked(state, week, cfg) && (needSchedule || games.some((g) => g.spread == null && g.status === "pre")) && Date.now() - (wk?.lastLinesPull || 0) > 3600e3;
  if (needSchedule || needLines) pullSlate(week, { lines: needLines, quiet: true });
}

async function refreshScores(week, quiet = true) {
  return pullSlate(week, { lines: false, quiet });
}

let pollTimer = null;
function schedulePolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  if (ui.tab !== "week") return;
  const games = SC.weekGames(S.getState(), ui.week);
  const active = games.some((g) => g.status === "in" || (g.status === "pre" && SC.hasStarted(g)));
  if (active) pollTimer = setInterval(() => refreshScores(ui.week), 60_000);
}

// ---- mutations ----------------------------------------------------------------
function setPick(gameId, side) {
  const pid = actor();
  flashSaved();
  if (!pid) return toast("Pick who you are first", { bad: true });
  const g = gameById(ui.week, gameId);
  if (!g) return;
  if (SC.hasStarted(g) && !commish()) return toast("Kicked off. Picks are locked.", { bad: true });
  const dups = SC.resolveDups(S.getState(), cfg, ui.week);
  const dup = dups.assigned[pid];
  if (dup && (g.home === dup || g.away === dup)) return toast(`${dup} is your dup this week. That pick is locked in.`, { bad: true });
  S.update((d) => {
    const wk = S.ensureWeek(d, ui.week);
    wk.picks[pid] ||= {};
    if (wk.picks[pid][gameId] === side) delete wk.picks[pid][gameId];
    else wk.picks[pid][gameId] = side;
  });
}

/**
 * Set this team's dup priority. `rank` is 1-based; 0 clears it. Your list is
 * capped at your draft position, so choosing a rank inserts at that spot and
 * pushes the rest down, dropping anything past the cap.
 */
function setDupRank(team, rank) {
  const pid = actor();
  if (!pid) return toast("Pick who you are first", { bad: true });
  flashSaved();
  const state = S.getState();
  const dups = SC.resolveDups(state, cfg, ui.week);
  if (dups.lockAt && Date.now() >= dups.lockAt && !commish()) return toast("Dup draft is locked for this week.", { bad: true });
  if (!dups.byTeam[team]) return toast(`${team} isn't a dup this week.`, { bad: true });
  const cap = dups.order.indexOf(pid) + 1;
  const current = (state.weeks?.[ui.week]?.dupPrefs?.[pid] || []).filter((t) => dups.byTeam[t]);
  const without = current.filter((t) => t !== team);
  let next;
  if (!rank) {
    next = without;
  } else {
    const at = Math.min(Math.max(rank, 1), cap) - 1;
    next = [...without.slice(0, at), team, ...without.slice(at)].slice(0, cap);
  }
  S.update((d) => {
    const wk = S.ensureWeek(d, ui.week);
    wk.dupPrefs ||= {};
    if (next.length) wk.dupPrefs[pid] = next;
    else delete wk.dupPrefs[pid];
  });
}

function setLms(team) {
  const pid = actor();
  flashSaved();
  if (!pid) return toast("Pick who you are first", { bad: true });
  const state = S.getState();
  const used = SC.lmsUsed(state, cfg, ui.week, pid).find((u) => u.team === team);
  if (used) return toast(`You already used ${team} in week ${used.week} this round.`, { bad: true });
  const g = SC.weekGames(state, ui.week).find((x) => x.home === team || x.away === team);
  if (team && g && SC.hasStarted(g) && !commish()) return toast("That game already kicked off.", { bad: true });
  S.update((d) => {
    const wk = S.ensureWeek(d, ui.week);
    if (team) wk.lms[pid] = team; else delete wk.lms[pid];
  });
  closeModal();
}

// ---- rendering ----------------------------------------------------------------
function render() {
  const state = S.getState();
  if (!me()) { app.innerHTML = renderGate(state); return; }
  let body = "";
  if (ui.tab === "week") body = renderWeek(state);
  else if (ui.tab === "standings") body = renderStandings(state);
  else if (ui.tab === "money") body = renderMoney(state);
  else if (ui.tab === "browns") body = renderSideBet(state);
  else body = renderSettings(state);
  app.innerHTML = `${renderTopbar(state)}<main class="page">${body}</main>${renderBottomNav()}`;
  schedulePolling();
}

const TABS = [
  ["week", "Week", "week"], ["standings", "Standings", "board"], ["money", "Money", "money"],
  ["browns", cfg.sideBet?.label?.split(" ")[0] || "Side bet", "helmet"], ["settings", "Setup", "gear"],
];

function renderTopbar() {
  const sync = S.getSync();
  const saved = Date.now() < savedUntil;
  let syncHtml;
  if (saved) {
    syncHtml = `<span class="sync sync--live" title="Your entry is stored"><i class="sync__dot"></i>Saved</span>`;
  } else if (sync.enabled) {
    const label = sync.state === "live" ? "Synced" : sync.state === "error" ? "Sync off" : "Syncing";
    syncHtml = `<span class="sync sync--${esc(sync.state)}" title="${esc(sync.detail || "Shared board")}"><i class="sync__dot"></i>${label}</span>`;
  } else {
    syncHtml = `<span class="sync" title="Picks are stored in this browser only. Add Supabase in config.js to share one board."><i class="sync__dot"></i>This device</span>`;
  }
  const who = actor();
  return `<header class="topbar">
    <a class="wordmark" href="./"><span class="wordmark__mark"></span><span class="wordmark__text">${esc(cfg.poolName)}</span><span class="wordmark__season">${cfg.season}</span></a>
    <nav class="tabs" role="tablist">${TABS.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${ui.tab === id}" data-action="tab" data-tab="${id}">${esc(label)}</button>`).join("")}</nav>
    <div class="topbar__right">${syncHtml}
      <button class="me" data-action="whoami" title="Switch player">${avatar(who)}<span class="me__label">${commish() && who !== me() ? "Picking as" : "You"}</span><span>${esc(nameOf(who))}</span></button>
    </div></header>`;
}

function renderBottomNav() {
  return `<nav class="bottomnav"><div class="bottomnav__inner">${TABS.map(([id, label, ic]) => `<button class="tab" aria-selected="${ui.tab === id}" data-action="tab" data-tab="${id}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div></nav>`;
}

function renderGate(state) {
  return `<div class="gate"><div class="gate__box">
    <h1 class="gate__title"><small>${esc(cfg.poolName)} · ${cfg.season}</small>Pick'em</h1>
    <div class="gate__prompt">▶ Who's playing?</div>
    <div class="gate__who">${state.players.map((p) => `<button class="who" style="--c:${esc(p.color)}" data-action="me" data-id="${esc(p.id)}">${avatar(p.id, "avatar--xl")}<b>${esc(p.name)}</b><small>${esc(p.short || "")}</small></button>`).join("")}</div>
    <p class="mute" style="font-size:13px;max-width:44ch">Honor system, same as the sheet. Your choice sticks on this device.</p>
  </div></div>`;
}

// ---- week view ----------------------------------------------------------------
function renderWeekStrip(state) {
  const now = currentWeek();
  return `<div class="weekstrip" role="tablist">${Array.from({ length: cfg.weeks }, (_, i) => i + 1).map((w) => {
    const games = SC.weekGames(state, w);
    const live = games.some((g) => g.status === "in");
    const done = games.length && games.every(SC.isFinal);
    const cls = ["wk", live ? "wk--live" : done ? "wk--done" : "", w === now ? "wk--now" : ""].join(" ");
    return `<button class="${cls}" role="tab" aria-selected="${ui.week === w}" data-action="week" data-week="${w}" aria-label="Week ${w}">${w}</button>`;
  }).join("")}</div>`;
}

function renderWeek(state) {
  const week = ui.week;
  const wk = state.weeks?.[week] || {};
  const games = wk.games || [];
  const tally = SC.weekTally(state, week, cfg);
  const dups = SC.resolveDups(state, cfg, week);
  const finals = games.filter(SC.isFinal).length;
  const live = games.filter((g) => g.status === "in").length;
  const complete = SC.weekComplete(state, week);
  const led = SC.ledger(state, cfg);
  const wrow = led.weekly.rows[week];
  const lrow = led.lms.rows[week];
  const best = Math.max(0, ...state.players.map((p) => tally[p.id].points));
  const linesFrozen = SC.linesLocked(state, week, cfg);
  const lockAt = SC.lineLockAt(week, cfg);
  const lockLabel = lockAt && !linesFrozen
    ? new Date(lockAt).toLocaleString(undefined, { weekday: "short", hour: "numeric" }).toLowerCase()
    : "";
  const anyPicks = state.players.some((p) => tally[p.id].picks);

  const tiles = state.players.map((p) => {
    const t = tally[p.id];
    const pos = dups.order.indexOf(p.id) + 1;
    const lead = anyPicks && t.points === best && t.picks > 0 && state.players.filter((q) => tally[q.id].points === best).length === 1;
    return `<div class="tile ${lead ? "tile--lead" : ""}" style="--c:${esc(p.color)}">
      <div class="tile__name">${avatar(p.id)}<span>${esc(p.name)}</span><span class="tile__pos" title="Draft position">${ordinal(pos)}</span></div>
      <div class="tile__big">${t.picks ? fmtPts(t.points) : "—"}<small>${t.w}-${t.l}${t.p ? `-${t.p}` : ""}</small></div>
      <div class="tile__sub"><span>${t.picks}/${games.length} picked</span>${t.dup ? `<span>Dup <b>${esc(t.dup)}</b></span>` : ""}</div>
    </div>`;
  }).join("");

  let weeklyTxt;
  if (!games.length) weeklyTxt = "Pull the slate to open the week.";
  else if (complete && wrow) {
    weeklyTxt = wrow.winners.length && !wrow.rolled
      ? `<b>${wrow.winners.map(nameOf).join(" & ")}</b> ${wrow.winners.length > 1 ? "split" : "takes"} it with ${fmtPts(best)}.`
      : `Tie at ${fmtPts(best)} between ${wrow.winners.map(nameOf).join(", ")}. Pot rolls to week ${week + 1}.`;
  } else if (anyPicks && finals) {
    const leaders = state.players.filter((p) => tally[p.id].points === best && tally[p.id].picks);
    weeklyTxt = leaders.length === 1 ? `<b>${esc(leaders[0].name)}</b> leads with ${fmtPts(best)}. ${games.length - finals} to play.` : `${leaders.map((p) => esc(p.name)).join(" & ")} tied at ${fmtPts(best)}. ${games.length - finals} to play.`;
  } else weeklyTxt = `Best ATS score takes it. Ties roll over${week === cfg.weeks ? "" : " to next week"}.`;

  const lmsAlive = lrow ? lrow.aliveEntering : state.players.map((p) => p.id);
  const lmsTxt = lrow
    ? (lrow.complete && lrow.ended
      ? `Round ${lrow.round} paid: ${Object.entries(lrow.payouts).map(([id, amt]) => `<b>${esc(nameOf(id))}</b> ${SC.money(amt)}`).join(", ")}.`
      : `Round ${lrow.round} · weeks ${lrow.roundStart}–${lrow.roundEnd} · <b>${lmsAlive.length}</b> still standing${lrow.complete ? ` · ${lrow.eliminated.length} out this week` : ""}.`)
    : `Pick a team to lose. ${SC.money(cfg.lmsPerPlayer ?? 1)} each every week, in or out.`;

  return `${renderWeekStrip(state)}
  <section class="field">
    <div>
      <h1 class="hero__title"><small>${esc(cfg.poolName)} · ${cfg.season}</small>Week ${String(week).padStart(2, "0")}</h1>
      <div class="hero__meta">
        ${games.length ? `<span>${esc(fmtRange(games))}</span><span><span class="num">${games.length}</span> games</span>` : `<span>No slate yet</span>`}
        ${finals ? `<span><span class="num">${finals}</span> final</span>` : ""}
        ${live ? `<span class="livepill">${live} live</span>` : ""}
        ${linesFrozen ? `<span>Lines locked</span>` : lockLabel ? `<span>Lines lock ${esc(lockLabel)}</span>` : ""}
      </div>
    </div>
    <div class="tiles">${tiles}</div>
  </section>

  <div class="pots">
    <div class="pot"><div class="pot__amt">${SC.money(wrow ? wrow.total : cfg.weeklyPot)}<small>weekly pot${wrow?.carry ? ` · ${SC.money(wrow.carry)} rolled in` : ""}</small></div><div class="pot__txt"><span class="pot__k">Weekly</span>${weeklyTxt}</div></div>
    <div class="pot"><div class="pot__amt">${SC.money(lrow ? lrow.pot : SC.lmsWeekly(state, cfg))}<small>LMS pot</small></div><div class="pot__txt"><span class="pot__k">Last man standing</span>${lmsTxt}</div></div>
  </div>

  <div class="toolbar">
    <button class="btn btn--px" data-action="refresh" ${ui.busy ? "disabled" : ""}>${icon("refresh", ui.busy ? "spin" : "")}${games.length ? "Refresh scores" : "Pull slate"}</button>
    ${commish() ? `
      <button class="btn btn--px" data-action="lock-lines" title="${linesFrozen ? "Reopen the lines for this week" : `Freeze them now — otherwise they lock ${esc(lockLabel)}`}">${icon("lock")}${linesFrozen ? "Reopen lines" : "Lock lines now"}</button>
      <button class="btn btn--px" data-action="add-game">${icon("plus")}Add game</button>
` : ""}
  </div>


  <section class="section">
    <div class="section__head"><h2 class="section__title">The slate</h2><span class="section__sub">${games.length ? "Tap either side to take it against the number. Picks lock at kickoff." : ""}</span></div>
    ${games.length ? renderDupBar(state, week, dups, tally) + renderSlate(state, week, games, tally, dups) : renderEmptySlate()}
  </section>

  ${games.length ? renderLms(state, week, lrow, games) : ""}`;
}

function fmtPts(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

function renderEmptySlate() {
  return `<div class="empty"><h3>No games loaded</h3><p>Pull this week's schedule and lines. ESPN provides the games and scores; the book provides the spreads. You can also add games by hand.</p>
    <button class="btn btn--primary btn--px" data-action="refresh" ${ui.busy ? "disabled" : ""}>${icon("refresh", ui.busy ? "spin" : "")}Pull week ${ui.week}</button></div>`;
}

// ---- the slate --------------------------------------------------------------
// The sheet's shape, because it was the right shape: Fav | Spr | Dog reading
// across, all four players' picks beside it, and the dup priority picker on the
// same line. One row per game, no second screen, no horizontal scroll.

/** Favorite and dog sides of a game. Pick'em games have no favorite. */
function sides(g) {
  const fav = SC.favorite(g);
  if (!fav) return { favSide: "away", dogSide: "home", pk: true };
  return { favSide: fav, dogSide: fav === "home" ? "away" : "home", pk: false };
}
const abbrOf = (g, side) => (side === "home" ? g.home : g.away);

/** A slim header: your draft slot, and who holds which dup. */
function renderDupBar(state, week, dups, tally) {
  const pid = actor();
  const pos = dups.order.indexOf(pid) + 1;
  const locked = dups.lockAt && Date.now() >= dups.lockAt;
  const mine = dups.assigned[pid];
  const held = dups.order.map((id) => {
    const team = dups.assigned[id];
    const grade = team ? tally[id]?.dupGrade : null;
    const cls = ["dupchip", team ? "" : "dupchip--none", grade ? `dupchip--${grade}` : "", id === pid ? "dupchip--me" : ""].join(" ");
    return `<span class="${cls}" style="--c:${esc(player(id)?.color)}" title="${esc(nameOf(id))}">
      ${avatar(id)}<b>${team ? esc(team) : "—"}</b></span>`;
  }).join("");
  let note;
  if (!pid) note = "";
  else if (!dups.candidates.length) note = "No lines yet, so no dups to rank.";
  else if (locked) note = `Draft locked. ${mine ? `You have <b>${esc(mine)}</b>.` : "You didn't rank one."}`;
  else {
    const missed = (dups.prefs[pid] || []).filter((t) => t !== mine);
    note = `You pick <b>${ordinal(pos)}</b> this week &mdash; rank ${pos === 1 ? "one" : `up to ${pos}`} underdog${pos > 1 ? "s" : ""} in the Dup column, best first.${mine ? ` Currently <b>${esc(mine)}</b>.` : ""}`;
    if (missed.length) note += ` ${missed.map((t) => esc(t)).join(" and ")} went above you, so ${missed.length > 1 ? "those games" : "that game"} sits on the favorite unless you pick it yourself.`;
  }
  return `<div class="dupbar">
    <div class="dupbar__note">${note}</div>
    <div class="dupbar__held">${held}</div>
  </div>`;
}

function renderSlate(state, week, games, tally, dups) {
  const pid = actor();
  const myColor = player(pid)?.color || "var(--accent)";
  const pos = dups.order.indexOf(pid) + 1;
  const dupLocked = Boolean(dups.lockAt && Date.now() >= dups.lockAt && !commish());
  const myPrefs = dups.prefs[pid] || [];

  const head = `<div class="grow grow--head" role="row">
    <span>Fav</span><span class="ctr">Spr</span><span>Dog</span>
    ${state.players.map((p) => `<span class="ctr pname" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.short || p.name.slice(0, 2))}</span>`).join("")}
    <span class="ctr">Dup</span>${commish() ? `<span></span>` : ""}
  </div>`;

  let lastSlot = null;
  const rows = [];
  for (const g of games) {
    const slot = `${dayKey(g.kickoff)}|${fmtKick(g.kickoff)}`;
    if (slot !== lastSlot) {
      rows.push(`<div class="slate__slot">${g.kickoff ? esc(fmtKick(g.kickoff)) : "TBD"}${g.broadcast ? ` <i>${esc(g.broadcast)}</i>` : ""}</div>`);
      lastSlot = slot;
    }
    rows.push(renderRow(state, g, tally, dups, pid, myColor, { pos, dupLocked, myPrefs }));
  }
  return `<div class="slate ${commish() ? "slate--commish" : ""}" role="table">${head}${rows.join("")}</div>`;
}

function renderRow(state, g, tally, dups, pid, myColor, ctx) {
  const { favSide, dogSide, pk } = sides(g);
  const favAbbr = abbrOf(g, favSide);
  const dogAbbr = abbrOf(g, dogSide);
  const started = SC.hasStarted(g);
  const final = SC.isFinal(g);
  const live = g.status === "in";
  const winner = SC.straightUpWinner(g);
  const margin = final && g.spread != null ? g.homeScore - g.awayScore + g.spread : null;
  const coveredSide = margin == null || margin === 0 ? null : margin > 0 ? "home" : "away";

  const myDupTeam = dups.assigned[pid];
  const myDupHere = myDupTeam && (g.home === myDupTeam || g.away === myDupTeam);
  const mySide = pid ? tally[pid]?.sides[g.id] : null;
  const canPick = pid && (!started || commish()) && !myDupHere;

  const teamCell = (side, abbr, isDog) => {
    const cls = [
      "cell", "cell--team", isDog ? "cell--dog" : "cell--fav",
      mySide === side ? "cell--mine" : "",
      final && winner && winner !== abbr && winner !== "tie" ? "cell--lost" : "",
      coveredSide === side ? "cell--covered" : "",
    ].join(" ");
    const prefix = isDog ? (side === "home" ? "@" : "vs") : "";
    return `<button class="${cls}" data-action="pick" data-game="${esc(g.id)}" data-side="${side}"
      ${canPick ? "" : "disabled"} aria-pressed="${mySide === side}"
      title="${esc(teamName(abbr))}${started ? "" : ` · ${esc(fmtKick(g.kickoff))}`}">
      ${prefix ? `<i>${prefix}</i>` : ""}<span class="cell__abbr">${esc(abbr)}</span>
      <span class="cell__name">${esc(teamName(abbr))}</span>
    </button>`;
  };

  // One middle column: the line before kickoff, the score over the line after,
  // always read favourite-first so it lines up with the columns either side.
  const sprText = g.spread == null ? "\u2014" : pk ? "PK" : `-${fmtPts(Math.abs(g.spread))}`;
  const favIsAway = favSide === "away";
  const scoreText = started && g.awayScore != null && g.homeScore != null
    ? (favIsAway ? `${g.awayScore}-${g.homeScore}` : `${g.homeScore}-${g.awayScore}`)
    : null;
  const midInner = scoreText
    ? `<b>${esc(scoreText)}</b><i>${esc(sprText)}</i>`
    : `<b class="mid__line">${esc(sprText)}</b>`;
  const midTitle = `${esc(SC.lineText(g))}${g.book ? ` \u00b7 ${esc(g.book)}` : ""}${live ? ` \u00b7 ${esc(g.clock || "live")}` : final ? " \u00b7 final" : ""}`;
  const spr = commish()
    ? `<button class="cell cell--mid" data-action="edit-line" data-game="${esc(g.id)}" title="${midTitle} \u2014 tap to edit">${midInner}</button>`
    : `<span class="cell cell--mid" title="${midTitle}">${midInner}</span>`;

  const picks = state.players.map((p) => {
    const t = tally[p.id];
    const side = t.sides[g.id];
    const grade = t.grades[g.id];
    const isDup = t.dup && (g.home === t.dup || g.away === t.dup);
    const auto = t.auto[g.id];
    const cls = ["cell", "cell--pick", grade ? `is-${grade}` : "", isDup ? "cell--isdup" : "",
                 auto ? "cell--auto" : "", p.id === pid ? "cell--self" : ""].join(" ");
    const why = isDup ? " (dup)" : auto ? ` — the favorite by default, ${esc(auto)} went to someone above them in the draft` : "";
    const title = `${esc(p.name)}${side ? `: ${esc(abbrOf(g, side))}${why}` : " — no pick"}`;
    return `<span class="${cls}" style="--c:${esc(p.color)}" title="${title}">${side ? esc(abbrOf(g, side)) : "·"}</span>`;
  }).join("");

  // The dup picker lives in the row. Only the week's eligible underdogs get one.
  const cand = dups.byTeam[dogAbbr];
  let dup;
  if (!cand) {
    dup = `<span class="cell cell--dup cell--dup-off">—</span>`;
  } else {
    const rank = ctx.myPrefs.indexOf(dogAbbr) + 1;   // 0 when unranked
    const owner = Object.entries(dups.assigned).find(([, t]) => t === dogAbbr)?.[0];
    const disabled = ctx.dupLocked || !pid || (started && !rank);
    const opts = [`<option value="0"${rank ? "" : " selected"}>—</option>`]
      .concat(Array.from({ length: ctx.pos }, (_, i) => i + 1).map((n) =>
        `<option value="${n}"${n === rank ? " selected" : ""}>${n}</option>`))
      .join("");
    const heldByOther = owner && owner !== pid;
    dup = `<span class="cell cell--dup ${rank ? "cell--dup-on" : ""} ${owner ? "cell--dup-taken" : ""}"
      style="--c:${owner ? esc(player(owner)?.color) : "var(--accent-lift)"}"
      title="${esc(dogAbbr)} +${fmtPts(cand.points)} dup${owner ? ` — ${esc(nameOf(owner))} has it` : ""}">
      ${heldByOther && !rank ? `<span class="cell__owner">${esc(player(owner)?.short || nameOf(owner).slice(0, 2))}</span>` : ""}
      <select data-action="dup-rank" data-team="${esc(dogAbbr)}" ${disabled ? "disabled" : ""} aria-label="Dup priority for ${esc(dogAbbr)}">${opts}</select>
    </span>`;
  }

  const menu = commish() ? `<button class="cell cell--menu" data-action="row-menu" data-game="${esc(g.id)}" aria-label="Game options">${icon("edit")}</button>` : "";
  const cls = ["grow", live ? "grow--live" : "", final ? "grow--final" : "", myDupHere ? "grow--mydup" : ""].join(" ");
  return `<div class="${cls}" style="--me-c:${esc(myColor)}" role="row">
    ${teamCell(favSide, favAbbr, false)}${spr}${teamCell(dogSide, dogAbbr, true)}${picks}${dup}${menu}
  </div>`;
}

function renderLms(state, week, lrow, games) {
  const pid = actor();
  const picks = state.weeks[week]?.lms || {};
  const rows = state.players.map((p) => {
    const team = picks[p.id];
    const res = lrow?.results[p.id] || "pending";
    const out = res === "out";
    const g = team ? games.find((x) => x.home === team || x.away === team) : null;
    const started = g ? SC.hasStarted(g) : false;
    const canEdit = p.id === pid && !out && (!started || commish());
    const badge = out ? `<span class="badge">Out</span>`
      : res === "safe" ? `<span class="badge badge--win">Safe</span>`
      : res === "busted" ? `<span class="badge badge--loss">Busted</span>`
      : res === "nopick" ? `<span class="badge badge--loss">No pick</span>`
      : res === "nogame" ? `<span class="badge badge--loss">Not playing</span>`
      : res === "reused" ? `<span class="badge badge--loss">Already used</span>`
      : team ? `<span class="badge">${g && g.status === "in" ? "Live" : "Locked in"}</span>` : `<span class="badge">Needs a pick</span>`;
    const pay = lrow?.payouts?.[p.id] ? `<span class="badge badge--money">${SC.money(lrow.payouts[p.id])}</span>` : "";
    const sub = g ? `${g.home === team ? `vs ${g.away}` : `@ ${g.home}`} · ${started && g.homeScore != null ? `${g.awayScore}-${g.homeScore}` : fmtKick(g.kickoff)}` : team ? "Not on this week's slate" : (canEdit ? "Tap to choose" : "");
    return `<div class="lmsrow ${out ? "lmsrow--out" : ""}" style="--c:${esc(p.color)}">${avatar(p.id, "avatar--lg")}
      <button class="lmsrow__pick" data-action="lms-open" ${canEdit ? "" : "disabled"}>${team ? `<img ${logoAttrs(team)}>` : ""}<div><div class="lmsrow__team">${team ? `${esc(team)} <span>to lose</span>` : esc(p.name)}</div><div class="lmsrow__sub">${esc(sub)}</div></div></button>
      <div style="display:grid;gap:4px;justify-items:end">${badge}${pay}</div></div>`;
  }).join("");
  return `<section class="section">
    <div class="section__head"><h2 class="section__title">Last man standing</h2><span class="section__sub">Round ${lrow?.round || 1} · weeks ${lrow?.roundStart || 1}–${lrow?.roundEnd || cfg.lmsRoundWeeks} · pot ${SC.money(lrow?.pot ?? SC.lmsWeekly(state, cfg))}</span></div>
    <div class="lms">${rows}</div>
  </section>`;
}

// ---- standings ----------------------------------------------------------------
function renderStandings(state) {
  const led = SC.ledger(state, cfg);
  const rec = SC.seasonRecords(state, cfg);
  const weeksPlayed = Object.keys(state.weeks || {}).map(Number).filter((w) => SC.weekGames(state, w).length);
  const ranked = [...state.players].sort((a, b) => led.totals[b.id].won - led.totals[a.id].won || rec[b.id].points - rec[a.id].points || rec[b.id].w - rec[a.id].w);
  const bestByWeek = {};
  for (const w of weeksPlayed) bestByWeek[w] = Math.max(...state.players.map((p) => rec[p.id].byWeek[w] ?? -Infinity));
  const maxPts = Math.max(1, ...state.players.flatMap((p) => Object.values(rec[p.id].byWeek).filter((v) => v != null)));

  const rows = ranked.map((p, i) => {
    const r = rec[p.id], t = led.totals[p.id];
    const pct = r.w + r.l ? ((r.w + 0.5 * r.p) / (r.w + r.l + r.p) * 100).toFixed(0) : "—";
    const spark = Array.from({ length: cfg.weeks }, (_, k) => k + 1).map((w) => {
      const v = r.byWeek[w];
      if (v == null) return `<i class="spark--none" title="Week ${w}"></i>`;
      const h = Math.max(6, Math.round((Math.max(v, 0) / maxPts) * 100));
      return `<i style="height:${h}%" class="${v === bestByWeek[w] ? "spark--best" : ""}" title="Week ${w}: ${fmtPts(v)}"></i>`;
    }).join("");
    return `<div class="row ${i === 0 && t.won > 0 ? "row--lead" : ""}" style="--c:${esc(p.color)}">
      <div class="row__rank">${i + 1}</div>${avatar(p.id, "avatar--lg")}
      <div class="row__name">${esc(p.name)}<small>${r.w}-${r.l}${r.p ? `-${r.p}` : ""} ATS · ${pct}%</small></div>
      <div class="stat stat--money"><div class="stat__v money">${SC.money(t.won)}</div><div class="stat__k">Won</div></div>
      <div class="stat"><div class="stat__v">${fmtPts(r.points)}</div><div class="stat__k">Points</div></div>
      <div class="stat stat--wide"><div class="stat__v">${t.weeklyWins}</div><div class="stat__k">Weeks</div></div>
      <div class="stat stat--wide"><div class="stat__v">${SC.money(t.lmsWon)}</div><div class="stat__k">LMS</div></div>
      <div class="spark">${spark}</div>
    </div>`;
  }).join("");

  const sheet = `<div class="grid"><table class="sheet"><thead><tr><th>Wk</th>${state.players.map((p) => `<th class="pname" style="--c:${esc(p.color)}">${esc(p.short || p.name)}</th>`).join("")}<th>Dups</th></tr></thead><tbody>
    ${Array.from({ length: cfg.weeks }, (_, k) => k + 1).map((w) => {
      const tally = state.weeks?.[w] ? SC.weekTally(state, w, cfg) : null;
      const dupTxt = tally ? state.players.map((p) => tally[p.id].dup ? `${esc(p.short || p.name)} ${esc(tally[p.id].dup)}${tally[p.id].dupGrade === "win" ? " ✓" : tally[p.id].dupGrade === "loss" ? " ✗" : ""}` : null).filter(Boolean).join(" · ") : "";
      return `<tr><td>${w}</td>${state.players.map((p) => {
        const v = rec[p.id].byWeek[w];
        const cls = v == null ? "dim" : v === bestByWeek[w] && state.players.filter((q) => rec[q.id].byWeek[w] === v).length === 1 ? "best" : "";
        return `<td class="${cls}">${v == null ? "·" : fmtPts(v)}</td>`;
      }).join("")}<td class="dim" style="text-align:left;font-size:11px">${dupTxt}</td></tr>`;
    }).join("")}
  </tbody><tfoot><tr><td>Total</td>${state.players.map((p) => `<td>${fmtPts(rec[p.id].points)}</td>`).join("")}<td></td></tr></tfoot></table></div>`;

  return `<section class="section" style="margin-top:6px"><div class="section__head"><h2 class="section__title">Standings</h2><span class="section__sub">Ranked by money, then ATS points.</span></div><div class="board">${rows}</div></section>
  <section class="section"><div class="section__head"><h2 class="section__title">Last man standing</h2><span class="section__sub">${SC.money(cfg.lmsPerPlayer ?? 1)} each every week, in or out · survivors split every ${cfg.lmsRoundWeeks}</span></div>
    ${renderLmsTracker(state, led)}</section>
  <section class="section"><div class="section__head"><h2 class="section__title">Week by week</h2><span class="section__sub">Points per week. Bold is the week's outright winner.</span></div>${sheet}</section>`;
}

// ---- money --------------------------------------------------------------------
function renderMoney(state) {
  const led = SC.ledger(state, cfg);
  const P = state.players;
  const tiles = P.map((p) => {
    const t = led.totals[p.id];
    return `<div class="mt" style="--c:${esc(p.color)}"><div class="mt__name">${avatar(p.id)}${esc(p.name)}</div><div class="mt__big">${SC.money(t.won)}</div>
      <div class="mt__sub"><span>In ${SC.money(t.buyIn)}</span> · <span class="${t.net >= 0 ? "pos" : "neg"}">${t.net >= 0 ? "+" : ""}${SC.money(t.net)}</span></div></div>`;
  }).join("");

  const weeklyRows = Object.values(led.weekly.rows).filter((r) => r.inPlay).map((r) => `<tr><td>${r.week}</td>${P.map((p) => {
    const v = r.payouts[p.id];
    return `<td class="${v ? "money" : r.rolled && r.winners.includes(p.id) ? "roll" : "dim"}">${v ? SC.money(v) : r.rolled && r.winners.includes(p.id) ? "tie" : r.pending ? "" : "·"}</td>`;
  }).join("")}<td class="dim">${r.pending ? "open" : r.rolled ? `rolls ${SC.money(r.total)}` : ""}</td></tr>`).join("");
  const weeklyTotals = P.map((p) => `<td>${SC.money(led.totals[p.id].weeklyWon)}</td>`).join("");


  const adj = (state.adjustments || []).map((a) => `<tr><td>${a.week || ""}</td><td style="text-align:left">${esc(nameOf(a.player))}</td><td class="${a.amount >= 0 ? "win" : "dim"}">${SC.money(a.amount)}</td><td style="text-align:left;color:var(--ink-soft)">${esc(a.note || "")}</td>${commish() ? `<td><button class="btn btn--ghost btn--sm btn--danger" data-action="adj-del" data-id="${esc(a.id)}">${icon("trash")}</button></td>` : ""}</tr>`).join("");

  return `<section class="section" style="margin-top:6px"><div class="section__head"><h2 class="section__title">Money</h2><span class="section__sub">Season buy-in ${SC.money(led.seasonBuyIn)} across the table · ${SC.money(led.seasonBuyIn / P.length)} each</span></div><div class="moneytiles">${tiles}</div></section>
  <section class="section"><div class="section__head"><h2 class="section__title">Weekly pot · ${SC.money(cfg.weeklyPot)}/wk</h2><span class="section__sub">Best ATS score. Ties roll over. Week ${cfg.weeks} splits.</span></div>
    <div class="grid"><table class="sheet"><thead><tr><th>Wk</th>${P.map((p) => `<th class="pname" style="--c:${esc(p.color)}">${esc(p.short || p.name)}</th>`).join("")}<th></th></tr></thead><tbody>${weeklyRows || `<tr><td colspan="${P.length + 2}" class="dim">Nothing settled yet.</td></tr>`}</tbody><tfoot><tr><td>Total</td>${weeklyTotals}<td>${SC.money(P.reduce((s, p) => s + led.totals[p.id].weeklyWon, 0))}</td></tr></tfoot></table></div></section>
  <section class="section"><div class="section__head"><h2 class="section__title">Adjustments</h2><span class="section__sub">Side action, corrections, whatever needs squaring.</span>${commish() ? `<button class="btn btn--sm btn--px" data-action="adj-add">${icon("plus")}Add</button>` : ""}</div>
    ${adj ? `<div class="grid"><table class="sheet"><thead><tr><th>Wk</th><th style="text-align:left">Who</th><th>Amt</th><th style="text-align:left">Note</th>${commish() ? "<th></th>" : ""}</tr></thead><tbody>${adj}</tbody></table></div>` : `<p class="mute" style="font-size:13px;margin:0">None.</p>`}</section>`;
}

/**
 * Last man standing, week by week. The point of the tracker is to answer three
 * things at a glance: what everyone picked, who it knocked out, and which teams
 * each player has spent in the current block.
 */
function renderLmsTracker(state, led) {
  const P = state.players;
  const now = currentWeek();
  const rows = Object.values(led.lms.rows).filter((r) => r.inPlay);
  if (!rows.length) {
    return `<p class="mute" style="font-size:13px;margin:0">Nothing picked yet. The tracker fills in as weeks are played.</p>`;
  }

  const byRound = new Map();
  for (const r of rows) {
    if (!byRound.has(r.round)) byRound.set(r.round, []);
    byRound.get(r.round).push(r);
  }

  const OUT = { busted: "their team won", nopick: "no pick", nogame: "team wasn't playing", reused: "already used this block" };
  const standing = (r) => r.aliveEntering.filter((id) => !r.eliminated.includes(id)).length;
  const blocks = [...byRound.entries()].map(([round, weeks]) => {
    const last = weeks[weeks.length - 1];
    // A block can pay out more than once: if the whole field busts early the pot
    // is settled there and the contest restarts for the rest of the four weeks.
    const paid = weeks.filter((r) => r.ended);
    let outcome;
    if (paid.length) {
      const parts = paid.map((r) => {
        const winners = Object.keys(r.payouts);
        const each = SC.money(r.payouts[winners[0]] || 0);
        const who = winners.length === 1
          ? `<b>${esc(nameOf(winners[0]))}</b> ${each}`
          : `${winners.map((id) => esc(nameOf(id))).join(" & ")} ${each} each`;
        return paid.length > 1 ? `wk ${r.week} ${who}` : who;
      });
      outcome = parts.join(" · ");
      // and the block may still be running after the last payout
      const after = weeks.filter((r) => r.week > paid[paid.length - 1].week);
      if (after.length) {
        outcome += ` · ${standing(after[after.length - 1])} still standing for ${SC.money(last.pot)}`;
      }
    } else if (weeks.every((r) => r.rolled || !r.complete)) {
      outcome = `nothing settled · ${SC.money(last.pot)} rolls on`;
    } else {
      outcome = `${standing(last)} still standing · ${SC.money(last.pot)} in the pot`;
    }
    const head = `<tr class="round"><td colspan="${P.length + 1}">Round ${round} · weeks ${last.roundStart}–${last.roundEnd} · ${outcome}</td></tr>`;

    const body = weeks.map((r) => {
      const cells = P.map((p) => {
        const res = r.results[p.id];
        const pick = r.picks[p.id];
        const paid = r.payouts[p.id];
        if (res === "out") return `<td class="lmst lmst--gone" title="${esc(nameOf(p.id))} was already out">out</td>`;
        // On a rolled week nothing was settled, so nobody is struck out.
        const knocked = r.rolled ? null : OUT[res];
        const cls = ["lmst", knocked ? "lmst--knocked" : "", !r.rolled && res === "safe" ? "lmst--safe" : "",
                     r.rolled ? "lmst--void" : "", paid ? "lmst--paid" : ""].join(" ");
        const why = r.rolled ? " — nothing settled, the pot rolled" : knocked ? ` — out, ${knocked}` : res === "safe" ? " — through" : "";
        const title = `${esc(nameOf(p.id))}: ${pick ? esc(pick) : "no pick"}${why}`;
        const label = pick ? esc(pick) : res === "nopick" ? `<span class="lmst__none">no pick</span>` : "—";
        return `<td class="${cls}" title="${title}">${label}${paid ? `<i>${SC.money(paid)}</i>` : ""}</td>`;
      }).join("");
      const flag = r.week === now ? `<i class="lmst__now">now</i>` : r.rolled ? `<i class="lmst__roll">rolled</i>` : "";
      return `<tr class="${r.rolled ? "lmst-rolled" : ""}"><td>${r.week}${flag ? ` ${flag}` : ""}</td>${cells}</tr>`;
    }).join("");
    return head + body;
  }).join("");

  const totals = P.map((p) => `<td>${SC.money(led.totals[p.id].lmsWon)}</td>`).join("");
  const rolled = rows.some((r) => r.rolled);
  return `<div class="grid"><table class="sheet sheet--lms">
      <thead><tr><th>Wk</th>${P.map((p) => `<th class="pname" style="--c:${esc(p.color)}">${esc(p.short || p.name)}</th>`).join("")}</tr></thead>
      <tbody>${blocks}</tbody>
      <tfoot><tr><td>Won</td>${totals}</tr></tfoot>
    </table></div>
    <p class="legend"><span class="legend__x">struck through</span> knocked out that week &middot; a column is the teams that player has spent in the block &middot; each team is good once per block${rolled ? " &middot; <b>rolled</b> means nobody made a live pick, so the pot carried and nobody went out" : ""}</p>`;
}

// ---- side bet -----------------------------------------------------------------
function renderSideBet(state) {
  const bet = SC.sideBet(state, cfg);
  const team = cfg.sideBet.team;
  const wk1 = SC.weekGames(state, 1);
  const locked = wk1.length > 0 && wk1.some(SC.hasStarted);
  const pid = actor();
  const rows = state.players.map((p) => {
    const pr = bet.predictions[p.id];
    const r = bet.ranked.find((x) => x.id === p.id);
    const canEdit = p.id === pid && (!locked || commish());
    const pay = bet.payouts[p.id];
    return `<div class="pred" style="--c:${esc(p.color)}">${avatar(p.id, "avatar--lg")}
      <div class="pred__big">${pr ? `${pr.wins}-${pr.losses ?? (17 - pr.wins)}${pr.points != null ? ` <span class="mute" style="font-size:11px">· ${pr.points} pts</span>` : ""}` : `<span class="mute">No guess</span>`}<small>${esc(p.name)}${r && bet.actual ? ` · off by ${r.winDiff} win${r.winDiff === 1 ? "" : "s"}` : ""}</small></div>
      <div style="display:grid;gap:4px;justify-items:end">${pay ? `<span class="badge badge--money">${SC.money(pay)}</span>` : bet.winners.includes(p.id) ? `<span class="badge badge--win">Winner</span>` : ""}${canEdit ? `<button class="btn btn--sm btn--px" data-action="bet-edit" data-id="${esc(p.id)}">${pr ? "Edit" : "Guess"}</button>` : ""}</div></div>`;
  }).join("");
  const a = bet.actual;
  return `<section class="section" style="margin-top:6px"><div class="section__head"><h2 class="section__title">${esc(cfg.sideBet.label)} · ${SC.money(cfg.sideBet.pot)}</h2><span class="section__sub">One guess before Week 1 kicks off. Closest record wins; points scored breaks ties.</span></div>
    <div class="cards">
      <div class="card" style="display:flex;gap:14px;align-items:center"><img ${logoAttrs(team)} style="width:56px;height:56px"><div><h4 style="margin:0 0 6px">${esc(TEAMS[team]?.city || "")} ${esc(teamName(team))} · actual</h4>
        <div class="pred__big" style="font-size:20px">${a ? `${a.w}-${a.l}${a.t ? `-${a.t}` : ""}` : "0-0"} <span class="mute" style="font-size:11px">· ${a?.pf ?? 0} pts · ${bet.derived?.played ?? 0} played</span></div>
        <div class="mute" style="font-size:12px;margin-top:6px">${bet.settled ? "Settled." : locked ? "Guesses locked. Updates as games go final." : "Guesses open until kickoff."}${commish() ? ` <button class="btn btn--ghost btn--sm" data-action="bet-actual">${icon("edit")}Override</button>` : ""}</div></div></div>
    </div>
    <div class="cards" style="margin-top:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${rows}</div></section>`;
}

// ---- settings -----------------------------------------------------------------
function renderSettings(state) {
  const sync = S.getSync();
  return `<section class="section" style="margin-top:6px"><div class="section__head"><h2 class="section__title">Setup</h2></div>
    <div class="cards">
      <div class="card"><h4>You</h4><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">${avatar(me(), "avatar--lg")}<b>${esc(nameOf(me()))}</b>${commish() ? `<span class="badge badge--accent">Commish</span>` : ""}</div>
        <div class="toolbar" style="margin:0"><button class="btn btn--sm btn--px" data-action="whoami">Switch player</button>${commish() ? `<button class="btn btn--sm btn--px" data-action="pick-as">Pick as…</button>` : ""}</div></div>
      <div class="card"><h4>Sync</h4>
        <p style="margin:0 0 10px;font-size:13px;color:var(--ink-soft)">${sync.enabled ? `Shared board via ${sync.via === "sheet" ? "a Google Sheet" : "Supabase"} · <b>${esc(sync.state)}</b>${sync.detail ? ` · ${esc(sync.detail)}` : ""}` : "This device only. Everyone's picks live here, like the sheet did. To put all four phones on one board, fill in the Supabase block in config.js (see README)."}</p>
        <div class="toolbar" style="margin:0">${sync.enabled ? `<button class="btn btn--sm btn--px" data-action="test-sync">Test the connection</button>` : ""}<button class="btn btn--sm btn--px" data-action="export">Export JSON</button><button class="btn btn--sm btn--px" data-action="import">Import JSON</button>${commish() ? `<button class="btn btn--sm btn--px btn--danger" data-action="reset">Reset season</button>` : ""}</div></div>
      <div class="card"><h4>Sources</h4><dl class="kv"><dt>Schedule & scores</dt><dd>ESPN</dd><dt>Lines</dt><dd>${cfg.oddsApiKey ? esc((cfg.oddsBooks || [])[0] || "the book") : "ESPN"}</dd><dt>Season</dt><dd>${cfg.season}</dd><dt>Week 1</dt><dd>${esc(cfg.week1Tuesday)}</dd></dl></div>
    </div></section>
  <section class="section"><div class="section__head"><h2 class="section__title">House rules</h2></div><div class="rules">
    <p><b>Picks.</b> Every game, against the spread the pool pulled. A cover is 1 point, a push is ½. Picks lock at kickoff. The line freezes for everyone as soon as anyone picks the game, or when the commissioner locks the week.</p>
    <p><b>Dups.</b> The week's big underdogs (${fmtPts(cfg.dup.minSpread)}+ points, never the ${esc(teamName(cfg.dup.exclude?.[0] || "CLE"))}, at least one per player) go up for a draft whose order rotates a seat every week: whoever picked first last week drops to last and everyone moves up. Position 1 ranks one team, position 2 ranks two, and so on; each player gets their highest-ranked team still available. Your dup is your pick in that game: +${cfg.dup.win} if it covers, ${cfg.dup.loss} if it doesn't. A team you ranked but lost to someone above you reconciles to the favorite, so the game is never left unpicked while you wait on the draft &mdash; tap the dog yourself if you want it anyway. The draft locks at the first kickoff among those games.</p>
    <p><b>Weekly pot.</b> ${SC.money(cfg.weeklyPot)} a week. Best score takes it. A tie rolls the whole pot into next week; week ${cfg.weeks} splits.</p>
    <p><b>Last man standing.</b> ${SC.money(cfg.lmsPerPlayer ?? 1)} from everyone, every week &mdash; <b>including the weeks you're already out</b>, which is what makes the pot worth chasing. That's ${SC.money(SC.lmsWeekly(state, cfg))} a week with ${state.players.length} playing. Name a team to lose; if it wins (or ties, or you forget), you're out for the round. Each team is good once per block. Rounds are ${cfg.lmsRoundWeeks} weeks and whoever is still standing at the end splits the pot. If every live pick busts in the same week, the players who actually picked split it and the field re-enters &mdash; a forfeit never shares. And if nobody picked at all, nothing is settled: the pot rolls into next week. The week-by-week tracker is on the Standings tab.</p>
    <p><b>${esc(cfg.sideBet.label)}.</b> ${SC.money(cfg.sideBet.pot)}. One guess at the ${esc(teamName(cfg.sideBet.team))}' final record before Week 1. Closest wins, points scored breaks ties.</p>
  </div></section>`;
}

// ---- modals -------------------------------------------------------------------
function whoModal() {
  const state = S.getState();
  openModal(`${modalHead("Who are you?")}<div class="gate__who">${state.players.map((p) => `<button class="who" style="--c:${esc(p.color)}" data-action="me" data-id="${esc(p.id)}">${avatar(p.id, "avatar--xl")}<b>${esc(p.name)}</b></button>`).join("")}</div>`);
}
function pickAsModal() {
  const state = S.getState();
  openModal(`${modalHead("Pick as")}<p class="mute" style="margin:0 0 12px;font-size:13px">Commissioner mode: enter picks for someone else.</p><div class="gate__who">${state.players.map((p) => `<button class="who" style="--c:${esc(p.color)}" data-action="pick-as-set" data-id="${esc(p.id)}">${avatar(p.id, "avatar--xl")}<b>${esc(p.name)}</b>${ui.pickingAs === p.id || (!ui.pickingAs && p.id === me()) ? `<small>current</small>` : ""}</button>`).join("")}</div>`);
}
function lmsModal() {
  const state = S.getState();
  const pid = actor();
  const games = SC.weekGames(state, ui.week);
  const current = state.weeks?.[ui.week]?.lms?.[pid];
  const lms = SC.lastManStanding(state, cfg).rows[ui.week];
  const used = SC.lmsUsed(state, cfg, ui.week, pid);
  const usedMap = Object.fromEntries(used.map((u) => [u.team, u.week]));

  // Biggest underdog first: the pick is a team to lose, so that is the order
  // you actually shop in. Teams without a line sit at the bottom.
  const teams = games
    .flatMap((g) => [{ abbr: g.away, g, opp: `@ ${g.home}` }, { abbr: g.home, g, opp: `vs ${g.away}` }])
    .map((t) => ({ ...t, spread: SC.ownSpread(t.g, t.abbr) }))
    .sort((a, b) => {
      if ((a.spread == null) !== (b.spread == null)) return a.spread == null ? 1 : -1;
      return (b.spread ?? 0) - (a.spread ?? 0) || a.abbr.localeCompare(b.abbr);
    });

  const usedStrip = used.length
    ? `<div class="usedstrip"><span class="usedstrip__k">Spent this round</span>
        ${used.map((u) => `<span class="usedchip">${esc(u.team)}<i>wk ${u.week}</i></span>`).join("")}</div>`
    : "";

  return openModal(`${modalHead("Pick a team to lose")}
    <p class="mute" style="margin:0 0 12px;font-size:13px">Round ${lms?.round || 1}${lms ? `, weeks ${lms.roundStart}&ndash;${lms.roundEnd}` : ""}. Biggest underdogs first &mdash; a big <span style="color:var(--accent-lift)">+number</span> is likeliest to lose. One team per round: once a week settles, that team is spent.</p>
    ${usedStrip}
    <div class="teamgrid">${teams.map((t) => {
      const spent = usedMap[t.abbr];
      const started = SC.hasStarted(t.g);
      const off = Boolean(spent) || (started && !commish());
      return `<button class="teamtile ${current === t.abbr ? "teamtile--on" : ""} ${spent ? "teamtile--spent" : ""}"
        style="--c:${teamColor(t.abbr)}" data-action="lms-pick" data-team="${esc(t.abbr)}" ${off ? "disabled" : ""}
        title="${esc(teamName(t.abbr))}${spent ? ` — used in week ${spent}` : started ? " — kicked off" : ""}">
        <img ${logoAttrs(t.abbr)}><b>${esc(t.abbr)}</b>
        <span class="teamtile__spr ${t.spread != null && t.spread > 0 ? "is-dog" : ""}">${t.spread == null ? "no line" : t.spread === 0 ? "PK" : SC.formatSpread(t.spread)}</span>
        <small>${spent ? `used wk ${spent}` : esc(t.opp)}</small>
      </button>`;
    }).join("")}</div>
    ${current ? `<div class="form__actions"><button type="button" class="btn btn--ghost btn--danger btn--sm" data-action="lms-pick" data-team="">Clear pick</button></div>` : ""}`, { wide: true });
}

function lineModal(gameId) {
  const g = gameById(ui.week, gameId);
  openModal(`${modalHead(`${g.away} @ ${g.home} · line`)}<form data-form="line" data-game="${g.id}">
    <div class="fields"><label class="field-row"><span>Favorite</span><select class="input" name="fav"><option value="home" ${g.spread == null || g.spread <= 0 ? "selected" : ""}>${esc(g.home)} (home)</option><option value="away" ${g.spread > 0 ? "selected" : ""}>${esc(g.away)} (away)</option></select></label>
    <label class="field-row"><span>Points</span><input class="input" name="pts" type="number" step="0.5" min="0" value="${g.spread == null ? "" : Math.abs(g.spread)}" placeholder="3.5" inputmode="decimal"></label></div>
    <p class="mute" style="font-size:12px;margin:10px 0 0">Setting a line by hand pins it; pulls won't overwrite it.</p>
    <div class="form__actions"><button type="button" class="btn btn--ghost btn--danger btn--sm" data-action="line-clear" data-game="${g.id}">Clear line</button><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Save line</button></div></form>`);
}
function scoreModal(gameId) {
  const g = gameById(ui.week, gameId);
  openModal(`${modalHead(`${g.away} @ ${g.home} · score`)}<form data-form="score" data-game="${g.id}">
    <div class="fields"><label class="field-row"><span>${esc(g.away)}</span><input class="input" name="away" type="number" min="0" inputmode="numeric" value="${g.awayScore ?? ""}"></label>
    <label class="field-row"><span>${esc(g.home)}</span><input class="input" name="home" type="number" min="0" inputmode="numeric" value="${g.homeScore ?? ""}"></label>
    <label class="field-row"><span>Status</span><select class="input" name="status"><option value="pre" ${g.status === "pre" ? "selected" : ""}>Not started</option><option value="in" ${g.status === "in" ? "selected" : ""}>In progress</option><option value="post" ${g.status === "post" ? "selected" : ""}>Final</option></select></label></div>
    <p class="mute" style="font-size:12px;margin:10px 0 0">Refreshing from ESPN will overwrite this once the feed catches up.</p>
    <div class="form__actions"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Save</button></div></form>`);
}
function addGameModal() {
  const opts = TEAM_LIST.map((t) => `<option value="${t}">${t} · ${esc(teamName(t))}</option>`).join("");
  openModal(`${modalHead(`Add game · week ${ui.week}`)}<form data-form="add-game">
    <div class="fields"><label class="field-row"><span>Away</span><select class="input" name="away" required><option value="">—</option>${opts}</select></label>
    <label class="field-row"><span>Home</span><select class="input" name="home" required><option value="">—</option>${opts}</select></label>
    <label class="field-row"><span>Kickoff</span><input class="input" name="kickoff" type="datetime-local" value="${toLocalInput()}" required></label>
    <label class="field-row"><span>Home spread</span><input class="input" name="spread" type="number" step="0.5" placeholder="-3.5" inputmode="decimal"></label></div>
    <div class="form__actions"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Add</button></div></form>`);
}
function betModal(pid) {
  const pr = S.getState().sideBet?.predictions?.[pid] || {};
  openModal(`${modalHead(`${nameOf(pid)} · ${cfg.sideBet.label}`)}<form data-form="bet" data-id="${esc(pid)}">
    <div class="fields"><label class="field-row"><span>Wins</span><input class="input" name="wins" type="number" min="0" max="17" inputmode="numeric" value="${pr.wins ?? ""}" required></label>
    <label class="field-row"><span>Losses</span><input class="input" name="losses" type="number" min="0" max="17" inputmode="numeric" value="${pr.losses ?? ""}"></label>
    <label class="field-row"><span>Points scored</span><input class="input" name="points" type="number" min="0" inputmode="numeric" value="${pr.points ?? ""}" placeholder="tiebreaker"></label></div>
    <div class="form__actions"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Lock it in</button></div></form>`);
}
function betActualModal() {
  const a = S.getState().sideBet?.actual || {};
  openModal(`${modalHead(`${cfg.sideBet.label} · actual`)}<form data-form="bet-actual">
    <p class="mute" style="margin:0 0 12px;font-size:13px">Normally computed from finals. Set it here to settle the bet by hand.</p>
    <div class="fields"><label class="field-row"><span>Wins</span><input class="input" name="w" type="number" min="0" value="${a.w ?? ""}"></label><label class="field-row"><span>Losses</span><input class="input" name="l" type="number" min="0" value="${a.l ?? ""}"></label><label class="field-row"><span>Ties</span><input class="input" name="t" type="number" min="0" value="${a.t ?? 0}"></label><label class="field-row"><span>Points</span><input class="input" name="pf" type="number" min="0" value="${a.pf ?? ""}"></label></div>
    <div class="form__actions"><button type="button" class="btn btn--ghost btn--danger btn--sm" data-action="bet-actual-clear">Back to automatic</button><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Save</button></div></form>`);
}
function adjModal() {
  const state = S.getState();
  openModal(`${modalHead("Adjustment")}<form data-form="adj">
    <div class="fields"><label class="field-row"><span>Who</span><select class="input" name="player">${state.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
    <label class="field-row"><span>Amount ($, negative to dock)</span><input class="input" name="amount" type="number" step="0.5" inputmode="decimal" required></label>
    <label class="field-row"><span>Week</span><input class="input" name="week" type="number" min="1" max="${cfg.weeks}" value="${ui.week}"></label></div>
    <label class="field-row" style="margin-top:12px"><span>Note</span><input class="input" name="note" type="text" placeholder="Side bet on the coin toss" style="font-family:var(--body)"></label>
    <div class="form__actions"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Add</button></div></form>`);
}
function importModal() {
  openModal(`${modalHead("Import JSON")}<form data-form="import"><p class="mute" style="margin:0 0 10px;font-size:13px">Paste an export. This replaces everything on this device${S.getSync().enabled ? " and the shared board" : ""}.</p>
    <textarea class="input" name="json" placeholder='{"v":1,...}' required></textarea>
    <div class="form__actions"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn btn--primary" type="submit">Import</button></div></form>`);
}

// ---- events -------------------------------------------------------------------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case "tab": ui.tab = el.dataset.tab; window.scrollTo({ top: 0 }); render(); break;
    case "week": ui.week = Number(el.dataset.week); render(); autoPull(ui.week); break;
    case "me": S.setMe(el.dataset.id); ui.pickingAs = null; closeModal(); render(); autoPull(ui.week); break;
    case "whoami": whoModal(); break;
    case "pick-as": pickAsModal(); break;
    case "pick-as-set": ui.pickingAs = el.dataset.id === me() ? null : el.dataset.id; closeModal(); render(); break;
    case "pick": setPick(el.dataset.game, el.dataset.side); break;
    case "row-menu": rowMenu(el.dataset.game); break;
    case "lms-open": lmsModal(); break;
    case "lms-pick": setLms(el.dataset.team || null); break;
    case "refresh": pullSlate(ui.week, { lines: !SC.weekGames(S.getState(), ui.week).length || ui.week === currentWeek() && SC.weekGames(S.getState(), ui.week).some((g) => g.spread == null && g.status === "pre") }); break;
    case "lock-lines": {
      const was = SC.linesLocked(S.getState(), ui.week, cfg);
      S.update((d) => { S.ensureWeek(d, ui.week).linesLocked = !was; });
      toast(was ? "Lines reopened" : "Lines locked for the week");
      break;
    }
    case "add-game": addGameModal(); break;
    case "edit-line": lineModal(el.dataset.game); break;   // also reached from the row menu
    case "edit-score": scoreModal(el.dataset.game); break;
    case "line-clear": S.update((d) => { const g = d.weeks[ui.week].games.find((x) => x.id === el.dataset.game); if (g) { g.spread = null; g.manualSpread = false; g.book = null; } }); closeModal(); break;
    case "del-game": if (confirm("Remove this game and everyone's picks on it?")) S.update((d) => { const wk = d.weeks[ui.week]; wk.games = wk.games.filter((g) => g.id !== el.dataset.game); for (const p of Object.values(wk.picks)) delete p[el.dataset.game]; }); break;
    case "bet-edit": betModal(el.dataset.id); break;
    case "bet-actual": betActualModal(); break;
    case "bet-actual-clear": S.update((d) => { d.sideBet.actual = null; }); closeModal(); break;
    case "adj-add": adjModal(); break;
    case "adj-del": S.update((d) => { d.adjustments = d.adjustments.filter((x) => x.id !== el.dataset.id); }); break;
    case "test-sync": testSync(); break;
    case "export": exportJson(); break;
    case "import": importModal(); break;
    case "reset": if (confirm("Wipe every pick, line and payout for this season? Export first if you want a copy.")) { S.resetState(); toast("Season reset"); } break;
    case "modal-close": closeModal(); break;
  }
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const num = (k) => { const v = f.get(k); return v === "" || v == null ? null : Number(v); };
  switch (form.dataset.form) {
    case "line": {
      const pts = num("pts");
      S.update((d) => { const g = d.weeks[ui.week].games.find((x) => x.id === form.dataset.game); if (!g) return false; g.spread = pts == null ? null : (f.get("fav") === "home" ? -Math.abs(pts) : Math.abs(pts)); g.manualSpread = true; g.book = "Commish"; });
      break;
    }
    case "score": {
      S.update((d) => { const g = d.weeks[ui.week].games.find((x) => x.id === form.dataset.game); if (!g) return false; g.awayScore = num("away"); g.homeScore = num("home"); g.status = f.get("status"); g.manualScore = true; });
      break;
    }
    case "add-game": {
      const away = f.get("away"), home = f.get("home");
      if (!away || !home || away === home) return toast("Pick two different teams", { bad: true });
      if (SC.weekGames(S.getState(), ui.week).some((g) => g.id === S.gameId({ away, home }))) return toast("That game is already on the slate", { bad: true });
      S.update((d) => { const wk = S.ensureWeek(d, ui.week); wk.games.push({ id: S.gameId({ away, home }), away, home, kickoff: new Date(f.get("kickoff")).toISOString(), spread: num("spread"), manualSpread: num("spread") != null, status: "pre", homeScore: null, awayScore: null, manual: true }); wk.games.sort((x, y) => new Date(x.kickoff) - new Date(y.kickoff)); });
      break;
    }
    case "bet": {
      const wins = num("wins");
      if (wins == null) return;
      S.update((d) => { d.sideBet.predictions[form.dataset.id] = { wins, losses: num("losses") ?? 17 - wins, points: num("points"), at: Date.now() }; });
      toast("Locked in");
      break;
    }
    case "bet-actual": {
      S.update((d) => { d.sideBet.actual = { w: num("w") || 0, l: num("l") || 0, t: num("t") || 0, pf: num("pf") }; });
      break;
    }
    case "adj": {
      S.update((d) => { d.adjustments.push({ id: S.newId("a"), player: f.get("player"), amount: num("amount") || 0, week: num("week"), note: f.get("note") || "", at: Date.now() }); });
      break;
    }
    case "import": {
      try { const obj = JSON.parse(f.get("json")); if (!obj || typeof obj !== "object" || !obj.weeks) throw new Error("not a pool export"); S.replaceState(obj); toast("Imported"); }
      catch (err) { return toast(`Import failed: ${err.message}`, { bad: true }); }
      break;
    }
  }
  closeModal();
});

document.addEventListener("change", (e) => {
  const el = e.target.closest('[data-action="dup-rank"]');
  if (!el) return;
  setDupRank(el.dataset.team, Number(el.value) || 0);
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalOpen()) closeModal(); });

async function testSync() {
  toast("Checking the shared board…");
  const r = await S.testSync();
  toast(r.ok ? r.detail : `Sync failed: ${r.detail}`, { bad: !r.ok, ms: 6000 });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(S.getState(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pickem-${cfg.season}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---- boot ---------------------------------------------------------------------
S.subscribe(() => render());
render();
S.initSync().then(() => { if (me()) autoPull(ui.week); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && ui.tab === "week" && SC.weekGames(S.getState(), ui.week).length) refreshScores(ui.week); });
