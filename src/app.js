// Builds the Express app.
//
// This lives apart from server.js so the tests can create the same app
// without opening a network port.

import express from "express";
import helmet from "helmet";
import session from "express-session";
import MongoStore from "connect-mongo";
import { getClient } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { coursesRouter } from "./routes/courses.js";
import { apiNotFound, pageNotFound, errorHandler } from "./middleware/errorHandler.js";

const TWO_HOURS = 2 * 60 * 60 * 1000;

export function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";
  const dbName = process.env.DB_NAME || "utron";

  // Do not advertise which framework runs the site.
  app.disable("x-powered-by");

  // Security headers. The Content Security Policy tells the browser to
  // load scripts, styles and fonts only from this site. Even if an attacker
  // managed to inject a <script> tag or an inline handler into a page, the
  // browser would refuse to run it. This is why no page here has inline
  // scripts or styles, and why the fonts are self-hosted.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );

  // Parse JSON bodies. Evaluations are small, so anything over 20kb is
  // rejected before it is even read into memory.
  app.use(express.json({ limit: "20kb" }));

  // The frontend: plain files from /public. Served before the session
  // middleware so a request for a stylesheet never touches the database.
  app.use(express.static("public"));

  // Sessions. The session data lives in MongoDB (so it survives a server
  // restart); the browser only gets a random id in a cookie.
  app.use(
    session({
      name: "utron.sid",
      secret: process.env.SESSION_SECRET,
      store: MongoStore.create({ client: getClient(), dbName, collectionName: "sessions" }),
      resave: false,
      saveUninitialized: false, // no cookie and no database write until someone signs in
      rolling: true, // every request restarts the two-hour countdown
      cookie: {
        httpOnly: true, // page JavaScript cannot read the cookie
        sameSite: "strict", // other sites cannot make requests that carry it
        secure: isProduction, // HTTPS only, once deployed
        maxAge: TWO_HOURS,
      },
    })
  );

  // A simple way to check that the server is running.
  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  // Public settings the sign-in page needs before anyone is signed in.
  app.get("/api/config", (req, res) => {
    res.json({
      term: process.env.TERM_NAME || "Fall 2026",
      demoInbox: process.env.DEMO_INBOX === "true",
    });
  });

  app.use("/api", authRouter);
  app.use("/api", coursesRouter);

  app.use("/api", apiNotFound);
  app.use(pageNotFound);
  app.use(errorHandler);

  return app;
}
