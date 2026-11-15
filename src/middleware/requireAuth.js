// Guards every route that needs a signed-in student.
//
// The browser only holds a random session id in a cookie. express-session
// uses that id to load the session from MongoDB into req.session, and the
// login route is the only place that ever puts a studentId in there.

import { ObjectId } from "mongodb";
import { collections } from "../db.js";

export async function requireAuth(req, res, next) {
  const studentId = req.session.studentId;

  if (!studentId) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }

  // Load the student fresh on each request, so routes always see the
  // current enrollment list rather than a copy saved at login.
  const student = await collections().students.findOne({ _id: new ObjectId(studentId) });

  if (!student) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }

  req.student = student;
  next();
}
