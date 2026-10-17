(function () {
  "use strict";
  var L = window.CrapsLogic;
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SAVE_KEY = "kz.craps.save.v1", RECORD_KEY = "kz.craps.record.v1";
  var params = new URLSearchParams(location.search);
  var URL_SEED = params.has("seed") ? (parseInt(params.get("seed"), 10) | 0) : null;
  var clockSeed = Date.now() >>> 0; // the clock is read here only, never in the logic
  var $ = function (id) { return document.getElementById(id); };
  var SVG_NS = "http://www.w3.org/2000/svg";

  var app = { s: null, chip: 5, bank: 1000, vert: false, busy: false, lay: null, timer: null, flash: null, lastRoll: null, pickup: false };

  // ------------------------------------------------------------ storage
  function store(op, key, val) {
    try {
      if (op === "get") return window.localStorage.getItem(key);
      if (op === "set") window.localStorage.setItem(key, val);
      if (op === "del") window.localStorage.removeItem(key);
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  function saveGame() {
    if (!app.s) return;
    store("set", SAVE_KEY, JSON.stringify({ s: app.s, chip: app.chip }));
  }
  function loadSaved() {
    try {
      var d = JSON.parse(store("get", SAVE_KEY));
      if (d && L.validState(d.s)) return d;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveRecord(s) {
    store("set", RECORD_KEY, JSON.stringify({ rolls: s.stats.rolls, pointsMade: s.stats.pointsMade, biggestWin: s.stats.biggestWin, net: s.net }));
  }
  function loadRecord() {
    try { var r = JSON.parse(store("get", RECORD_KEY)); if (r && typeof r.rolls === "number") return r; } catch (e) { /* ignore */ }
    return null;
  }

  // ------------------------------------------------------------ art: chips and dice
  var CHIP = {
    1: { body: "#F1EADB", light: "#FFFDF6", dark: "#B9AE98", edge: "#3E5F8C", ink: "#2B2622" },
    5: { body: "#C0392B", light: "#E25646", dark: "#7E1F15", edge: "#F3E6D2", ink: "#FFF6EA" },
    25: { body: "#2E7D4F", light: "#48A26C", dark: "#1B5234", edge: "#F3E6D2", ink: "#FFF6EA" },
    100: { body: "#2B2622", light: "#4A423B", dark: "#0F0C0A", edge: "#F3E6D2", ink: "#FFF6EA" },
    500: { body: "#6A3E8C", light: "#8D5CB4", dark: "#3F2256", edge: "#F1D27A", ink: "#FFF6EA" }
  };
  var gid = 0;
  function chipSvg(d, r, opts) {
    opts = opts || {};
    var c = CHIP[d], id = "cg" + (++gid), s = "";
    var lift = opts.lift === undefined ? r * 0.12 : opts.lift;
    s += '<defs><radialGradient id="' + id + '" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="' + c.light + '"/><stop offset="0.55" stop-color="' + c.body + '"/><stop offset="1" stop-color="' + c.dark + '"/></radialGradient></defs>';
    if (opts.shadow !== false) s += '<ellipse cx="' + (r * 0.1) + '" cy="' + (r * 0.3) + '" rx="' + (r * 1.02) + '" ry="' + (r * 0.92) + '" fill="rgba(0,0,0,0.42)"/>';
    s += '<circle cx="0" cy="0" r="' + r + '" fill="' + c.dark + '"/>';
    s += '<g transform="translate(0,' + (-lift) + ')">';
    s += '<circle r="' + r + '" fill="url(#' + id + ')"/>';
    for (var i = 0; i < 6; i++) {
      s += '<rect x="' + (-r * 0.17) + '" y="' + (-r) + '" width="' + (r * 0.34) + '" height="' + (r * 0.3) + '" rx="' + (r * 0.05) + '" fill="' + c.edge + '" transform="rotate(' + (i * 60) + ')"/>';
    }
    s += '<circle r="' + (r * 0.68) + '" fill="none" stroke="' + c.edge + '" stroke-width="' + (r * 0.07) + '" stroke-dasharray="' + (r * 0.36) + ' ' + (r * 0.18) + '" opacity="0.9"/>';
    s += '<circle r="' + (r * 0.58) + '" fill="' + c.body + '" stroke="rgba(0,0,0,0.18)" stroke-width="' + (r * 0.03) + '"/>';
    s += '<circle r="' + (r * 0.58) + '" fill="url(#' + id + ')" opacity="0.5"/>';
    if (opts.text !== false) s += '<text class="jost" x="0" y="' + (r * 0.2) + '" text-anchor="middle" font-size="' + (d >= 100 ? r * 0.56 : r * 0.68) + '" font-weight="600" fill="' + c.ink + '">' + d + '</text>';
    s += '<ellipse cx="' + (-r * 0.3) + '" cy="' + (-r * 0.42) + '" rx="' + (r * 0.42) + '" ry="' + (r * 0.2) + '" fill="rgba(255,255,255,0.18)" transform="rotate(-30)"/>';
    s += '</g>';
    return s;
  }
  function chipHtml(d, size) {
    return '<svg viewBox="-32 -32 64 64" width="' + size + '" height="' + size + '" aria-hidden="true">' + chipSvg(d, 28, { shadow: false }) + '</svg>';
  }
  // Break an amount into chips, largest first, for a stack picture.
  function chipsFor(amount) {
    var out = [], left = amount, denoms = [500, 100, 25, 5, 1];
    for (var i = 0; i < denoms.length; i++) while (left >= denoms[i]) { out.push(denoms[i]); left -= denoms[i]; }
    return out.reverse(); // small on top? no: big at the bottom, so reverse to draw bottom first
  }
  function stackSvg(amount, r, cls, data, label) {
    var chips = chipsFor(amount);
    if (chips.length > 7) chips = chips.slice(chips.length - 7);
    var s = '<g class="stack ' + (cls || "") + '" ' + (data || "") + '>';
    s += '<circle r="' + (r * 1.8) + '" cy="' + (-r * 0.4) + '" fill="rgba(0,0,0,0)"/>';
    for (var i = 0; i < chips.length; i++) {
      s += '<g transform="translate(0,' + (-i * r * 0.22) + ')">' + chipSvg(chips[i], r, { shadow: i === 0, text: i === chips.length - 1, lift: r * 0.1 }) + '</g>';
    }
    var ly = -(chips.length - 1) * r * 0.22 - r - 7;
    var fs = Math.max(10, r * 0.8), w = (String(amount).length + (label ? label.length + 1 : 0)) * fs * 0.6 + 10, lh = fs * 1.4;
    s += '<rect x="' + (-w / 2) + '" y="' + (ly - lh / 2) + '" width="' + w + '" height="' + lh + '" rx="' + (lh / 2) + '" fill="#F5EFE0" stroke="rgba(43,38,34,0.35)" stroke-width="0.8"/>';
    s += '<text class="jost" y="' + (ly + fs * 0.36) + '" text-anchor="middle" font-size="' + fs + '" font-weight="600" fill="#2B2622">' + amount + (label ? '<tspan fill="#7B7064" font-weight="500"> ' + label + '</tspan>' : "") + '</text>';
    s += '</g>';
    return s;
  }

  var PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  function dieSvg(v, size, opts) {
    opts = opts || {};
    var h = size / 2, id = "dg" + (++gid), s = "";
    s += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFEF9"/><stop offset="0.6" stop-color="#F3ECDC"/><stop offset="1" stop-color="#DDD2BC"/></linearGradient></defs>';
    if (opts.shadow !== false) s += '<rect x="' + (-h + size * 0.08) + '" y="' + (-h + size * 0.16) + '" width="' + size + '" height="' + size + '" rx="' + (size * 0.2) + '" fill="rgba(0,0,0,0.38)"/>';
    s += '<rect x="' + (-h) + '" y="' + (-h + 2) + '" width="' + size + '" height="' + size + '" rx="' + (size * 0.2) + '" fill="#C8BBA2"/>';
    s += '<rect x="' + (-h) + '" y="' + (-h) + '" width="' + size + '" height="' + size + '" rx="' + (size * 0.2) + '" fill="url(#' + id + ')" stroke="#CFC4AE" stroke-width="' + (size * 0.03) + '"/>';
    var pr = size * 0.09, off = size * 0.26;
    PIPS[v].forEach(function (p) {
      s += '<circle cx="' + (p[0] * off) + '" cy="' + (p[1] * off) + '" r="' + pr + '" fill="#2B2622"/>';
      s += '<circle cx="' + (p[0] * off - pr * 0.3) + '" cy="' + (p[1] * off - pr * 0.3) + '" r="' + (pr * 0.3) + '" fill="rgba(255,255,255,0.35)"/>';
    });
    s += '<rect x="' + (-h + size * 0.06) + '" y="' + (-h + size * 0.05) + '" width="' + (size * 0.5) + '" height="' + (size * 0.12) + '" rx="' + (size * 0.06) + '" fill="rgba(255,255,255,0.45)"/>';
    return s;
  }
  function miniPips(a, b, size, x, y) {
    return '<g transform="translate(' + (x - size * 0.62) + ',' + y + ')">' + dieSvg(a, size, { shadow: false }) + '</g>' +
      '<g transform="translate(' + (x + size * 0.62) + ',' + y + ')">' + dieSvg(b, size, { shadow: false }) + '</g>';
  }

  // ------------------------------------------------------------ table layout
  var P = L.POINTS;
  function z(key, kind, number, x, y, w, h, lines, extra) {
    var o = { key: key, kind: kind, number: number, x: x, y: y, w: w, h: h, lines: lines || [] };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  var NUM_WORD = { 4: "4", 5: "5", 6: "SIX", 8: "8", 9: "NINE", 10: "10" };
  var PROP = {
    hard6: { kind: "hard", number: 6, pips: [3, 3], title: "HARD 6", pay: "9 TO 1" }, hard10: { kind: "hard", number: 10, pips: [5, 5], title: "HARD 10", pay: "7 TO 1" },
    hard4: { kind: "hard", number: 4, pips: [2, 2], title: "HARD 4", pay: "7 TO 1" }, hard8: { kind: "hard", number: 8, pips: [4, 4], title: "HARD 8", pay: "9 TO 1" },
    two: { kind: "two", number: null, pips: [1, 1], title: "ACES", pay: "30 TO 1" }, three: { kind: "three", number: null, pips: [1, 2], title: "ACE DEUCE", pay: "15 TO 1" },
    eleven: { kind: "eleven", number: null, pips: [5, 6], title: "YO", pay: "15 TO 1" }, twelve: { kind: "twelve", number: null, pips: [6, 6], title: "BOXCARS", pay: "30 TO 1" }
  };

  function buildLayout(vert) {
    var lay = { vert: vert, zones: [], pos: {}, labels: [], paths: [] };
    var i, n, x, cx;
    function numberColumns(x0, colW, gap, yLay, hLay, yNum, hNum, yBuy, hBuy) {
      for (i = 0; i < 6; i++) {
        n = P[i]; x = x0 + i * (colW + gap); cx = x + colW / 2;
        lay.zones.push(z("lay:" + n, "lay", n, x, yLay, colW, hLay, [{ t: "LAY " + n, s: 12, dy: hLay / 2 + 4.5 }], { thin: true }));
        lay.zones.push(z("place:" + n, "place", n, x, yNum, colW, hNum, [{ t: NUM_WORD[n], s: n === 6 || n === 9 ? 26 : 40, dy: hNum * 0.52 + 10 }], { number: true }));
        lay.zones.push(z("buy:" + n, "buy", n, x, yBuy, colW, hBuy, [{ t: "BUY", s: 11, dy: hBuy / 2 + 4 }], { thin: true }));
        lay.pos["place:" + n] = { x: cx, y: yNum + hNum - 18 };
        lay.pos["come:" + n] = { x: cx - colW * 0.22, y: yNum + 34 };
        lay.pos["comeodds:" + n] = { x: cx + colW * 0.22, y: yNum + 34 };
        lay.pos["dontcome:" + n] = { x: x + colW * 0.28, y: yLay + hLay / 2 + 6 };
        lay.pos["dcodds:" + n] = { x: x + colW * 0.5, y: yLay + hLay / 2 + 6 };
        lay.pos["lay:" + n] = { x: x + colW * 0.76, y: yLay + hLay / 2 + 6 };
        lay.pos["buy:" + n] = { x: cx + colW * 0.25, y: yBuy + hBuy / 2 + 6 };
        lay.puckOn = lay.puckOn || {};
        lay.puckOn[n] = { x: cx + colW * 0.3, y: yNum + 20 };
      }
    }
    function propCell(id, x, y, w, h) {
      var p = PROP[id];
      lay.zones.push(z(id === "hard6" || id === "hard10" || id === "hard4" || id === "hard8" ? "hard:" + p.number : id, p.kind, p.number, x, y, w, h, [], { prop: p }));
      lay.pos[p.kind === "hard" ? "hard:" + p.number : id] = { x: x + w - 20, y: y + h - 16 };
    }
    function bar(key, kind, x, y, w, h, title, pay) {
      lay.zones.push(z(key, kind, null, x, y, w, h, [{ t: title + (pay ? "  " + pay : ""), s: lay.vert ? 12 : 11, dy: h / 2 + 4 }], { thin: true }));
      lay.pos[key] = { x: x + w - 22, y: y + h / 2 + 6 };
    }
    if (!vert) {
      lay.W = 1040; lay.H = 600; lay.felt = { x: 28, y: 44, w: 984, h: 530 };
      lay.rack = { x: 300, y: 10, w: 440, h: 24 };
      // the L-shaped line bands
      lay.zones.push(z("pass", "pass", null, 44, 60, 740, 496, [], { lpath: { x0: 44, y0: 60, vw: 54, y1: 556, bh: 54, x2: 784 }, band: true }));
      lay.zones.push(z("dontpass", "dontpass", null, 98, 60, 686, 442, [], { lpath: { x0: 98, y0: 60, vw: 38, y1: 502, bh: 38, x2: 784 }, band: true }));
      lay.zones.push(z("passodds", "passodds", null, 648, 502, 136, 54, [{ t: "ODDS", s: 11, dy: 14, lx: -42 }], { odds: true }));
      lay.zones.push(z("dpodds", "dpodds", null, 648, 464, 136, 38, [{ t: "LAY ODDS", s: 9, dy: 12, lx: -36 }], { odds: true }));
      lay.labels.push({ t: "PASS LINE", x: 400, y: 538, s: 22, ls: 6 });
      lay.labels.push({ t: "PASS LINE", x: 71, y: 300, s: 18, ls: 5, rot: -90 });
      lay.labels.push({ t: "DON'T PASS BAR", x: 380, y: 489, s: 15, ls: 3, pips: [6, 6], pipAt: { x: 500, y: 483 } });
      lay.labels.push({ t: "DON'T PASS", x: 117, y: 290, s: 12, ls: 3, rot: -90 });
      lay.pos.pass = { x: 250, y: 537 }; lay.pos.passodds = { x: 736, y: 541 };
      lay.pos.dontpass = { x: 250, y: 492 }; lay.pos.dpodds = { x: 740, y: 494 };
      numberColumns(150, 102, 4, 60, 28, 88, 98, 186, 26);
      lay.zones.push(z("come", "come", null, 150, 220, 632, 66, [{ t: "COME", s: 30, dy: 44 }]));
      lay.pos.come = { x: 600, y: 264 };
      lay.zones.push(z("field", "field", null, 150, 294, 632, 68, [], { field: true }));
      lay.pos.field = { x: 466, y: 340 };
      lay.zones.push(z("dontcome", "dontcome", null, 150, 370, 150, 86, [{ t: "DON'T", s: 15, dy: 36, lx: 16 }, { t: "COME", s: 15, dy: 56, lx: 16 }], { pips: [6, 6], pipAt: { x: 91, y: 73 } }));
      lay.pos.dontcome = { x: 268, y: 440 };
      lay.puckOff = { x: 182, y: 392 };
      lay.dice = { x: 310, y: 370, w: 472, h: 86, size: 50 };
      // propositions
      lay.propBox = { x: 796, y: 60, w: 200, h: 496 };
      propCell("hard6", 798, 66, 96, 78); propCell("hard10", 898, 66, 96, 78);
      propCell("hard4", 798, 148, 96, 78); propCell("hard8", 898, 148, 96, 78);
      bar("any7", "any7", 798, 232, 196, 36, "ANY SEVEN", "4 TO 1");
      propCell("two", 798, 276, 96, 78); propCell("three", 898, 276, 96, 78);
      propCell("eleven", 798, 358, 96, 78); propCell("twelve", 898, 358, 96, 78);
      bar("anycraps", "anycraps", 798, 444, 196, 36, "ANY CRAPS", "7 TO 1");
      bar("horn", "horn", 798, 488, 96, 36, "HORN", "");
      bar("ce", "ce", 898, 488, 96, 36, "C & E", "");
      lay.labels.push({ t: "PROPOSITION BETS", x: 896, y: 546, s: 11, ls: 2.5 });
    } else {
      lay.W = 560; lay.H = 770; lay.felt = { x: 24, y: 40, w: 512, h: 706 };
      lay.rack = { x: 120, y: 8, w: 320, h: 22 };
      numberColumns(40, 78, 4, 52, 26, 78, 84, 162, 24);
      lay.zones.push(z("come", "come", null, 40, 194, 488, 54, [{ t: "COME", s: 26, dy: 36 }]));
      lay.pos.come = { x: 440, y: 230 };
      lay.zones.push(z("field", "field", null, 40, 256, 488, 60, [], { field: true }));
      lay.pos.field = { x: 284, y: 300 };
      lay.zones.push(z("dontcome", "dontcome", null, 40, 324, 150, 86, [{ t: "DON'T", s: 15, dy: 36, lx: 16 }, { t: "COME", s: 15, dy: 56, lx: 16 }], { pips: [6, 6], pipAt: { x: 91, y: 73 } }));
      lay.pos.dontcome = { x: 160, y: 394 };
      lay.puckOff = { x: 72, y: 346 };
      lay.dice = { x: 200, y: 324, w: 328, h: 86, size: 48 };
      lay.zones.push(z("dontpass", "dontpass", null, 40, 418, 360, 38, [], { band: true }));
      lay.zones.push(z("dpodds", "dpodds", null, 400, 418, 128, 38, [{ t: "LAY ODDS", s: 9, dy: 12, lx: -34 }], { odds: true }));
      lay.zones.push(z("pass", "pass", null, 40, 462, 360, 52, [], { band: true }));
      lay.zones.push(z("passodds", "passodds", null, 400, 462, 128, 52, [{ t: "ODDS", s: 11, dy: 14, lx: -40 }], { odds: true }));
      lay.labels.push({ t: "DON'T PASS BAR", x: 170, y: 442, s: 13, ls: 2.5, pips: [6, 6], pipAt: { x: 290, y: 437 } });
      lay.labels.push({ t: "PASS LINE", x: 190, y: 495, s: 20, ls: 5 });
      lay.pos.pass = { x: 330, y: 496 }; lay.pos.passodds = { x: 484, y: 500 };
      lay.pos.dontpass = { x: 350, y: 446 }; lay.pos.dpodds = { x: 488, y: 448 };
      lay.propBox = { x: 36, y: 520, w: 496, h: 212 };
      var pw = 118, pg = 4, px = 40;
      ["hard6", "hard10", "hard4", "hard8"].forEach(function (id, k) { propCell(id, px + k * (pw + pg), 524, pw, 72); });
      ["two", "three", "eleven", "twelve"].forEach(function (id, k) { propCell(id, px + k * (pw + pg), 600, pw, 72); });
      bar("any7", "any7", 40, 678, 118, 44, "ANY 7", "4:1");
      bar("anycraps", "anycraps", 162, 678, 118, 44, "ANY CRAPS", "7:1");
      bar("horn", "horn", 284, 678, 118, 44, "HORN", "");
      bar("ce", "ce", 406, 678, 118, 44, "C & E", "");
    }
    return lay;
  }

  // ------------------------------------------------------------ table rendering
  var CREAM = "#EFE4CC", CREAM_DIM = "rgba(239,228,204,0.85)";
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#39;"); }
  function txt(t, x, y, size, opts) {
    opts = opts || {};
    var attrs = ' x="' + x + '" y="' + y + '" font-size="' + size + '" text-anchor="' + (opts.anchor || "middle") + '"' + (opts.ls ? ' letter-spacing="' + opts.ls + '"' : "") + (opts.rot ? ' transform="rotate(' + opts.rot + ' ' + x + ' ' + y + ')"' : "") + (opts.cls ? ' class="' + opts.cls + '"' : "") + (opts.weight ? ' font-weight="' + opts.weight + '"' : "");
    return '<text' + attrs + ' fill="rgba(0,0,0,0.45)" dx="1" dy="1.2">' + esc(t) + '</text>' +
      '<text' + attrs + ' fill="' + (opts.fill || CREAM) + '">' + esc(t) + '</text>';
  }
  function lPath(p, inset) {
    inset = inset || 0;
    var x0 = p.x0 + inset, y0 = p.y0 + inset, x1 = p.x0 + p.vw - inset, y1 = p.y1 - inset, yb = p.y1 - p.bh + inset, x2 = p.x2 - inset, r = 26;
    return "M" + x0 + " " + y0 + " L" + x0 + " " + (y1 - r) + " Q" + x0 + " " + y1 + " " + (x0 + r) + " " + y1 + " L" + x2 + " " + y1 + " L" + x2 + " " + yb + " L" + x1 + " " + yb + " L" + x1 + " " + y0 + " Z";
  }
  function zoneShape(zn, cls, attrs) {
    if (zn.lpath) return '<path class="' + cls + '" d="' + lPath(zn.lpath) + '" ' + (attrs || "") + '/>';
    return '<rect class="' + cls + '" x="' + zn.x + '" y="' + zn.y + '" width="' + zn.w + '" height="' + zn.h + '" rx="' + (zn.thin ? 5 : 8) + '" ' + (attrs || "") + '/>';
  }
  function zoneLabel(zn) {
    var s = "", cx = zn.x + zn.w / 2, i;
    for (i = 0; i < zn.lines.length; i++) s += txt(zn.lines[i].t, cx + (zn.lines[i].lx || 0), zn.y + zn.lines[i].dy, zn.lines[i].s, { ls: zn.lines[i].ls || 2 });
    if (zn.pips) s += miniPips(zn.pips[0], zn.pips[1], 14, zn.x + zn.pipAt.x, zn.y + zn.pipAt.y);
    if (zn.prop) {
      var p = zn.prop, big = zn.w > 100;
      s += txt(p.title, cx, zn.y + 15, big ? 11 : 10, { ls: 1.5 });
      s += miniPips(p.pips[0], p.pips[1], big ? 22 : 20, cx, zn.y + zn.h * 0.5 + 1);
      s += txt(p.pay, zn.x + 7, zn.y + zn.h - 7, 10, { ls: 1, anchor: "start" });
    }
    if (zn.field) {
      var items = [2, 3, 4, 9, 10, 11, 12], gap = zn.w / 8, fy = zn.y + zn.h * 0.58;
      s += txt("FIELD", cx, zn.y + 16, 13, { ls: 5 });
      for (i = 0; i < items.length; i++) {
        var fx = zn.x + gap * (i + 1), v = items[i];
        if (v === 2 || v === 12) {
          s += '<circle cx="' + fx + '" cy="' + (fy - 3) + '" r="17" fill="none" stroke="' + CREAM + '" stroke-width="2"/>';
          s += txt(v === 2 ? "DOUBLE" : "TRIPLE", fx, zn.y + zn.h - 5, 7.5, { ls: 1 });
        }
        s += txt(String(v), fx, fy + 5, 22);
      }
    }
    if (zn.odds) {
      s += '<rect x="' + (zn.x + 2) + '" y="' + (zn.y + 2) + '" width="' + (zn.w - 4) + '" height="' + (zn.h - 4) + '" rx="6" fill="none" stroke="' + CREAM_DIM + '" stroke-width="1.2" stroke-dasharray="4 3"/>';
    }
    return s;
  }
  function zoneAria(zn, s) {
    var bets = s ? s.bets : {};
    var b = bets[zn.key], what = L.describe(zn.kind, zn.number);
    if (zn.kind === "passodds" || zn.kind === "dpodds") { var pb = bets[zn.kind === "passodds" ? "pass" : "dontpass"]; return what + (pb && pb.odds ? ", " + pb.odds + " on it" : ", empty"); }
    return what + (b ? ", " + b.amount + " on it" : ", empty");
  }

  function renderTable() {
    var s = app.s, lay = app.lay, svg = $("table");
    svg.setAttribute("viewBox", "0 0 " + lay.W + " " + lay.H);
    var f = lay.felt, o = "", i;
    o += '<defs>' +
      '<radialGradient id="feltG" cx="45%" cy="40%" r="80%"><stop offset="0" stop-color="#47704F"/><stop offset="0.6" stop-color="#3F6447"/><stop offset="1" stop-color="#345239"/></radialGradient>' +
      '<linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A4A2A"/><stop offset="0.45" stop-color="#5C361D"/><stop offset="1" stop-color="#3E2211"/></linearGradient>' +
      '<linearGradient id="woodHi" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(255,220,170,0.0)"/><stop offset="0.5" stop-color="rgba(255,220,170,0.22)"/><stop offset="1" stop-color="rgba(255,220,170,0.0)"/></linearGradient>' +
      '<radialGradient id="puckOn" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8D0BE"/></radialGradient>' +
      '<radialGradient id="puckOff" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#4A423B"/><stop offset="1" stop-color="#15110E"/></radialGradient>' +
      '<filter id="emb" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0.6" dy="0.9" stdDeviation="0.35" flood-color="#000" flood-opacity="0.5"/></filter>' +
      '<filter id="inset" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="9"/></filter>' +
      '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>' +
      '<clipPath id="feltClip"><rect x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="22"/></clipPath>' +
      '</defs>';
    // rail
    o += '<rect x="0" y="0" width="' + lay.W + '" height="' + lay.H + '" rx="34" fill="url(#woodG)"/>';
    for (i = 0; i < 9; i++) o += '<path d="M8 ' + (18 + i * (lay.H / 9)) + ' Q ' + (lay.W / 2) + ' ' + (18 + i * (lay.H / 9) + (i % 2 ? 9 : -7)) + ' ' + (lay.W - 8) + ' ' + (22 + i * (lay.H / 9)) + '" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="1.2"/>';
    o += '<rect x="0" y="0" width="' + lay.W + '" height="' + lay.H + '" rx="34" fill="url(#woodHi)" opacity="0.6"/>';
    o += '<rect x="2" y="2" width="' + (lay.W - 4) + '" height="' + (lay.H - 4) + '" rx="32" fill="none" stroke="rgba(255,225,180,0.28)" stroke-width="1.5"/>';
    // chip rack in the rail
    var rk = lay.rack;
    o += '<rect x="' + rk.x + '" y="' + rk.y + '" width="' + rk.w + '" height="' + rk.h + '" rx="6" fill="#1D120A" stroke="rgba(255,220,170,0.25)" stroke-width="1"/>';
    var rackChips = [5, 5, 25, 25, 100, 1, 5, 500, 25, 5, 100, 25, 5, 1, 25, 5, 500, 100, 5, 25, 5, 25, 100, 5, 25, 1, 5, 25, 100, 5, 500, 25, 5, 5, 25, 100, 5, 25, 1, 5];
    var cw = rk.w / rackChips.length;
    for (i = 0; i < rackChips.length; i++) {
      var cc = CHIP[rackChips[i]];
      o += '<rect x="' + (rk.x + 3 + i * cw) + '" y="' + (rk.y + 4) + '" width="' + (cw - 2) + '" height="' + (rk.h - 8) + '" rx="1.2" fill="' + cc.body + '"/>';
      o += '<rect x="' + (rk.x + 3 + i * cw) + '" y="' + (rk.y + 4 + (rk.h - 8) * 0.38) + '" width="' + (cw - 2) + '" height="' + ((rk.h - 8) * 0.24) + '" fill="' + cc.edge + '" opacity="0.9"/>';
    }
    // felt
    o += '<rect x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="22" fill="url(#feltG)"/>';
    o += '<g clip-path="url(#feltClip)"><rect x="' + (f.x - 10) + '" y="' + (f.y - 10) + '" width="' + (f.w + 20) + '" height="' + (f.h + 20) + '" rx="30" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="26" filter="url(#inset)"/></g>';
    // printed layout
    o += '<g filter="url(#emb)">';
    for (i = 0; i < lay.zones.length; i++) {
      var zn = lay.zones[i];
      o += '<g data-zone="' + zn.key + '" role="button" tabindex="0" aria-label="' + esc(zoneAria(zn, s)) + '">';
      o += zoneShape(zn, "hit", 'stroke="' + (zn.odds ? "none" : CREAM) + '" stroke-width="' + (zn.band ? 2.4 : 1.8) + '"');
      if (zn.number) o += '<rect x="' + (zn.x + 5) + '" y="' + (zn.y + 5) + '" width="' + (zn.w - 10) + '" height="' + (zn.h - 10) + '" rx="5" fill="none" stroke="' + CREAM_DIM + '" stroke-width="0.8"/>';
      o += zoneLabel(zn);
      o += '</g>';
    }
    if (lay.propBox) o += '<rect x="' + lay.propBox.x + '" y="' + lay.propBox.y + '" width="' + lay.propBox.w + '" height="' + lay.propBox.h + '" rx="10" fill="none" stroke="' + CREAM_DIM + '" stroke-width="1.2"/>';
    for (i = 0; i < lay.labels.length; i++) {
      var lb = lay.labels[i];
      o += txt(lb.t, lb.x, lb.y, lb.s, { ls: lb.ls, rot: lb.rot });
      if (lb.pips) o += miniPips(lb.pips[0], lb.pips[1], 13, lb.pipAt.x, lb.pipAt.y);
    }
    o += '</g>';
    // puck
    var pk = s && s.point ? lay.puckOn[s.point] : lay.puckOff;
    var on = !!(s && s.point);
    o += '<g class="puck" transform="translate(' + pk.x + ',' + pk.y + ')" aria-hidden="true">' +
      '<ellipse cx="1.5" cy="3" rx="17" ry="15" fill="rgba(0,0,0,0.45)" filter="url(#soft)"/>' +
      '<circle r="16" fill="' + (on ? "#B9AE98" : "#0B0806") + '"/>' +
      '<circle cy="-2" r="16" fill="url(#' + (on ? "puckOn" : "puckOff") + ')" stroke="' + (on ? "#9E9280" : "#3A322B") + '" stroke-width="1"/>' +
      '<text y="2" text-anchor="middle" font-size="12" letter-spacing="1" fill="' + (on ? "#2B2622" : "#F1EADB") + '" font-weight="600">' + (on ? "ON" : "OFF") + '</text></g>';
    // chip stacks
    o += '<g class="stacks">' + stacksSvg(s) + '</g>';
    o += '<g class="fx"></g>';
    o += '<g class="diceLayer">' + diceSvg(app.lastRoll ? app.lastRoll.d1 : 3, app.lastRoll ? app.lastRoll.d2 : 4, !app.lastRoll) + '</g>';
    svg.innerHTML = o;
  }
  function stacksSvg(s) {
    if (!s) return "";
    var o = "", lay = app.lay, r = lay.vert ? 15 : 13, k, b, p;
    for (k in s.bets) {
      b = s.bets[k]; p = lay.pos[k];
      if (!p) continue;
      var lab = b.kind === "come" && b.number ? "come" : b.kind === "dontcome" && b.number ? "dc" : "";
      o += '<g transform="translate(' + p.x + ',' + p.y + ')">' + stackSvg(b.amount, r, "", 'data-stack="' + k + '" role="button" tabindex="0" aria-label="' + esc(L.describe(b.kind, b.number) + ", " + b.amount + " chips") + '"', lab) + '</g>';
      if (b.odds > 0) {
        var ok = L.oddsKindFor(b.kind), okey = ok === "passodds" ? "passodds" : ok === "dpodds" ? "dpodds" : ok + ":" + b.number;
        var op = lay.pos[okey];
        if (op) o += '<g transform="translate(' + op.x + ',' + op.y + ')">' + stackSvg(b.odds, r, "", 'data-stack="' + okey + '" role="button" tabindex="0" aria-label="' + esc(L.describe(ok, b.number) + ", " + b.odds + " chips") + '"', "odds") + '</g>';
      }
    }
    return o;
  }
  function diceSvg(d1, d2, ghost) {
    var dz = app.lay.dice, sz = dz.size, cy = dz.y + dz.h / 2, cx = dz.x + dz.w / 2;
    var o = "";
    if (ghost) {
      o += '<g opacity="0.35">' + '<g transform="translate(' + (cx - sz * 0.75) + ',' + cy + ') rotate(-8)">' + dieSvg(d1, sz, { shadow: false }) + '</g>' +
        '<g transform="translate(' + (cx + sz * 0.75) + ',' + cy + ') rotate(6)">' + dieSvg(d2, sz, { shadow: false }) + '</g></g>';
      return o;
    }
    o += '<g class="die one" transform="translate(' + (cx - sz * 0.75) + ',' + cy + ') rotate(-8)">' + dieSvg(d1, sz) + '</g>';
    o += '<g class="die two" transform="translate(' + (cx + sz * 0.75) + ',' + cy + ') rotate(6)">' + dieSvg(d2, sz) + '</g>';
    return o;
  }
  function setDice(d1, d2, tumble) {
    var layer = $("table").querySelector(".diceLayer");
    if (!layer) return;
    layer.innerHTML = diceSvg(d1, d2, false);
    if (tumble) Array.prototype.forEach.call(layer.querySelectorAll(".die"), function (g) { g.classList.add("tumble"); });
  }

  // ------------------------------------------------------------ hud
  function fmt(n) { return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function signed(n) { return (n > 0 ? "+" : "") + fmt(n); }
  function setStatus(t) { $("status").textContent = t; }
  function hint(t, zoneKey) {
    clearTimeout(app.flash);
    var h = $("hint");
    h.textContent = t || "";
    h.style.opacity = t ? "1" : "0";
    if (zoneKey && !REDUCED) {
      var g = $("table").querySelector('[data-zone="' + zoneKey + '"]');
      if (g) { g.classList.remove("zone-flash"); void g.getBoundingClientRect(); g.classList.add("zone-flash"); }
    }
    if (t) app.flash = setTimeout(function () { h.style.opacity = "0"; }, 4200);
  }
  function defaultStatus() {
    var s = app.s;
    if (!s) return "";
    var n = Object.keys(s.bets).length;
    if (s.bankroll === 0 && n === 0) return "Out of chips. Reset your bankroll from the menu to keep playing.";
    if (s.point) return "Point is " + s.point + ". Roll a " + s.point + " before a 7.";
    return n ? "Come-out roll. Puck is OFF." : "Come-out roll. Bet the Pass line (or Don't pass), then roll.";
  }
  function renderHud() {
    var s = app.s;
    $("bankroll").textContent = fmt(s.bankroll);
    $("onTable").textContent = fmt(L.totalOnTable(s));
    var pl = $("pointLbl");
    pl.textContent = s.point ? String(s.point) : "OFF";
    pl.classList.toggle("on", !!s.point);
    var cr = L.canRoll(s);
    $("rollBtn").disabled = !cr.ok || app.busy;
    $("rollBtn").textContent = app.busy ? "Rolling" : "Roll";
    $("repeatBtn").hidden = L.repeatable(s).length === 0 || app.busy;
    var removable = Object.keys(s.bets).some(function (k) { var b = s.bets[k]; return L.canRemove(s, b.kind, b.number).ok || b.odds > 0; });
    $("clearBtn").disabled = !removable || app.busy;
    $("workingBtn").setAttribute("aria-pressed", s.workingOnComeOut ? "true" : "false");
    $("workingBtn").textContent = s.workingOnComeOut ? "Place bets: working on come-out" : "Place bets: off on come-out";
    Array.prototype.forEach.call($("chips").children, function (b) {
      if (b.id === "pickupBtn") { b.disabled = Object.keys(s.bets).length === 0 || app.busy; return; }
      b.classList.toggle("on", !app.pickup && +b.dataset.chip === app.chip);
      b.setAttribute("aria-pressed", !app.pickup && +b.dataset.chip === app.chip ? "true" : "false");
      b.disabled = +b.dataset.chip > s.bankroll;
    });
    var st = s.stats;
    $("stats").innerHTML = '<div><b>' + fmt(st.rolls) + '</b><span>Rolls</span></div><div><b>' + fmt(st.pointsMade) + '</b><span>Points made</span></div>' +
      '<div><b>' + fmt(st.biggestWin) + '</b><span>Biggest win</span></div><div><b class="' + (s.net > 0 ? "pos" : s.net < 0 ? "neg" : "") + '">' + signed(s.net) + '</b><span>Net</span></div>';
    $("history").innerHTML = s.history.map(function (t) { return '<li class="' + (t === 7 ? "seven" : L.POINTS.indexOf(t) >= 0 ? "point" : "") + '">' + t + '</li>'; }).join("");
    $("seedNote").textContent = "Seed " + s.seed + ". Open ?seed=" + s.seed + " to replay this dice sequence.";
  }
  function renderOutcomes(r) {
    var box = $("outcomes");
    if (!r) { box.hidden = true; return; }
    box.hidden = false;
    var head = r.decision === "sevenout" ? "Seven out" : r.decision === "made" ? "Point " + r.point + " made" : r.decision === "point" ? "Point is " + r.total : r.decision === "natural" ? (r.total === 7 ? "Seven, a natural" : "Yo eleven, a natural") : r.decision === "craps" ? "Craps" : (r.hard ? "Hard " + r.total : String(r.total));
    var o = '<div class="head"><svg viewBox="-20 -20 40 40" aria-hidden="true">' + dieSvg(r.d1, 32, { shadow: false }) + '</svg><svg viewBox="-20 -20 40 40" aria-hidden="true">' + dieSvg(r.d2, 32, { shadow: false }) + '</svg>' +
      '<div><b>' + r.d1 + ' + ' + r.d2 + ' = ' + r.total + '</b><span>' + esc(head) + (r.cameOut ? ", come-out roll" : "") + '</span></div></div>';
    if (!r.outcomes.length) o += '<p class="empty">No bet was decided by this roll.</p>';
    else {
      o += "<ul>";
      r.outcomes.forEach(function (x) {
        var cls = x.result, amt = x.result === "win" ? signed(x.payout) : x.result === "lose" ? signed(x.payout) : x.result === "push" ? "push" : "travels";
        o += '<li><span class="lab">' + esc(x.label) + '<small>' + x.amount + '</small></span><span class="amt ' + cls + '">' + amt + '</span>' + (x.note ? '<span class="note">' + esc(x.note) + '</span>' : "") + '</li>';
      });
      o += "</ul>";
      o += '<div class="total"><span>This roll</span><span class="' + (r.net > 0 ? "win" : r.net < 0 ? "lose" : "push") + '">' + signed(r.net) + '</span></div>';
    }
    box.innerHTML = o;
  }
  function render() {
    if (!app.s) return;
    renderTable();
    renderHud();
    setStatus(defaultStatus());
    saveGame();
  }

  // ------------------------------------------------------------ betting interaction
  function placeAt(kind, number) {
    var s = app.s, fit = L.fitBet(s, kind, number, app.chip);
    if (!fit.amount) { hint(fit.reason, L.betKey(kind, number)); return; }
    var r = L.placeBet(s, kind, number, fit.amount);
    if (!r.ok) { hint(r.reason, L.betKey(kind, number)); return; }
    hint(fit.note || "");
    render();
    if (!REDUCED) {
      var key = r.key, sel = L.isOddsKind(kind) ? (kind === "passodds" ? "passodds" : kind === "dpodds" ? "dpodds" : kind + ":" + number) : key;
      var g = $("table").querySelector('[data-stack="' + sel + '"]');
      if (g) g.classList.add("drop");
    }
  }
  function oddsKindForKey(key) {
    var pk = L.parseKey(key);
    if (key === "pass") return { kind: "passodds", number: null };
    if (key === "dontpass") return { kind: "dpodds", number: null };
    if (pk.kind === "come" && pk.number) return { kind: "comeodds", number: pk.number };
    if (pk.kind === "dontcome" && pk.number) return { kind: "dcodds", number: pk.number };
    return null;
  }
  // Normal mode: a tap on a stack adds another chip (or odds behind a locked contract bet).
  // Pick-up mode: a tap on a stack takes the selected chip back, or the whole bet if the remainder would be invalid.
  function tapStack(key) {
    var s = app.s, pk = L.parseKey(key), kind = pk.kind, number = pk.number;
    var isOdds = L.isOddsKind(kind);
    if (!app.pickup) {
      var can0 = L.canRemove(s, kind, number);
      var ok2 = oddsKindForKey(key);
      if (!isOdds && !can0.ok && can0.code === "locked" && ok2) { placeAt(ok2.kind, ok2.number); return; }
      placeAt(kind, number);
      return;
    }
    var can = L.canRemove(s, kind, number);
    if (!can.ok) { hint(can.reason, key); return; }
    var r = L.removeBet(s, kind, number, app.chip);
    if (!r.ok && r.code === "remainder") r = L.removeBet(s, kind, number);
    if (!r.ok) { hint(r.reason, key); return; }
    hint("");
    if (Object.keys(s.bets).length === 0) app.pickup = false;
    render();
  }
  function tapZone(key) {
    var zn = null;
    for (var i = 0; i < app.lay.zones.length; i++) if (app.lay.zones[i].key === key) zn = app.lay.zones[i];
    if (!zn) return;
    if (app.pickup) { hint("Pick-up is on: tap one of your stacks to take chips back, or tap Pick up again to bet."); return; }
    placeAt(zn.kind, zn.number);
  }
  function setPickup(on) {
    app.pickup = on;
    $("table").classList.toggle("pickup", on);
    var pb = $("pickupBtn");
    if (pb) { pb.classList.toggle("on", on); pb.setAttribute("aria-pressed", on ? "true" : "false"); }
    $("trayhint").textContent = on ? "Pick-up mode: tap one of your stacks to take the selected chip back (line bets lock once the point is on)." : "Tap a chip, then a betting area. Tap a stack to add to it, or to add odds behind a line or come bet.";
  }
  $("table").addEventListener("click", function (e) {
    if (app.busy || !app.s) return;
    var st = e.target.closest("[data-stack]");
    if (st) { tapStack(st.dataset.stack); return; }
    var zn = e.target.closest("[data-zone]");
    if (zn) tapZone(zn.dataset.zone);
  });
  $("table").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target.closest("[data-stack],[data-zone]");
    if (!t) return;
    e.preventDefault();
    if (app.busy) return;
    if (t.dataset.stack) tapStack(t.dataset.stack); else tapZone(t.dataset.zone);
  });
  $("chips").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.id === "pickupBtn") { setPickup(!app.pickup); renderHud(); return; }
    app.chip = +b.dataset.chip;
    if (app.pickup) setPickup(false);
    renderHud();
    saveGame();
  });
  function buildTray() {
    $("chips").innerHTML = L.CHIPS.map(function (d) {
      return '<button type="button" data-chip="' + d + '" aria-label="' + d + ' chip" aria-pressed="false">' + chipHtml(d, 56) + '<span>' + d + '</span></button>';
    }).join("") + '<button type="button" id="pickupBtn" class="pickup" aria-pressed="false" aria-label="Pick up chips"><svg viewBox="-32 -32 64 64" aria-hidden="true"><circle r="26" fill="none" stroke="#F1D27A" stroke-width="3" stroke-dasharray="7 5"/><path d="M0 14 V-12 M-10 -2 L0 -12 L10 -2" fill="none" stroke="#F1D27A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Pick up</span></button>';
  }
  $("repeatBtn").addEventListener("click", function () {
    if (app.busy) return;
    var n = L.repeatBets(app.s);
    hint(n ? "" : "Nothing to repeat.");
    render();
  });
  $("clearBtn").addEventListener("click", function () {
    if (app.busy) return;
    L.clearBets(app.s);
    render();
  });
  $("workingBtn").addEventListener("click", function () {
    if (app.busy) return;
    L.toggleWorking(app.s);
    render();
  });

  // ------------------------------------------------------------ rolling
  function tumbleStep(step, endAt, onDone) {
    var d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6); // cosmetic faces only, the real dice come from the seeded logic
    setDice(d1, d2, step === 0);
    if (performance.now() < endAt) app.timer = setTimeout(function () { tumbleStep(step + 1, endAt, onDone); }, 85);
    else onDone();
  }
  function doRoll() {
    var s = app.s;
    if (app.busy || !L.canRoll(s).ok) return;
    app.busy = true;
    if (app.pickup) setPickup(false);
    renderHud();
    setStatus("Dice are out.");
    hint("");
    var r = L.roll(s);
    app.lastRoll = r;
    saveGame();
    var finish = function () {
      setDice(r.d1, r.d2, false);
      var summary = r.d1 + " and " + r.d2 + ", " + (r.hard && r.total !== 2 && r.total !== 12 ? "hard " : "") + r.total + ". ";
      if (r.decision === "sevenout") summary += "Seven out, line away.";
      else if (r.decision === "made") summary += "Point " + r.point + " made, pay the line.";
      else if (r.decision === "point") summary += "The point is " + r.total + ".";
      else if (r.decision === "natural") summary += "Natural, pass line wins.";
      else if (r.decision === "craps") summary += "Craps.";
      setStatus(summary);
      // winners pulse gold and losers fade on the old table, then the table redraws with the paid result
      var fx = $("table").querySelector(".fx"), any = false;
      if (!REDUCED && fx) {
        r.outcomes.forEach(function (x) {
          if (x.result !== "win" && x.result !== "lose") return;
          var key = x.kind === "passodds" ? "passodds" : x.kind === "dpodds" ? "dpodds" : x.kind === "comeodds" ? "comeodds:" + x.number : x.kind === "dcodds" ? "dcodds:" + x.number : x.key;
          var p = app.lay.pos[key];
          if (!p) return;
          var g = $("table").querySelector('[data-stack="' + key + '"]');
          if (x.result === "win") {
            any = true;
            fx.insertAdjacentHTML("beforeend", '<circle class="winglow" cx="' + p.x + '" cy="' + (p.y - 6) + '" r="26" fill="none" stroke="#F1D27A" stroke-width="3" opacity="0"/>' +
              '<circle class="winglow" cx="' + p.x + '" cy="' + (p.y - 6) + '" r="18" fill="rgba(241,210,122,0.25)" opacity="0"/>');
          } else if (g) { any = true; g.classList.add("losefade"); }
        });
      }
      var wait = REDUCED || !any ? 0 : 1250;
      app.timer = setTimeout(function () {
        app.busy = false;
        render();
        renderOutcomes(r);
        setStatus(summary + " " + defaultStatus());
        if (s.bankroll === 0 && Object.keys(s.bets).length === 0) saveRecord(s);
      }, wait);
    };
    if (REDUCED) finish();
    else tumbleStep(0, performance.now() + 600, finish);
  }
  $("rollBtn").addEventListener("click", doRoll);

  // ------------------------------------------------------------ menu, screens, modal
  function show(id) {
    ["menu", "game"].forEach(function (k) { $(k).hidden = k !== id; });
    window.scrollTo(0, 0);
  }
  function renderMenu() {
    show("menu");
    clearTimeout(app.timer); app.busy = false;
    var sv = loadSaved(), b = $("resume");
    if (sv) {
      b.hidden = false;
      b.textContent = "Resume session (bankroll " + fmt(sv.s.bankroll) + (sv.s.point ? ", point " + sv.s.point : "") + ")";
    } else b.hidden = true;
    var rec = loadRecord();
    $("recordCard").hidden = !rec;
    if (rec) $("record").innerHTML = '<div><b>' + fmt(rec.rolls) + '</b><span>Rolls</span></div><div><b>' + fmt(rec.pointsMade) + '</b><span>Points made</span></div><div><b>' + fmt(rec.biggestWin) + '</b><span>Biggest win</span></div><div><b class="' + (rec.net > 0 ? "pos" : rec.net < 0 ? "neg" : "") + '">' + signed(rec.net) + '</b><span>Net</span></div>';
    $("menuSeed").textContent = URL_SEED !== null ? "Seeded dice: " + URL_SEED : "";
    $("hero").innerHTML = heroSvg();
  }
  function heroSvg() {
    var o = '<svg class="hero" viewBox="0 0 560 190" aria-hidden="true">';
    o += '<defs><radialGradient id="hf" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#47704F"/><stop offset="1" stop-color="#34523A"/></radialGradient></defs>';
    o += '<rect width="560" height="190" fill="url(#hf)"/>';
    o += '<g opacity="0.9">' + txt("PASS LINE", 160, 160, 26, { ls: 8 }) + '<path d="M20 125 Q 280 95 540 125" fill="none" stroke="' + CREAM + '" stroke-width="2.4"/><path d="M20 175 Q 280 145 540 175" fill="none" stroke="' + CREAM + '" stroke-width="2.4"/></g>';
    o += '<g opacity="0.85">' + txt("COME", 400, 60, 34, { ls: 10 }) + '<rect x="300" y="18" width="200" height="60" rx="8" fill="none" stroke="' + CREAM + '" stroke-width="2"/></g>';
    o += '<g transform="translate(170,70) rotate(-12)">' + dieSvg(5, 64) + '</g><g transform="translate(250,88) rotate(9)">' + dieSvg(2, 64) + '</g>';
    o += '<g transform="translate(70,110)">' + stackSvg(130, 18, "", "", "") + '</g>';
    o += '<g transform="translate(470,120)">' + stackSvg(525, 18, "", "", "") + '</g>';
    o += '<g transform="translate(380,135)">' + stackSvg(25, 16, "", "", "") + '</g>';
    o += '</svg>';
    return o;
  }
  function modal(title, body, btns) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    var wrap = $("modalBtns"); wrap.innerHTML = "";
    btns.forEach(function (b) {
      var el = document.createElement("button");
      el.type = "button"; el.className = "btn" + (b.primary ? " primary" : ""); el.textContent = b.label;
      el.addEventListener("click", function () { $("modal").hidden = true; if (b.fn) b.fn(); });
      wrap.appendChild(el);
    });
    $("modal").hidden = false;
    wrap.querySelector("button").focus();
  }
  function startGame(bank) {
    clearTimeout(app.timer); app.busy = false;
    app.s = L.newGame({ bankroll: bank, seed: URL_SEED !== null ? URL_SEED : clockSeed });
    clockSeed = (clockSeed + 7919) >>> 0;
    app.chip = 5; app.lastRoll = null;
    openGame();
  }
  function openGame() {
    show("game");
    setPickup(false);
    renderOutcomes(null);
    fitOrientation();
    render();
  }
  $("bankSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    app.bank = +b.dataset.bank;
    Array.prototype.forEach.call($("bankSeg").children, function (c) { c.classList.toggle("on", c === b); });
  });
  $("startBtn").addEventListener("click", function () {
    var sv = loadSaved();
    if (sv) modal("Replace the saved session?", "<p>Your saved table (bankroll " + fmt(sv.s.bankroll) + ") will be cleared.</p>", [{ label: "Keep it" }, { label: "New session", primary: true, fn: function () { startGame(app.bank); } }]);
    else startGame(app.bank);
  });
  $("resume").addEventListener("click", function () {
    var sv = loadSaved(); if (!sv) return;
    app.s = sv.s; app.chip = L.CHIPS.indexOf(sv.chip) >= 0 ? sv.chip : 5; app.lastRoll = sv.s.lastRoll;
    openGame();
    if (app.lastRoll) renderOutcomes(app.lastRoll);
  });
  $("menuBtn").addEventListener("click", function () { saveGame(); renderMenu(); });
  $("resetBtn").addEventListener("click", function () {
    var s = app.s; if (!s) return;
    modal("Reset bankroll?", "<p>Clears the table and starts a fresh rack of " + fmt(s.startBankroll) + " play chips. Session stats reset too.</p>",
      [{ label: "Cancel" }, { label: "Reset", primary: true, fn: function () { saveRecord(s); startGame(s.startBankroll); } }]);
  });
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) $("modal").hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) $("modal").hidden = true; });

  // ------------------------------------------------------------ orientation
  function fitOrientation() {
    var vert = window.innerWidth < 760;
    if (!app.lay || app.lay.vert !== vert) app.lay = buildLayout(vert);
    app.vert = vert;
    var oc = $("outcomes"), wide = window.innerWidth >= 900, side = document.querySelector("#game .side");
    if (wide && oc.parentNode !== side) side.insertBefore(oc, side.firstChild);
    else if (!wide && oc.parentNode === side) document.querySelector("#game .play").appendChild(oc);
  }
  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!app.s || $("game").hidden) return;
      var was = app.lay && app.lay.vert, wasWide = $("outcomes").parentNode.classList.contains("side");
      fitOrientation();
      if (wasWide !== $("outcomes").parentNode.classList.contains("side")) { /* panel moved */ }
      if (app.lay.vert !== was && !app.busy) render();
    }, 120);
  });

  // ------------------------------------------------------------ rules
  function rulesHtml() {
    var rows = L.payoutTable().map(function (r) {
      return '<li><b>' + esc(r.bet) + '</b><span class="pays">' + esc(r.pays) + '</span><small>' + esc(r.note) + '</small></li>';
    }).join("");
    return '<details class="card rules"><summary>How to play</summary><div class="body">' +
      "<h3>The flow</h3><ul>" +
      "<li>Each hand starts with a <b>come-out roll</b> (puck OFF). Bet the Pass line or Don't pass first. A 7 or 11 wins the Pass line at once, 2, 3 or 12 (craps) loses it. Any other number (4, 5, 6, 8, 9, 10) becomes the <b>point</b> and the puck turns ON.</li>" +
      "<li>With a point on, the shooter rolls until the point repeats (Pass wins, the hand ends) or a 7 shows (<b>seven out</b>: Pass loses, place, buy, hardway and come bets are cleared, Don't pass and lays win).</li>" +
      "<li>Don't pass is the mirror image: 2 and 3 win on the come-out, 7 and 11 lose, 12 is a push (bar 12). Then a 7 before the point wins.</li>" +
      "<li>Line bets are contracts: once the point is set they cannot be picked up. Odds, place, buy, lay, hardways and the one-roll bets can come down any time before a roll (tap your stack).</li></ul>" +
      "<h3>Betting</h3><ul>" +
      "<li>Tap a chip in the tray, then tap an area of the layout. Each tap adds one chip. Bets must be in valid units: place 6 and 8 in multiples of 6, place 4, 5, 9 and 10 in multiples of 5, horn in 4s, C and E in 2s. The table says what is wrong when a chip does not fit.</li>" +
      "<li><b>Odds</b> have no house edge. With the point on, tap ODDS behind the Pass line or tap your Pass line stack. Tap a travelled Come stack to add odds behind it. 3-4-5x: 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8. Lay odds behind Don't bets up to 6x.</li>" +
      "<li><b>Come</b> works like a new Pass line bet placed after the point. It wins on 7 or 11, loses on craps, otherwise travels to the number rolled and wins when that number repeats before a 7. Don't come is the mirror image.</li>" +
      "<li><b>Place</b> bets wait for their number to roll before a 7 and stay up after paying. They are off on the come-out roll unless you switch them to working.</li>" +
      "<li><b>Buy</b> bets pay true odds for a 5% commission on the win. <b>Lay</b> bets back the 7 against a number and are always working.</li>" +
      "<li><b>Hardways</b> need the pair (3-3 for hard 6) before a 7 or the easy way. The <b>Field</b>, <b>Any seven</b>, <b>Any craps</b>, <b>2, 3, 11, 12</b>, <b>Horn</b> and <b>C and E</b> are one-roll bets.</li>" +
      "<li>Come odds are off on the come-out roll and are returned if the bet is decided then. Repeat bets puts the last table back after a decision.</li></ul>" +
      "<h3>Payouts</h3><ul class=\"paytable\">" + rows + "</ul>" +
      "<h3>The house</h3><p>Play chips only. The table minimum is 5 and the chips are 1, 5, 25, 100 and 500. Dice are two fair six-sided dice from a seeded generator; the session saves itself after every action.</p>" +
      "</div></details>";
  }
  function fillRules() {
    var slots = document.querySelectorAll(".rules-slot");
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = rulesHtml();
  }

  // ------------------------------------------------------------ boot
  fillRules();
  buildTray();
  renderMenu();

  window.__craps = { app: app, L: L, render: render, roll: doRoll, start: startGame, layout: function () { return app.lay; } };
})();
