// MongoDB connection and collections.
//
// One MongoClient is shared by the whole app. The driver keeps a connection
// pool inside the client, so we connect once at startup and reuse it.

import { MongoClient } from "mongodb";

let client = null;
let db = null;

// Connects, remembers the client, and makes sure every index exists.
export async function connectToDatabase(uri, dbName) {
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await createIndexes();
  return client;
}

// The client is needed for two things outside this file:
// the session store (connect-mongo) and transactions (client.startSession()).
export function getClient() {
  return client;
}

// Every collection the app uses, in one place.
export function collections() {
  return {
    students: db.collection("students"),
    courses: db.collection("courses"),
    submissions: db.collection("submissions"),
    responses: db.collection("responses"),
    drafts: db.collection("drafts"),
  };
}

export async function closeDatabase() {
  if (client) {
    await client.close();
  }
}

// createIndex does nothing if the index already exists, so it is safe to
// run this on every startup.
async function createIndexes() {
  const { students, submissions, drafts } = collections();

  // Two students can never share an email address.
  await students.createIndex({ email: 1 }, { unique: true });

  // One receipt per student per course. This is what makes a double
  // submission impossible, even if two requests arrive at the same moment:
  // the database itself rejects the second insert.
  await submissions.createIndex({ studentId: 1, courseId: 1 }, { unique: true });

  // One draft per student per course (the autosave upserts into it).
  await drafts.createIndex({ studentId: 1, courseId: 1 }, { unique: true });

  // TTL index: MongoDB deletes a draft 30 days after its last update,
  // so abandoned answers do not sit in the database forever.
  const thirtyDays = 60 * 60 * 24 * 30;
  await drafts.createIndex({ updatedAt: 1 }, { expireAfterSeconds: thirtyDays });
}
