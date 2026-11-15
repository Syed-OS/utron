// Sign in, sign out, and "who am I".

import express from "express";
import rateLimit from "express-rate-limit";
import { collections } from "../db.js";
import { verifyPassword } from "../services/passwords.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = express.Router();

// One message for every kind of failure. If "unknown email" and "wrong
// password" read differently, an attacker could use the difference to
// find out which students have accounts.
const LOGIN_ERROR = "That email and password don't match.";

// A real bcrypt hash of a throwaway string. When the email is unknown we
// still run one bcrypt comparison against this, so a failed login takes
// the same time either way and response time gives nothing away.
const DUMMY_HASH = "$2b$12$JzJoPkls26qdsmfcBOQQYuH5r4P8Z4KyuZgVohi13xPtN84TUBx5a";

// Brute-force protection: 10 attempts per 15 minutes from one IP address.
// The automated tests sign in far more often than that, so they are exempt.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
});

authRouter.post("/auth/login", loginLimiter, async (req, res, next) => {
  // express.json() may leave req.body undefined, and a JSON body can hold
  // any type. Only plain strings are accepted. This blocks "operator
  // injection": without the check, sending { "email": { "$gt": "" } }
  // would turn into a MongoDB query that matches the first student.
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(401).json({ error: LOGIN_ERROR });
    return;
  }

  // Emails are stored trimmed and lowercase, so compare the same way.
  const normalizedEmail = email.trim().toLowerCase();
  const student = await collections().students.findOne({ email: normalizedEmail });

  const passwordHash = student ? student.passwordHash : DUMMY_HASH;
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!student || !passwordMatches) {
    res.status(401).json({ error: LOGIN_ERROR });
    return;
  }

  // Swap the session id for a brand new one at the moment of sign-in.
  // This prevents "session fixation": if an attacker planted a session id
  // in this browser beforehand, that id never becomes a signed-in one.
  req.session.regenerate((err) => {
    if (err) {
      next(err);
      return;
    }
    req.session.studentId = student._id.toString();
    res.json({ name: student.name });
  });
});

authRouter.post("/auth/logout", (req, res, next) => {
  // Delete the session from MongoDB, then tell the browser to drop the cookie.
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie("utron.sid");
    res.status(204).end();
  });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    name: req.student.name,
    email: req.student.email,
    term: process.env.TERM_NAME || "Fall 2026",
  });
});
