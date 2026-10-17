// Procedural SVG art for Mexican Train: bone tiles with colour coded pips, the
// wooden hub, brass markers and the little locomotive emblem. Everything here
// returns SVG markup strings; app.js composes them into the table.
(function (root) {
  "use strict";

  var TL = 48, TW = 24, R = 4; // tile length, width, corner radius (world units)
  var PIP_COLORS = ["#5B5247", "#2A5BA8", "#2F8F4E", "#C23B2E", "#7B4FA3", "#1B8A8F", "#C9930F", "#C2367A", "#1E3A6E", "#7A4A2A", "#E0742A", "#6B7A1E", "#3E4A57"];
  var PIP_NAMES = ["blank", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

  var C3 = [-0.62, 0, 0.62];
  var R4 = [-0.72, -0.24, 0.24, 0.72];
  function col(x, ys) { return ys.map(function (y) { return [x, y]; }); }
  var LAYOUTS = [
    [],
    [[0, 0]],
    [[-0.62, -0.62], [0.62, 0.62]],
    [[-0.62, -0.62], [0, 0], [0.62, 0.62]],
    [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]],
    [[-0.62, -0.62], [0.62, -0.62], [0, 0], [-0.62, 0.62], [0.62, 0.62]],
    col(-0.62, C3).concat(col(0.62, C3)),
    col(-0.62, C3).concat([[0, 0]], col(0.62, C3)),
    col(-0.62, C3).concat([[0, -0.62], [0, 0.62]], col(0.62, C3)),
    col(-0.62, C3).concat(col(0, C3), col(0.62, C3)),
    col(-0.66, R4).concat([[0, -0.24], [0, 0.24]], col(0.66, R4)),
    col(-0.66, R4).concat(col(0, C3), col(0.66, R4)),
    col(-0.66, R4).concat(col(0, R4), col(0.66, R4))
  ];

  function defs() {
    return '<defs>' +
      '<linearGradient id="mtIvory" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFEF9"/><stop offset="0.55" stop-color="#F6F0E1"/><stop offset="1" stop-color="#E6DCC6"/></linearGradient>' +
      '<linearGradient id="mtSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFC4AA"/><stop offset="1" stop-color="#A89C80"/></linearGradient>' +
      '<radialGradient id="mtWood" cx="0.38" cy="0.35" r="0.75"><stop offset="0" stop-color="#9C6A3A"/><stop offset="0.6" stop-color="#6F4523"/><stop offset="1" stop-color="#3F2611"/></radialGradient>' +
      '<linearGradient id="mtBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5DE8C"/><stop offset="0.35" stop-color="#C99A2E"/><stop offset="0.7" stop-color="#8E6816"/><stop offset="1" stop-color="#E4C465"/></linearGradient>' +
      '<linearGradient id="mtBrass2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5DE8C"/><stop offset="0.5" stop-color="#B98A24"/><stop offset="1" stop-color="#7A5A12"/></linearGradient>' +
      '<radialGradient id="mtFelt" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#4B7353"/><stop offset="1" stop-color="#2E4A35"/></radialGradient>' +
      '<radialGradient id="mtGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFE38A" stop-opacity="0.95"/><stop offset="0.6" stop-color="#F1C54A" stop-opacity="0.45"/><stop offset="1" stop-color="#C99A2E" stop-opacity="0"/></radialGradient>' +
      '<filter id="mtSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>' +
      '<filter id="mtHubShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/></filter>' +
      '</defs>';
  }

  // Pips for value n centred at (cx, cy), half size h (half of the square face).
  function pipsSVG(n, cx, cy, h) {
    var lay = LAYOUTS[n] || [];
    if (!lay.length) return "";
    var r = n >= 10 ? h * 0.15 : n >= 7 ? h * 0.17 : h * 0.2;
    var span = h * 0.62;
    var c = PIP_COLORS[n];
    var s = '<g fill="' + c + '">';
    for (var i = 0; i < lay.length; i++) {
      var x = cx + lay[i][0] * span, y = cy + lay[i][1] * span;
      s += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r.toFixed(2) + '"/>';
    }
    s += '</g><g fill="#fff" opacity="0.55">';
    for (i = 0; i < lay.length; i++) {
      x = cx + lay[i][0] * span - r * 0.3; y = cy + lay[i][1] * span - r * 0.32;
      s += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + (r * 0.32).toFixed(2) + '"/>';
    }
    return s + "</g>";
  }

  // A tile lying along +x, centred on the origin: `a` on the left (near) half,
  // `b` on the right (far) half. opts.flat skips the drop shadow.
  function tileSVG(a, b, opts) {
    opts = opts || {};
    var hl = TL / 2, hw = TW / 2;
    var s = "";
    if (!opts.flat) s += '<rect x="' + (-hl + 1.5) + '" y="' + (-hw + 3) + '" width="' + TL + '" height="' + TW + '" rx="' + R + '" fill="#000" opacity="0.32" filter="url(#mtSoft)"/>';
    s += '<rect x="' + -hl + '" y="' + (-hw + 2) + '" width="' + TL + '" height="' + TW + '" rx="' + R + '" fill="url(#mtSide)"/>';
    s += '<rect x="' + -hl + '" y="' + -hw + '" width="' + TL + '" height="' + TW + '" rx="' + R + '" fill="url(#mtIvory)" stroke="#B3A68A" stroke-width="0.6"/>';
    s += '<rect x="' + (-hl + 1.1) + '" y="' + (-hw + 1.1) + '" width="' + (TL - 2.2) + '" height="' + (TW - 2.2) + '" rx="' + (R - 0.8) + '" fill="none" stroke="#fff" stroke-width="0.9" opacity="0.75"/>';
    s += '<line x1="0" y1="' + (-hw + 3) + '" x2="0" y2="' + (hw - 3) + '" stroke="#A3977C" stroke-width="0.9"/>';
    s += '<line x1="0.9" y1="' + (-hw + 3) + '" x2="0.9" y2="' + (hw - 3) + '" stroke="#fff" stroke-width="0.7" opacity="0.8"/>';
    s += pipsSVG(a, -hl / 2, 0, hw);
    s += pipsSVG(b, hl / 2, 0, hw);
    if (opts.ring) s += '<rect x="' + (-hl - 2) + '" y="' + (-hw - 2) + '" width="' + (TL + 4) + '" height="' + (TW + 4) + '" rx="' + (R + 2) + '" fill="none" stroke="#F1C54A" stroke-width="2"/>';
    return s;
  }

  // A standalone vertical tile as an <svg>, `a` on the bottom half, `b` on top.
  function tileStandalone(a, b, w, cls) {
    var h = w * 2;
    return '<svg class="' + (cls || "") + '" viewBox="-15 -28 30 56" width="' + w + '" height="' + h + '" aria-hidden="true">' +
      '<g transform="rotate(-90)">' + tileSVG(a, b, { flat: true }) + "</g></svg>";
  }

  // Small locomotive, roughly 26 wide and 16 tall, centred on the origin.
  function locoSVG(fill, ink) {
    fill = fill || "url(#mtBrass)"; ink = ink || "#2B2622";
    return '<g>' +
      '<rect x="-13" y="-3" width="18" height="8" rx="1.5" fill="' + fill + '" stroke="' + ink + '" stroke-width="0.8"/>' +
      '<rect x="3" y="-8" width="9" height="13" rx="1.5" fill="' + fill + '" stroke="' + ink + '" stroke-width="0.8"/>' +
      '<rect x="4.5" y="-6" width="6" height="4" rx="0.8" fill="' + ink + '" opacity="0.8"/>' +
      '<rect x="-10" y="-8" width="4" height="5" rx="0.8" fill="' + fill + '" stroke="' + ink + '" stroke-width="0.8"/>' +
      '<rect x="-14" y="4.5" width="27" height="1.6" fill="' + ink + '"/>' +
      '<circle cx="-8" cy="7" r="2.6" fill="' + fill + '" stroke="' + ink + '" stroke-width="0.9"/>' +
      '<circle cx="-1" cy="7" r="2.6" fill="' + fill + '" stroke="' + ink + '" stroke-width="0.9"/>' +
      '<circle cx="8" cy="7" r="2.6" fill="' + fill + '" stroke="' + ink + '" stroke-width="0.9"/>' +
      '<circle cx="-2.5" cy="-3" r="1" fill="#EDE2C2" opacity="0.6"/><circle cx="-1" cy="-6" r="1.4" fill="#EDE2C2" opacity="0.45"/>' +
      "</g>";
  }

  // Brass marker token (radius ~12), centred on the origin.
  function markerSVG() {
    return '<g>' +
      '<circle cx="0.6" cy="1.8" r="12.5" fill="#000" opacity="0.4" filter="url(#mtSoft)"/>' +
      '<circle r="12" fill="url(#mtBrass)" stroke="#5A4210" stroke-width="0.9"/>' +
      '<circle r="8.6" fill="none" stroke="#5A4210" stroke-width="0.8" opacity="0.8"/>' +
      '<circle r="8.6" fill="url(#mtBrass2)" opacity="0.9"/>' +
      '<circle r="2.4" fill="#5A4210"/>' +
      '<g stroke="#5A4210" stroke-width="1.3"><line x1="0" y1="-7.5" x2="0" y2="7.5"/><line x1="-7.5" y1="0" x2="7.5" y2="0"/><line x1="-5.3" y1="-5.3" x2="5.3" y2="5.3"/><line x1="5.3" y1="-5.3" x2="-5.3" y2="5.3"/></g>' +
      '<circle cx="-3.5" cy="-4" r="3.5" fill="#fff" opacity="0.28"/>' +
      "</g>";
  }

  // The hub: wooden disc, brass ring, felt centre with the engine double, and a
  // plate per spoke. spokes: [{angle (deg), label, mex, marker}]
  function hubSVG(engine, spokes, hubR) {
    hubR = hubR || 82;
    var s = '<g class="hub">';
    s += '<circle r="' + hubR + '" fill="url(#mtWood)" filter="url(#mtHubShadow)"/>';
    s += '<circle r="' + hubR + '" fill="none" stroke="#2A170A" stroke-width="2"/>';
    s += '<circle r="' + (hubR - 2.5) + '" fill="none" stroke="#C48D55" stroke-width="0.8" opacity="0.6"/>';
    // wood grain rings
    for (var g = 0; g < 5; g++) s += '<circle r="' + (hubR - 6 - g * 3.1).toFixed(1) + '" fill="none" stroke="#2A170A" stroke-width="0.6" opacity="' + (0.16 + g * 0.03).toFixed(2) + '"/>';
    s += '<ellipse cx="' + (-hubR * 0.22) + '" cy="' + (-hubR * 0.3) + '" rx="' + (hubR * 0.55) + '" ry="' + (hubR * 0.28) + '" fill="#fff" opacity="0.10" transform="rotate(-30)"/>';
    s += '<circle r="' + (hubR - 20) + '" fill="url(#mtBrass)" stroke="#5A4210" stroke-width="1"/>';
    s += '<circle r="' + (hubR - 25) + '" fill="url(#mtFelt)" stroke="#1F3326" stroke-width="1.2"/>';
    s += '<circle r="' + (hubR - 26.5) + '" fill="none" stroke="#000" stroke-width="3" opacity="0.18"/>';
    // engine double, crosswise and a touch larger
    s += '<g transform="rotate(-90) scale(1.3)">' + tileSVG(engine, engine, {}) + "</g>";
    for (var i = 0; i < spokes.length; i++) {
      var sp = spokes[i];
      s += '<g transform="rotate(' + sp.angle + ') translate(' + (hubR - 10) + ',0)">';
      if (sp.marker) {
        s += '<g transform="rotate(' + (-sp.angle) + ')">' + markerSVG() + "</g>";
      } else {
        s += '<rect x="-9" y="-8.5" width="18" height="17" rx="3.5" fill="url(#mtBrass)" stroke="#5A4210" stroke-width="0.8"/>';
        s += '<g transform="rotate(' + (-sp.angle) + ')">';
        if (sp.mex) s += '<g transform="scale(0.55)">' + locoSVG("#F3E3B2", "#3B2A10") + "</g>";
        else s += '<text y="4.2" text-anchor="middle" font-size="11" font-weight="600" fill="#3B2A10">' + sp.label + "</text>";
        s += "</g>";
      }
      s += "</g>";
    }
    return s + "</g>";
  }

  root.MexicanTrainArt = {
    TL: TL, TW: TW,
    PIP_COLORS: PIP_COLORS,
    PIP_NAMES: PIP_NAMES,
    defs: defs,
    tileSVG: tileSVG,
    tileStandalone: tileStandalone,
    locoSVG: locoSVG,
    markerSVG: markerSVG,
    hubSVG: hubSVG,
    pipsSVG: pipsSVG
  };
})(typeof self !== "undefined" ? self : this);
