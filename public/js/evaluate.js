// The evaluation page: one question per screen, then review, then done.
//
// How it works: one "state" object remembers where the student is, and
// each show…() function draws one kind of screen from that state. Events
// (clicks, key presses) change the state and call a show…() function.

import { api } from "./api.js";
import { escapeHtml, icons, shortDate } from "./ui.js";

const courseId = new URLSearchParams(location.search).get("course") || "";
const draftUrl = `/courses/${encodeURIComponent(courseId)}/draft`;
const PENDING_KEY = "utron.pendingAnswers";

const stage = document.querySelector("#stage");
const nav = document.querySelector("#nav");
const backButton = document.querySelector("#back");
const nextButton = document.querySelector("#next");
const nextHint = document.querySelector("#next-hint");
const saveStatus = document.querySelector("#save-status");
const saveError = document.querySelector("#save-error");
const progress = document.querySelector("#progress");
const live = document.querySelector("#live");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMac = navigator.platform.startsWith("Mac");

// ---------------------------------------------------------------- State

const state = {
  course: null,
  questions: [],
  answers: {}, // { questionId: answer } — the same shape the server stores
  view: "loading", // "question" | "review" | "done" | "message"
  index: 0, // which question is on screen
  editingFromReview: false, // true after "Edit" on the review screen
  studentEmail: "",
  busy: false, // true while the screen is changing or a submit is in flight
  usingKeyboard: false, // true when the last input was a key press, not a click or tap
};

function currentQuestion() {
  return state.questions[state.index];
}

function hasAnswer(question) {
  return state.answers[question.id] !== undefined;
}

// Index of the first required question with no answer, or -1 if none.
function firstRequiredGap() {
  return state.questions.findIndex((question) => question.required && !hasAnswer(question));
}

// ---------------------------------------------------------------- Start

start();

async function start() {
  let me, evaluation;
  try {
    [me, evaluation] = await Promise.all([
      api("GET", "/me"),
      api("GET", `/courses/${encodeURIComponent(courseId)}/evaluation`),
    ]);
  } catch (err) {
    // 403 covers "not enrolled" and "no such course" alike.
    if (err.status === 403) {
      showMessage("Not found", "We couldn't find that evaluation",
        "The link may be wrong, or you may not be enrolled in this course.");
    } else {
      showMessage("Something went wrong", "We couldn't load this evaluation", err.message);
    }
    return;
  }

  state.course = evaluation.course;
  state.studentEmail = me.email;
  document.title = `${state.course.code} evaluation · U-tron`;
  document.querySelector("#course-code").textContent = state.course.code;
  document.querySelector("#course-title").textContent = state.course.title;

  if (evaluation.status === "submitted") {
    showAlreadySubmitted();
    return;
  }
  if (evaluation.status === "closed") {
    showMessage("Closed", `This evaluation closed on ${shortDate(state.course.evalClosesAt)}`,
      "Evaluations can't be started or changed after the closing date.");
    return;
  }

  state.questions = evaluation.questionnaire.questions;
  state.answers = evaluation.draft.answers;
  restorePendingAnswers();

  const screen = startingScreen();
  if (screen === "review") showReview();
  else showQuestion(screen);
}

