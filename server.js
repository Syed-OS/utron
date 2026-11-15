// Entry point: load settings, connect to MongoDB, start listening.

import "dotenv/config";
import { connectToDatabase } from "./src/db.js";
import { createApp } from "./src/app.js";

// Stop early, with instructions, if a required setting is missing.
// A clear message is kinder than a stack trace from deep inside a library.
const missing = ["MONGODB_URI", "SESSION_SECRET"].filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`
U-tron can't start: ${missing.join(" and ")} missing from .env

  1. Copy ".env.example" to ".env"
  2. MONGODB_URI    -> your MongoDB Atlas connection string
  3. SESSION_SECRET -> any long random string, for example from:
       node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
`);
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const dbName = process.env.DB_NAME || "utron";

try {
  await connectToDatabase(process.env.MONGODB_URI, dbName);
} catch (err) {
  console.error(`
U-tron can't reach MongoDB: ${err.message}

  Check MONGODB_URI in .env. On Atlas, also check that your current
  IP address is allowed under "Network Access".
`);
  process.exit(1);
}

const app = createApp();

app.listen(port, () => {
  console.log(`U-tron is running at http://localhost:${port}`);
});
