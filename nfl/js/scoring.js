// Pure functions. Everything the sheet used to compute by hand lives here:
// ATS grading, weekly pot with rollovers, Last Man Standing rounds, the side bet,
// and the season money ledger. No DOM, no storage.

export const WIN = 1;
export const PUSH = 0.5;

/** Which side is favored by the home-relative spread. */
export function favorite(game) {
  if (game.spread == null) return null;
  if (game.spread < 0) return "home";
  if (game.spread > 0) return "away";
  return null; // pick'em
}

/** Display string for a game's line, e.g. "NE -3" or "PK". */
export function lineText(game) {
  if (game.spread == null) return "no line";
  if (game.spread === 0) return "PK";
  const fav = game.spread < 0 ? game.home : game.away;
  return `${fav} ${formatSpread(-Math.abs(game.spread))}`;
}

export function formatSpread(n) {
  if (n == null) return "";
  const s = Math.abs(n) % 1 === 0 ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
  return (n < 0 ? "-" : "+") + s;
}

export function isFinal(game) {
  return game.status === "post" && game.homeScore != null && game.awayScore != null;
}

export function hasStarted(game, now = Date.now()) {
  if (game.status === "in" || game.status === "post") return true;
  return game.kickoff ? new Date(game.kickoff).getTime() <= now : false;
}

/** 'win' | 'loss' | 'push' | null (not final / no spread / no pick) */
export function gradePick(game, side) {
  if (!side || !isFinal(game) || game.spread == null) return null;
  const margin = game.homeScore - game.awayScore + game.spread; // >0 => home covers
  if (margin === 0) return "push";
  const homeCovers = margin > 0;
  if (side === "home") return homeCovers ? "win" : "loss";
  return homeCovers ? "loss" : "win";
}

export function pointsFor(grade) {
  if (grade === "win") return WIN;
  if (grade === "push") return PUSH;
  return 0;
}

/** Straight-up winner abbreviation, 'tie', or null when not final. */
export function straightUpWinner(game) {
  if (!isFinal(game)) return null;
  if (game.homeScore === game.awayScore) return "tie";
  return game.homeScore > game.awayScore ? game.home : game.away;
}

/**
 * When week N's lines freeze: that week's Tuesday at `lineLockHour` local.
 * Week 1's Tuesday comes from the config and every later week is seven days on.
 */
export function lineLockAt(week, cfg) {
  const at = new Date(`${cfg.week1Tuesday}T00:00:00`);
  if (Number.isNaN(at.getTime())) return null;
  at.setDate(at.getDate() + (week - 1) * 7);
  at.setHours(Number(cfg.lineLockHour ?? 12), 0, 0, 0);
  return at.getTime();
}

/**
 * Lines are frozen once that Tuesday passes. The commissioner can force it
 * either way for a week: `linesLocked` true locks early, false reopens.
 */
export function linesLocked(state, week, cfg, now = Date.now()) {
  const flag = state.weeks?.[week]?.linesLocked;
  if (flag === true) return true;
  if (flag === false) return false;
  const at = lineLockAt(week, cfg);
  return at != null && now >= at;
}

export function weekGames(state, week) {
  return state.weeks?.[week]?.games || [];
}

export function weekComplete(state, week) {
  const games = weekGames(state, week);
  return games.length > 0 && games.every(isFinal);
}

// ---- Dups ------------------------------------------------------------------
// Each week the big underdogs (spread >= minSpread, never the Browns, at least one
// per player) form the dup pool. Players draft one each in an order that rotates
// weekly, by submitting ranked choices: position 1 ranks one team, position 2
// ranks two, and so on, so nobody waits on anybody. Your dup forces your pick to that underdog and
// scores dup.win on a cover / dup.loss otherwise.

export function underdogOf(game) {
  if (game.spread == null || game.spread === 0) return null;
  return game.spread < 0 ? game.away : game.home;
}