// Where to begin: the address bar's #q4 or #review if it is reachable,
// otherwise the first unanswered question.
function startingScreen() {
  const requiredGap = firstRequiredGap();
  const allRequiredAnswered = requiredGap === -1;

  // A refresh keeps the student on the question they were looking at.
  // They can never jump past a required question they have not answered.
  const match = location.hash.match(/^#q(\d+)$/);
  if (match) {
    const index = Number(match[1]) - 1;
    const furthestAllowed = allRequiredAnswered ? state.questions.length - 1 : requiredGap;
    if (index >= 0 && index <= furthestAllowed) return index;
  }
  if (location.hash === "#review" && allRequiredAnswered) return "review";

  const firstGap = state.questions.findIndex((question) => !hasAnswer(question));
  return firstGap === -1 ? "review" : firstGap;
}

// -------------------------------------------------------------- Screens

// Swaps what is on the stage, with a short fade-and-slide. "direction"
// only changes which way things move: forward slides up, back slides down.
async function changeScreen(html, direction = "forward") {
  state.busy = true;
  if (!reduceMotion) {
    stage.dataset.direction = direction;
    stage.classList.add("is-leaving");
    await new Promise((resolve) => setTimeout(resolve, 150));
    stage.classList.remove("is-leaving");
  }
  stage.innerHTML = html;
  stage.classList.add("is-entering");
  window.scrollTo(0, 0);
  state.busy = false;
}

stage.addEventListener("animationend", (event) => {
  if (event.target === stage) stage.classList.remove("is-entering");
});

async function showQuestion(index, direction = "forward") {
  state.view = "question";
  state.index = index;
  const question = currentQuestion();
  const total = state.questions.length;

  // replaceState (not pushState): the hash is only there so a refresh
  // lands on the same question. The browser's Back button still leaves
  // the evaluation in one step instead of replaying every question.
  history.replaceState(null, "", `#q${index + 1}`);

  await changeScreen(questionHtml(question, index, total), direction);

  nav.hidden = false;
  backButton.hidden = index === 0 || state.editingFromReview;
  const shortcut = isMac ? "⌘ Enter" : "Ctrl Enter";
  nextHint.textContent = question.type === "text" ? shortcut : "Enter";
  updateNextButton();
  setProgress(index / total);
  live.textContent = `Question ${index + 1} of ${total}`;

  // Put the keyboard where the answer goes. A text box always takes focus.
  // Options only take it for keyboard users: the focus ring on option 1
  // would look like a selected answer to someone using a mouse.
  const textarea = stage.querySelector("textarea");
  if (textarea) {
    textarea.focus();
    growToFit(textarea);
  } else if (state.usingKeyboard) {
    (stage.querySelector("input:checked") || stage.querySelector("input")).focus();
  }
}

function questionHtml(question, index, total) {
  const counter = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const help = question.help ? `<p class="question-help">${escapeHtml(question.help)}</p>` : "";
  const saved = state.answers[question.id];
  let body;

  if (question.type === "text") {
    const text = saved || "";
    body = `
      <h1 class="question-prompt"><label for="answer-text">${escapeHtml(question.prompt)}</label></h1>
      ${help}
      <textarea class="textarea" id="answer-text" rows="3" maxlength="${question.maxLength}"
                placeholder="Type your answer">${escapeHtml(text)}</textarea>
      <p class="char-count mono"><span id="char-count">${text.length}</span> / ${question.maxLength}</p>`;
  } else {
    // Real radio buttons inside a fieldset: the legend is read out as the
    // group's name, and arrow keys move between options, with no extra code.
    const options = question.type === "scale" ? scaleHtml(question, saved) : choicesHtml(question, saved);
    body = `
      <fieldset>
        <legend><h1 class="question-prompt">${escapeHtml(question.prompt)}</h1></legend>
        ${help}
        ${options}
      </fieldset>`;
  }

  const tip = index === 0 ? '<p class="tip">Tip: use number keys and Enter.</p>' : "";
  return `<p class="counter mono">${counter}</p>${body}${tip}`;
}

function scaleHtml(question, saved) {
  const tiles = [1, 2, 3, 4, 5].map((number) => {
    // Screen readers hear "1, Poor" and "5, Excellent" on the end tiles.
    let endLabel = "";
    if (number === 1) endLabel = question.lowLabel;
    if (number === 5) endLabel = question.highLabel;
    return `
      <label class="option">
        <input type="radio" name="answer" value="${number}" ${saved === number ? "checked" : ""}>
        <span class="option-face">${number}<span class="visually-hidden">${escapeHtml(endLabel)}</span></span>
      </label>`;
  });
  return `
    <div class="scale">${tiles.join("")}</div>
    <div class="scale-labels" aria-hidden="true">
      <span>${escapeHtml(question.lowLabel)}</span><span>${escapeHtml(question.highLabel)}</span>
    </div>`;
}

function choicesHtml(question, saved) {
  const rows = question.options.map((option, i) => `
    <label class="option">
      <input type="radio" name="answer" value="${escapeHtml(option.value)}" ${saved === option.value ? "checked" : ""}>
      <span class="option-face">
        <span class="kbd" aria-hidden="true">${i + 1}</span>
        <span>${escapeHtml(option.label)}</span>
        <span class="option-check">${icons.check}</span>
      </span>
    </label>`);
  return `<div class="choices">${rows.join("")}</div>`;
}

async function showReview() {
  state.view = "review";
  state.editingFromReview = false;
  history.replaceState(null, "", "#review");

  const rows = state.questions.map((question, index) => {
    const answer = answerText(question);
    const answerHtml = answer === null
      ? '<p class="review-answer is-empty">No answer</p>'
      : `<p class="review-answer">${escapeHtml(answer)}</p>`;
    return `
      <li class="review-row">
        <div class="review-text">
          <p class="review-question">${escapeHtml(question.prompt)}</p>
          ${answerHtml}
        </div>
        <button class="btn btn-ghost btn-small" type="button" data-action="edit" data-index="${index}">Edit</button>
      </li>`;
  });

  await changeScreen(`
    <p class="counter eyebrow">Review</p>
    <h1 class="review-title" tabindex="-1">Review your answers</h1>
    <ol class="list review-list">${rows.join("")}</ol>
    <p class="note note-quiet">${icons.lock}
      <span>Your answers are stored separately from your name. We only record that you submitted.</span></p>
    <div class="note note-danger" id="submit-error" role="alert" hidden></div>
    <div class="review-actions">
      <span id="start-over">${startOverHtml()}</span>
      <button class="btn btn-primary" type="button" data-action="submit">Submit anonymously</button>
    </div>`);

  nav.hidden = true;
  setProgress(1);
  live.textContent = "Review your answers";
  stage.querySelector("h1").focus();
}

// The answer as the student should read it back on the review screen.
function answerText(question) {
  const value = state.answers[question.id];
  if (value === undefined) return null;

  if (question.type === "text") return value;
  if (question.type === "scale") {
    if (value === 1) return `1 of 5 · ${question.lowLabel}`;
    if (value === 5) return `5 of 5 · ${question.highLabel}`;
    return `${value} of 5`;
  }
  // Stored as a key such as "na"; shown as its label.
  return question.options.find((option) => option.value === value).label;
}

async function showDone() {
  state.view = "done";
  history.replaceState(null, "", location.pathname + location.search);

  // Offer the next unfinished course, if there is one.
  let nextLink = "";
  try {
    const { courses } = await api("GET", "/courses");
    const next = courses.find((course) => course.status !== "submitted" && course.isOpen);
    if (next) {
      nextLink = `<a class="btn btn-primary" href="/evaluate.html?course=${encodeURIComponent(next.id)}">
        Next: ${escapeHtml(next.code)} ${escapeHtml(next.title)} ${icons.arrowRight}</a>`;
    }
  } catch {
    // Not worth an error message: "Back to courses" is still there.
  }

  await changeScreen(`
    <svg class="done-check" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="26"/><path d="M17 29l8 8 15-17"/>
    </svg>
    <h1 class="done-title" tabindex="-1">Submitted.</h1>
    <p class="done-text">Your evaluation for ${escapeHtml(state.course.code)} is in. Thank you for taking the time.</p>
    <div class="done-actions">
      ${nextLink}
      <a class="btn btn-ghost" href="/courses.html">Back to courses</a>
    </div>`);

  nav.hidden = true;
  live.textContent = "Submitted.";
  stage.querySelector("h1").focus();
}

// A calm full-screen state for anything that stops the evaluation.
async function showMessage(label, title, text) {
  state.view = "message";
  await changeScreen(`
    <p class="counter eyebrow">${escapeHtml(label)}</p>
    <h1 class="message-title" tabindex="-1">${escapeHtml(title)}</h1>
    <p class="message-text">${escapeHtml(text)}</p>
    <a class="btn btn-primary" href="/courses.html">Back to courses</a>`);
  nav.hidden = true;
  saveError.hidden = true;
  setProgress(0);
  stage.querySelector("h1").focus();
}

function showAlreadySubmitted() {
  forgetPendingAnswers();
  showMessage("Already submitted", "You've already submitted this evaluation",
    "Each evaluation can be submitted once. Your answers were stored anonymously, so they can't be shown or changed.");
}

function setProgress(fraction) {
  const percent = Math.round(fraction * 100);
  // Set from JavaScript because the Content Security Policy blocks
  // style="" attributes written into HTML.
  document.querySelector("#progress-fill").style.width = `${percent}%`;
  progress.setAttribute("aria-valuenow", percent);
}

// ------------------------------------------------------------ Answering

function recordChoice(radio) {
  const question = currentQuestion();
  // Radio values are always strings; scale answers are stored as numbers.
  state.answers[question.id] = question.type === "scale" ? Number(radio.value) : radio.value;
  updateNextButton();
  // Save straight away, so a refresh right after choosing keeps the choice.
  saveDraft();
}

function recordText(textarea) {
  const question = currentQuestion();
  if (textarea.value.trim() === "") {
    delete state.answers[question.id]; // blank means "skipped"
  } else {
    state.answers[question.id] = textarea.value;
  }
  stage.querySelector("#char-count").textContent = textarea.value.length;
  growToFit(textarea);
  updateNextButton();
}

// Makes the text box as tall as its content, so it never scrolls inside.
function growToFit(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateNextButton() {
  const question = currentQuestion();
  nextButton.disabled = question.required && !hasAnswer(question);

  if (state.editingFromReview) nextButton.textContent = "Back to review";
  else if (!question.required && !hasAnswer(question)) nextButton.textContent = "Skip";
  else nextButton.textContent = "Next";
}

// ----------------------------------------------------------- Navigation

function goNext() {
  const question = currentQuestion();
  if (state.busy || state.view !== "question") return;
  if (question.required && !hasAnswer(question)) return;

  // Autosave on every move (this is what saves typed answers). Not
  // awaited: the save runs in the background while the next question
  // slides in.
  saveDraft();

  const isLast = state.index === state.questions.length - 1;
  if (state.editingFromReview || isLast) showReview();
  else showQuestion(state.index + 1);
}

function goBack() {
  if (state.busy || state.view !== "question" || state.index === 0) return;
  saveDraft();
  showQuestion(state.index - 1, "back");
}

// Leaves for the dashboard, but only once the answers are safely saved.
async function saveAndExit() {
  const hasWork = state.view === "question" || state.view === "review";
  if (hasWork && !(await saveDraft())) return; // the "Couldn't save" note is showing
  location.href = "/courses.html";
}

nextButton.addEventListener("click", goNext);
backButton.addEventListener("click", goBack);
document.querySelector("#retry-save").addEventListener("click", saveDraft);
document.querySelector("#exit").addEventListener("click", (event) => {
  event.preventDefault(); // it is a real link, but save first
  saveAndExit();
});

// The stage's contents are replaced on every screen, so listeners are
// attached once to the stage itself; events from inside bubble up to it.
stage.addEventListener("change", (event) => {
  if (event.target.name === "answer") recordChoice(event.target);
});

stage.addEventListener("input", (event) => {
  if (event.target.id === "answer-text") recordText(event.target);
});

stage.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || state.busy) return;

  const action = button.dataset.action;
  if (action === "edit") {
    state.editingFromReview = true;
    showQuestion(Number(button.dataset.index), "back");
  }
  if (action === "submit") submit(button);
  if (action === "start-over") {
    document.querySelector("#start-over").innerHTML = `
      <span class="confirm">Discard answers?
        <button class="btn btn-ghost btn-small" type="button" data-action="discard">Yes</button>
        <button class="btn btn-ghost btn-small" type="button" data-action="keep">No</button>
      </span>`;
  }
  if (action === "keep") document.querySelector("#start-over").innerHTML = startOverHtml();
  if (action === "discard") discardDraft();
});

