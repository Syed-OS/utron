# Code tour

Three pieces of code that carry the project. For each: where it is, what it
does step by step, why it is written that way, and the questions it is likely
to raise.

Line numbers match the code at the time of writing. If they have drifted, the
function names have not.

---

## 1. The login route

**File:** `src/routes/auth.js`, lines 35–69
(with the three constants it uses on lines 14–33)

### What it does, step by step

| Lines | Step |
|---|---|
| 40–44 | Pull `email` and `password` out of the body. If either is not a plain string, stop with the generic error. |
| 47–48 | Normalize the email (trim, lowercase) and look the student up. |
| 50–51 | Pick a hash to compare against — the student's, or a dummy if there is no such student — and run bcrypt. |
| 53–56 | If there was no student **or** the password did not match, return the same 401 with the same message. |
| 61–68 | Replace the session with a fresh one, store the student's id in it, reply with their name. |

### Why it is written that way

- **Only strings are accepted (line 41).** A JSON body can contain objects. If
  `email` were `{ "$gt": "" }` and went straight into
  `findOne({ email })`, MongoDB would read it as "any email greater than the
  empty string" and return the first student. Checking `typeof` closes that
  door. This attack is called operator injection (or NoSQL injection).
- **One error for everything (lines 14, 53–56).** "Unknown email" and "wrong
  password" look identical from outside, so the form cannot be used to find
  out who has an account.
- **The dummy hash (lines 19, 50).** bcrypt is slow on purpose. If unknown
  emails skipped it, they would get a faster reply than real ones, and the
  *timing* would reveal which emails exist. Running one comparison either way
  keeps the timing the same.
- **`req.session.regenerate` (line 61).** The session id changes at the moment
  of sign-in. If an attacker had managed to plant a session id in the victim's
  browser beforehand, that id never becomes a signed-in one. The attack is
  called session fixation.
- **Only the id goes in the session (line 66).** The session stores
  `studentId` and nothing else. Each request loads the student fresh from the
  database (`requireAuth.js`), so enrollment is always current.
- **`loginLimiter` (lines 25–33, used on line 35).** Ten failed attempts per
  15 minutes per IP address. Successful sign-ins do not count.

### Questions to be ready for

**Why bcrypt instead of SHA-256?**
SHA-256 is built to be fast — a graphics card can try billions of guesses per
second against a stolen database. bcrypt is built to be slow, and its cost
factor makes it tunable: cost 12 means 2¹² rounds, a fraction of a second per
attempt. That is unnoticeable for one login and ruinous for someone guessing
millions of passwords. bcrypt also generates a random salt and stores it
inside the hash, so two students with the same password have different hashes
and precomputed tables are useless.

**Where is the plaintext password stored?**
Nowhere in the database. `scripts/seed.js` generates it, hashes it, stores the
hash, and puts the plaintext only into the email. In this demo the "email" is
a file in `outbox/`, standing in for the student's real inbox.

**What is in the cookie?**
A random session id, signed with `SESSION_SECRET` so it cannot be forged. No
user data. The session itself is a document in the `sessions` collection. The
cookie is `httpOnly` (page scripts cannot read it) and `SameSite=Strict`
(other sites cannot send requests that carry it).

**Why is there no try/catch?**
Express 5 passes errors thrown in `async` handlers to the error handler
automatically. The one callback-style call, `regenerate`, passes its error
along with `next(err)`.

**Why can't students change their password?**
A deliberate scope decision: passwords are issued once per term, like a
ballot. Leaving out a reset flow also leaves out its attack surface.

---

## 2. The transactional submit

**File:** `src/routes/courses.js`, lines 157–226

### What it does, step by step

