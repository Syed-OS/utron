// The demo inbox: a list of emails on the left, the chosen one on the right.

import { api } from "./api.js";
import { escapeHtml } from "./ui.js";

const list = document.querySelector("#inbox-list");
const frame = document.querySelector("#message-frame");
const copyButton = document.querySelector("#copy-password");

let emails = [];
let selected = null;

load();

async function load() {
  ({ emails } = await api("GET", "/demo/inbox"));

  if (emails.length === 0) {
    document.querySelector("#inbox-empty").hidden = false;
    return;
  }

  list.innerHTML = emails.map((email) => `
    <li>
      <button class="inbox-row" type="button" data-id="${escapeHtml(email.id)}">
        <span class="inbox-row-to">${escapeHtml(email.to)}</span>
        <span class="inbox-row-subject">${escapeHtml(email.subject)}</span>
        <span class="inbox-row-time mono">${formatTime(email.sentAt)}</span>
      </button>
    </li>`).join("");

  document.querySelector("#inbox-panes").hidden = false;
  select(emails[0].id);
}

function formatTime(isoDate) {
  return new Date(isoDate).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function select(id) {
  selected = emails.find((email) => email.id === id);

  for (const row of list.querySelectorAll(".inbox-row")) {
    row.setAttribute("aria-current", String(row.dataset.id === id));
  }

  document.querySelector("#message-subject").textContent = selected.subject;
  document.querySelector("#message-to").textContent = selected.to;
  frame.src = `/api/demo/inbox/${encodeURIComponent(id)}/html`;
  copyButton.textContent = "Copy password";
}

list.addEventListener("click", (event) => {
  const row = event.target.closest(".inbox-row");
  if (!row) return;
  select(row.dataset.id);
  // On a phone the message sits below the list; bring it into view.
  document.querySelector("#inbox-message").scrollIntoView({ block: "nearest", behavior: "smooth" });
});

copyButton.addEventListener("click", async () => {
  // The plain-text version of the email has a line "Password: abcd-efgh-ijkl".
  const match = selected.text.match(/Password: (\S+)/);
  if (!match) return;
  try {
    await navigator.clipboard.writeText(match[1]);
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Couldn't copy";
  }
});