function startOverHtml() {
  return '<button class="btn btn-ghost" type="button" data-action="start-over">Start over</button>';
}

document.addEventListener("pointerdown", () => {
  state.usingKeyboard = false;
});

document.addEventListener("keydown", (event) => {
  state.usingKeyboard = true;
  if (state.busy) return;

  if (event.key === "Escape") {
    saveAndExit();
    return;
  }
  if (state.view !== "question") return;

  const inTextarea = event.target.tagName === "TEXTAREA";

  if (event.key === "Enter") {
    if (inTextarea) {
      // Plain Enter makes a new line; Ctrl/⌘+Enter moves on.
      if (event.ctrlKey || event.metaKey) goNext();
      return;
    }
    // Enter on a focused button or link should press that button or link.
    if (event.target.closest("button, a")) return;
    goNext();
    return;
  }

  // Number keys pick an option: 1 is the first, 2 the second, and so on.
  const isPlainDigit = /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (isPlainDigit && !inTextarea) {
    const radio = stage.querySelectorAll('input[name="answer"]')[Number(event.key) - 1];
    if (radio) {
      radio.checked = true;
      radio.focus();
      recordChoice(radio);
    }
  }
});

// ----------------------------------------------------- Saving and submit

// UPDATE in CRUD: sends every answer so far. Returns true if it saved.
async function saveDraft() {
  try {
    await api("PUT", draftUrl, { answers: state.answers });
  } catch (err) {
    if (err.status === 409) {
      showAlreadySubmitted(); // submitted from another tab or device
      return false;
    }
    // Nothing is lost: the answers are still in state.answers, and the
    // next move (or Retry) sends them all again.
    saveError.hidden = false;
    return false;
  }

  saveError.hidden = true;
  saveStatus.innerHTML = `${icons.check} Saved`;
  saveStatus.classList.add("is-visible");
  clearTimeout(saveStatus.timer);
  saveStatus.timer = setTimeout(() => saveStatus.classList.remove("is-visible"), 1800);
  return true;
}

