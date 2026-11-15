// Demo only: lets the presenter read the "emails" in outbox/.
//
// app.js mounts this router only when DEMO_INBOX=true. With the setting
// off, these URLs do not exist at all and return 404.

import express from "express";
import { readOutbox } from "../services/mailer.js";

export const demoInboxRouter = express.Router();

// The list for the left pane. The HTML body is left out; the message pane
// loads it separately from the route below.
demoInboxRouter.get("/demo/inbox", async (req, res) => {
  const emails = await readOutbox();
  res.json({
    emails: emails.map(({ id, to, subject, text, sentAt }) => ({ id, to, subject, text, sentAt })),
  });
});

// One email's HTML, shown inside a sandboxed <iframe> on the inbox page.
demoInboxRouter.get("/demo/inbox/:id/html", async (req, res) => {
  const emails = await readOutbox();
  // Looking the id up in the list (instead of building a file path from
  // it) means a crafted id like "../../.env" can never read another file.
  const email = emails.find((candidate) => candidate.id === req.params.id);

  if (!email) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  // Emails are styled with inline style attributes, which the site-wide
  // policy blocks. This one response gets its own policy: inline styles
  // allowed, and everything else (scripts, images, requests) forbidden.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'");
  // Helmet's Origin-Agent-Cluster header makes no sense for a sandboxed
  // frame (it has no origin of its own) and makes Chrome log a warning.
  res.removeHeader("Origin-Agent-Cluster");
  res.type("html").send(email.html);
});