| Lines | Step |
|---|---|
| 157 | The route runs `loadEnrolledCourse` first: bad id, unknown course or not enrolled → 403. |
| 162–165 | Evaluation closed → 403. |
| 166–169 | Receipt already exists → 409. |
| 172–176 | Validate every answer on the server; all required questions must be present → otherwise 400. |
| 185–197 | Build two documents: the **receipt** (who, which course, date) and the **response** (which course, what was said). |
| 203–210 | In one transaction: insert the receipt, insert the response, delete the draft. |
| 211–221 | If MongoDB reports duplicate key (code 11000), answer 409. Anything else is re-thrown to the error handler. |
| 222–223 | Always end the database session. |
| 225 | Reply `201 { ok: true }`. |

### Why it is written that way

- **Two documents with nothing in common (lines 185–197).** The receipt has a
  `studentId` and no answers. The response has answers and no `studentId`.
  There is no shared field to join them on.
- **`crypto.randomUUID()` for both ids (lines 186, 192).** MongoDB's default
  ObjectId starts with a timestamp accurate to the second. Two documents
  created by the same request would have near-identical timestamps — a hidden
  link. A random UUID has no time in it.
- **Date only (line 189).** `toISOString().slice(0, 10)` keeps `2026-11-15`
  and drops the time, for the same reason.
- **A transaction (lines 203–210).** Three writes that must all happen or all
  not happen. Passing `{ session }` to each call is what puts it inside the
  transaction; `withTransaction` commits at the end, or rolls everything back
  if anything throws.
- **The draft is deleted inside it (line 209).** The draft was the last
  document connecting this student to these answers.
- **Two checks for "already submitted" (lines 166 and 216).** The `findOne`
  gives a fast, friendly answer in the normal case. The unique index is the
  real guarantee, because it also covers the case the `findOne` cannot — see
  below.

### Questions to be ready for

**What happens if two submit requests arrive at once?**
Both pass the `findOne` check, because neither receipt exists yet. Both start
a transaction and try to insert a receipt with the same
`{ studentId, courseId }`. The unique index (created in `src/db.js`) lets
exactly one through. The other gets error 11000, its transaction rolls back —
so its response is never stored — and it replies 409. The test
`two submits at the same instant: exactly one wins` proves this by firing two
requests with `Promise.all`.

**How do you know responses are anonymous?**
Three ways. By design: the response document has five fields — `_id`,
`courseId`, `term`, `questionnaireVersion`, `answers` — and none identifies a
person. By test: `ANONYMITY: a stored response cannot be traced to the
student` reads a real stored response and asserts exactly those fields, a UUID
id, and that the student's id, email and name appear nowhere in it. By
inspection: open the `responses` collection in Atlas and look.

**Is it perfectly anonymous?**
No, and `docs/ARCHITECTURE.md` lists the limits honestly: very small classes,
students identifying themselves in free text, insertion order, and logs kept
by the database and host outside the app.

**Why does the transaction need Atlas (or a replica set)?**
MongoDB transactions depend on the replication log, so they only work on
replica sets. Every Atlas cluster, including the free tier, is one. That is
also why the tests and the local backup database start a one-member replica
set instead of a plain server.

**Why validate on the server when the browser already does?**
The browser's checks are for convenience. Anyone can skip the page and send a
request directly (with curl, for example). The server is the only place a
rule can actually be enforced. `validateAnswers` also loops over the
*questionnaire's* ids, not the request's keys, so extra fields a client adds
are never stored.

**Why not Mongoose?**
The official driver keeps every query visible: `insertOne`, `findOne`,
`updateOne` do exactly what they say. The data model is five small collections
with rules that live in indexes and one validation function, so a schema layer
would add concepts without removing code. It also matches the Track 2 handout.

---

## 3. The question flow in the browser

**File:** `public/js/evaluate.js`

| Part | Lines |
|---|---|
| The `state` object | 29–39 |
| `showQuestion` — draw one question | 143–174 |
| `goNext` and `goBack` — navigation | 392–411 |
| `saveDraft` — autosave | 506–527 |

### What it does

The page is a small **state machine**: one object remembers where the student
is, functions draw a screen from that object, and events change the object and
redraw.

