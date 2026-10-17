/* Stratego art module: procedural SVG for the board, tokens and effects.
   Everything is gradients, patterns and paths; no external assets.
   Shared <defs> live once in a hidden SVG so every inline SVG on the page
   (board, tray, graveyard, legend, hero) resolves the same url(#id) refs. */
(function () {
  "use strict";
  var FLAG = 0, SPY = 1, SCOUT = 2, MINER = 3, GENERAL = 9, MARSHAL = 10, BOMB = 11;
  var RED = 0, BLUE = 1;
  var A = {};

  // ---------- shared defs ----------
  function grad(id, type, attrs, stops) {
    var s = "<" + type + 'Gradient id="' + id + '"' + attrs + ">";
    stops.forEach(function (st) { s += '<stop offset="' + st[0] + '" stop-color="' + st[1] + '"' + (st[2] !== undefined ? ' stop-opacity="' + st[2] + '"' : "") + "/>"; });
    return s + "</" + type + "Gradient>";
  }
  // Octagon (Blue) and rounded square (Red) faces in a 40x40 token space.
  var SHAPE_R = "M11.5 3H28.5A7 7 0 0 1 35.5 10V26A7 7 0 0 1 28.5 33H11.5A7 7 0 0 1 4.5 26V10A7 7 0 0 1 11.5 3Z";
  var SHAPE_Ri = "M12.5 5.6H27.5A5 5 0 0 1 32.5 10.6V25.4A5 5 0 0 1 27.5 30.4H12.5A5 5 0 0 1 7.5 25.4V10.6A5 5 0 0 1 12.5 5.6Z";
  var SHAPE_B = "M13.2 3H26.8L35.5 11.7V24.3L26.8 33H13.2L4.5 24.3V11.7Z";
  var SHAPE_Bi = "M14.3 5.6H25.7L32.9 12.8V23.2L25.7 30.4H14.3L7.1 23.2V12.8Z";

  A.defs = function () {
    var d = "<defs>";
    // wood, brass, parchment
    d += grad("sgWalnut", "linear", ' x1="0" y1="0" x2="1" y2="1"', [[0, "#6B4529"], [0.5, "#4A2D18"], [1, "#2E1A0D"]]);
    d += grad("sgBrass", "linear", ' x1="0" y1="0" x2="1" y2="1"', [[0, "#F0D58A"], [0.5, "#B98A2A"], [1, "#6F5014"]]);
    d += grad("sgParch", "radial", ' cx="0.42" cy="0.38" r="0.8"', [[0, "#EEE2C6"], [0.6, "#E0D0AC"], [1, "#C8B189"]]);
    d += grad("sgVig", "radial", ' cx="0.5" cy="0.5" r="0.72"', [[0.55, "#3A2410", 0], [1, "#3A2410", 0.34]]);
    d += grad("sgEdgeT", "linear", ' x1="0" y1="0" x2="0" y2="1"', [[0, "#1A0E05", 0.5], [1, "#1A0E05", 0]]);
    d += grad("sgEdgeL", "linear", ' x1="0" y1="0" x2="1" y2="0"', [[0, "#1A0E05", 0.42], [1, "#1A0E05", 0]]);
    d += grad("sgEdgeB", "linear", ' x1="0" y1="1" x2="0" y2="0"', [[0, "#1A0E05", 0.22], [1, "#1A0E05", 0]]);
    d += grad("sgEdgeR", "linear", ' x1="1" y1="0" x2="0" y2="0"', [[0, "#1A0E05", 0.22], [1, "#1A0E05", 0]]);
    // wood grain pattern for the frame
    d += '<pattern id="sgWood" width="140" height="26" patternUnits="userSpaceOnUse">' +
      '<path d="M-10 6q35 -6 70 0t80 2" fill="none" stroke="#1E1006" stroke-opacity="0.35" stroke-width="1.1"/>' +
      '<path d="M-10 14q40 5 70 -1t80 3" fill="none" stroke="#F3D7A8" stroke-opacity="0.09" stroke-width="0.9"/>' +
      '<path d="M-10 21q30 -4 60 1t90 -2" fill="none" stroke="#1E1006" stroke-opacity="0.22" stroke-width="0.8"/>' +
      '<path d="M-10 2q50 4 70 -1t80 2" fill="none" stroke="#1E1006" stroke-opacity="0.16" stroke-width="0.6"/>' +
      "</pattern>";
    // checker, recessed cell bevel, parchment grain
    d += '<pattern id="sgCheck" width="80" height="80" patternUnits="userSpaceOnUse">' +
      '<rect x="40" y="0" width="40" height="40" fill="#4A2E12" fill-opacity="0.12"/><rect x="0" y="40" width="40" height="40" fill="#4A2E12" fill-opacity="0.12"/></pattern>';
    d += '<pattern id="sgCell" width="40" height="40" patternUnits="userSpaceOnUse">' +
      '<path d="M0.5 39.5V0.5H39.5" fill="none" stroke="#2C1A08" stroke-opacity="0.28" stroke-width="1"/>' +
      '<path d="M1.5 38.5V1.5H38.5" fill="none" stroke="#2C1A08" stroke-opacity="0.10" stroke-width="1"/>' +
      '<path d="M39.5 0.5V39.5H0.5" fill="none" stroke="#FFF6E2" stroke-opacity="0.55" stroke-width="1"/>' +
      "</pattern>";
    d += '<pattern id="sgGrain" width="64" height="64" patternUnits="userSpaceOnUse">' +
      '<g fill="#5A3A14" fill-opacity="0.16">' +
      '<ellipse cx="7" cy="11" rx="2.2" ry="0.5"/><ellipse cx="31" cy="4" rx="3" ry="0.5" transform="rotate(12 31 4)"/><ellipse cx="52" cy="17" rx="1.8" ry="0.5"/>' +
      '<ellipse cx="18" cy="29" rx="2.6" ry="0.5" transform="rotate(-8 18 29)"/><ellipse cx="44" cy="36" rx="2" ry="0.5"/><ellipse cx="9" cy="47" rx="1.6" ry="0.5"/>' +
      '<ellipse cx="59" cy="52" rx="2.4" ry="0.5" transform="rotate(10 59 52)"/><ellipse cx="33" cy="58" rx="2.8" ry="0.5"/><ellipse cx="24" cy="44" rx="1.2" ry="0.5"/>' +
      '</g><g fill="#FFF8E8" fill-opacity="0.35"><circle cx="40" cy="22" r="0.7"/><circle cx="14" cy="60" r="0.6"/><circle cx="57" cy="40" r="0.6"/><circle cx="3" cy="33" r="0.5"/></g>' +
      "</pattern>";
    // water
    d += grad("sgWater", "radial", ' cx="0.35" cy="0.3" r="0.9"', [[0, "#3F9AA4"], [0.45, "#226873"], [1, "#0D3440"]]);
    d += grad("sgShore", "linear", ' x1="0" y1="0" x2="1" y2="1"', [[0, "#D4BF95"], [0.5, "#B59D70"], [1, "#8A744E"]]);
    d += grad("sgWaterT", "linear", ' x1="0" y1="0" x2="0" y2="1"', [[0, "#041B22", 0.6], [1, "#041B22", 0]]);
    d += grad("sgWaterL", "linear", ' x1="0" y1="0" x2="1" y2="0"', [[0, "#041B22", 0.5], [1, "#041B22", 0]]);
    d += '<clipPath id="sgLakeClip"><rect x="5" y="5" width="70" height="70" rx="9"/></clipPath>';
    // tokens
    d += '<path id="sgR" d="' + SHAPE_R + '"/><path id="sgRi" d="' + SHAPE_Ri + '"/><path id="sgB" d="' + SHAPE_B + '"/><path id="sgBi" d="' + SHAPE_Bi + '"/>';
    d += grad("sgShd", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#120804", 0.5], [0.6, "#120804", 0.25], [1, "#120804", 0]]);
    d += grad("sgShdL", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#120804", 0.55], [0.55, "#120804", 0.28], [1, "#120804", 0]]);
    d += grad("sgRf", "linear", ' x1="0" y1="0" x2="0.7" y2="1"', [[0, "#D8604A"], [0.42, "#A8381F"], [1, "#5C160B"]]);
    d += grad("sgBf", "linear", ' x1="0" y1="0" x2="0.7" y2="1"', [[0, "#6A92C4"], [0.42, "#355484"], [1, "#152846"]]);
    d += grad("sgGoldS", "linear", ' x1="0" y1="0" x2="1" y2="1"', [[0, "#FBE7A3"], [0.45, "#D1A33A"], [1, "#7D5A12"]]);
    d += grad("sgSilS", "linear", ' x1="0" y1="0" x2="1" y2="1"', [[0, "#F7F9FB"], [0.45, "#B9C4D0"], [1, "#5E6D7E"]]);
    d += grad("sgSheen", "linear", ' x1="0" y1="0" x2="0" y2="1"', [[0, "#FFFFFF", 0.3], [0.45, "#FFFFFF", 0.04], [1, "#FFFFFF", 0]]);
    d += grad("sgPlate", "linear", ' x1="0" y1="0" x2="0" y2="1"', [[0, "#FFFBF0"], [1, "#EADBBC"]]);
    d += grad("sgGem", "radial", ' cx="0.35" cy="0.3" r="0.75"', [[0, "#FFF0B8"], [0.4, "#E0B13F"], [1, "#8A5F0E"]]);
    d += grad("sgIron", "radial", ' cx="0.35" cy="0.32" r="0.8"', [[0, "#6E6A66"], [0.4, "#2E2A27"], [1, "#0E0B09"]]);
    d += grad("sgSpark", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#FFF3B0", 0.95], [0.5, "#FFB83A", 0.5], [1, "#FF8A1E", 0]]);
    d += grad("sgFlag", "linear", ' x1="0" y1="0" x2="1" y2="1"', [[0, "#FFE38A"], [0.5, "#E2B23A"], [1, "#A6771A"]]);
    // highlights and markers
    d += grad("sgGlowG", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#3F7A4C", 0.55], [0.55, "#3F7A4C", 0.22], [1, "#3F7A4C", 0]]);
    d += grad("sgDisc", "radial", ' cx="0.38" cy="0.32" r="0.8"', [[0, "#6E9E78"], [0.5, "#2F4B35"], [1, "#1C3022"]]);
    d += grad("sgGlowC", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#D9663A", 0.45], [0.6, "#D9663A", 0.18], [1, "#D9663A", 0]]);
    d += grad("sgGlowGold", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#F2C14E", 0.6], [0.6, "#F2C14E", 0.25], [1, "#F2C14E", 0]]);
    d += grad("sgTrail", "linear", ' gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0"', [[0, "#F2C14E", 0.15], [1, "#F2C14E", 0.95]]);
    d += grad("sgVs", "radial", ' cx="0.4" cy="0.3" r="0.8"', [[0, "#FFE9A6"], [0.5, "#D1A33A"], [1, "#7A5410"]]);
    d += grad("sgFlash", "radial", ' cx="0.5" cy="0.5" r="0.5"', [[0, "#FFFFFF", 0.95], [0.4, "#FFE08A", 0.6], [1, "#FFB347", 0]]);
    d += grad("sgSky", "linear", ' x1="0" y1="0" x2="0" y2="1"', [[0, "#2B2622"], [1, "#5A4330"]]);
    // filters (shared, used sparingly)
    d += '<filter id="sgBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>';
    d += '<filter id="sgLift" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="1.5" dy="5" stdDeviation="2.6" flood-color="#1A0E05" flood-opacity="0.55"/></filter>';
    d += '<filter id="sgSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter>';
    // reusable token parts, so each piece on the board is a few <use> refs
    d += '<g id="sgBody0">' + body(RED, false) + '</g><g id="sgBody1">' + body(BLUE, false) + "</g>";
    d += '<g id="sgBodyL0">' + body(RED, true) + '</g><g id="sgBodyL1">' + body(BLUE, true) + "</g>";
    d += '<g id="sgCrest0">' + crest(RED) + '</g><g id="sgCrest1">' + crest(BLUE) + "</g>";
    d += '<g id="sgBomb">' + bomb() + "</g>";
    return d + "</defs>";
  };

  A.install = function () {
    if (document.getElementById("sgDefs")) return;
    var h = document.createElement("div");
    h.innerHTML = '<svg id="sgDefs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">' + A.defs() + "</svg>";
    document.body.insertBefore(h.firstChild, document.body.firstChild);
  };

  // ---------- tokens ----------
  var INK = { 0: "#2B1612", 1: "#13223A" };
  var SIDE = { 0: "#4E1409", 1: "#101F38" };
  var FACE = { 0: "url(#sgRf)", 1: "url(#sgBf)" };
  var BEVEL = { 0: "url(#sgGoldS)", 1: "url(#sgSilS)" };
  var METAL = { 0: "#E9BE57", 1: "#D7DFE8" };
  var METAL_D = { 0: "#7D5A12", 1: "#5E6D7E" };
  function shapeId(o) { return o === RED ? "sgR" : "sgB"; }
  function ringId(o) { return o === RED ? "sgRi" : "sgBi"; }

  function body(o, lift) {
    var s = "";
    s += lift ? '<rect x="1" y="10" width="38" height="32" rx="13" fill="url(#sgShdL)"/>' : '<rect x="3" y="8.5" width="34" height="30" rx="12" fill="url(#sgShd)"/>';
    s += '<use href="#' + shapeId(o) + '" y="3.4" fill="' + SIDE[o] + '"/>';
    s += '<use href="#' + shapeId(o) + '" y="1.9" fill="' + SIDE[o] + '" opacity="0.6"/>';
    s += '<use href="#' + shapeId(o) + '" fill="' + FACE[o] + '"/>';
    s += '<use href="#' + ringId(o) + '" fill="none" stroke="' + BEVEL[o] + '" stroke-width="1.5"/>';
    s += '<use href="#' + ringId(o) + '" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="0.6" transform="translate(0.5 0.6)"/>';
    s += '<use href="#' + shapeId(o) + '" fill="url(#sgSheen)"/>';
    s += '<path d="M12 7.6Q20 5 28 7.6" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="1.1" stroke-linecap="round"/>';
    return s;
  }
  function plate(o, label, big) {
    var fs = big ? 19 : 15.5, y = big ? 28.1 : 27.2, ls = big ? "" : ' letter-spacing="-0.6"';
    var s = '<rect x="7" y="11" width="26" height="20.5" rx="3.6" fill="url(#sgPlate)" stroke="' + SIDE[o] + '" stroke-opacity="0.7" stroke-width="0.8"/>' +
      '<path d="M8.6 12.3H31.4" stroke="#3A2410" stroke-opacity="0.22" stroke-width="1"/>' +
      '<path d="M8.6 30.3H31.4" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="0.8"/>' +
      '<text x="20" y="' + (y + 0.7) + '" text-anchor="middle" font-size="' + fs + '" font-weight="600" fill="#FFFFFF" fill-opacity="0.85"' + ls + ">" + label + "</text>" +
      '<text x="20" y="' + y + '" text-anchor="middle" font-size="' + fs + '" font-weight="600" fill="' + INK[o] + '"' + ls + ">" + label + "</text>";
    return s;
  }
  function emblem(o, rank) {
    var m = METAL[o], md = METAL_D[o];
    if (rank === MARSHAL) return '<path d="M20 3l1.5 3.1 3.4 0.4-2.5 2.4 0.7 3.4-3.1-1.7-3.1 1.7 0.7-3.4-2.5-2.4 3.4-0.4z" fill="' + m + '" stroke="' + md + '" stroke-width="0.5"/>';
    if (rank === GENERAL) return '<path d="M15 9.6l5-3.2 5 3.2M15 6.2l5-3.2 5 3.2" fill="none" stroke="' + m + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    if (rank === 8) return '<path d="M14 9.6l6-4.6 6 4.6" fill="none" stroke="' + m + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    if (rank === MINER) return '<path d="M20 4.4v6.2" stroke="' + m + '" stroke-width="1.8" stroke-linecap="round"/><path d="M13.8 6.8q6.2-4.6 12.4 0" fill="none" stroke="' + m + '" stroke-width="1.8" stroke-linecap="round"/>';
    if (rank === SCOUT) return '<path d="M22 2.8l-5 5h3.4l-1.6 3.8 5.2-5.3h-3.4z" fill="' + m + '" stroke="' + md + '" stroke-width="0.4"/>';
    if (rank === SPY) return '<path d="M13 7q7-5.4 14 0q-7 5.4-14 0z" fill="' + m + '" stroke="' + md + '" stroke-width="0.4"/><circle cx="20" cy="7" r="1.9" fill="' + INK[o] + '"/>';
    return "";
  }
  function crest(o) {
    var m = METAL[o];
    var sh = "M20 9.5l9 3v7.5c0 5-4 8.5-9 10.5c-5-2-9-5.5-9-10.5v-7.5z";
    return '<path d="' + sh + '" fill="#000" fill-opacity="0.32" transform="translate(0.7 0.9)"/>' +
      '<path d="' + sh + '" fill="#FFF" fill-opacity="0.28" transform="translate(-0.5 -0.6)"/>' +
      '<path d="' + sh + '" fill="' + SIDE[o] + '" fill-opacity="0.55" stroke="' + m + '" stroke-opacity="0.75" stroke-width="0.9"/>' +
      '<path d="M14.5 26.5Q17 19 25.5 13.5M25.5 26.5Q23 19 14.5 13.5" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2.4" stroke-linecap="round" transform="translate(0.5 0.7)"/>' +
      '<path d="M14.5 26.5Q17 19 25.5 13.5M25.5 26.5Q23 19 14.5 13.5" fill="none" stroke="' + m + '" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M15.6 24.5Q18 18.5 25 14M24.4 24.5Q22 18.5 15 14" fill="none" stroke="#FFF" stroke-opacity="0.5" stroke-width="0.5" stroke-linecap="round"/>' +
      '<path d="M13.2 24.2l3.4 1.8M26.8 24.2l-3.4 1.8" stroke="' + m + '" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="14.1" cy="27" r="1.2" fill="' + m + '"/><circle cx="25.9" cy="27" r="1.2" fill="' + m + '"/>';
  }
  function bomb() {
    return '<ellipse cx="19.5" cy="31.5" rx="9" ry="2.2" fill="#000" fill-opacity="0.35"/>' +
      '<circle cx="19" cy="22.5" r="9.5" fill="url(#sgIron)" stroke="#000" stroke-opacity="0.5" stroke-width="0.6"/>' +
      '<ellipse cx="15.3" cy="18.3" rx="2.8" ry="1.8" fill="#FFF" fill-opacity="0.55" transform="rotate(-30 15.3 18.3)"/>' +
      '<path d="M16.5 12.6h5l-0.8 2.2h-3.4z" fill="#4A4542"/>' +
      '<path d="M22.5 13.3Q26 9.5 29.5 10.2" fill="none" stroke="#C9A96B" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="30.2" cy="9.3" r="5" fill="url(#sgSpark)" class="spark"/>' +
      '<path d="M30.2 5.2l1 2.9 3 0.9-3 0.9-1 2.9-1-2.9-3-0.9 3-0.9z" fill="#FFF0A0" stroke="#F0A020" stroke-width="0.5" class="spark"/>';
  }
  function flag(o) {
    return '<path d="M12.5 8v24" stroke="#000" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round" transform="translate(0.8 1)"/>' +
      '<path d="M12.5 8v24" stroke="' + METAL[o] + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M12.5 8v24" stroke="#FFF" stroke-opacity="0.5" stroke-width="0.7" stroke-linecap="round" transform="translate(-0.6 0)"/>' +
      '<circle cx="12.5" cy="7" r="1.9" fill="url(#sgGem)"/>' +
      '<path d="M14 10.5q8 -3 16 1.5q-3.5 3 -2 6.5q-7 -2 -14 1.5z" fill="#000" fill-opacity="0.3" transform="translate(1 1.3)"/>' +
      '<path d="M14 10.5q8 -3 16 1.5q-3.5 3 -2 6.5q-7 -2 -14 1.5z" fill="url(#sgFlag)" stroke="#6F4F0E" stroke-width="0.7"/>' +
      '<path d="M15 13q7 -2.2 13 1" fill="none" stroke="#FFF" stroke-opacity="0.45" stroke-width="0.8"/>' +
      '<path d="M8.5 32.5h8" stroke="' + METAL[o] + '" stroke-width="2.2" stroke-linecap="round"/>';
  }
  // 40x40 piece. mode: "face" | "hidden". lift: selected (bigger shadow).
  A.piece = function (o, rank, mode, moved, ghost, lift) {
    var s = '<g class="pc"' + (ghost ? ' opacity="0.72"' : "") + '><use href="#sgBody' + (lift ? "L" : "") + o + '"/>';
    if (mode === "hidden") {
      s += '<use href="#sgCrest' + o + '"/>';
      if (moved) s += '<circle cx="31.3" cy="7.6" r="2.9" fill="url(#sgGem)" stroke="#5E4208" stroke-width="0.6"/>';
      return s + "</g>";
    }
    if (rank === BOMB) s += '<use href="#sgBomb"/>';
    else if (rank === FLAG) s += flag(o);
    else if (rank === SPY) s += emblem(o, SPY) + plate(o, "S", true);
    else s += emblem(o, rank) + plate(o, String(rank), rank < 10);
    return s + "</g>";
  };
  A.tile = function (o, rank, mode, size) {
    return '<svg class="tile" viewBox="0 0 40 42" width="' + (size || 28) + '" height="' + (size || 28) + '" aria-hidden="true">' + A.piece(o, rank, mode || "face", false, false, false) + "</svg>";
  };

  // ---------- board surface ----------
  // viewBox is -14 -14 428 428: cells still occupy 0..400.
  A.frame = function () {
    var s = '<rect x="-14" y="-14" width="428" height="428" rx="12" fill="url(#sgWalnut)"/>' +
      '<rect x="-14" y="-14" width="428" height="428" rx="12" fill="url(#sgWood)"/>' +
      '<rect x="-13.2" y="-13.2" width="426.4" height="426.4" rx="11.4" fill="none" stroke="#1A0E05" stroke-opacity="0.75" stroke-width="1.6"/>' +
      '<path d="M-4 406.8H-9.8A3 3 0 0 1 -12.8 403.8V-9.8A3 3 0 0 1 -9.8 -12.8H403.8" fill="none" stroke="#F6DDB0" stroke-opacity="0.28" stroke-width="1.2"/>' +
      '<path d="M406.5 -6V403.8A3 3 0 0 1 403.5 406.8H-6" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1.4"/>' +
      '<rect x="-5.5" y="-5.5" width="411" height="411" rx="3" fill="none" stroke="url(#sgBrass)" stroke-width="1.3"/>' +
      '<rect x="-5.5" y="-5.5" width="411" height="411" rx="3" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="0.6" transform="translate(0.6 0.7)"/>' +
      '<rect x="-2" y="-2" width="404" height="404" fill="#1A0E05"/>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#sgParch)"/>' +
      '<rect x="0" y="0" width="400" height="400" fill="url(#sgCheck)"/>';
    return s;
  };
  // deterministic per-cell tone variation, seeded by index
  function hash(i) { var x = (i * 2654435761) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15; return (x >>> 0) / 4294967296; }
  A.cells = function (setup) {
    var s = "", i, x, y, h;
    for (i = 0; i < 100; i++) {
      x = (i % 10) * 40; y = Math.floor(i / 10) * 40; h = hash(i);
      var light = h > 0.5, op = (0.02 + Math.abs(h - 0.5) * 0.14).toFixed(3);
      s += '<rect x="' + x + '" y="' + y + '" width="40" height="40" fill="' + (light ? "#FFF4DC" : "#3A2410") + '" fill-opacity="' + op + '"/>';
    }
    // territory tints: cool for Blue (rows 1-4), warm for Red (rows 7-10)
    s += '<rect x="0" y="0" width="400" height="160" fill="#2F5E8A" fill-opacity="' + (setup ? 0.07 : 0.06) + '"/>';
    s += '<rect x="0" y="240" width="400" height="160" fill="#C94A2A" fill-opacity="' + (setup ? 0.13 : 0.06) + '"/>';
    if (setup) s += '<rect x="1" y="241" width="398" height="158" fill="none" stroke="#C99A2E" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="6 4"/>';
    s += '<rect x="0" y="0" width="400" height="400" fill="url(#sgGrain)" opacity="0.6"/>';
    s += '<rect x="0" y="0" width="400" height="400" fill="url(#sgCell)"/>';
    s += '<rect x="0" y="0" width="400" height="400" fill="url(#sgVig)"/>';
    // inner shadow of the frame falling onto the field
    s += '<rect x="0" y="0" width="400" height="16" fill="url(#sgEdgeT)"/><rect x="0" y="0" width="14" height="400" fill="url(#sgEdgeL)"/>' +
      '<rect x="0" y="392" width="400" height="8" fill="url(#sgEdgeB)"/><rect x="392" y="0" width="8" height="400" fill="url(#sgEdgeR)"/>';
    return s;
  };
  A.lake = function (x, y) {
    var s = '<g transform="translate(' + x + " " + y + ')">' +
      '<rect x="2" y="4" width="76" height="76" rx="12" fill="#0A1A1E" fill-opacity="0.6" filter="url(#sgBlur)"/>' +
      '<rect x="1.5" y="1.5" width="77" height="77" rx="11.5" fill="url(#sgShore)" stroke="#5E4B2E" stroke-width="0.8"/>' +
      '<path d="M4 74V6a2 2 0 0 1 2-2h68" fill="none" stroke="#FFF6E0" stroke-opacity="0.5" stroke-width="1"/>' +
      '<rect x="5" y="5" width="70" height="70" rx="9" fill="url(#sgWater)"/>' +
      '<g clip-path="url(#sgLakeClip)">' +
      '<path class="wave w1" d="M-30 22q10-5 20 0t20 0t20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#E6FBF9" stroke-opacity="0.6" stroke-width="1.4"/>' +
      '<path class="wave w2" d="M-30 38q10-4 20 0t20 0t20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#E6FBF9" stroke-opacity="0.45" stroke-width="1.3"/>' +
      '<path class="wave w3" d="M-30 54q10-5 20 0t20 0t20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#E6FBF9" stroke-opacity="0.55" stroke-width="1.4"/>' +
      '<path class="wave w4" d="M-30 66q10-3 20 0t20 0t20 0t20 0t20 0t20 0t20 0" fill="none" stroke="#9FD9D8" stroke-opacity="0.3" stroke-width="1"/>' +
      '<ellipse class="glint" cx="24" cy="16" rx="7" ry="2" fill="#FFFFFF" fill-opacity="0.28"/>' +
      '<ellipse class="glint" cx="52" cy="47" rx="4" ry="1.3" fill="#FFFFFF" fill-opacity="0.2"/>' +
      '<rect x="5" y="5" width="70" height="20" fill="url(#sgWaterT)"/><rect x="5" y="5" width="18" height="70" fill="url(#sgWaterL)"/>' +
      "</g>" +
      '<rect x="5.6" y="5.6" width="68.8" height="68.8" rx="8.6" fill="none" stroke="#EAFBFA" stroke-opacity="0.45" stroke-width="1.1"/>' +
      '<path d="M12 73.5h58a3 3 0 0 0 3-3V18" fill="none" stroke="#F3FFFE" stroke-opacity="0.32" stroke-width="1.2"/>' +
            "</g>";
    return s;
  };

  // ---------- markers ----------
  A.destEmpty = function (cx, cy) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="16" fill="url(#sgGlowG)"/>' +
      '<circle cx="' + cx + '" cy="' + (cy + 1.2) + '" r="7.5" fill="#000" fill-opacity="0.3"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="7.5" fill="url(#sgDisc)" stroke="#F5F0E6" stroke-width="1.5" class="pulse"/>';
  };
  A.destAttack = function (cx, cy) {
    return '<rect x="' + (cx - 21) + '" y="' + (cy - 21) + '" width="42" height="42" rx="12" fill="url(#sgGlowC)"/>' +
      '<rect x="' + (cx - 18.5) + '" y="' + (cy - 18.5) + '" width="37" height="37" rx="9" fill="none" stroke="#D9663A" stroke-width="3" class="pulse"/>' +
      '<g transform="translate(' + (cx + 11) + " " + (cy - 11) + ')"><circle r="6" fill="#D9663A" stroke="#FBF8F2" stroke-width="1.2"/>' +
      '<path d="M-3 -3l6 6M3 -3l-6 6" stroke="#FFF6EA" stroke-width="1.6" stroke-linecap="round"/></g>';
  };
  A.selRing = function (x, y) {
    return '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="38" height="38" rx="9" fill="url(#sgGlowGold)"/>' +
      '<rect x="' + (x - 1) + '" y="' + (y - 1) + '" width="42" height="42" rx="8" fill="none" stroke="#F2C14E" stroke-opacity="0.4" stroke-width="7"/>' +
      '<rect x="' + (x - 1) + '" y="' + (y - 1) + '" width="42" height="42" rx="8" fill="none" stroke="#F6D46A" stroke-width="2.4"/>';
  };
  A.trail = function (from, to) {
    var fx = (from % 10) * 40 + 20, fy = Math.floor(from / 10) * 40 + 20, tx = (to % 10) * 40 + 20, ty = Math.floor(to / 10) * 40 + 20;
    var dx = tx - fx, dy = ty - fy, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
    var ex = tx - ux * 13, ey = ty - uy * 13, sx = fx + ux * 6, sy = fy + uy * 6;
    var s = '<rect x="' + (fx - 20) + '" y="' + (fy - 20) + '" width="40" height="40" fill="#F2C14E" fill-opacity="0.22"/>' +
      '<rect x="' + (tx - 20) + '" y="' + (ty - 20) + '" width="40" height="40" fill="#F2C14E" fill-opacity="0.32"/>';
    s += '<line x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" stroke="#F2C14E" stroke-opacity="0.3" stroke-width="10" stroke-linecap="round"/>';
    s += '<line x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" stroke="#F6D46A" stroke-width="3" stroke-linecap="round"/>';
    var px = -uy, py = ux, ax = ex - ux * 2, ay = ey - uy * 2;
    s += '<path d="M' + (ex + ux * 8) + " " + (ey + uy * 8) + "L" + (ax + px * 6) + " " + (ay + py * 6) + "L" + (ax - px * 6) + " " + (ay - py * 6) + 'Z" fill="#F6D46A" stroke="#8A6314" stroke-width="0.8"/>';
    s += '<circle cx="' + fx + '" cy="' + fy + '" r="4" fill="#F6D46A" stroke="#8A6314" stroke-width="0.8"/>';
    return s;
  };

  // ---------- battle overlay (cosmetic, pointer-events none) ----------
  A.battle = function (e, elapsedMs) {
    var fx = (e.from % 10) * 40, fy = Math.floor(e.from / 10) * 40, tx = (e.to % 10) * 40, ty = Math.floor(e.to / 10) * 40;
    var dl = ' style="animation-delay:-' + (elapsedMs | 0) + 'ms"';
    var attLost = e.out === "lose" || e.out === "tie", defLost = e.out !== "lose";
    var s = '<g class="battle" pointer-events="none">';
    // flash under everything
    s += '<circle cx="' + (tx + 20) + '" cy="' + (ty + 20) + '" r="26" fill="url(#sgFlash)" class="flash"' + dl + "/>";
    // defender copy at target (fades if it lost, otherwise just a brief shake)
    s += '<g transform="translate(' + tx + " " + ty + ')"><g class="' + (defLost ? "loser" : "holder") + '"' + dl + ">" + A.piece(1 - e.side, e.dr, "face", false, false, false) + "</g></g>";
    // attacker copy lunges from origin toward the target
    var dx = (tx - fx) * 0.55, dy = (ty - fy) * 0.55;
    s += '<g transform="translate(' + fx + " " + fy + ')"><g class="' + (attLost ? "lunge lose" : "lunge") + '" style="--dx:' + dx + "px;--dy:" + dy + "px;animation-delay:-" + (elapsedMs | 0) + 'ms">' + A.piece(e.side, e.ar, "face", false, false, true) + "</g></g>";
    s += '<circle cx="' + (tx + 20) + '" cy="' + (ty + 20) + '" r="6" fill="none" stroke="#FFE08A" stroke-width="3" class="ring"' + dl + "/>";
    return s + "</g>";
  };

  // ---------- menu hero ----------
  A.hero = function () {
    var s = '<svg class="hero" viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A Red marshal faces a hidden Blue piece across the board">';
    s += '<defs><clipPath id="sgHeroClip"><rect x="0" y="0" width="400" height="170" rx="16"/></clipPath>' +
      '<linearGradient id="sgHeroFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B2622" stop-opacity="0"/><stop offset="1" stop-color="#2B2622" stop-opacity="0.55"/></linearGradient></defs>';
    s += '<g clip-path="url(#sgHeroClip)"><rect width="400" height="170" fill="url(#sgSky)"/>';
    // board in false perspective
    s += '<g transform="translate(205 125) scale(1.3 0.66) rotate(-14) translate(-200 -200)">';
    s += A.frame() + A.cells(false) + A.lake(80, 160) + A.lake(240, 160);
    var deco = [[RED, 2, 61], [RED, 7, 64], [RED, 11, 76], [RED, 6, 78], [RED, 3, 73], [RED, 9, 66], [BLUE, 0, 31], [BLUE, 0, 34], [BLUE, 0, 22], [BLUE, 0, 36], [BLUE, 0, 48], [BLUE, 0, 42], [BLUE, 0, 25]];
    deco.forEach(function (d) {
      s += '<g transform="translate(' + (d[2] % 10) * 40 + " " + Math.floor(d[2] / 10) * 40 + ')">' + A.piece(d[0], d[1], d[0] === BLUE ? "hidden" : "face", d[2] === 34 || d[2] === 48, false, false) + "</g>";
    });
    s += "</g>";
    s += '<rect width="400" height="170" fill="url(#sgHeroFade)"/><ellipse cx="200" cy="90" rx="190" ry="80" fill="url(#sgGlowGold)" opacity="0.5"/>';
    // the duel: two big tokens facing off
    s += '<ellipse cx="140" cy="128" rx="40" ry="9" fill="#000" fill-opacity="0.45" filter="url(#sgBlur)"/>' +
      '<ellipse cx="262" cy="128" rx="40" ry="9" fill="#000" fill-opacity="0.45" filter="url(#sgBlur)"/>';
    s += '<g transform="translate(93 50) scale(2.35)">' + A.piece(RED, MARSHAL, "face", false, false, true) + "</g>";
    s += '<g transform="translate(215 50) scale(2.35)">' + A.piece(BLUE, 0, "hidden", true, false, true) + "</g>";
    s += '<g transform="translate(200 98)"><circle r="19" fill="url(#sgVs)" stroke="#5A3F0A" stroke-width="1.2"/><circle r="15.5" fill="none" stroke="#FFF" stroke-opacity="0.45" stroke-width="1"/>' +
      '<text y="5.5" text-anchor="middle" font-size="15" font-family="Marcellus, Georgia, serif" fill="#2B1A08" letter-spacing="1">VS</text></g>';
    s += "</g></svg>";
    return s;
  };

  window.StrategoArt = A;
})();