export function dupCandidates(games, cfg, minCount) {
  const excl = new Set((cfg.dup?.exclude || []).map((t) => t.toUpperCase()));
  const dogs = games
    .filter((g) => g.spread != null && g.spread !== 0)
    .map((g) => ({ gameId: g.id, team: underdogOf(g), points: Math.abs(g.spread), game: g }))
    .filter((d) => !excl.has(d.team))
    .sort((a, b) => b.points - a.points || new Date(a.game.kickoff) - new Date(b.game.kickoff));
  const min = Number(cfg.dup?.minSpread) || 0;
  let pool = dogs.filter((d) => d.points >= min);
  if (pool.length < minCount) {
    const rest = dogs.filter((d) => d.points < min);
    const need = minCount - pool.length;
    const extra = rest.slice(0, need);
    // include anything tied with the last one we took, so the cutoff is fair
    const cutoff = extra.length ? extra[extra.length - 1].points : null;
    pool = pool.concat(cutoff == null ? extra : rest.filter((d) => d.points >= cutoff));
  }
  return pool;
}

/**
 * Draft order rotates one seat a week for the whole season: whoever picked
 * first last week drops to last and everyone else moves up. Week 1 uses
 * `dupOrderBase` from the config, or the roster order. Nothing overrides it.
 */
