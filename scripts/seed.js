// Fills the database with demo courses and students.
//
//   npm run seed              add anything that is missing
//   npm run seed -- --reset   wipe everything first, then recreate
//
// Each new student gets a generated password. Only its bcrypt hash goes
// into the database; the password itself goes into an "email" in outbox/,
// standing in for the student's real inbox.

import "dotenv/config";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { connectToDatabase, collections, getClient, closeDatabase } from "../src/db.js";
import { questionnaire } from "../src/config/questions.js";
import { generatePassword, hashPassword } from "../src/services/passwords.js";
import { sendMail, OUTBOX_DIR } from "../src/services/mailer.js";
import { buildPasswordEmail } from "../src/services/passwordEmail.js";

const term = process.env.TERM_NAME || "Fall 2026";
const closesAt = new Date(process.env.EVAL_CLOSES_AT || "2026-12-30T23:59:00-05:00");
const signInUrl = `http://localhost:${process.env.PORT || 3000}`;

// Everything below is fictional: the courses, the professors, the students.
const courses = [
  { _id: "CSC-240-F26", code: "CSC 240", title: "Web Programming",
    professor: "Prof. Dana Whitfield", schedule: "Tue/Thu 10:55–12:40" },
  { _id: "MTH-210-F26", code: "MTH 210", title: "Linear Algebra",
    professor: "Prof. Ikenna Obi", schedule: "Mon/Wed/Fri 9:15–10:20" },
  { _id: "HST-155-F26", code: "HST 155", title: "The Modern City",
    professor: "Prof. Marguerite Sandoval", schedule: "Tue/Thu 1:55–3:40" },
  { _id: "PHY-120-F26", code: "PHY 120", title: "Physics of Everyday Life",
    professor: "Prof. Tobias Lindqvist", schedule: "Mon/Wed 1:50–3:35" },
  { _id: "ENG-230-F26", code: "ENG 230", title: "Writing About Science",
    professor: "Prof. Priya Raman", schedule: "Mon/Wed/Fri 11:45–12:50" },
];

const students = [
  { name: "Alex Rivera", email: "alex.rivera@students.example.edu",
    courseIds: ["CSC-240-F26", "MTH-210-F26", "HST-155-F26", "ENG-230-F26"] },
  { name: "Jordan Kim", email: "jordan.kim@students.example.edu",
    courseIds: ["CSC-240-F26", "MTH-210-F26", "PHY-120-F26"] },
  { name: "Sam Okafor", email: "sam.okafor@students.example.edu",
    courseIds: ["CSC-240-F26", "MTH-210-F26", "HST-155-F26", "PHY-120-F26", "ENG-230-F26"] },
  { name: "Taylor Nguyen", email: "taylor.nguyen@students.example.edu",
    courseIds: ["CSC-240-F26", "HST-155-F26", "ENG-230-F26"] },
  { name: "Morgan Patel", email: "morgan.patel@students.example.edu",
    courseIds: ["MTH-210-F26", "HST-155-F26", "PHY-120-F26", "ENG-230-F26"] },
  { name: "Casey Brooks", email: "casey.brooks@students.example.edu",
    courseIds: ["CSC-240-F26", "HST-155-F26", "PHY-120-F26", "ENG-230-F26"] },
];

if (!process.env.MONGODB_URI) {
  console.error('The seed needs MONGODB_URI. Copy ".env.example" to ".env" and fill it in.');
  process.exit(1);
}

try {
  await connectToDatabase(process.env.MONGODB_URI, process.env.DB_NAME || "utron");
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

// Students: skip any that already exist, so a re-run never changes a
// password that has already been "emailed".
const created = [];
for (const student of students) {
  const existing = await db.students.findOne({ email: student.email });
  if (existing) {
    created.push({ name: student.name, email: student.email, password: "(unchanged — see the demo inbox)" });
    continue;
  }

  const password = generatePassword();
  const { insertedId } = await db.students.insertOne({
    email: student.email,
    name: student.name,
    passwordHash: await hashPassword(password),
    courseIds: student.courseIds,
  });

  await sendMail({ to: student.email, ...buildPasswordEmail({ name: student.name, password, term, signInUrl }) });
  created.push({ name: student.name, email: student.email, password });

  // Give the first student some history, so the dashboard shows all three
  // states (submitted, in progress, not started) the moment the demo starts.
  if (student.email === students[0].email) {
    await addDemoHistory(insertedId);
  }
}

console.log(`\nSeeded ${courses.length} courses and ${students.length} students for ${term}.`);
console.table(created);
console.log(`Sign in at ${signInUrl} — passwords are also in the demo inbox: ${signInUrl}/inbox.html\n`);

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
  // Signed-in sessions belong to students that no longer exist.
  await getClient().db(process.env.DB_NAME || "utron").collection("sessions").deleteMany({});
  // Old emails hold passwords that no longer work.
  await fs.rm(OUTBOX_DIR, { recursive: true, force: true });
  console.log("Reset: removed all students, courses, evaluations and demo emails.");
}
