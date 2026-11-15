// Unit tests for the answer validator. No database needed: it is a pure
// function, so each test just calls it and checks what comes back.

import test from "node:test";
import assert from "node:assert/strict";
import { validateAnswers } from "../src/services/validateAnswers.js";
import { questionnaire } from "../src/config/questions.js";

// A complete, valid set of answers that individual tests can tweak.
const complete = {
  teaching_overall: 5,
  clarity: 4,
  grading_timeliness: "often",
  office_hours: "na",
  assessment_fit: 3,
  respect: 5,
  workload: "6-8",
  recommend: 4,
};

test("accepts a complete set of answers", () => {
  const result = validateAnswers(complete, questionnaire, { partial: false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.clean, complete);
});

test("a final submit needs every required question", () => {
  const { clarity, ...missingOne } = complete;
  const result = validateAnswers(missingOne, questionnaire, { partial: false });
  assert.equal(result.ok, false);
  assert.ok(result.errors.clarity);
});

test("a draft may have gaps", () => {
  const result = validateAnswers({ teaching_overall: 2 }, questionnaire, { partial: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.clean, { teaching_overall: 2 });
});

test("unknown question ids are dropped", () => {
  const result = validateAnswers({ ...complete, studentId: "abc", $where: "1" }, questionnaire, { partial: false });
  assert.equal(result.ok, true);
  assert.equal("studentId" in result.clean, false);
  assert.equal("$where" in result.clean, false);
});

test("scale answers must be whole numbers from 1 to 5", () => {
  for (const bad of [0, 6, 2.5, "5", true, { $gt: 0 }]) {
    const result = validateAnswers({ teaching_overall: bad }, questionnaire, { partial: true });
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("choice answers must be one of the listed values", () => {
  const wrongValue = validateAnswers({ workload: "100+" }, questionnaire, { partial: true });
  assert.equal(wrongValue.ok, false);

  // "na" is allowed for office hours but not for grading timeliness.
  const wrongQuestion = validateAnswers({ grading_timeliness: "na" }, questionnaire, { partial: true });
  assert.equal(wrongQuestion.ok, false);
});

test("text is trimmed, and blank text is left out", () => {
  const result = validateAnswers({ keep: "  The labs.  ", improve: "   " }, questionnaire, { partial: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.clean, { keep: "The labs." });
});

test("text over 2,000 characters is rejected", () => {
  const result = validateAnswers({ keep: "a".repeat(2001) }, questionnaire, { partial: true });
  assert.equal(result.ok, false);
  assert.ok(result.errors.keep);
});

test("answers must be an object", () => {
  for (const bad of [undefined, null, "text", 5, [1, 2]]) {
    const result = validateAnswers(bad, questionnaire, { partial: true });
    assert.equal(result.ok, false);
  }
});
