// The evaluation routes: course list, loading an evaluation, autosaved
// drafts, and the anonymous submit.

import crypto from "node:crypto";
import express from "express";
import { collections, getClient } from "../db.js";
import { questionnaire } from "../config/questions.js";
import { validateAnswers } from "../services/validateAnswers.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const coursesRouter = express.Router();

// Every route in this file needs a signed-in student.
coursesRouter.use("/courses", requireAuth);

// Course ids look like "CSC-240-F26".
const COURSE_ID_PATTERN = /^[A-Z]{3}-\d{3}-[A-Z]\d{2}$/;
const ALREADY_SUBMITTED = "You've already submitted this evaluation.";

function isOpen(course) {
  return new Date() < course.evalClosesAt;
}

// What the browser is allowed to know about a course.
function publicCourse(course) {
  return {
    id: course._id,
    code: course.code,
    title: course.title,
    professor: course.professor,
    term: course.term,
    schedule: course.schedule,
    evalClosesAt: course.evalClosesAt,
    isOpen: isOpen(course),
  };
}

// Runs before every /courses/:courseId/... route.
// The check happens here, on the server, on every request: hiding a course
// in the browser would not stop someone from typing its URL into curl.
async function loadEnrolledCourse(req, res, next) {
  const { courseId } = req.params;

  // "Not enrolled", "no such course" and "not even a valid id" all get the
  // same answer, so the response cannot be used to discover course ids.
  const enrolled = COURSE_ID_PATTERN.test(courseId) && req.student.courseIds.includes(courseId);
  const course = enrolled ? await collections().courses.findOne({ _id: courseId }) : null;

  if (!course) {
    res.status(403).json({ error: "You're not enrolled in that course." });
    return;
  }

  req.course = course;
  next();
}

// READ: the dashboard. Enrolled courses, each with a status worked out
// from two other collections.
coursesRouter.get("/courses", async (req, res) => {
  const { courses, submissions, drafts } = collections();
  const studentId = req.student._id;

  const enrolledCourses = await courses.find({ _id: { $in: req.student.courseIds } }).toArray();
  const receipts = await submissions.find({ studentId }).toArray();
  const savedDrafts = await drafts.find({ studentId }).toArray();

  const submittedIds = receipts.map((receipt) => receipt.courseId);

  const list = enrolledCourses.map((course) => {
    const draft = savedDrafts.find((d) => d.courseId === course._id);
    const answeredCount = draft ? Object.keys(draft.answers).length : 0;

    let status = "not_started";
    if (submittedIds.includes(course._id)) status = "submitted";
    else if (answeredCount > 0) status = "in_progress";

    return {
      ...publicCourse(course),
      status,
      answeredCount,
      totalQuestions: questionnaire.questions.length,
    };
  });

  // Unfinished work first, finished work last.
  const order = { in_progress: 0, not_started: 1, submitted: 2 };
  list.sort((a, b) => order[a.status] - order[b.status] || a.code.localeCompare(b.code));

  res.json({ courses: list });
});

// READ: everything the evaluation page needs for one course.
coursesRouter.get("/courses/:courseId/evaluation", loadEnrolledCourse, async (req, res) => {
  const { submissions, drafts } = collections();
  const key = { studentId: req.student._id, courseId: req.course._id };
  const course = publicCourse(req.course);

  // Already submitted: say so, and send no questions and no answers.
  // (There are no answers to send — nothing links this student to them.)
  if (await submissions.findOne(key)) {
    res.json({ course, status: "submitted", questionnaire: null, draft: null });
    return;
  }

  const draft = await drafts.findOne(key);
  const answers = draft ? draft.answers : {};

  let status = Object.keys(answers).length > 0 ? "in_progress" : "not_started";
  if (!course.isOpen) status = "closed";

  res.json({ course, status, questionnaire, draft: { answers } });
});

