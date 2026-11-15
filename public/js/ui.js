// Small shared helpers for the pages that build HTML in JavaScript.

// Text from the database or from the student must be escaped before it is
// placed inside an HTML string. Otherwise an answer like "<img onerror=…>"
// would be treated as markup instead of text (cross-site scripting).
export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Hand-written icons, all drawn on a 24×24 grid. The .icon class in
// components.css gives them their stroke.
function icon(paths) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

export const icons = {
  arrowRight: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  check: icon('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lock: icon('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};

// "Dec 30" from an ISO date string.
export function shortDate(isoDate) {
  return new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
