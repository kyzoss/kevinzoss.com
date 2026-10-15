/* Backgammon rules engine and computer player. No DOM. State is plain JSON.
 *
 * Board: pts[0..23], positive = White (player 0), negative = Black (player 1).
 * White moves from high index to low (own point number = index + 1) and bears
 * off past index 0. Black moves from low index to high (own point number =
 * 24 - index) and bears off past index 23.
 * Moves are {from: index | "bar", to: index | "off", die, hit}.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BackgammonLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- PRNG (mulberry32), state kept in game state ----------
  function rngNext(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rollDie(s) { return Math.floor(rngNext(s) * 6) + 1; }

  // ---------- position helpers ----------
  function cnt(pts, p, i) { const v = pts[i]; return p === 0 ? (v > 0 ? v : 0) : (v < 0 ? -v : 0); }
  function sgn(p) { return p === 0 ? 1 : -1; }
  function pipOf(p, i) { return p === 0 ? i + 1 : 24 - i; }
  function idxFromPip(p, pip) { return p === 0 ? pip - 1 : 24 - pip; }
  function pointNo(p, i) { return pipOf(p, i); }
  function clonePos(pos) { return { pts: pos.pts.slice(), bar: pos.bar.slice(), off: pos.off.slice() }; }
  function posKey(pos) { return pos.pts.join(",") + "|" + pos.bar[0] + "," + pos.bar[1] + "|" + pos.off[0] + "," + pos.off[1]; }
  function posOf(s) { return { pts: s.pts, bar: s.bar, off: s.off }; }

  function initialPts() {
    const pts = new Array(24).fill(0);
    pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
    pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
    return pts;
  }

  function allHome(pos, p) {
    if (pos.bar[p] > 0) return false;
    for (let i = 0; i < 24; i++) if (cnt(pos.pts, p, i) > 0 && pipOf(p, i) > 6) return false;
    return true;
  }

  function movesForDie(pos, p, d) {
    const res = [];
    const o = 1 - p;
    if (pos.bar[p] > 0) {
      const to = idxFromPip(p, 25 - d);
      const oc = cnt(pos.pts, o, to);
      if (oc < 2) res.push({ from: "bar", to, die: d, hit: oc === 1 });
      return res;
    }
    const home = allHome(pos, p);
    let maxPip = 0;
    for (let i = 0; i < 24; i++) if (cnt(pos.pts, p, i) > 0) { const pp = pipOf(p, i); if (pp > maxPip) maxPip = pp; }
    for (let i = 0; i < 24; i++) {
      if (cnt(pos.pts, p, i) === 0) continue;
      const pip = pipOf(p, i);
      const np = pip - d;
      if (np >= 1) {
        const to = idxFromPip(p, np);
        const oc = cnt(pos.pts, o, to);
        if (oc < 2) res.push({ from: i, to, die: d, hit: oc === 1 });
      } else if (home && (np === 0 || pip === maxPip)) {
        res.push({ from: i, to: "off", die: d, hit: false });
      }
    }
    return res;
  }

  function applyMove(pos, p, m) {
    const o = 1 - p, sg = sgn(p);
    if (m.from === "bar") pos.bar[p]--; else pos.pts[m.from] -= sg;
    if (m.to === "off") { pos.off[p]++; return false; }
    let hit = false;
    if (cnt(pos.pts, o, m.to) === 1) { pos.pts[m.to] = 0; pos.bar[o]++; hit = true; }
    pos.pts[m.to] += sg;
    return hit;
  }

  function removeOne(arr, d) { const r = arr.slice(); const i = r.indexOf(d); if (i >= 0) r.splice(i, 1); return r; }
  function distinct(arr) { return arr.filter((v, i) => arr.indexOf(v) === i); }

  const memo = new Map();
  function maxPlayable(pos, p, dice) {
    if (dice.length === 0) return 0;
    const key = posKey(pos) + "#" + p + "#" + dice.slice().sort().join("");
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    outer: for (const d of distinct(dice)) {
      const rest = removeOne(dice, d);
      for (const m of movesForDie(pos, p, d)) {
        const np = clonePos(pos);
        applyMove(np, p, m);
        const v = 1 + maxPlayable(np, p, rest);
        if (v > best) best = v;
        if (best === dice.length) break outer;
      }
    }
    if (memo.size > 150000) memo.clear();
    memo.set(key, best);
    return best;
  }

  // ---------- game state ----------
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed === undefined || opts.seed === null || isNaN(opts.seed)) ? 1 : (Number(opts.seed) >>> 0);
    const matchTo = opts.matchTo > 1 ? opts.matchTo | 0 : 0;
    return {
      v: 1, seed, rng: seed,
      pts: initialPts(), bar: [0, 0], off: [0, 0],
      turn: 0, phase: "opening",
      dice: [], remaining: [], played: [], start: null, maxUse: 0, forceDie: null,
      opening: null,
      cube: { on: !!opts.cube, value: 1, owner: null },
      offer: null,
      match: matchTo ? {
        target: matchTo, score: (opts.scores || [0, 0]).slice(), crawfordRule: opts.crawford !== false,
        crawfordUsed: !!opts.crawfordUsed, winner: null
      } : null,
      crawfordGame: !!opts.crawfordGame,
      result: null, log: [], turnNo: 0, gameNo: opts.gameNo || 1
    };
  }

  // Build a custom position (own point numbers per colour) for tests and puzzles.
  function custom(o) {
    const s = newGame({ seed: o.seed === undefined ? 1 : o.seed, cube: o.cube, matchTo: o.matchTo, scores: o.scores, crawfordGame: o.crawfordGame });
    s.pts = new Array(24).fill(0);
    const w = o.white || {}, b = o.black || {};
    for (const k of Object.keys(w)) s.pts[Number(k) - 1] += w[k];
    for (const k of Object.keys(b)) s.pts[24 - Number(k)] -= b[k];
    s.bar = (o.bar || [0, 0]).slice();
    s.off = (o.off || [0, 0]).slice();
    s.turn = o.turn || 0;
    s.phase = "roll";
    if (o.cubeValue) s.cube.value = o.cubeValue;
    if (o.cubeOwner !== undefined) s.cube.owner = o.cubeOwner;
    if (o.dice) setDice(s, o.dice[0], o.dice[1]);
    return s;
  }

  function startTurn(s) {
    const p = s.turn;
    s.phase = "move";
    s.played = [];
    s.start = { pts: s.pts.slice(), bar: s.bar.slice(), off: s.off.slice() };
    s.maxUse = maxPlayable(posOf(s), p, s.remaining);
    s.forceDie = null;
    if (s.maxUse === 1 && s.dice[0] !== s.dice[1]) {
      const hi = Math.max(s.dice[0], s.dice[1]);
      s.forceDie = movesForDie(posOf(s), p, hi).length > 0 ? hi : Math.min(s.dice[0], s.dice[1]);
    }
    s.turnNo++;
  }

  function setDice(s, a, b) {
    s.dice = [a, b];
    s.remaining = a === b ? [a, a, a, a] : [a, b];
    startTurn(s);
  }

  // Roll the dice for the side to act. Returns {tie} for a tied opening roll.
  function roll(s) {
    if (s.phase === "opening") {
      const a = rollDie(s), b = rollDie(s);
      s.opening = { dice: [a, b] };
      if (a === b) { s.log.push({ p: -1, dice: [a, b], text: "Opening roll tied, roll again" }); return { tie: true }; }
      s.turn = a > b ? 0 : 1;
      s.log.push({ p: -1, dice: [a, b], text: "Opening roll: " + (a > b ? "White" : "Black") + " starts" });
      setDice(s, a, b);
      return { tie: false };
    }
    if (s.phase !== "roll") throw new Error("cannot roll in phase " + s.phase);
    const a = rollDie(s), b = rollDie(s);
    setDice(s, a, b);
    return { tie: false };
  }

  function legalMoves(s) {
    if (s.phase !== "move" || s.remaining.length === 0) return [];
    const p = s.turn;
    const needed = s.maxUse - s.played.length;
    if (needed <= 0) return [];
    const out = [];
    for (const d of distinct(s.remaining)) {
      if (s.forceDie !== null && s.played.length === 0 && d !== s.forceDie) continue;
      const rest = removeOne(s.remaining, d);
      for (const m of movesForDie(posOf(s), p, d)) {
        const np = clonePos(posOf(s));
        applyMove(np, p, m);
        if (1 + maxPlayable(np, p, rest) >= needed) out.push(m);
      }
    }
    return out;
  }

  function sameMove(a, b) { return a.from === b.from && a.to === b.to && a.die === b.die; }

  function move(s, m) {
    const legal = legalMoves(s).find((x) => sameMove(x, m));
    if (!legal) return false;
    const hit = applyMove(posOf(s), s.turn, legal);
    s.played.push({ from: legal.from, to: legal.to, die: legal.die, hit });
    s.remaining = removeOne(s.remaining, legal.die);
    if (s.off[s.turn] === 15) {
      logTurn(s);
      finishByBearoff(s);
    }
    return true;
  }

  function undo(s) {
    if (s.phase !== "move" || s.played.length === 0) return false;
    const moves = s.played.slice(0, -1);
    s.pts = s.start.pts.slice(); s.bar = s.start.bar.slice(); s.off = s.start.off.slice();
    s.remaining = s.dice[0] === s.dice[1] ? [s.dice[0], s.dice[0], s.dice[0], s.dice[0]] : s.dice.slice();
    s.played = [];
    for (const m of moves) {
      const hit = applyMove(posOf(s), s.turn, m);
      s.played.push({ from: m.from, to: m.to, die: m.die, hit });
      s.remaining = removeOne(s.remaining, m.die);
    }
    return true;
  }

  function canEnd(s) { return s.phase === "move" && legalMoves(s).length === 0; }

  function fmtPoint(p, x) { return x === "bar" ? "bar" : x === "off" ? "off" : String(pointNo(p, x)); }
  function notation(p, moves) {
    if (!moves.length) return "no legal move";
    const parts = [];
    for (const m of moves) {
      const t = fmtPoint(p, m.from) + "/" + fmtPoint(p, m.to) + (m.hit ? "*" : "");
      const last = parts[parts.length - 1];
      if (last && last.t === t) last.n++; else parts.push({ t, n: 1 });
    }
    return parts.map((x) => x.t + (x.n > 1 ? "(" + x.n + ")" : "")).join(" ");
  }

  function logTurn(s) {
    s.log.push({ p: s.turn, dice: s.dice.slice(), text: notation(s.turn, s.played) });
  }

  function endTurn(s) {
    if (!canEnd(s)) return false;
    logTurn(s);
    s.turn = 1 - s.turn;
    s.phase = "roll";
    s.remaining = []; s.played = []; s.start = null; s.maxUse = 0; s.forceDie = null;
    return true;
  }

  // ---------- scoring ----------
  function outcomeFor(s, w) {
    const o = 1 - w;
    if (s.off[o] > 0) return { mult: 1, kind: "single" };
    let bg = s.bar[o] > 0;
    if (!bg) {
      for (let i = 0; i < 24; i++) {
        if (cnt(s.pts, o, i) > 0 && pipOf(w, i) <= 6) { bg = true; break; } // in the winner's home board
      }
    }
    return bg ? { mult: 3, kind: "backgammon" } : { mult: 2, kind: "gammon" };
  }

  function finish(s, w, mult, kind) {
    const points = mult * s.cube.value;
    s.phase = "over";
    s.result = { winner: w, kind, mult, points, cube: s.cube.value, recorded: false };
    if (s.match) {
      s.match.score[w] += points;
      if (s.match.score[w] >= s.match.target) s.match.winner = w;
    }
    s.log.push({ p: -1, dice: [], text: (w === 0 ? "White" : "Black") + " wins " + points + (points === 1 ? " point" : " points") + (kind === "single" || kind === "pass" ? "" : " (" + kind + ")") });
  }
  function finishByBearoff(s) {
    const out = outcomeFor(s, s.turn);
    finish(s, s.turn, out.mult, out.kind);
  }

  // ---------- cube and match ----------
  // Cube rules: optional, starts centred at 1. The player on roll (before
  // rolling) may double if the cube is centred or theirs. The opponent takes
  // (cube doubles and moves to them) or passes (doubler wins the current cube
  // value, single game). No Jacoby rule, no beavers, cube capped at 64.
  // Optional Crawford rule in matches: the game after a player first reaches
  // target-1 is played with no doubling.
  function canDouble(s, p) {
    if (p === undefined) p = s.turn;
    if (!s.cube.on || s.crawfordGame || s.phase !== "roll" || s.turn !== p || s.offer) return false;
    if (s.cube.owner !== null && s.cube.owner !== p) return false;
    if (s.cube.value >= 64) return false;
    return true;
  }
  function offerDouble(s) {
    if (!canDouble(s)) return false;
    s.phase = "double";
    s.offer = { by: s.turn };
    s.log.push({ p: s.turn, dice: [], text: "Doubles to " + s.cube.value * 2 });
    return true;
  }
  function takeDouble(s) {
    if (s.phase !== "double") return false;
    const by = s.offer.by;
    s.cube.value *= 2;
    s.cube.owner = 1 - by;
    s.offer = null;
    s.phase = "roll";
    s.log.push({ p: 1 - by, dice: [], text: "Takes, cube at " + s.cube.value });
    return true;
  }
  function dropDouble(s) {
    if (s.phase !== "double") return false;
    const by = s.offer.by;
    s.offer = null;
    s.log.push({ p: 1 - by, dice: [], text: "Passes" });
    finish(s, by, 1, "pass");
    return true;
  }
  function nextGame(s) {
    if (s.phase !== "over" || !s.match || s.match.winner !== null) return null;
    const m = s.match;
    const tmp = { rng: s.rng };
    const seed = Math.floor(rngNext(tmp) * 4294967296) >>> 0;
    const nearing = m.score[0] === m.target - 1 || m.score[1] === m.target - 1;
    const crawfordGame = m.crawfordRule && !m.crawfordUsed && !s.crawfordGame && nearing;
    return newGame({
      seed, cube: s.cube.on, matchTo: m.target, scores: m.score, crawford: m.crawfordRule,
      crawfordUsed: m.crawfordUsed || crawfordGame, crawfordGame, gameNo: s.gameNo + 1
    });
  }

  // ---------- stats ----------
  function pipCount(pos, p) {
    let n = pos.bar[p] * 25;
    for (let i = 0; i < 24; i++) n += cnt(pos.pts, p, i) * pipOf(p, i);
    return n;
  }
  function hasContact(pos) {
    // White moves down, Black moves up: contact while a white checker is above a black one.
    if (pos.bar[0] > 0 || pos.bar[1] > 0) return true;
    let wMax = -1, bMin = 24;
    for (let i = 0; i < 24; i++) {
      if (pos.pts[i] > 0 && i > wMax) wMax = i;
      if (pos.pts[i] < 0 && i < bMin) bMin = i;
    }
    return wMax > bMin;
  }

  // ---------- turn generation ----------
  function generateTurns(pos, p, dice) {
    let frontier = [{ pos: clonePos(pos), rem: dice.slice(), moves: [] }];
    const finals = [];
    while (frontier.length) {
      const next = new Map();
      for (const node of frontier) {
        let any = false;
        for (const d of distinct(node.rem)) {
          for (const m of movesForDie(node.pos, p, d)) {
            any = true;
            const np = clonePos(node.pos);
            const hit = applyMove(np, p, m);
            const nn = { pos: np, rem: removeOne(node.rem, d), moves: node.moves.concat([{ from: m.from, to: m.to, die: d, hit }]) };
            const k = posKey(np) + "#" + nn.rem.slice().sort().join("");
            if (!next.has(k)) next.set(k, nn);
          }
        }
        if (!any) finals.push(node);
      }
      frontier = Array.from(next.values());
    }
    let max = 0;
    for (const f of finals) if (f.moves.length > max) max = f.moves.length;
    let list = finals.filter((f) => f.moves.length === max);
    if (max === 1 && dice[0] !== dice[1]) {
      const hi = Math.max(dice[0], dice[1]);
      const withHi = list.filter((f) => f.moves[0].die === hi);
      if (withHi.length) list = withHi;
    }
    const seen = new Set();
    const out = [];
    for (const f of list) {
      const k = posKey(f.pos);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ moves: f.moves, pos: f.pos });
    }
    return out;
  }

  // ---------- evaluation ----------
  // Value of a made point by the owner's own point number (index 1..24).
  const MADE = [0, 1, 2, 3, 5, 8, 6, 6, 4, 2, 1.5, 1, 1, 1.5, 0.5, 0.5, 0.5, 1, 4, 5, 7, 6, 4, 2, 2.5];
  const ROLLS = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

  // Probability (0..1) that the opponent of p hits a blot of p at absolute index v.
  function shotProb(pos, p, v) {
    const o = 1 - p;
    const dir = o === 0 ? -1 : 1; // opponent travel direction in index space
    const atts = [];
    if (pos.bar[o] > 0) atts.push(o === 0 ? 24 : -1);
    else {
      for (let i = 0; i < 24; i++) {
        if (cnt(pos.pts, o, i) > 0) {
          const dist = (v - i) * dir;
          if (dist >= 1 && dist <= 24) atts.push(i);
        }
      }
    }
    if (!atts.length) return 0;
    let tot = 0;
    for (const r of ROLLS) {
      const a = r[0], b = r[1];
      let hit = false;
      for (let k = 0; k < atts.length && !hit; k++) {
        const at = atts[k];
        const dist = (v - at) * dir;
        if (a === b) {
          if (dist % a === 0 && dist / a <= 4) {
            let ok = true;
            for (let j = 1; j < dist / a; j++) {
              if (cnt(pos.pts, p, at + dir * a * j) >= 2) { ok = false; break; }
            }
            hit = ok;
          }
        } else if (dist === a || dist === b) hit = true;
        else if (dist === a + b) {
          hit = cnt(pos.pts, p, at + dir * a) < 2 || cnt(pos.pts, p, at + dir * b) < 2;
        }
      }
      if (hit) tot += r[2];
    }
    return tot / 36;
  }

  function evaluate(pos, p) {
    const o = 1 - p;
    if (pos.off[p] === 15) return 1e6;
    const myPip = pipCount(pos, p), opPip = pipCount(pos, o);
    let score = opPip - myPip;
    const myC = new Array(26).fill(0), opC = new Array(26).fill(0);
    for (let i = 0; i < 24; i++) {
      myC[pipOf(p, i)] = cnt(pos.pts, p, i);
      opC[pipOf(o, i)] = cnt(pos.pts, o, i);
    }
    if (!hasContact(pos)) {
      score += 4 * pos.off[p] - 4 * pos.off[o];
      let hi = 0;
      for (let k = 1; k <= 24; k++) if (myC[k] > 0) hi = k;
      for (let k = 1; k < Math.min(hi, 7); k++) if (myC[k] === 0) score -= 1.2; // gaps waste pips
      for (let k = 7; k <= 24; k++) score -= 0.6 * myC[k];
      return score;
    }
    let opBoard = 0, myBoard = 0;
    for (let k = 1; k <= 6; k++) { if (opC[k] >= 2) opBoard++; if (myC[k] >= 2) myBoard++; }
    for (let k = 1; k <= 24; k++) {
      const c = myC[k];
      if (c >= 2) score += MADE[k];
      if (c > 3) score -= (c - 3) * 1.6;
      if (k >= 7 && k <= 11) score += 0.5 * Math.min(c, 2);
    }
    for (let i = 0; i < 24; i++) {
      if (cnt(pos.pts, p, i) === 1) {
        const prob = shotProb(pos, p, i);
        if (prob > 0) score -= prob * ((25 - pipOf(p, i)) + 9 + opBoard * 2.5);
      }
    }
    score -= pos.bar[p] * (14 + opBoard * 4);
    score += pos.bar[o] * (14 + myBoard * 4);
    let run = 0, best = 0;
    for (let k = 1; k <= 24; k++) { if (myC[k] >= 2) { run++; if (run > best) best = run; } else run = 0; }
    if (best >= 3) score += best * best * 1.2;
    run = 0;
    let obest = 0;
    for (let k = 1; k <= 24; k++) { if (opC[k] >= 2) { run++; if (run > obest) obest = run; } else run = 0; }
    let back = pos.bar[p] > 0;
    for (let k = 13; k <= 24; k++) if (myC[k] > 0) back = true;
    if (back && obest >= 3) score -= obest * obest * 1.0;
    return score;
  }

  function chooseTurn(s) {
    if (s.phase !== "move") return [];
    const cands = generateTurns(posOf(s), s.turn, s.remaining);
    if (!cands.length) return [];
    let best = null, bv = -Infinity;
    for (const c of cands) {
      const v = evaluate(c.pos, s.turn);
      if (v > bv) { bv = v; best = c; }
    }
    return best.moves.map((m) => ({ from: m.from, to: m.to, die: m.die }));
  }

  // Cube thresholds: races double at an 8% pip lead and pass above 12%.
  // Contact positions use the evaluation score (in pip-like units).
  function aiShouldDouble(s) {
    const p = s.turn;
    if (!canDouble(s, p)) return false;
    const pos = posOf(s);
    const myPip = pipCount(pos, p), opPip = pipCount(pos, 1 - p);
    const lead = (opPip - myPip) / Math.max(1, myPip);
    if (!hasContact(pos)) return lead >= 0.08;
    return lead >= 0.07 && evaluate(pos, p) >= 28;
  }
  function aiShouldTake(s) {
    if (s.phase !== "double") return false;
    const r = 1 - s.offer.by;
    const pos = posOf(s);
    const rPip = pipCount(pos, r), dPip = pipCount(pos, s.offer.by);
    if (!hasContact(pos)) return (rPip - dPip) / Math.max(1, dPip) < 0.12;
    return evaluate(pos, r) > -34;
  }

  function playMoves(s, moves) {
    for (const m of moves) if (!move(s, m)) return false;
    return true;
  }

  return {
    WHITE: 0, BLACK: 1,
    newGame, custom, roll, legalMoves, move, undo, canEnd, endTurn,
    canDouble, offerDouble, takeDouble, dropDouble, nextGame,
    movesForDie, maxPlayable, generateTurns, chooseTurn, evaluate, shotProb,
    aiShouldDouble, aiShouldTake, playMoves,
    pipCount, hasContact, outcomeFor, notation, pointNo, pipOf, cnt, allHome,
    posOf, clonePos, initialPts, rollDie, rngNext
  };
});