// UPDATE: autosave. Called each time the student moves between questions.
coursesRouter.put("/courses/:courseId/draft", loadEnrolledCourse, async (req, res) => {
  const { submissions, drafts } = collections();
  const key = { studentId: req.student._id, courseId: req.course._id };

  if (await submissions.findOne(key)) {
    res.status(409).json({ error: ALREADY_SUBMITTED });
    return;
  }
  if (!isOpen(req.course)) {
    res.status(403).json({ error: "This evaluation has closed." });
    return;
  }

  // partial: true — a draft may have unanswered questions.
  const { ok, errors, clean } = validateAnswers(req.body?.answers, questionnaire, { partial: true });
  if (!ok) {
    res.status(400).json({ error: "Some answers aren't valid.", errors });
    return;
  }

  // upsert: update this student's draft for this course if there is one,
  // otherwise create it. One query covers both the first save and every
  // save after it.
  await drafts.updateOne(
    key,
    { $set: { answers: clean, updatedAt: new Date() } },
    { upsert: true }
  );

  res.json({ ok: true, answeredCount: Object.keys(clean).length });
});

// DELETE: "Start over" throws the draft away.
coursesRouter.delete("/courses/:courseId/draft", loadEnrolledCourse, async (req, res) => {
  await collections().drafts.deleteOne({ studentId: req.student._id, courseId: req.course._id });
  res.status(204).end();
});

// CREATE: the anonymous submit. Note that nothing in this handler logs
// the request body — answers must never end up in a log file next to
// the name of who sent them.
coursesRouter.post("/courses/:courseId/submit", loadEnrolledCourse, async (req, res) => {
  const { submissions, responses, drafts } = collections();
  const studentId = req.student._id;
  const courseId = req.course._id;

  if (!isOpen(req.course)) {
    res.status(403).json({ error: "This evaluation has closed." });
    return;
  }
  if (await submissions.findOne({ studentId, courseId })) {
    res.status(409).json({ error: ALREADY_SUBMITTED });
    return;
  }

  // partial: false — every required question must be answered.
  const { ok, errors, clean } = validateAnswers(req.body?.answers, questionnaire, { partial: false });
  if (!ok) {
    res.status(400).json({ error: "Some answers are missing or aren't valid.", errors });
    return;
  }

  // Two documents that deliberately know nothing about each other.
  //
  // Both use a random UUID as _id instead of MongoDB's default ObjectId.
  // An ObjectId contains the second it was created, so a receipt and a
  // response created together could be matched up by their ids. A random
  // UUID contains no time at all. For the same reason the receipt stores
  // only the date, not the time.
  const receipt = {
    _id: crypto.randomUUID(),
    studentId, // WHO submitted...
    courseId,
    submittedOn: new Date().toISOString().slice(0, 10), // e.g. "2026-11-15"
  };
  const response = {
    _id: crypto.randomUUID(),
    courseId, // ...and WHAT was said, with no student anywhere in it.
    term: req.course.term,
    questionnaireVersion: questionnaire.version,
    answers: clean,
  };

  // A transaction makes the three writes all-or-nothing. Without it, a
  // crash between them could leave a response with no receipt (the student
  // could vote twice) or a receipt with no response (their evaluation
  // would be lost, and they could not redo it).
  const session = getClient().startSession();
  try {
    await session.withTransaction(async () => {
      await submissions.insertOne(receipt, { session });
      await responses.insertOne(response, { session });
      // The draft was the last thing tying this student to these answers.
      await drafts.deleteOne({ studentId, courseId }, { session });
    });
  } catch (err) {
    // 11000 is MongoDB's "duplicate key" error: the unique index on
    // { studentId, courseId } refused a second receipt. This catches the
    // race the findOne check above cannot — two submits arriving at the
    // same instant. The transaction rolled back, so no response was stored.
    if (err.code === 11000) {
      res.status(409).json({ error: ALREADY_SUBMITTED });
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }

  res.status(201).json({ ok: true });
});
