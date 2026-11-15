// Fills the database with the demo courses and the one demo account.
//
//   npm run seed              create or update the courses and the account
//   npm run seed -- --reset   wipe everything first, then recreate
//
// The account's email and password come from .env (DEMO_EMAIL and
// DEMO_PASSWORD), so the password is never written in the code or
// committed to the repository. Only its bcrypt hash goes into the database.

import "dotenv/config";
import crypto from "node:crypto";
import { connectToDatabase, collections, getClient, closeDatabase } from "../src/db.js";
import { questionnaire } from "../src/config/questions.js";
import { hashPassword } from "../src/services/passwords.js";

const term = process.env.TERM_NAME || "Fall 2026";
const closesAt = new Date(process.env.EVAL_CLOSES_AT || "2026-12-30T23:59:00-05:00");
const dbName = process.env.DB_NAME || "utron";

// Everything below is fictional: the courses, the professors, the student.
const courses = [
  { _id: "CSC-240-F26", code: "CSC 240", title: "Web Programming",
    professor: "Prof. Dana Whitfield", schedule: "Tue/Thu 10:55–12:40" },
  { _id: "MTH-210-F26", code: "MTH 210", title: "Linear Algebra",
    professor: "Prof. Ikenna Obi", schedule: "Mon/Wed/Fri 9:15–10:20" },
  { _id: "HST-155-F26", code: "HST 155", title: "The Modern City",
    professor: "Prof. Marguerite Sandoval", schedule: "Tue/Thu 1:55–3:40" },
  { _id: "ENG-230-F26", code: "ENG 230", title: "Writing About Science",
    professor: "Prof. Priya Raman", schedule: "Mon/Wed/Fri 11:45–12:50" },
];

// Stop early, with instructions, if a setting is missing.
const missing = ["MONGODB_URI", "DEMO_EMAIL", "DEMO_PASSWORD"].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`The seed needs ${missing.join(", ")} in .env. See ".env.example" for what each one is.`);
  process.exit(1);
}

// Stored the same way the login route looks it up: trimmed and lowercase.
const email = process.env.DEMO_EMAIL.trim().toLowerCase();
const name = process.env.DEMO_NAME || "John Doe";

try {
  await connectToDatabase(process.env.MONGODB_URI, dbName);
} catch (err) {
  // Same friendly message as server.js, instead of a stack trace.
  console.error(`The seed can't reach MongoDB: ${err.message}`);
  console.error('Check MONGODB_URI in .env. On Atlas, also check "Network Access".');
  process.exit(1);
}
const db = collections();

if (process.argv.includes("--reset")) {
  await resetEverything();
}

// Courses: replaceOne + upsert means "create it, or overwrite it if it is
// already there", so running the seed twice never makes duplicates.
for (const course of courses) {
  const document = { ...course, term, evalClosesAt: closesAt };
  await db.courses.replaceOne({ _id: course._id }, document, { upsert: true });
}

// This account is the only one allowed in, so remove any other.
await db.students.deleteMany({ email: { $ne: email } });

const existing = await db.students.findOne({ email });
const account = {
  email,
  name,
  passwordHash: await hashPassword(process.env.DEMO_PASSWORD),
  courseIds: courses.map((course) => course._id),
};

if (existing) {
  // Already there: bring it in line with .env (for example a new password).
  await db.students.updateOne({ _id: existing._id }, { $set: account });
} else {
  const { insertedId } = await db.students.insertOne(account);
  // Some history, so the dashboard shows all three states (submitted,
  // in progress, not started) the moment the demo starts.
  await addDemoHistory(insertedId);
}

console.log(`
Seeded ${courses.length} courses and 1 account for ${term}.

  Sign in at  http://localhost:${process.env.PORT || 3000}
  Email       ${email}
  Password    the DEMO_PASSWORD value in your .env file
`);

await closeDatabase();

// One course already submitted, one draft in progress.
async function addDemoHistory(studentId) {
  // Same shape the real submit route writes: a receipt that says who and
  // when (date only), and a separate response that says what.
  await db.submissions.insertOne({
    _id: crypto.randomUUID(),
    studentId,
    courseId: "HST-155-F26",
    submittedOn: new Date().toISOString().slice(0, 10),
  });
  await db.responses.insertOne({
    _id: crypto.randomUUID(),
    courseId: "HST-155-F26",
    term,
    questionnaireVersion: questionnaire.version,
    answers: {
      teaching_overall: 5, clarity: 4, grading_timeliness: "often", office_hours: "always",
      assessment_fit: 4, respect: 5, workload: "3-5", recommend: 5,
      keep: "The walking tours. Seeing the buildings made the readings stick.",
    },
  });
  await db.drafts.insertOne({
    studentId,
    courseId: "MTH-210-F26",
    answers: { teaching_overall: 4, clarity: 3, grading_timeliness: "sometimes", office_hours: "na" },
    updatedAt: new Date(),
  });
}

async function resetEverything() {
  for (const collection of Object.values(db)) {
    await collection.deleteMany({});
  }
  // Signed-in sessions belong to accounts that no longer exist.
  await getClient().db(dbName).collection("sessions").deleteMany({});
  console.log("Reset: removed all accounts, courses and evaluations.");
}
