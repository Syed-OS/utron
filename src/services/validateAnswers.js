// Checks a set of answers against the questionnaire.
//
// This is a pure function: it reads its arguments and returns a result,
// with no database and no request object. That makes it easy to test, and
// lets the draft route and the submit route share one set of rules.
//
// The browser also validates, but only to be helpful. The browser can be
// bypassed (anyone can send a request with curl), so the server never
// trusts it and re-checks everything here.
//
// Returns { ok, errors, clean }:
//   ok     - true when there are no errors
//   errors - { questionId: "what is wrong" }
//   clean  - only the valid answers, safe to store

export function validateAnswers(answers, questionnaire, { partial }) {
  const errors = {};
  const clean = {};

  // Guard against a body like { "answers": "hello" } or { "answers": [1, 2] }.
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    return { ok: false, errors: { answers: "Answers must be an object." }, clean };
  }

  // Loop over the questions we asked, not over the keys we were sent.
  // Anything the client added that is not a real question id is never
  // looked at, so it can never reach the database.
  for (const question of questionnaire.questions) {
    const value = answers[question.id];
    const isMissing = value === undefined || value === null || value === "";

    if (isMissing) {
      // Drafts (partial) may have gaps. A final submit may not.
      if (question.required && !partial) {
        errors[question.id] = "This question needs an answer.";
      }
      continue;
    }

    const result = checkOne(question, value);
    if (result.error) {
      errors[question.id] = result.error;
    } else if (result.value !== "") {
      clean[question.id] = result.value;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, clean };
}

// Validates one answer. Returns { value } or { error }.
function checkOne(question, value) {
  if (question.type === "scale") {
    // Number.isInteger is false for "5", 4.5, NaN and objects.
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return { error: "Choose a number from 1 to 5." };
    }
    return { value };
  }

  if (question.type === "frequency" || question.type === "choice") {
    const allowed = question.options.map((option) => option.value);
    if (!allowed.includes(value)) {
      return { error: "Choose one of the listed options." };
    }
    return { value };
  }

  if (question.type === "text") {
    if (typeof value !== "string") {
      return { error: "This answer must be text." };
    }
    const trimmed = value.trim();
    if (trimmed.length > question.maxLength) {
      return { error: `Keep this under ${question.maxLength} characters.` };
    }
    // An all-spaces answer trims to "", which the caller leaves out.
    return { value: trimmed };
  }

  return { error: "Unknown question type." };
}