- **`state` (29–39)** holds the questions, the answers so far (in the same
  `{ questionId: answer }` shape the server stores), which `view` is showing
  (`question`, `review`, `done` or `message`), and the `index` of the current
  question.
- **`showQuestion(index, direction)` (143–174)** sets `state.view` and
  `state.index`, writes `#q4` into the address bar, swaps the stage's HTML with
  a short animation, then updates everything around it: Back button, Next
  button label, keyboard hint, progress bar, screen-reader announcement, focus.
- **`goNext` (392–405)** refuses to move if the screen is mid-change or a
  required question is unanswered. Otherwise it saves the draft and shows
  either the next question or the review screen.
- **`goBack` (407–411)** is the mirror image, sliding the other way.
- **`saveDraft` (506–527)** sends *all* answers with `PUT`. On success it
  flashes "Saved". On failure it shows "Couldn't save — check your
  connection" with a Retry button. It returns `true` or `false` so
  `saveAndExit` can refuse to leave with unsaved work.

### Why it is written that way

- **One state object instead of reading the DOM.** The answers live in
  `state.answers`, not in the radio buttons. The screen can be thrown away and
  redrawn at any time (next question, back, edit from review) without losing
  anything.
- **`history.replaceState` (line 152), not `pushState`.** The hash exists so a
  refresh lands on the same question. With `pushState`, the browser's Back
  button would replay every question; with `replaceState` it leaves the
  evaluation in one step, which is what people expect.
- **`saveDraft()` is not awaited in `goNext` (line 400).** The save runs in the
  background while the next question slides in, so the interface never waits
  on the network. If it fails, the answers are still in `state.answers` and
  the next save sends them all again.
- **The whole answer set is sent every time.** No "what changed since last
  time" bookkeeping. The server replaces the draft with an upsert, so a
  repeated or late save is harmless.
- **`state.busy` (line 37).** Set while a screen is changing or a submit is in
  flight. Key presses and clicks are ignored during that time, so hammering
  Enter cannot skip two questions or submit twice.
- **Event delegation.** The stage's contents are replaced on every screen, so
  listeners are attached once to the stage itself (`change`, `input`,
  `click`), and events from the elements inside bubble up to it.
- **Real radio inputs in a `<fieldset>`.** Arrow keys, Space, and screen-reader
  announcements come for free from the browser. The number-key and Enter
  shortcuts are added on top (the `keydown` listener).
- **`escapeHtml` on everything dynamic.** Question text and the student's own
  typed answers pass through `escapeHtml` (in `ui.js`) before going into an
  HTML string, so typed markup is shown as text, never run.

### Questions to be ready for

**Why not React?**
The page has one piece of state and four screens. A framework would add a
build step, a dependency tree and a layer of concepts on top of about 600
lines that already do the job. Track 2 is about the backend, and with no build
tooling there is nothing to break before a demo.

**What happens if the session expires halfway through?**
The next save returns 401. `api.js` fires a `utron:session-expired` event,
`evaluate.js` answers it by copying the answers into `sessionStorage`, and the
browser is sent to sign-in with `?next=` pointing back here. After signing in,
`restorePendingAnswers` picks the answers up — only if the same student and
course — and saves them.

**What if the network drops?**
`saveDraft` catches the failure and shows the Retry note. Nothing is lost,
because the answers are in memory. Navigation still works; the next successful
save sends everything.

**What stops a double-click on Submit?**
Three layers: the button is disabled and `state.busy` is set while the request
runs; the server checks for an existing receipt; the unique index rejects a
second one regardless.

**Why can't I jump to `#q9` by editing the address bar?**
`startingScreen` (line 103) only honors the hash up to the first required
question that has no answer.

**How does the page avoid inline styles, given the Content Security Policy?**
The progress bar's width is set from JavaScript (`element.style.width`), which
the policy allows. What it blocks is `style="…"` written into HTML.
