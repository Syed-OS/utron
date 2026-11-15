# Dev log

A running record of the real problems hit while building U-tron: what went
wrong, how it was noticed, and how it was fixed. Entries are in the order they
happened. Each one names the commit that holds the fix
(`git show <hash>` displays it).

All entries are from 2026-11-15, the day of the build.

---

### 1. `npm install` reported two vulnerabilities

- **Noticed:** `npm install` ended with "2 moderate severity
  vulnerabilities". `npm audit` traced both to `minimatch`, pulled in only by
  `nodemon`.
- **Why it matters:** the project has to install cleanly on the grader's
  machine, with no warnings to explain away.
- **Fix:** removed `nodemon`. Node 20+ has a built-in watch mode, so
  `npm run dev` is now `node --watch server.js`. One less dependency, and
  `npm audit` reports 0 vulnerabilities.
- **Commit:** `f10c015`

### 2. The build machine could not download MongoDB for local testing

- **Noticed:** `mongodb-memory-server` (used by the tests) downloads a real
  `mongod` program from `fastdl.mongodb.org` the first time it runs. On the
  cloud machine used for the build, that download failed with
  `CONNECT tunnel failed, response 403` — the network only allowed package
  registries.
- **Fix:** allowed that one host in the build environment's network settings.
  Nothing in the project changed.
- **Related decision:** Atlas itself was not reachable from that machine, so
  development ran against a local in-memory replica set instead. That became
  `npm run db:local` (`scripts/local-db.js`): a throwaway MongoDB for working
  offline, and a backup if the demo room's Wi-Fi blocks Atlas. It has to be a
  *replica set*, not a plain server, because transactions only work on
  replica sets.
- **Commit:** `3fa3f46`

### 3. Error logs could have contained students' answers

- **Noticed:** while writing the submit route, re-read the error handler. It
  logged the whole error object. Some database errors carry details of the
  operation that failed, and on the submit route that operation contains
  answers — next to a request made by a signed-in student.
- **Fix:** the error handler logs `err.stack` only (the message and where it
  happened), never the object and never the request body.
- **Commit:** `0e73e4a`

### 4. Tertiary text color failed the contrast check

- **Noticed:** while writing `tokens.css`, checked each text color against
  WCAG AA (4.5:1). The planned tertiary gray `#8C887D` on the page background
  `#F7F6F3` came out near 3.3:1 — too faint for small text such as the footer
  and help lines.
- **Fix:** darkened `--ink-3` to `#6E6A60` (about 4.9:1 on the background and
  still above 4.5:1 on the hover fill). The same check in the dark theme moved
  `--ink-3` to `#8A867C`, and `--warn` to `#8A5A00` so warning text passes on
  its own wash color. The password email had the same faint gray and got the
  same fix later.
- **Commits:** `62b5873`, `25c53f1`

### 5. The sign-in page logged a console error on every visit

- **Noticed:** the first screenshot run printed
  `Failed to load resource: the server responded with a status of 401`. The
  page asked `GET /api/me` to find out whether the visitor was already signed
  in, and for a signed-out visitor the honest answer is 401 — which the
  browser always reports in the console, even when the code handles it.
- **Fix:** `GET /api/config` (public, always 200) now also returns
  `signedIn: true/false`, and the sign-in page asks that instead. One request
  instead of two, and a clean console.
- **Commit:** `d9175d8`

### 6. The show-password button sat 8px too low

- **Noticed:** in the screenshot the eye icon was below the middle of the
  password field.
- **Cause:** the rule `.signin-form .btn { margin-top: 8px }` was meant for
  the "Sign in" button but matched every `.btn` in the form, including the
  icon button inside the field.
- **Fix:** narrowed the selector to `.signin-form .btn-block`.
- **Commit:** `d9175d8`

### 7. "In progress ·4/10" was missing a space

- **Noticed:** in the dashboard screenshot, the pill read `In progress ·4/10`.
- **Cause:** the count was wrapped in its own `<span>` inside a flex
  container. Flex layout turns the text and the span into separate items and
  drops the whitespace between them.
- **Fix:** removed the inner span; the pill is one piece of text, with
  `font-variant-numeric: tabular-nums` on the pill itself.
- **Commit:** `ae1a427`

### 8. Option 1 looked selected before anything was chosen

- **Noticed:** the first evaluation screenshot showed an orange ring around
  tile "1" on a question nobody had answered. The page was moving keyboard
  focus to the first option on every question, and the focus ring uses the
  same accent color as a selected answer.
- **Fix:** `showQuestion()` only moves focus to the options when the last
  input was a key press (`state.usingKeyboard`). Mouse and touch users see no
  ring; keyboard users still land on the options. Text questions always focus
  the text box.
- **Commit:** `53d3d11`

### 9. A chosen answer disappeared on refresh

- **Noticed:** an automated browser walkthrough picked an option on question
  3, refreshed the page, and pressed Enter — and got stuck. The page had come
  back on question 3 (correct), but with nothing selected, so "Next" was
  disabled.
- **Cause:** the draft was only saved when the student *moved* to another
  question. A choice made but not yet confirmed with Next existed only in the
  page's memory.
- **Fix:** `recordChoice()` in `public/js/evaluate.js` now saves as soon as an
  option is picked. Typed answers are still saved on move, not on every
  keystroke.
- **Checked first:** picking and pressing Enter quickly sends two saves almost
  at once. Fired six simultaneous first-time `PUT /draft` requests, six rounds
  in a row, with curl: all returned 200 and exactly one draft document existed
  afterwards. The upsert is safe to run concurrently because its query matches
  the unique index exactly.
