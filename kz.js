/* ============================================================
   KEVIN ZOSS — journey engine (same architecture as Halle v2)
   Fixed stacked scenes; scroll drives time. Incoming scene
   dissolves in OVER the fully-painted outgoing one, so the
   background never shows and seams never hard-cut.
   Writes per-scene: --p (linear), --pe (eased), --copy.
   Static fallback: reduced motion, coarse pointer, ≤860px, no JS.
   ============================================================ */

(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  var small = window.matchMedia("(max-width: 860px)").matches;
  if (reduce || coarse || small) {
    document.documentElement.classList.add("j-static");
    return;
  }

  var XFADE_VH = 0.55;
  var spans = Array.prototype.slice.call(document.querySelectorAll(".scene-span"));
  var stages = spans.map(function (s) { return s.querySelector(".scene-stage"); });
  var N = spans.length;
  var railLinks = Array.prototype.slice.call(document.querySelectorAll(".kz-rail a"));
  var hint = document.querySelector(".kz-hint");

  document.documentElement.classList.add("j-scrub");
  stages.forEach(function (st, i) { st.style.zIndex = String(10 + i); });

  var M = [], vh = 0;
  function measure() {
    vh = window.innerHeight;
    spans.forEach(function (span) {
      var vhs = parseFloat(span.getAttribute("data-scroll") || "2.2");
      span.style.height = Math.round(vhs * 100) + "vh";
    });
    M = spans.map(function (span) {
      return { start: span.offsetTop, end: span.offsetTop + span.offsetHeight - vh };
    });
  }

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  var lastActive = -1, raf = 0;
  function frame() {
    raf = 0;
    var y = window.scrollY;
    var X = XFADE_VH * vh;
    var active = 0;

    for (var i = 0; i < N; i++) {
      var m = M[i], st = stages[i];
      var enterAt = m.start - X;
      var leaveAt = m.end + X;

      if (y < enterAt - vh || y > leaveAt + vh) {
        if (st.style.visibility !== "hidden") st.style.visibility = "hidden";
        continue;
      }
      if (st.style.visibility !== "visible") st.style.visibility = "visible";

      var op = (i === 0) ? 1 : clamp01((y - enterAt) / X);
      st.style.opacity = op.toFixed(3);

      var p = clamp01((y - enterAt) / (leaveAt - enterAt));
      st.style.setProperty("--p", p.toFixed(4));
      st.style.setProperty("--pe", ease(p).toFixed(4));

      var cin = (i === 0) ? 1 : clamp01((p - 0.10) / 0.20);
      var cout = (i === N - 1) ? 1 : 1 - clamp01((p - 0.90) / 0.10);
      st.style.setProperty("--copy", Math.min(cin, cout).toFixed(3));

      if (y >= m.start - X * 0.5 && y <= m.end + X * 0.5) active = i;
      else if (y > m.end + X * 0.5) active = Math.min(i + 1, N - 1);
    }

    if (active !== lastActive) {
      railLinks.forEach(function (a, k) { a.classList.toggle("active", k === active); });
      lastActive = active;
    }
    if (hint) hint.classList.toggle("gone", y > vh * 0.35);
  }

  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", function () { measure(); schedule(); }, { passive: true });

  railLinks.forEach(function (a, i) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var m = M[i];
      window.scrollTo({ top: Math.round(m.start + (m.end - m.start) * 0.6), behavior: "smooth" });
    });
  });

  measure();
  frame();
})();