export function dupOrder(state, cfg, week) {
  const roster = state.players.map((p) => p.id);
  const configured = Array.isArray(cfg.dupOrderBase) ? cfg.dupOrderBase.filter((id) => roster.includes(id)) : [];
  // anyone missing from the configured base still gets a seat, at the back
  const base = configured.length ? [...configured, ...roster.filter((id) => !configured.includes(id))] : roster;
  const n = base.length;
  if (!n) return [];
  const shift = (((week - 1) % n) + n) % n;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

/** Resolve the dup draft: { order, candidates, assigned: {pid: team}, byTeam, prefs, lockAt } */
export function resolveDups(state, cfg, week) {
  const wk = state.weeks?.[week] || {};
  const games = wk.games || [];
  const order = dupOrder(state, cfg, week);
  const candidates = dupCandidates(games, cfg, state.players.length);
  const byTeam = Object.fromEntries(candidates.map((c) => [c.team, c]));
  const taken = new Set();
  const assigned = {};
  const prefs = {};
  order.forEach((pid, i) => {
    const list = (wk.dupPrefs?.[pid] || []).filter((t) => byTeam[t]).slice(0, i + 1);
    prefs[pid] = list;
    const hit = list.find((t) => !taken.has(t));
    if (hit) { assigned[pid] = hit; taken.add(hit); }
  });
  const lockAt = candidates.length ? Math.min(...candidates.map((c) => new Date(c.game.kickoff).getTime() || Infinity)) : null;
  return { order, candidates, assigned, byTeam, prefs, lockAt };
}

/** The side a player is effectively on for a game (dup overrides the stored pick). */
export function effectiveSide(game, storedSide, dupTeam) {
  if (dupTeam && (game.home === dupTeam || game.away === dupTeam)) return game.home === dupTeam ? "home" : "away";
  return storedSide || null;
}

/** Per-player ATS tally for a week: { points, w, l, p, picks, grades, sides, dup } */
export function weekTally(state, week, cfg = window.POOL_CONFIG) {
  const wk = state.weeks?.[week] || {};
  const games = wk.games || [];
  const dups = resolveDups(state, cfg, week);
  const out = {};
  for (const p of state.players) {
    const t = { points: 0, w: 0, l: 0, p: 0, picks: 0, grades: {}, sides: {}, dup: dups.assigned[p.id] || null, dupGrade: null };
    const picks = wk.picks?.[p.id] || {};
    for (const g of games) {
      const isDup = t.dup && (g.home === t.dup || g.away === t.dup);
      const side = effectiveSide(g, picks[g.id], t.dup);
      if (!side) continue;
      t.picks++;
      t.sides[g.id] = side;
      const grade = gradePick(g, side);
      t.grades[g.id] = grade;
      if (grade === "win") t.w++;
      else if (grade === "loss") t.l++;
      else if (grade === "push") t.p++;
      if (isDup) {
        t.dupGrade = grade;
        if (grade === "win") t.points += Number(cfg.dup?.win ?? 1.5);
        else if (grade === "loss") t.points += Number(cfg.dup?.loss ?? 0);
        else if (grade === "push") t.points += PUSH;
      } else {
        t.points += pointsFor(grade);
      }
    }
    out[p.id] = t;
  }
  return out;
}

/**
 * Weekly pot. Best record takes the pot; a tie rolls the pot into next week,
 * except in the final week where a tie splits. Returns per-week rows.
 */
export function weeklyPot(state, cfg) {
  const rows = {};
  let carry = 0;
  const pot = Number(cfg.weeklyPot) || 0;
  for (let w = 1; w <= cfg.weeks; w++) {
    // A week nobody has loaded yet, or one still being played, simply isn't
    // settled: it awards nothing and it does not roll. Earlier this loop stopped
    // at the first such week, which hid every later week's money.
    const inPlay = weekGames(state, w).length > 0;
    const complete = inPlay && weekComplete(state, w);
    const tally = weekTally(state, w, cfg);
    const row = {
      week: w, pot, carry, total: pot + carry, inPlay, complete,
      payouts: {}, winners: [], rolled: false, pending: !complete,
    };
    if (complete) {
      const played = state.players.filter((p) => tally[p.id].picks > 0);
      if (played.length) {
        const best = Math.max(...played.map((p) => tally[p.id].points));
        const winners = played.filter((p) => tally[p.id].points === best).map((p) => p.id);
        row.winners = winners;
        if (winners.length === 1 || w === cfg.weeks) {
          const each = Math.round(((pot + carry) / winners.length) * 100) / 100;
          winners.forEach((id) => (row.payouts[id] = each));
          carry = 0;
        } else {
          row.rolled = true;
          carry += pot;
        }
      } else {
        // Games were played but nobody picked; the pot just rolls.
        row.rolled = true;
        carry += pot;
      }
    }
    rows[w] = row;
  }
  return { rows, carry };
}

/**
 * What goes into the LMS pot each week: every player's stake, counted whether or
 * not they are still alive in the round. Older configs set a flat `lmsPot`.
 */
export function lmsWeekly(state, cfg) {
  if (cfg.lmsPerPlayer != null) return (Number(cfg.lmsPerPlayer) || 0) * state.players.length;
  return Number(cfg.lmsPot) || 0;
}

/**
 * Last Man Standing, loser-pick flavour: every week each live player names a team
 * to LOSE. If that team wins (or ties, or you forgot to pick) you're out for the
 * round. Rounds are fixed blocks of `lmsRoundWeeks` (4) weeks; the pot grows every
 * week and whoever is still standing at the end of the block splits it. If the
 * whole field busts before the block ends, the last ones standing take what has
 * accrued and everyone re-enters for the rest of the block.
 */
export function lastManStanding(state, cfg) {
  const all = state.players.map((p) => p.id);
  const potPerWeek = lmsWeekly(state, cfg);
  const roundLen = Number(cfg.lmsRoundWeeks) || 4;
  let alive = [...all];
  let pot = 0;
  let prevRound = 1;
  // Teams each player has already spent this block. One team per player per
  // block: burn the obvious dog in week 1 and you can't come back to it.
  let used = Object.fromEntries(all.map((id) => [id, []]));
  const rows = {};
  for (let w = 1; w <= cfg.weeks; w++) {
    const wk = state.weeks?.[w] || {};
    const games = wk.games || [];
    const round = Math.floor((w - 1) / roundLen) + 1;
    const roundStart = (round - 1) * roundLen + 1;
    const roundEnd = Math.min(round * roundLen, cfg.weeks);
    // Crossing into a new block resets the field and everyone's used teams,
    // even if the previous block's last week was never settled.
    if (round !== prevRound) {
      alive = [...all]; prevRound = round;
      used = Object.fromEntries(all.map((id) => [id, []]));
      // The pot deliberately is not cleared here: an unpaid rollover carries
      // into the next block rather than evaporating.
    }

    const inPlay = games.length > 0;
    const complete = inPlay && weekComplete(state, w);
    if (inPlay) pot += potPerWeek; // an unplayed week does not grow the pot

    const row = {
      week: w, round, roundStart, roundEnd, pot, inPlay, complete,
      aliveEntering: [...alive], picks: {}, results: {}, eliminated: [], payouts: {},
      used: Object.fromEntries(all.map((id) => [id, [...used[id]]])),
      ended: false, rolled: false, pending: !complete,
    };
    for (const id of all) {
      const team = wk.lms?.[id] || null;
      row.picks[id] = team;
      if (!alive.includes(id)) { row.results[id] = "out"; continue; }
      if (team && used[id].includes(team)) { row.results[id] = "reused"; continue; }
      const game = team ? games.find((g) => g.home === team || g.away === team) : null;
      if (!game) {
        row.results[id] = complete ? (team ? "nogame" : "nopick") : "pending";
        continue;
      }
      const winner = straightUpWinner(game);
      if (winner === null) row.results[id] = "pending";
      else if (winner === team || winner === "tie") row.results[id] = "busted"; // the team didn't lose
      else row.results[id] = "safe";
    }
    if (complete) {
      const survivors = alive.filter((id) => row.results[id] === "safe");
      // A team is spent only if the pick actually resolved. One that was never
      // live -- a team on a bye, or a repeat that was voided -- does not use up
      // your one shot at it.
      for (const id of alive) {
        const team = row.picks[id];
        const resolved = row.results[id] === "safe" || row.results[id] === "busted";
        if (team && resolved && !used[id].includes(team)) used[id].push(team);
      }
      row.eliminated = alive.filter((id) => row.results[id] !== "safe");
      if (survivors.length > 0) {
        if (w === roundEnd) {
          splitAmong(row.payouts, survivors, pot);
          row.ended = true;
        } else {
          alive = survivors;
        }
      } else {
        // Nobody's team lost. A forfeit does not share the pot: only players who
        // actually made a live pick and got beaten split it. If none of them
        // even picked, nothing is settled and the pot rolls into next week.
        const played = alive.filter((id) => row.results[id] === "busted");
        if (played.length) {
          splitAmong(row.payouts, played, pot);
          row.ended = true;
        } else {
          // Nothing happened this week: the pot carries and the field is intact,
          // so nobody is recorded as knocked out.
          row.rolled = true;
          row.eliminated = [];
        }
      }
      if (row.ended) { alive = [...all]; pot = 0; }
      // a rollover leaves alive and used untouched by design
    }
    rows[w] = row;
  }
  return { rows, alive, pot, used };
}

/**
 * Teams this player has already used in the block containing `week`, and so
 * cannot pick again until the block turns over.
 */
export function lmsUsed(state, cfg, week, pid) {
  const roundLen = Number(cfg.lmsRoundWeeks) || 4;
  const round = Math.floor((week - 1) / roundLen) + 1;
  const start = (round - 1) * roundLen + 1;
  const out = [];
  for (let w = start; w < week; w++) {
    const team = state.weeks?.[w]?.lms?.[pid];
    if (!team || out.some((u) => u.team === team)) continue;
    // Spent only if the pick actually resolved: the team was on that week's
    // slate and the game finished. Same rule the resolver applies.
    const game = weekGames(state, w).find((x) => x.home === team || x.away === team);
    if (game && isFinal(game)) out.push({ team, week: w });
  }
  return out;
}

/** A team's line from its own side: positive means it is getting points. */
export function ownSpread(game, abbr) {
  if (game.spread == null) return null;
  return abbr === game.home ? game.spread : -game.spread;
}

function splitAmong(payouts, ids, pot) {
  // Whole-dollar shares like the sheet did ($20 three ways = 7 / 7 / 6).
  const base = Math.floor(pot / ids.length);
  let remainder = Math.round(pot - base * ids.length);
  ids.forEach((id) => { payouts[id] = base + (remainder > 0 ? 1 : 0); remainder--; });
}

/** Season ATS record and per-week points for every player. */
export function seasonRecords(state, cfg) {
  const out = {};
  for (const p of state.players) out[p.id] = { w: 0, l: 0, p: 0, points: 0, byWeek: {}, weeklyWins: 0, lmsWins: 0 };
  for (let w = 1; w <= cfg.weeks; w++) {
    if (!state.weeks?.[w]) continue;
    const tally = weekTally(state, w, cfg);
    for (const p of state.players) {
      const t = tally[p.id];
      out[p.id].w += t.w; out[p.id].l += t.l; out[p.id].p += t.p; out[p.id].points += t.points;
      out[p.id].byWeek[w] = t.picks ? t.points : null;
    }
  }
  return out;
}

/** Actual record for the side-bet team from whatever weeks have been loaded. */
export function teamActual(state, cfg, team) {
  let w = 0, l = 0, t = 0, pf = 0, played = 0;
  for (let wk = 1; wk <= cfg.weeks; wk++) {
    for (const g of weekGames(state, wk)) {
      if (g.home !== team && g.away !== team || !isFinal(g)) continue;
      played++;
      const mine = g.home === team ? g.homeScore : g.awayScore;
      const theirs = g.home === team ? g.awayScore : g.homeScore;
      pf += mine;
      if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
    }
  }
  return { w, l, t, pf, played };
}

/** Side bet: closest predicted win total takes the pot; points scored breaks ties. */
export function sideBet(state, cfg) {
  const team = cfg.sideBet?.team;
  const predictions = state.sideBet?.predictions || {};
  const manual = state.sideBet?.actual;
  const derived = team ? teamActual(state, cfg, team) : null;
  const actual = manual || (derived && derived.played ? derived : null);
  const seasonDone = state.players.length > 0 && Array.from({ length: cfg.weeks }, (_, i) => i + 1).every((w) => weekComplete(state, w));
  const settled = Boolean(manual) || seasonDone;
  const result = { team, predictions, actual, derived, settled, payouts: {}, winners: [], ranked: [] };
  if (!actual) return result;
  const ranked = state.players
    .filter((p) => predictions[p.id] && predictions[p.id].wins != null)
    .map((p) => {
      const pr = predictions[p.id];
      return { id: p.id, winDiff: Math.abs(pr.wins - actual.w), ptsDiff: pr.points != null && actual.pf != null ? Math.abs(pr.points - actual.pf) : Infinity };
    })
    .sort((a, b) => a.winDiff - b.winDiff || a.ptsDiff - b.ptsDiff);
  result.ranked = ranked;
  if (ranked.length && settled) {
    const top = ranked[0];
    const winners = ranked.filter((r) => r.winDiff === top.winDiff && r.ptsDiff === top.ptsDiff).map((r) => r.id);
    result.winners = winners;
    splitAmong(result.payouts, winners, Number(cfg.sideBet.pot) || 0);
  }
  return result;
}

/** Everything the money tab needs. */
export function ledger(state, cfg) {
  const weekly = weeklyPot(state, cfg);
  const lms = lastManStanding(state, cfg);
  const bet = sideBet(state, cfg);
  const n = state.players.length || 1;
  const totals = {};
  for (const p of state.players) {
    let weeklyWon = 0, lmsWon = 0, weeklyWins = 0, lmsWins = 0;
    for (const row of Object.values(weekly.rows)) {
      if (row.payouts[p.id]) { weeklyWon += row.payouts[p.id]; weeklyWins++; }
    }
    for (const row of Object.values(lms.rows)) {
      if (row.payouts[p.id]) { lmsWon += row.payouts[p.id]; lmsWins++; }
    }
    const betWon = bet.payouts[p.id] || 0;
    const adjustments = (state.adjustments || []).filter((a) => a.player === p.id).reduce((s, a) => s + Number(a.amount || 0), 0);
    const won = weeklyWon + lmsWon + betWon + adjustments;
    const lmsStake = (cfg.lmsPerPlayer != null ? Number(cfg.lmsPerPlayer) || 0 : (Number(cfg.lmsPot) || 0) / n) * cfg.weeks;
    const buyIn = (Number(cfg.weeklyPot) || 0) / n * cfg.weeks + lmsStake + (Number(cfg.sideBet?.pot) || 0) / n;
    totals[p.id] = { weeklyWon, lmsWon, betWon, adjustments, won, buyIn, net: won - buyIn, weeklyWins, lmsWins };
  }
  const seasonBuyIn = ((Number(cfg.weeklyPot) || 0) + lmsWeekly(state, cfg)) * cfg.weeks + (Number(cfg.sideBet?.pot) || 0);
  return { weekly, lms, bet, totals, seasonBuyIn };
}

export function money(n) {
  if (n == null || Number.isNaN(n)) return "";
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = abs % 1 === 0 ? String(abs) : abs.toFixed(2);
  return (neg ? "-$" : "$") + s;
}