- **Commit:** `53d3d11`

### 10. Email preview: inline styles versus the Content Security Policy

- **Expected in advance:** the site's policy is `style-src 'self'`, which
  blocks `style="…"` attributes. Emails are styled *only* with inline
  attributes, because email clients ignore stylesheets. Rendering an email
  inside the inbox page with `srcdoc` would have inherited the page's policy
  and shown it unstyled.
- **Fix:** each email's HTML is served from its own route
  (`/api/demo/inbox/:id/html`) with its own, narrower policy:
  `default-src 'none'; style-src 'unsafe-inline'`. Inline styles are allowed
  for that one response; scripts, images and requests are all forbidden. The
  inbox page shows it in an `<iframe sandbox>`.
- **Commit:** `dd8dc68`

### 11. Chrome warning from the email preview frame

- **Noticed:** the inbox screenshot run printed a console warning: "The page
  requested an origin-keyed agent cluster using the Origin-Agent-Cluster
  header, but could not be origin-keyed…".
- **Cause:** `helmet` adds an `Origin-Agent-Cluster` header to every response.
  A sandboxed frame has no origin of its own, so the header on the email
  response contradicted how the browser had already grouped the page.
- **Fix:** the email route removes that one header from its response.
- **Commit:** `dd8dc68`

### 12. "Saved" and "Couldn't save" showed at the same time

- **Noticed:** tested a network failure by switching the browser offline
  mid-evaluation. The red "Couldn't save" note appeared correctly — but the
  "Saved" indicator from the previous successful save was still fading out in
  the top corner. Two opposite messages on one screen.
- **Fix:** a failed save hides the "Saved" indicator immediately.
- **Commit:** `f3ce95a`

### 13. The rate limit would have locked out the demo

- **Noticed:** during the security pass, sent 12 sign-in attempts in a row to
  confirm the limit: the 11th returned 429 as designed. But the limiter
  counted *every* attempt, including successful ones — and a live demo that
  signs in and out as several students would hit 10 within 15 minutes.
- **Fix:** `skipSuccessfulRequests: true`. Only failed sign-ins count, which
  is what brute-force protection is actually about.
- **Commit:** `6593395`

### 14. Question text wrapped awkwardly on phones

- **Noticed:** in the 375px screenshots, a long question broke as "work
  returned in / time to help with the", leaving the right third of the screen
  empty.
- **Cause:** the `max-width: 24ch` that gives questions a comfortable line
  length on desktop was narrower than the phone's own width once the font
  size dropped.
- **Fix:** `max-width: none` for the question text below 600px.
- **Commit:** `1520bff`

### 15. Arrow keys did nothing on the first question

- **Noticed:** a keyboard-only walkthrough (no mouse at any point) reached the
  first question from the dashboard and pressed the right arrow. Nothing
  happened. Because of fix 8, focus only moves into the options once the page
  has seen a key press — and on a freshly loaded page it has not seen one yet.
- **Fix:** in the `keydown` listener, an arrow key pressed while nothing is
  focused moves focus to the options. From there the browser's own arrow-key
  behavior for radio buttons takes over. Number keys and Enter already worked
  without focus.
- **Result:** the full flow — sign in, pick a course, answer, review, submit —
  passes with the keyboard alone, with zero console errors.
- **Commit:** `488249b`

### 16. The seed crashed with a stack trace on a bad connection string

- **Noticed:** on the first run on the presenter's Mac, `.env` still held the
  placeholder connection string. `npm start` answered with its friendly
  "can't reach MongoDB" message, but `npm run seed` printed a raw
  `querySrv ENOTFOUND` stack trace.
- **Cause:** `server.js` wrapped the database connection in try/catch; the
  seed script did not.
- **Fix:** the seed catches the connection error and prints the same kind of
  short message.
- **Commit:** `842efeb`

### 17. Simplified to one account; demo inbox removed

- **Why:** six generated passwords, read out of a demo inbox, made the demo
  slower to start and harder to follow. One known account is enough to show
  everything.
- **Change:** the seed now creates a single account from `DEMO_EMAIL` and
  `DEMO_PASSWORD` in `.env`, removes any other account, and enrolls it in
  four courses. The demo inbox page, its API routes, the file-based mailer,
  the password email and the password generator were deleted, along with
  their tests and styles (29 tests became 25).
- **Decision:** the password is read from `.env` rather than written in
  `seed.js`. The repository is public, and a password committed to a public
  repository would contradict the project's own rule that secrets never go
  in code.
- **Note:** entries 10 and 11 above describe the inbox that this change
  removed. They are kept because they happened.

---

## Decisions worth remembering

Not bugs, but choices that someone might ask about.

- **`bcryptjs` rather than `bcrypt`.** The pure-JavaScript version needs no
  compiler, so `npm install` cannot fail on a machine without build tools.
- **Fonts are committed, not installed.** The two `.woff2` files were copied
  from the `@fontsource-variable` packages once and committed under
  `public/fonts/`, so the packages are not dependencies and there is no
  `postinstall` step to go wrong.
- **`npm test` is just `node --test`.** No `NODE_ENV=test` prefix in the
  script, because that syntax does not work in the Windows command prompt.
  The test file sets the variable itself.
- **Two small files beyond the original plan.** `public/js/ui.js` (HTML
  escaping and icons shared by the pages) and `scripts/local-db.js` (see
  entry 2).
- **One extra route, `GET /api/config`.** See entry 5.
- **Not reachable during the build: MongoDB Atlas.** Everything was verified
  against a local replica set of the same MongoDB server. The first run
  against Atlas itself happens on the presenter's own machine.
