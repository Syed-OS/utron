// API tests: real HTTP requests against the real app, backed by a
// throwaway in-memory MongoDB.
//
// The database is a replica set (MongoMemoryReplSet) rather than a plain
// server because the submit route uses a transaction, and MongoDB only
// supports transactions on replica sets.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectToDatabase, collections, closeDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/services/passwords.js";

const EMAIL = "test.student@students.example.edu";
const PASSWORD = "abcd-efgh-jkmn";
const COURSE = "CSC-240-F26"; // enrolled
const OTHER_COURSE = "MTH-210-F26"; // enrolled, used for the race test
const NOT_ENROLLED = "PHY-120-F26";
const CLOSED_COURSE = "HST-155-F26"; // enrolled, but past its closing date

const completeAnswers = {
  teaching_overall: 5,
  clarity: 4,
  grading_timeliness: "often",
  office_hours: "na",
  assessment_fit: 3,
  respect: 5,
  workload: "6-8",
  recommend: 4,
  improve: "More worked examples.",
};

let replicaSet;
let app;
let db;
let studentId;

before(async () => {
  process.env.NODE_ENV = "test"; // turns the login rate limit off
  process.env.SESSION_SECRET = "test-secret";
  process.env.DB_NAME = "utron_test";

  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectToDatabase(replicaSet.getUri(), process.env.DB_NAME);
  app = createApp();
  db = collections();

  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const lastYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  await db.courses.insertMany([
    { _id: COURSE, code: "CSC 240", title: "Web Programming", term: "Fall 2026", evalClosesAt: nextYear },
    { _id: OTHER_COURSE, code: "MTH 210", title: "Linear Algebra", term: "Fall 2026", evalClosesAt: nextYear },
    { _id: NOT_ENROLLED, code: "PHY 120", title: "Physics", term: "Fall 2026", evalClosesAt: nextYear },
    { _id: CLOSED_COURSE, code: "HST 155", title: "The Modern City", term: "Fall 2026", evalClosesAt: lastYear },
  ]);

  const { insertedId } = await db.students.insertOne({
    email: EMAIL,
    name: "Test Student",
    passwordHash: await hashPassword(PASSWORD),
    courseIds: [COURSE, OTHER_COURSE, CLOSED_COURSE],
  });
  studentId = insertedId;
});

after(async () => {
  await closeDatabase();
  await replicaSet.stop();
});

// A supertest "agent" keeps cookies between requests, like a browser.
async function signedInAgent() {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD }).expect(200);
  return agent;
}

// ------------------------------------------------------------------ Login

test("login succeeds with the right password, ignoring case and spaces in the email", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: `  ${EMAIL.toUpperCase()} `, password: PASSWORD });

  assert.equal(response.status, 200);
  assert.equal(response.body.name, "Test Student");

  // The cookie must be unreadable by page scripts and never sent cross-site.
  const cookie = response.headers["set-cookie"][0];
  assert.match(cookie, /^utron\.sid=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});

test("a wrong password and an unknown email get the identical response", async () => {
  const wrongPassword = await request(app).post("/api/auth/login").send({ email: EMAIL, password: "nope" });
  const unknownEmail = await request(app).post("/api/auth/login").send({ email: "nobody@example.edu", password: "nope" });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  // Identical bodies: the response never reveals whether an account exists.
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
});

test("login rejects operator-injection payloads and empty bodies", async () => {
  const injection = await request(app)
    .post("/api/auth/login")
    .send({ email: { $gt: "" }, password: { $gt: "" } });
  assert.equal(injection.status, 401);

  const empty = await request(app).post("/api/auth/login").send({});
  assert.equal(empty.status, 401);
});

test("logout ends the session", async () => {
  const agent = await signedInAgent();
  await agent.get("/api/me").expect(200);
  await agent.post("/api/auth/logout").expect(204);
  await agent.get("/api/me").expect(401);
});

// ------------------------------------------------------------- Auth guard

test("course routes require a session", async () => {
  await request(app).get("/api/courses").expect(401);
  await request(app).get(`/api/courses/${COURSE}/evaluation`).expect(401);
  await request(app).put(`/api/courses/${COURSE}/draft`).send({ answers: {} }).expect(401);
  await request(app).post(`/api/courses/${COURSE}/submit`).send({ answers: completeAnswers }).expect(401);
});

test("a student cannot touch a course they are not enrolled in", async () => {
  const agent = await signedInAgent();
  await agent.get(`/api/courses/${NOT_ENROLLED}/evaluation`).expect(403);
  await agent.put(`/api/courses/${NOT_ENROLLED}/draft`).send({ answers: { clarity: 3 } }).expect(403);
  await agent.post(`/api/courses/${NOT_ENROLLED}/submit`).send({ answers: completeAnswers }).expect(403);
  await agent.get("/api/courses/not-a-real-id/evaluation").expect(403);
});

test("a closed evaluation cannot be saved or submitted", async () => {
  const agent = await signedInAgent();
  await agent.put(`/api/courses/${CLOSED_COURSE}/draft`).send({ answers: { clarity: 3 } }).expect(403);
  await agent.post(`/api/courses/${CLOSED_COURSE}/submit`).send({ answers: completeAnswers }).expect(403);
});

// ----------------------------------------------------------------- Drafts

