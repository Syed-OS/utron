# Dev log

A running record of the real problems hit while building U-tron: what went
wrong, how it was noticed, and how it was fixed. Newest entries are at the
bottom. Commit hashes point at the fix.

## 2026-11-15

### `npm install` reported two vulnerabilities (nodemon)

- **Noticed:** `npm install` ended with "2 moderate severity vulnerabilities".
  `npm audit` traced both to `minimatch`, pulled in only by `nodemon`.
- **Why it matters:** the project has to install cleanly on the grader's
  machine, with no warnings to explain away.
- **Fix:** removed `nodemon`. Node 20+ has a built-in watch mode, so
  `npm run dev` is now `node --watch server.js`. One less dependency, and
  `npm audit` reports 0 vulnerabilities.

### The build machine could not download MongoDB for local testing

- **Noticed:** `mongodb-memory-server` (used by the tests) downloads a real
  `mongod` program from `fastdl.mongodb.org` the first time it runs. On the
  cloud machine used for the build, that download failed with
  `CONNECT tunnel failed, response 403` — the network only allowed package
  registries.
- **Fix:** allowed that one host in the build environment's network
  settings. Nothing in the project changed.
- **Related decision:** Atlas itself is not reachable from that machine, so
  development ran against a local in-memory replica set instead. That became
  `npm run db:local` (`scripts/local-db.js`): a throwaway MongoDB for working
  offline, and a backup if the demo room's Wi-Fi blocks Atlas. It has to be a
  *replica set*, not a plain server, because transactions only work on
  replica sets.
