// Optional: a throwaway MongoDB on this computer, for working offline.
//
//   npm run db:local
//
// It uses the same in-memory server as the tests. It runs as a replica set
// (a single member) because transactions only work on replica sets, and
// the submit route needs a transaction. Data disappears when you stop it,
// so run "npm run seed" again after each start.

import { MongoMemoryReplSet } from "mongodb-memory-server";

const replicaSet = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  instanceOpts: [{ port: 27018 }],
});

console.log(`
Local MongoDB is running. Put this line in .env, then leave this window open:

  MONGODB_URI=${replicaSet.getUri()}

Press Ctrl+C to stop it.
`);

process.on("SIGINT", async () => {
  await replicaSet.stop();
  process.exit(0);
});
