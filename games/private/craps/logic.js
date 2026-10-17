// Craps rules engine. Pure logic: no DOM, no clock reads, all randomness from a
// seeded mulberry32 whose state lives inside the game state, so a state is plain
// JSON and the same seed always throws the same dice.
//
// Money model: placing a bet moves chips from the bankroll to the table. roll()
// resolves every bet and reports an itemized list of outcomes. Each outcome has
// `payout` (the net profit, negative on a loss) and `returned` (chips that moved
// from the table back to the rack, stake included when the bet comes down), so
// bankroll + chips on table === starting bankroll + sum of all payouts at all times.
//
// Bets are keyed by strings: "pass", "dontpass", "come" (the come box), "come:6"
// (a travelled come bet), "dontcome", "dontcome:6", "place:8", "buy:4", "lay:10",
// "hard:8", "field", "any7", "anycraps", "horn", "ce", "two", "three", "eleven",
// "twelve". Odds live on their parent bet as `odds` and are placed with the kinds
// "passodds", "dpodds", "comeodds" (number = the come point) and "dcodds".
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CrapsLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var POINTS = [4, 5, 6, 8, 9, 10];
  var HARD_NUMBERS = [4, 6, 8, 10];
  var TABLE_MIN = 5;
  var CHIPS = [1, 5, 25, 100, 500];
  var BANKROLLS = [500, 1000, 5000];
  var MAX_ODDS = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };   // 3-4-5x
  var MAX_LAY_ODDS = 6;                                      // lay to win 3-4-5x
  var ODDS_PAY = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
  var LAY_PAY = { 4: [1, 2], 10: [1, 2], 5: [2, 3], 9: [2, 3], 6: [5, 6], 8: [5, 6] };
  var PLACE_PAY = { 4: [9, 5], 10: [9, 5], 5: [7, 5], 9: [7, 5], 6: [7, 6], 8: [7, 6] };
  var HARD_PAY = { 4: 7, 10: 7, 6: 9, 8: 9 };
  var SINGLES = { two: { total: 2, pay: 30 }, three: { total: 3, pay: 15 }, eleven: { total: 11, pay: 15 }, twelve: { total: 12, pay: 30 } };
  var FIELD = { 2: 2, 3: 1, 4: 1, 9: 1, 10: 1, 11: 1, 12: 3 };
  var ANY7_PAY = 4, ANYCRAPS_PAY = 7;

  var FLAT_KINDS = ["pass", "dontpass", "come", "dontcome", "place", "buy", "lay"];
  var NUMBER_KINDS = { place: POINTS, buy: POINTS, lay: POINTS, hard: HARD_NUMBERS, comeodds: POINTS, dcodds: POINTS };
  var SIMPLE_KINDS = ["pass", "dontpass", "come", "dontcome", "field", "any7", "anycraps", "horn", "ce", "two", "three", "eleven", "twelve", "passodds", "dpodds"];
  var ODDS_KINDS = { passodds: "pass", dpodds: "dontpass", comeodds: "come", dcodds: "dontcome" };
  var KIND_NAMES = {
    pass: "Pass line", dontpass: "Don't pass", come: "Come", dontcome: "Don't come", place: "Place", buy: "Buy", lay: "Lay",
    hard: "Hard", field: "Field", any7: "Any seven", anycraps: "Any craps", horn: "Horn", ce: "C and E",
    two: "Aces (2)", three: "Ace-deuce (3)", eleven: "Yo (11)", twelve: "Boxcars (12)",
    passodds: "Pass odds", dpodds: "Don't pass lay odds", comeodds: "Come odds", dcodds: "Don't come lay odds"
  };

  // ---------------------------------------------------------------- rng

  function nextRand(st) {
    var a = (st.rng + 0x6d2b79f5) | 0;
    st.rng = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- helpers

  function isPoint(n) { return POINTS.indexOf(n) >= 0; }
  function isOddsKind(k) { return Object.prototype.hasOwnProperty.call(ODDS_KINDS, k); }
  function validKind(k) { return SIMPLE_KINDS.indexOf(k) >= 0 || Object.prototype.hasOwnProperty.call(NUMBER_KINDS, k); }
  function numberOk(kind, number) {
    if (NUMBER_KINDS[kind]) return NUMBER_KINDS[kind].indexOf(number) >= 0;
    return number === null || number === undefined;
  }
  function betKey(kind, number) {
    if (kind === "passodds") return "pass";
    if (kind === "dpodds") return "dontpass";
    if (kind === "comeodds") return "come:" + number;
    if (kind === "dcodds") return "dontcome:" + number;
    if ((kind === "come" || kind === "dontcome") && number !== null && number !== undefined) return kind + ":" + number;
    return NUMBER_KINDS[kind] ? kind + ":" + number : kind;
  }
  // The number whose odds table governs a bet: the point for line odds, else the bet's own number.
  function unitNumber(st, kind, number) {
    return kind === "passodds" || kind === "dpodds" ? st.point : number;
  }
  function parseKey(key) {
    var i = key.indexOf(":");
    if (i < 0) return { kind: key, number: null };
    return { kind: key.slice(0, i), number: +key.slice(i + 1) };
  }
  function describe(kind, number) {
    if (kind === "place" || kind === "buy" || kind === "lay" || kind === "hard") return KIND_NAMES[kind] + " " + number;
    if (kind === "come" || kind === "dontcome") return KIND_NAMES[kind] + (number ? " on " + number : "");
    if (kind === "comeodds" || kind === "dcodds") return KIND_NAMES[kind] + " on " + number;
    return KIND_NAMES[kind] || kind;
  }

  // Smallest unit a bet can be made in so every payout is a whole chip.
  function increment(kind, number) {
    var hi = number === 4 || number === 10, mid = number === 5 || number === 9;
    switch (kind) {
      case "place": return hi || mid ? 5 : 6;
      case "buy": return hi ? 1 : mid ? 2 : 5;
      case "lay": return hi ? 2 : mid ? 3 : 6;
      case "passodds": case "comeodds": return hi ? 1 : mid ? 2 : 5;
      case "dpodds": case "dcodds": return hi ? 2 : mid ? 3 : 6;
      case "horn": return 4;
      case "ce": return 2;
      default: return 1;
    }
  }
  function minBet(kind, number) {
    var inc = increment(kind, number);
    if (FLAT_KINDS.indexOf(kind) >= 0) return Math.ceil(TABLE_MIN / inc) * inc;
    return inc;
  }
  function incrementHint(kind, number) {
    var inc = increment(kind, number);
    if (inc === 1) return null;
    var why = "";
    if (kind === "place") why = number === 6 || number === 8 ? " so 7 to 6 pays in whole chips" : " so " + PLACE_PAY[number][0] + " to 5 pays in whole chips";
    else if (kind === "buy") why = " so " + ODDS_PAY[number][0] + " to " + ODDS_PAY[number][1] + " pays in whole chips";
    else if (kind === "lay" || kind === "dpodds" || kind === "dcodds") why = " so " + LAY_PAY[number][0] + " to " + LAY_PAY[number][1] + " pays in whole chips";
    else if (kind === "passodds" || kind === "comeodds") why = " so " + ODDS_PAY[number][0] + " to " + ODDS_PAY[number][1] + " pays in whole chips";
    else if (kind === "horn") why = " (one unit each on 2, 3, 11 and 12)";
    else if (kind === "ce") why = " (half on any craps, half on 11)";
    return describe(kind, number) + " goes in multiples of " + inc + why + ".";
  }

  function totalOnTable(st) {
    var t = 0;
    for (var k in st.bets) t += st.bets[k].amount + (st.bets[k].odds || 0);
    return t;
  }
  function betList(st) {
    var out = [];
    for (var k in st.bets) {
      var b = st.bets[k];
      out.push({ key: k, kind: b.kind, number: b.number, amount: b.amount, odds: b.odds || 0, label: describe(b.kind, b.number) });
    }
    return out;
  }

  // Maximum free odds behind a contract bet, in chips. null when no odds allowed yet.
  function maxOdds(st, kind, number) {
    if (!isOddsKind(kind)) return null;
    var key = betKey(kind, number), b = st.bets[key];
    if (!b) return null;
    var n = kind === "passodds" || kind === "dpodds" ? st.point : number;
    if (!isPoint(n)) return null;
    if (kind === "passodds" || kind === "comeodds") return b.amount * MAX_ODDS[n];
    return b.amount * MAX_LAY_ODDS;
  }

  // ---------------------------------------------------------------- setup

  function newGame(opts) {
    opts = opts || {};
    var bank = BANKROLLS.indexOf(opts.bankroll) >= 0 ? opts.bankroll : 1000;
    var seed = (opts.seed === undefined || opts.seed === null ? 1 : opts.seed) | 0;
    return {
      v: 1, seed: seed, rng: seed,
      startBankroll: bank, bankroll: bank, net: 0,
      point: null, workingOnComeOut: false,
      bets: {}, lastBets: [], lastRoll: null, history: [],
      stats: { rolls: 0, pointsMade: 0, sevenOuts: 0, biggestWin: 0, wagered: 0 }
    };
  }

  function validState(s) {
    try {
      if (!s || s.v !== 1 || typeof s.rng !== "number" || typeof s.bankroll !== "number" || s.bankroll < 0) return false;
      if (!(s.point === null || isPoint(s.point)) || typeof s.bets !== "object" || !s.stats) return false;
      for (var k in s.bets) {
        var b = s.bets[k];
        if (!validKind(b.kind) || typeof b.amount !== "number" || b.amount <= 0) return false;
        if (betKey(b.kind, b.number) !== k) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- betting

  function no(reason, code) { return { ok: false, reason: reason, code: code || "no" }; }

  function canBet(st, kind, number, amount) {
    if (number === undefined) number = null;
    if (!validKind(kind)) return no("Unknown bet.", "kind");
    if (!numberOk(kind, number)) return no("That number does not take a " + (KIND_NAMES[kind] || kind) + " bet.", "number");
    if (typeof amount !== "number" || amount !== Math.floor(amount) || amount <= 0) return no("Bet a whole number of chips.", "amount");
    if (amount > st.bankroll) return no("Not enough chips in your rack.", "bankroll");
    if ((kind === "pass" || kind === "dontpass") && st.point !== null) return no("Line bets go down before the come-out roll. The point is " + st.point + ".", "phase");
    if ((kind === "come" || kind === "dontcome") && st.point === null) return no("Come bets need a point. On the come-out roll, bet the Pass line.", "phase");
    var key = betKey(kind, number), b = st.bets[key], un = unitNumber(st, kind, number);
    var cur, inc = increment(kind, un), min = minBet(kind, un);
    if (isOddsKind(kind)) {
      if (!b) return no("Odds go behind a " + KIND_NAMES[ODDS_KINDS[kind]] + " bet. Place that first.", "parent");
      var mx = maxOdds(st, kind, number);
      if (mx === null) return no("Odds can be taken once the point is set.", "phase");
      cur = (b.odds || 0) + amount;
      if (cur > mx) return no("Max odds here are " + mx + " (" + (kind === "passodds" || kind === "comeodds" ? MAX_ODDS[kind === "passodds" ? st.point : number] + "x" : "lay 6x") + ").", "max");
    } else {
      cur = (b ? b.amount : 0) + amount;
    }
    if (cur % inc !== 0) return no(incrementHint(kind, un), "increment");
    if (cur < min) return no("Table minimum is " + min + " for " + describe(kind, number) + ".", "min");
    return { ok: true };
  }

  // Adjusts a tapped chip to the nearest legal amount: up to the next unit (or the table
  // minimum), or down to the odds max. Returns { amount, note } or { amount: 0, reason }.
  function fitBet(st, kind, number, amount) {
    if (number === undefined) number = null;
    var c = canBet(st, kind, number, amount);
    if (c.ok) return { amount: amount, note: "" };
    if (c.code !== "increment" && c.code !== "min" && c.code !== "max") return { amount: 0, reason: c.reason, code: c.code };
    var key = betKey(kind, number), b = st.bets[key], un = unitNumber(st, kind, number);
    var have = b ? (isOddsKind(kind) ? (b.odds || 0) : b.amount) : 0;
    var inc = increment(kind, un), min = minBet(kind, un);
    var want = Math.max(min, Math.ceil((have + amount) / inc) * inc);
    var mx = isOddsKind(kind) ? maxOdds(st, kind, number) : null;
    if (mx !== null && want > mx) want = Math.floor(mx / inc) * inc;
    var add = want - have;
    if (add <= 0) return { amount: 0, reason: c.reason, code: c.code };
    var c2 = canBet(st, kind, number, add);
    if (!c2.ok) return { amount: 0, reason: c2.code === "bankroll" ? describe(kind, number) + " needs " + add + " more to make " + want + ", and you only have " + st.bankroll + "." : c2.reason, code: c2.code };
    var note = c.code === "max" ? "Max odds here are " + mx + ", so " + add + " went down." : describe(kind, number) + " goes in units of " + inc + (min > inc ? " from " + min : "") + ", so " + add + " went down to make " + want + ".";
    return { amount: add, note: note };
  }

  function placeBet(st, kind, number, amount) {
    if (number === undefined) number = null;
    var c = canBet(st, kind, number, amount);
    if (!c.ok) return c;
    var key = betKey(kind, number);
    if (isOddsKind(kind)) {
      st.bets[key].odds = (st.bets[key].odds || 0) + amount;
    } else {
      var b = st.bets[key];
      if (b) b.amount += amount;
      else st.bets[key] = { kind: kind, number: number, amount: amount, odds: 0 };
    }
    st.bankroll -= amount;
    st.stats.wagered += amount;
    return { ok: true, key: key };
  }

  function canRemove(st, kind, number) {
    if (number === undefined) number = null;
    var key = betKey(kind, number), b = st.bets[key];
    if (!b) return no("No bet there.", "none");
    if (isOddsKind(kind)) return (b.odds || 0) > 0 ? { ok: true } : no("No odds there.", "none");
    if ((kind === "pass" || kind === "dontpass") && st.point !== null) return no(KIND_NAMES[kind] + " is a contract bet: it stays until the point is made or the shooter sevens out.", "locked");
    if ((kind === "come" || kind === "dontcome") && number !== null) return no(KIND_NAMES[kind] + " on " + number + " stays up until it wins or loses. You can take its odds down.", "locked");
    return { ok: true };
  }

  // Removes `amount` chips (all when omitted). The remainder must still be a valid bet.
  function removeBet(st, kind, number, amount) {
    if (number === undefined) number = null;
    var c = canRemove(st, kind, number);
    if (!c.ok) return c;
    var key = betKey(kind, number), b = st.bets[key], odds = isOddsKind(kind);
    var have = odds ? b.odds : b.amount;
    var take = amount === undefined || amount === null ? have : amount;
    if (typeof take !== "number" || take !== Math.floor(take) || take <= 0) return no("Take down a whole number of chips.", "amount");
    if (take > have) take = have;
    var rest = have - take, un = unitNumber(st, kind, number);
    if (rest > 0 && (rest % increment(kind, un) !== 0 || rest < minBet(kind, un))) return no("Taking " + take + " would leave an invalid " + describe(kind, number) + " bet. Take it all down instead.", "remainder");
    if (odds) b.odds = rest;
    else {
      b.amount = rest;
      if (rest === 0) {
        if (b.odds > 0) st.bankroll += b.odds; // flat gone, odds come back too
        delete st.bets[key];
      }
    }
    st.bankroll += take;
    st.stats.wagered -= take;
    return { ok: true, removed: take };
  }

  function clearBets(st) {
    var n = 0;
    var keys = Object.keys(st.bets);
    for (var i = 0; i < keys.length; i++) {
      var b = st.bets[keys[i]];
      if (b.odds > 0) { var ok = isOddsKind(oddsKindFor(b.kind)) && removeBet(st, oddsKindFor(b.kind), b.number).ok; if (ok) n++; }
      if (canRemove(st, b.kind, b.number).ok && removeBet(st, b.kind, b.number).ok) n++;
    }
    return n;
  }
  function oddsKindFor(kind) {
    return kind === "pass" ? "passodds" : kind === "dontpass" ? "dpodds" : kind === "come" ? "comeodds" : kind === "dontcome" ? "dcodds" : null;
  }

  function toggleWorking(st) { st.workingOnComeOut = !st.workingOnComeOut; return st.workingOnComeOut; }

  function canRoll(st) {
    if (Object.keys(st.bets).length === 0) return no(st.bankroll === 0 ? "Out of chips. Reset your bankroll to keep playing." : "Put a bet on the table first.", "nobets");
    return { ok: true };
  }

  // ---------------------------------------------------------------- rolling

  function pay(st, out, o) {
    st.bankroll += o.returned;
    st.net += o.payout;
    out.push(o);
  }
  function outcome(key, b, kind, result, payout, returned, note) {
    return { key: key, kind: kind || b.kind, number: b.number, amount: isOddsKind(kind) ? b.odds : b.amount,
      label: describe(kind || b.kind, b.number), result: result, payout: payout, returned: returned, note: note || "" };
  }
  function winTo(pair, stake) { return Math.round(stake * pair[0] / pair[1]); }
  function vigOn(amount) { return Math.max(1, Math.round(amount * 0.05)); }

  function roll(st) {
    var c = canRoll(st);
    if (!c.ok) return null;
    var d1 = 1 + Math.floor(nextRand(st) * 6), d2 = 1 + Math.floor(nextRand(st) * 6), total = d1 + d2;
    var hard = d1 === d2;
    var cameOut = st.point === null, point = st.point;
    var working = !cameOut || st.workingOnComeOut;
    var out = [], bets = st.bets, b, key, k, i;

    st.lastBets = snapshotBets(st);

    // single-roll propositions
    if (bets.field) {
      b = bets.field;
      if (FIELD[total]) pay(st, out, outcome("field", b, "field", "win", b.amount * FIELD[total], b.amount * (1 + FIELD[total]), total === 2 ? "pays double" : total === 12 ? "pays triple" : ""));
      else pay(st, out, outcome("field", b, "field", "lose", -b.amount, 0));
      delete bets.field;
    }
    if (bets.any7) {
      b = bets.any7;
      if (total === 7) pay(st, out, outcome("any7", b, "any7", "win", b.amount * ANY7_PAY, b.amount * (1 + ANY7_PAY)));
      else pay(st, out, outcome("any7", b, "any7", "lose", -b.amount, 0));
      delete bets.any7;
    }
    if (bets.anycraps) {
      b = bets.anycraps;
      if (total === 2 || total === 3 || total === 12) pay(st, out, outcome("anycraps", b, "anycraps", "win", b.amount * ANYCRAPS_PAY, b.amount * (1 + ANYCRAPS_PAY)));
      else pay(st, out, outcome("anycraps", b, "anycraps", "lose", -b.amount, 0));
      delete bets.anycraps;
    }
    for (k in SINGLES) {
      if (!bets[k]) continue;
      b = bets[k];
      if (total === SINGLES[k].total) pay(st, out, outcome(k, b, k, "win", b.amount * SINGLES[k].pay, b.amount * (1 + SINGLES[k].pay)));
      else pay(st, out, outcome(k, b, k, "lose", -b.amount, 0));
      delete bets[k];
    }
    if (bets.horn) {
      b = bets.horn;
      var u = b.amount / 4;
      var hp = total === 2 || total === 12 ? 30 : total === 3 || total === 11 ? 15 : 0;
      if (hp) pay(st, out, outcome("horn", b, "horn", "win", u * hp - 3 * u, u * hp + u, "the " + total + " pays " + hp + " to 1 on one unit, three units lose"));
      else pay(st, out, outcome("horn", b, "horn", "lose", -b.amount, 0));
      delete bets.horn;
    }
    if (bets.ce) {
      b = bets.ce;
      var h = b.amount / 2;
      if (total === 2 || total === 3 || total === 12) pay(st, out, outcome("ce", b, "ce", "win", h * 7 - h, h * 8, "craps half pays 7 to 1, the 11 half loses"));
      else if (total === 11) pay(st, out, outcome("ce", b, "ce", "win", h * 15 - h, h * 16, "11 half pays 15 to 1, the craps half loses"));
      else pay(st, out, outcome("ce", b, "ce", "lose", -b.amount, 0));
      delete bets.ce;
    }

    // hardways: win on the pair, lose on seven or the easy way, otherwise stay up
    for (i = 0; i < HARD_NUMBERS.length; i++) {
      key = "hard:" + HARD_NUMBERS[i]; b = bets[key];
      if (!b) continue;
      if (total === b.number && hard) pay(st, out, outcome(key, b, "hard", "win", b.amount * HARD_PAY[b.number], b.amount * HARD_PAY[b.number], "stays up"));
      else if (total === 7 || total === b.number) { pay(st, out, outcome(key, b, "hard", "lose", -b.amount, 0, total === 7 ? "" : "easy " + total)); delete bets[key]; }
    }

    // place, buy, lay
    for (i = 0; i < POINTS.length; i++) {
      var n = POINTS[i];
      key = "place:" + n; b = bets[key];
      if (b && working) {
        if (total === n) pay(st, out, outcome(key, b, "place", "win", winTo(PLACE_PAY[n], b.amount), winTo(PLACE_PAY[n], b.amount), "stays up"));
        else if (total === 7) { pay(st, out, outcome(key, b, "place", "lose", -b.amount, 0)); delete bets[key]; }
      } else if (b && !working && (total === n || total === 7)) {
        pay(st, out, outcome(key, b, "place", "push", 0, 0, "off on the come-out"));
      }
      key = "buy:" + n; b = bets[key];
      if (b && working) {
        if (total === n) { var bw = winTo(ODDS_PAY[n], b.amount), bv = vigOn(b.amount); pay(st, out, outcome(key, b, "buy", "win", bw - bv, bw - bv, "true odds less " + bv + " vig, stays up")); }
        else if (total === 7) { pay(st, out, outcome(key, b, "buy", "lose", -b.amount, 0)); delete bets[key]; }
      } else if (b && !working && (total === n || total === 7)) {
        pay(st, out, outcome(key, b, "buy", "push", 0, 0, "off on the come-out"));
      }
      key = "lay:" + n; b = bets[key];
      if (b) {
        if (total === 7) { var lw = winTo(LAY_PAY[n], b.amount), lv = vigOn(lw); pay(st, out, outcome(key, b, "lay", "win", lw - lv, b.amount + lw - lv, "true odds less " + lv + " vig")); delete bets[key]; }
        else if (total === n) { pay(st, out, outcome(key, b, "lay", "lose", -b.amount, 0)); delete bets[key]; }
      }
    }

    // travelled come and don't come bets
    for (i = 0; i < POINTS.length; i++) {
      key = "come:" + POINTS[i]; b = bets[key];
      if (b) {
        if (total === b.number) {
          pay(st, out, outcome(key, b, "come", "win", b.amount, 2 * b.amount));
          if (b.odds > 0) {
            if (working) pay(st, out, outcome(key, b, "comeodds", "win", winTo(ODDS_PAY[b.number], b.odds), b.odds + winTo(ODDS_PAY[b.number], b.odds)));
            else pay(st, out, outcome(key, b, "comeodds", "push", 0, b.odds, "odds off on the come-out, returned"));
          }
          delete bets[key];
        } else if (total === 7) {
          pay(st, out, outcome(key, b, "come", "lose", -b.amount, 0));
          if (b.odds > 0) {
            if (working) pay(st, out, outcome(key, b, "comeodds", "lose", -b.odds, 0));
            else pay(st, out, outcome(key, b, "comeodds", "push", 0, b.odds, "odds off on the come-out, returned"));
          }
          delete bets[key];
        }
      }
      key = "dontcome:" + POINTS[i]; b = bets[key];
      if (b) {
        if (total === 7) {
          pay(st, out, outcome(key, b, "dontcome", "win", b.amount, 2 * b.amount));
          if (b.odds > 0) pay(st, out, outcome(key, b, "dcodds", "win", winTo(LAY_PAY[b.number], b.odds), b.odds + winTo(LAY_PAY[b.number], b.odds)));
          delete bets[key];
        } else if (total === b.number) {
          pay(st, out, outcome(key, b, "dontcome", "lose", -b.amount, 0));
          if (b.odds > 0) pay(st, out, outcome(key, b, "dcodds", "lose", -b.odds, 0));
          delete bets[key];
        }
      }
    }

    // come box
    if (bets.come) {
      b = bets.come;
      if (total === 7 || total === 11) { pay(st, out, outcome("come", b, "come", "win", b.amount, 2 * b.amount, "natural")); delete bets.come; }
      else if (total === 2 || total === 3 || total === 12) { pay(st, out, outcome("come", b, "come", "lose", -b.amount, 0, "craps")); delete bets.come; }
      else {
        delete bets.come;
        bets["come:" + total] = { kind: "come", number: total, amount: b.amount, odds: 0 };
        out.push({ key: "come:" + total, kind: "come", number: total, amount: b.amount, label: "Come", result: "travel", payout: 0, returned: 0, note: "moves to the " + total });
      }
    }
    if (bets.dontcome) {
      b = bets.dontcome;
      if (total === 2 || total === 3) { pay(st, out, outcome("dontcome", b, "dontcome", "win", b.amount, 2 * b.amount)); delete bets.dontcome; }
      else if (total === 7 || total === 11) { pay(st, out, outcome("dontcome", b, "dontcome", "lose", -b.amount, 0)); delete bets.dontcome; }
      else if (total === 12) pay(st, out, outcome("dontcome", b, "dontcome", "push", 0, 0, "bar 12"));
      else {
        delete bets.dontcome;
        bets["dontcome:" + total] = { kind: "dontcome", number: total, amount: b.amount, odds: 0 };
        out.push({ key: "dontcome:" + total, kind: "dontcome", number: total, amount: b.amount, label: "Don't come", result: "travel", payout: 0, returned: 0, note: "moves behind the " + total });
      }
    }

    // the line
    var decision = null;
    if (cameOut) {
      if (bets.pass) {
        b = bets.pass;
        if (total === 7 || total === 11) { pay(st, out, outcome("pass", b, "pass", "win", b.amount, 2 * b.amount, "natural")); delete bets.pass; }
        else if (total === 2 || total === 3 || total === 12) { pay(st, out, outcome("pass", b, "pass", "lose", -b.amount, 0, "craps")); delete bets.pass; }
      }
      if (bets.dontpass) {
        b = bets.dontpass;
        if (total === 2 || total === 3) { pay(st, out, outcome("dontpass", b, "dontpass", "win", b.amount, 2 * b.amount)); delete bets.dontpass; }
        else if (total === 7 || total === 11) { pay(st, out, outcome("dontpass", b, "dontpass", "lose", -b.amount, 0)); delete bets.dontpass; }
        else if (total === 12) pay(st, out, outcome("dontpass", b, "dontpass", "push", 0, 0, "bar 12"));
      }
      if (isPoint(total)) { st.point = total; decision = "point"; }
      else decision = total === 7 || total === 11 ? "natural" : "craps";
    } else if (total === point || total === 7) {
      var made = total === point;
      if (bets.pass) {
        b = bets.pass;
        if (made) {
          pay(st, out, outcome("pass", b, "pass", "win", b.amount, 2 * b.amount, "point made"));
          if (b.odds > 0) pay(st, out, outcome("pass", b, "passodds", "win", winTo(ODDS_PAY[point], b.odds), b.odds + winTo(ODDS_PAY[point], b.odds)));
        } else {
          pay(st, out, outcome("pass", b, "pass", "lose", -b.amount, 0, "seven out"));
          if (b.odds > 0) pay(st, out, outcome("pass", b, "passodds", "lose", -b.odds, 0));
        }
        delete bets.pass;
      }
      if (bets.dontpass) {
        b = bets.dontpass;
        if (made) {
          pay(st, out, outcome("dontpass", b, "dontpass", "lose", -b.amount, 0, "point made"));
          if (b.odds > 0) pay(st, out, outcome("dontpass", b, "dpodds", "lose", -b.odds, 0));
        } else {
          pay(st, out, outcome("dontpass", b, "dontpass", "win", b.amount, 2 * b.amount, "seven out"));
          if (b.odds > 0) pay(st, out, outcome("dontpass", b, "dpodds", "win", winTo(LAY_PAY[point], b.odds), b.odds + winTo(LAY_PAY[point], b.odds)));
        }
        delete bets.dontpass;
      }
      st.point = null;
      if (made) { st.stats.pointsMade++; decision = "made"; }
      else { st.stats.sevenOuts++; decision = "sevenout"; }
    } else decision = "none";

    var rollNet = 0;
    for (i = 0; i < out.length; i++) rollNet += out[i].payout;
    if (rollNet > st.stats.biggestWin) st.stats.biggestWin = rollNet;
    st.stats.rolls++;
    st.lastRoll = { d1: d1, d2: d2, total: total, hard: hard, cameOut: cameOut, point: point, decision: decision, net: rollNet, outcomes: out };
    st.history.push(total);
    if (st.history.length > 14) st.history.shift();
    return st.lastRoll;
  }

  // ---------------------------------------------------------------- repeat

  function snapshotBets(st) {
    var list = [];
    for (var k in st.bets) {
      var b = st.bets[k];
      if ((b.kind === "come" || b.kind === "dontcome") && b.number !== null) continue; // cannot be re-placed directly
      list.push({ kind: b.kind, number: b.number, amount: b.amount });
    }
    return list;
  }
  function repeatable(st) {
    var out = [];
    for (var i = 0; i < st.lastBets.length; i++) {
      var r = st.lastBets[i];
      if (st.bets[betKey(r.kind, r.number)]) continue;
      if (canBet(st, r.kind, r.number, r.amount).ok) out.push(r);
    }
    return out;
  }
  function repeatBets(st) {
    var list = repeatable(st), n = 0;
    for (var i = 0; i < list.length; i++) if (placeBet(st, list[i].kind, list[i].number, list[i].amount).ok) n++;
    return n;
  }

  // ---------------------------------------------------------------- reference

  function payoutTable() {
    return [
      { bet: "Pass line / Come", pays: "1 to 1", note: "Win on 7 or 11 on the come-out, lose on 2, 3, 12. Otherwise the point must repeat before a 7." },
      { bet: "Don't pass / Don't come", pays: "1 to 1", note: "Win on 2 or 3, lose on 7 or 11, 12 is a push (bar 12). Then a 7 before the point wins." },
      { bet: "Free odds (pass, come)", pays: "2 to 1 on 4 and 10, 3 to 2 on 5 and 9, 6 to 5 on 6 and 8", note: "No house edge. 3-4-5x: up to 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8." },
      { bet: "Lay odds (don't pass, don't come)", pays: "1 to 2 on 4 and 10, 2 to 3 on 5 and 9, 5 to 6 on 6 and 8", note: "Lay up to 6x the flat bet on any point." },
      { bet: "Place 4 or 10", pays: "9 to 5", note: "Multiples of 5. Off on the come-out roll unless you call them working." },
      { bet: "Place 5 or 9", pays: "7 to 5", note: "Multiples of 5." },
      { bet: "Place 6 or 8", pays: "7 to 6", note: "Multiples of 6." },
      { bet: "Buy 4, 5, 6, 8, 9, 10", pays: "True odds less 5% vig", note: "Vig is charged on the win, minimum 1 chip. Buying 4 and 10 beats placing them." },
      { bet: "Lay 4, 5, 6, 8, 9, 10", pays: "Inverse true odds less 5% vig on the win", note: "Wins on a 7 before the number. Always working. Multiples of 2, 3 or 6." },
      { bet: "Field", pays: "1 to 1 on 3, 4, 9, 10, 11; 2 to 1 on 2; 3 to 1 on 12", note: "One roll." },
      { bet: "Hard 4 / Hard 10", pays: "7 to 1", note: "The pair must roll before any 7 or the easy way. Stays up after a win." },
      { bet: "Hard 6 / Hard 8", pays: "9 to 1", note: "Same rule." },
      { bet: "Any seven", pays: "4 to 1", note: "One roll." },
      { bet: "Any craps (2, 3, 12)", pays: "7 to 1", note: "One roll." },
      { bet: "2 or 12", pays: "30 to 1", note: "One roll." },
      { bet: "3 or 11", pays: "15 to 1", note: "One roll." },
      { bet: "Horn", pays: "One unit each on 2, 3, 11, 12", note: "Multiples of 4. The hit pays its number, the other three units lose." },
      { bet: "C and E", pays: "Half on any craps (7 to 1), half on 11 (15 to 1)", note: "Multiples of 2. One roll." }
    ];
  }

  return {
    POINTS: POINTS, HARD_NUMBERS: HARD_NUMBERS, TABLE_MIN: TABLE_MIN, CHIPS: CHIPS, BANKROLLS: BANKROLLS,
    MAX_ODDS: MAX_ODDS, MAX_LAY_ODDS: MAX_LAY_ODDS, ODDS_PAY: ODDS_PAY, LAY_PAY: LAY_PAY, PLACE_PAY: PLACE_PAY,
    HARD_PAY: HARD_PAY, FIELD: FIELD, KIND_NAMES: KIND_NAMES,
    nextRand: nextRand, newGame: newGame, validState: validState,
    betKey: betKey, parseKey: parseKey, describe: describe, increment: increment, minBet: minBet, incrementHint: incrementHint,
    totalOnTable: totalOnTable, betList: betList, maxOdds: maxOdds, isOddsKind: isOddsKind, oddsKindFor: oddsKindFor,
    canBet: canBet, fitBet: fitBet, placeBet: placeBet, canRemove: canRemove, removeBet: removeBet, clearBets: clearBets,
    toggleWorking: toggleWorking, canRoll: canRoll, roll: roll,
    repeatable: repeatable, repeatBets: repeatBets, payoutTable: payoutTable
  };
});
