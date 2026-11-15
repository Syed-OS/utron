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

### Tertiary text color failed the contrast check

- **Noticed:** while writing `tokens.css`, checked each text color against
  WCAG AA (4.5:1). The planned tertiary gray `#8C887D` on the page
  background `#F7F6F3` came out near 3.3:1 — too faint for small text such
  as the footer and help lines.
- **Fix:** darkened `--ink-3` to `#6E6A60` (about 4.9:1 on the background
  and still above 4.5:1 on the hover fill). Same check in the dark theme
  moved `--ink-3` to `#8A867C`, and `--warn` to `#8A5A00` so warning text
  passes on its own wash color.

### The sign-in page logged a console error on every visit

- **Noticed:** the first screenshot run printed
  `Failed to load resource: the server responded with a status of 401`.
  The page asked `GET /api/me` to find out whether the visitor was already
  signed in, and for a signed-out visitor the honest answer is 401 — which
  the browser always reports in the console, even when the code handles it.
- **Fix:** `GET /api/config` (public, always 200) now also returns
  `signedIn: true/false`, and the sign-in page asks that instead. One
  request instead of two, and a clean console.

### The show-password button sat 8px too low

- **Noticed:** in the screenshot the eye icon was below the middle of the
  password field.
- **Cause:** the rule `.signin-form .btn { margin-top: 8px }` was meant for
  the "Sign in" button but matched every `.btn` in the form, including the
  icon button inside the field.
- **Fix:** narrowed the selector to `.signin-form .btn-block`.
