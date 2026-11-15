// The sign-in page.

import { api } from "./api.js";

const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const emailError = document.querySelector("#email-error");
const passwordError = document.querySelector("#password-error");
const loginError = document.querySelector("#login-error");
const signInButton = document.querySelector("#sign-in");
const toggleButton = document.querySelector("#toggle-password");

// After signing in, go back to the page that sent the student here (the
// evaluation page does this when a session expires). Only same-site paths
// are accepted: "/evaluate.html…" is fine, but "//evil.example" or
// "https://evil.example" would send a freshly signed-in student to
// someone else's site (an "open redirect").
function destinationAfterSignIn() {
  const next = new URLSearchParams(location.search).get("next");
  const isLocalPath = next && next.startsWith("/") && !next.startsWith("//");
  return isLocalPath ? next : "/courses.html";
}

// One request tells the page what it needs: skip this page if already
// signed in, fill in the term name, and show the demo bar in demo mode.
api("GET", "/config")
  .then((config) => {
    if (config.signedIn) {
      location.replace(destinationAfterSignIn());
      return;
    }
    document.querySelector("#term").textContent = config.term;
    document.querySelector("#demo-bar").hidden = !config.demoInbox;
    document.body.classList.toggle("has-demo-bar", config.demoInbox);
  })
  .catch(() => {}); // the form still works without it

// Show / hide the password.
toggleButton.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  toggleButton.setAttribute("aria-pressed", String(show));
  toggleButton.setAttribute("aria-label", show ? "Hide password" : "Show password");
  document.querySelector("#icon-eye").hidden = show;
  document.querySelector("#icon-eye-off").hidden = !show;
});

// Marks a field as empty (or clears the mark). Returns true when empty.
function flagIfEmpty(input, errorElement) {
  const empty = input.value.trim() === "";
  errorElement.hidden = !empty;
  input.setAttribute("aria-invalid", String(empty));
  return empty;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); // stay on the page; we send the request ourselves
  loginError.hidden = true;

  // Quick checks in the browser, for a faster answer. The server checks
  // everything again, because requests do not have to come from this page.
  const emailEmpty = flagIfEmpty(emailInput, emailError);
  const passwordEmpty = flagIfEmpty(passwordInput, passwordError);
  if (emailEmpty || passwordEmpty) {
    (emailEmpty ? emailInput : passwordInput).focus();
    return;
  }

  // Disabled while the request runs, so a double-click sends one request.
  signInButton.disabled = true;
  signInButton.classList.add("is-busy");

  try {
    await api("POST", "/auth/login", {
      email: emailInput.value,
      password: passwordInput.value,
    });
    location.href = destinationAfterSignIn();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
    signInButton.disabled = false;
    signInButton.classList.remove("is-busy");
    passwordInput.select();
  }
});
