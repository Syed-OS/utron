// The last stops in the middleware chain.
//
// Express 5 forwards errors thrown inside async route handlers to the error
// handler automatically, so routes do not need their own try/catch.

import path from "node:path";

const notFoundPage = path.resolve("public", "404.html");

// Unknown /api/* routes get JSON, because the caller is our fetch wrapper.
export function apiNotFound(req, res) {
  res.status(404).json({ error: "Not found." });
}

// Any other unknown URL is a person in a browser, so they get a real page.
export function pageNotFound(req, res) {
  res.status(404).sendFile(notFoundPage);
}

// Express knows this is the error handler because it takes four arguments.
export function errorHandler(err, req, res, next) {
  // express.json() raises these for bad or oversized request bodies.
  // They are the client's mistake, not ours.
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    res.status(400).json({ error: "That request could not be read." });
    return;
  }

  // Log the detail for us, on the server only.
  console.error(`[error] ${req.method} ${req.path}:`, err);

  // The client gets a generic message: a stack trace would tell an
  // attacker about file paths, libraries and queries.
  res.status(500).json({ error: "Something went wrong on our end. Please try again." });
}
