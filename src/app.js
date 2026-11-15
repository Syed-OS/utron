// Builds the Express app.
//
// This lives apart from server.js so the tests can create the same app
// without opening a network port.

import express from "express";
import { apiNotFound, pageNotFound, errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // Do not advertise which framework runs the site.
  app.disable("x-powered-by");

  // Parse JSON bodies. Evaluations are small, so anything over 20kb is
  // rejected before it is even read into memory.
  app.use(express.json({ limit: "20kb" }));

  // A simple way to check that the server is running.
  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  // The frontend: plain files from /public.
  app.use(express.static("public"));

  app.use("/api", apiNotFound);
  app.use(pageNotFound);
  app.use(errorHandler);

  return app;
}