// DELETE in CRUD: "Start over" throws the draft away.
async function discardDraft() {
  try {
    await api("DELETE", draftUrl);
  } catch (err) {
    showSubmitError(`Couldn't discard your answers. ${err.message}`);
    return;
  }
  state.answers = {};
  showQuestion(0, "back");
}

// CREATE in CRUD: the anonymous submit.
async function submit(button) {
  // Disabled while the request runs, so a double-click sends one request.
  // (The server would reject a second one anyway.)
  state.busy = true;
  button.disabled = true;
  button.classList.add("is-busy");

  try {
    await api("POST", `/courses/${encodeURIComponent(courseId)}/submit`, { answers: state.answers });
  } catch (err) {
    state.busy = false;
    if (err.status === 409) {
      showAlreadySubmitted();
      return;
    }
    button.disabled = false;
    button.classList.remove("is-busy");
    showSubmitError(err.status === 0 ? "Couldn't submit — check your connection, then try again." : err.message);
    return;
  }

  state.busy = false;
  showDone();
}

function showSubmitError(text) {
  const box = document.querySelector("#submit-error");
  box.textContent = text;
  box.hidden = false;
}

// ------------------------------------------------------ Expired sessions

// api.js fires this just before it redirects to sign-in. The answers are
// parked in sessionStorage (this tab only, gone when the tab closes) so
// nothing typed since the last save is lost.
window.addEventListener("utron:session-expired", () => {
  if (state.view !== "question" && state.view !== "review") return;
  const pending = { email: state.studentEmail, courseId, answers: state.answers };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
});

// After signing back in, pick the parked answers up again and save them.
function restorePendingAnswers() {
  const saved = sessionStorage.getItem(PENDING_KEY);
  if (!saved) return;
  forgetPendingAnswers();

  // Only for the same student and course. If someone else signed in on
  // this tab, the first student's answers must not appear for them.
  const pending = JSON.parse(saved);
  if (pending.email === state.studentEmail && pending.courseId === courseId) {
    state.answers = { ...state.answers, ...pending.answers };
    saveDraft();
  }
}

function forgetPendingAnswers() {
  sessionStorage.removeItem(PENDING_KEY);
}
