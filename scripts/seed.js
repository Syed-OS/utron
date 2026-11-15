// Fills the database with the demo courses and the one demo account.
//
//   npm run seed              create or update the courses and the account
//   npm run seed -- --reset   wipe everything first, then recreate
//
// There is one demo account. Its email and password are written below (and
// in the README) on purpose, so anyone who clones the project can sign in.
// That is fine for demo data; a real deployment would never do this. Even
// here, the database only ever holds a bcrypt hash of the password.

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

// The demo account. Stored the same way the login route looks it up:
// lowercase, no spaces around it.
const email = "johndoe@onion.edu";
const name = "John Doe";
const password = "be77erth@nsc@ntr0n";

if (!process.env.MONGODB_URI) {
  console.error('The seed needs MONGODB_URI. Copy ".env.example" to ".env" and fill it in.');
  process.exit(1);
}

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
  passwordHash: await hashPassword(password),
  courseIds: courses.map((course) => course._id),
};

if (existing) {
  // Already there: bring it in line with the values above.
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
  Password    ${password}
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
