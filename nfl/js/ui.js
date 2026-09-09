// Tiny DOM helpers: escaping, modals, toasts, formatting. No app state here.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fmtKick(iso, { withDay = true } = {}) {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return withDay ? `${day} ${time}` : time;
}

export function fmtDayHeading(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function dayKey(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "tbd" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function fmtRange(games) {
  const times = games.map((g) => new Date(g.kickoff).getTime()).filter((t) => !Number.isNaN(t));
  if (!times.length) return "";
  const a = new Date(Math.min(...times)), b = new Date(Math.max(...times));
  const opts = { month: "short", day: "numeric" };
  if (a.toDateString() === b.toDateString()) return a.toLocaleDateString(undefined, opts);
  const sameMonth = a.getMonth() === b.getMonth();
  return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : opts)}`;
}

export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- toasts ----------------------------------------------------------------
let toastRoot;
export function toast(msg, { bad = false, ms = 2600 } = {}) {
  if (!toastRoot) { toastRoot = document.createElement("div"); toastRoot.className = "toasts"; document.body.appendChild(toastRoot); }
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " toast--bad" : "");
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---- modal -----------------------------------------------------------------
let modalRoot;
export function openModal(html, { wide = false } = {}) {
  closeModal();
  modalRoot = document.createElement("div");
  modalRoot.className = "modal";
  modalRoot.innerHTML = `<div class="modal__box${wide ? " modal__box--wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  modalRoot.addEventListener("click", (e) => { if (e.target === modalRoot) closeModal(); });
  document.body.appendChild(modalRoot);
  const first = modalRoot.querySelector("input, select, button:not(.modal__close)");
  if (first) first.focus({ preventScroll: true });
}
export function closeModal() { if (modalRoot) { modalRoot.remove(); modalRoot = null; } }
export function modalOpen() { return Boolean(modalRoot); }
export function modalHead(title) {
  return `<div class="modal__head"><h3 class="modal__title">${esc(title)}</h3><button class="modal__close" data-action="modal-close" aria-label="Close">${icon("x")}</button></div>`;
}

// ---- icons -----------------------------------------------------------------
const ICONS = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  week: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  board: '<path d="M8 21h8M12 17v4M4 4h16v9a8 8 0 0 1-16 0Z"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5"/>',
  helmet: '<path d="M4 13a8 8 0 0 1 16 0v3H4zM4 16l2 4h4l-1-4M14 16h6v3h-6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
};
export function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
