// The dashboard: greets the student and lists their courses with status.

import { api } from "./api.js";
import { escapeHtml, icons, shortDate } from "./ui.js";

const courseList = document.querySelector("#course-list");

// "Good evening" needs no data, so show it before the requests finish.
function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
document.querySelector("#greeting").textContent = `${timeOfDay()}.`;

document.querySelector("#sign-out").addEventListener("click", async () => {
  await api("POST", "/auth/logout");
  location.href = "/";
});

load();

async function load() {
  let me, courses;
  try {
    // The two requests do not depend on each other, so run them together.
    [me, { courses }] = await Promise.all([api("GET", "/me"), api("GET", "/courses")]);
  } catch (err) {
    courseList.hidden = true;
    const errorBox = document.querySelector("#load-error");
    errorBox.textContent = `We couldn't load your courses. ${err.message}`;
    errorBox.hidden = false;
    return;
  }

  const firstName = me.name.split(" ")[0];
  document.querySelector("#greeting").textContent = `${timeOfDay()}, ${firstName}.`;
  document.querySelector("#student-name").textContent = me.name;

  // Every course in the seed closes on the same day; use the first.
  const closes = courses.length > 0 ? ` · Closes ${shortDate(courses[0].evalClosesAt)}` : "";
  document.querySelector("#term-line").textContent = `${me.term}${closes}`;

  renderSummary(courses, me.term);

  // .map builds one HTML string per course; .join glues them together.
  courseList.innerHTML = courses.map(courseRow).join("");
  courseList.removeAttribute("aria-busy");
}

function renderSummary(courses, term) {
  const submitted = courses.filter((course) => course.status === "submitted").length;
  document.querySelector("#summary-text").textContent = `${submitted} of ${courses.length} submitted`;

  // One segment per course. The API already sorts in-progress first and
  // submitted last; the bar reads better the other way around.
  const order = { submitted: 0, in_progress: 1, not_started: 2 };
  const classes = { submitted: "is-submitted", in_progress: "is-in-progress", not_started: "" };
  document.querySelector("#segments").innerHTML = [...courses]
    .sort((a, b) => order[a.status] - order[b.status])
    .map((course) => `<span class="segment ${classes[course.status]}"></span>`)
    .join("");

  if (courses.length > 0 && submitted === courses.length) {
    document.querySelector("#all-done-title").textContent = `You're all done for ${term}.`;
    document.querySelector("#all-done").hidden = false;
  }
}

// One row of the list. Rows the student can act on are real links, so
// the whole row is clickable and works with the keyboard. Finished and
// closed rows are plain, slightly muted, and not clickable.
function courseRow(course) {
  const details = `
    <span class="course-code mono">${escapeHtml(course.code)}</span>
    <span class="course-main">
      <span class="course-title">${escapeHtml(course.title)}</span>
      <span class="course-professor">${escapeHtml(course.professor)}</span>
    </span>
    <span class="course-schedule">${escapeHtml(course.schedule)}</span>`;

  if (course.status === "submitted") {
    return `<li class="course-row is-muted">${details}
      <span class="course-status status-done">${icons.check} Submitted</span></li>`;
  }

  if (!course.isOpen) {
    return `<li class="course-row is-muted">${details}
      <span class="course-status">Closed</span></li>`;
  }

  const status =
    course.status === "in_progress"
      ? `<span class="pill">In progress · ${course.answeredCount}/${course.totalQuestions}</span>
         <span class="text-action">Resume ${icons.arrowRight}</span>`
      : `<span class="text-action">Start ${icons.arrowRight}</span>`;

  return `<li><a class="course-row" href="/evaluate.html?course=${encodeURIComponent(course.id)}">${details}
    <span class="course-status">${status}</span></a></li>`;
}
