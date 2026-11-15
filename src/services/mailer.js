// The demo "email" transport.
//
// Instead of sending real email, each message is written as a JSON file
// into outbox/ (which git ignores). The demo inbox page reads that folder.
//
// sendMail takes the same arguments a real mailer takes ({ to, subject,
// html, text }), so switching to real email later means replacing only the
// body of this one function — nothing that calls it would change.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const OUTBOX_DIR = path.resolve("outbox");

export async function sendMail({ to, subject, html, text }) {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });

  const sentAt = new Date();
  // Time first so files sort by date; random suffix so two emails sent in
  // the same millisecond never overwrite each other.
  const id = `${sentAt.getTime()}-${crypto.randomUUID().slice(0, 8)}`;
  const email = { id, to, subject, html, text, sentAt: sentAt.toISOString() };

  await fs.writeFile(path.join(OUTBOX_DIR, `${id}.json`), JSON.stringify(email, null, 2));
  console.log(`[mail] "${subject}" -> ${to}`);
}

// Used by the demo inbox: every email in the outbox, newest first.
export async function readOutbox() {
  let fileNames;
  try {
    fileNames = await fs.readdir(OUTBOX_DIR);
  } catch {
    return []; // no outbox folder yet means no emails yet
  }

  const emails = [];
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json")) continue;
    const contents = await fs.readFile(path.join(OUTBOX_DIR, fileName), "utf8");
    emails.push(JSON.parse(contents));
  }

  emails.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  return emails;
}