test("drafts: create, update in place, list as in progress, delete", async () => {
  const agent = await signedInAgent();

  // First save creates the draft; unknown keys are dropped.
  await agent.put(`/api/courses/${COURSE}/draft`).send({ answers: { teaching_overall: 4, hacked: true } }).expect(200);
  let draft = await db.drafts.findOne({ studentId, courseId: COURSE });
  assert.deepEqual(draft.answers, { teaching_overall: 4 });

  // Second save updates the same document instead of adding another.
  await agent.put(`/api/courses/${COURSE}/draft`).send({ answers: { teaching_overall: 4, clarity: 2 } }).expect(200);
  assert.equal(await db.drafts.countDocuments({ studentId, courseId: COURSE }), 1);

  const list = await agent.get("/api/courses").expect(200);
  const course = list.body.courses.find((c) => c.id === COURSE);
  assert.equal(course.status, "in_progress");
  assert.equal(course.answeredCount, 2);

  // Invalid answers are refused and the stored draft is left alone.
  await agent.put(`/api/courses/${COURSE}/draft`).send({ answers: { teaching_overall: 99 } }).expect(400);
  draft = await db.drafts.findOne({ studentId, courseId: COURSE });
  assert.equal(draft.answers.teaching_overall, 4);

  await agent.delete(`/api/courses/${COURSE}/draft`).expect(204);
  assert.equal(await db.drafts.countDocuments({ studentId, courseId: COURSE }), 0);
});

// ----------------------------------------------------------------- Submit

test("submit refuses incomplete answers and stores nothing", async () => {
  const agent = await signedInAgent();
  const response = await agent.post(`/api/courses/${COURSE}/submit`).send({ answers: { teaching_overall: 5 } });

  assert.equal(response.status, 400);
  assert.equal(await db.submissions.countDocuments({ courseId: COURSE }), 0);
  assert.equal(await db.responses.countDocuments({ courseId: COURSE }), 0);
});

test("submit stores a receipt and an anonymous response, and deletes the draft", async () => {
  const agent = await signedInAgent();
  await agent.put(`/api/courses/${COURSE}/draft`).send({ answers: { teaching_overall: 5 } }).expect(200);

  await agent.post(`/api/courses/${COURSE}/submit`).send({ answers: completeAnswers }).expect(201);

  // The receipt: who and which course, with a date but no time.
  const receipt = await db.submissions.findOne({ studentId, courseId: COURSE });
  assert.ok(receipt);
  assert.match(receipt.submittedOn, /^\d{4}-\d{2}-\d{2}$/);

  // The draft went in the same transaction.
  assert.equal(await db.drafts.countDocuments({ studentId, courseId: COURSE }), 0);

  // The dashboard and the evaluation page now report it as submitted.
  const list = await agent.get("/api/courses").expect(200);
  assert.equal(list.body.courses.find((c) => c.id === COURSE).status, "submitted");
  const evaluation = await agent.get(`/api/courses/${COURSE}/evaluation`).expect(200);
  assert.equal(evaluation.body.status, "submitted");
  assert.equal(evaluation.body.questionnaire, null);
});

test("ANONYMITY: a stored response cannot be traced to the student", async () => {
  const response = await db.responses.findOne({ courseId: COURSE });
  assert.ok(response);

  // Exactly these fields and nothing else.
  assert.deepEqual(Object.keys(response).sort(), ["_id", "answers", "courseId", "questionnaireVersion", "term"]);
  assert.deepEqual(response.answers, completeAnswers);

  // The id is a random UUID string. It must not be an ObjectId, because an
  // ObjectId contains its creation time, which could be matched to a receipt.
  assert.equal(typeof response._id, "string");
  assert.equal(response._id instanceof ObjectId, false);
  assert.match(response._id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  // Nothing about the student appears anywhere in the document.
  const everything = JSON.stringify(response);
  assert.equal(everything.includes(studentId.toString()), false);
  assert.equal(everything.includes(EMAIL), false);
  assert.equal(everything.includes("Test Student"), false);

  // The receipt's id is also a UUID, and shares nothing with the response's.
  const receipt = await db.submissions.findOne({ studentId, courseId: COURSE });
  assert.equal(typeof receipt._id, "string");
  assert.notEqual(receipt._id, response._id);
});

test("a second submit is rejected with 409 and stores nothing more", async () => {
  const agent = await signedInAgent();
  const response = await agent.post(`/api/courses/${COURSE}/submit`).send({ answers: completeAnswers });

  assert.equal(response.status, 409);
  assert.equal(await db.responses.countDocuments({ courseId: COURSE }), 1);

  // Saving a draft after submitting is refused too.
  await agent.put(`/api/courses/${COURSE}/draft`).send({ answers: { clarity: 1 } }).expect(409);
});

test("two submits at the same instant: exactly one wins", async () => {
  const agent = await signedInAgent();
  const submit = () => agent.post(`/api/courses/${OTHER_COURSE}/submit`).send({ answers: completeAnswers });

  // Promise.all starts both requests before either has finished.
  const [first, second] = await Promise.all([submit(), submit()]);

  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  // The unique index and the transaction together guarantee one of each.
  assert.equal(await db.submissions.countDocuments({ courseId: OTHER_COURSE }), 1);
  assert.equal(await db.responses.countDocuments({ courseId: OTHER_COURSE }), 1);
});
