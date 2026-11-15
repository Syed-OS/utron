// One small wrapper around fetch, used by every page.
// It sends and reads JSON, turns error responses into thrown errors, and
// handles "your session ended" in one place.

export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status; // HTTP status, or 0 when the network failed
    this.errors = errors; // per-question messages from the server, if any
  }
}

export async function api(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    // fetch only throws when no response arrived at all (offline, server down).
    throw new ApiError(0, "Couldn't reach the server — check your connection.");
  }

  // 401 on any page except sign-in means the session ended.
  const onSignInPage = location.pathname === "/" || location.pathname === "/index.html";
  if (response.status === 401 && !onSignInPage) {
    // Tell the page first, so it can stash unsaved work (the evaluation
    // page listens for this). dispatchEvent runs listeners immediately,
    // before the next line.
    window.dispatchEvent(new Event("utron:session-expired"));

    // Send the student to sign in, remembering where they were.
    const here = location.pathname + location.search + location.hash;
    location.href = `/?next=${encodeURIComponent(here)}`;

    // The browser is leaving this page. Returning a promise that never
    // settles keeps the caller from carrying on in the meantime.
    return new Promise(() => {});
  }

  if (response.status === 204) {
    return null; // "No Content": success with nothing to read
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error || "Something went wrong. Please try again.", data.errors);
  }
  return data;
}
