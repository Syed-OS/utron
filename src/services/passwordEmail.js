// Builds the "your password" email that the seed script sends.
//
// Email clients ignore stylesheets, so emails are styled with inline
// style attributes. This is the one place in the project that does that.

const sans = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const mono = "'SF Mono', Menlo, Consolas, monospace";

export function buildPasswordEmail({ name, password, term, signInUrl }) {
  const firstName = name.split(" ")[0];
  const subject = `Your U-tron password for ${term} evaluations`;

  const text = [
    `Hi ${firstName},`,
    "",
    `Course evaluations for ${term} are open. Sign in with this email address and the password below.`,
    "",
    `Password: ${password}`,
    "",
    `Sign in: ${signInUrl}`,
    "",
    "This password was made for you and can't be changed. Your answers are anonymous: they are stored separately from your name.",
    "",
    "Lost this email? Contact the registrar.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0; padding:32px 16px; background:#F7F6F3; font-family:${sans}; color:#16150F;">
  <div style="max-width:480px; margin:0 auto; background:#FFFFFF; border:1px solid #E5E2DA; border-radius:12px; padding:32px;">
    <div style="font-size:20px; font-weight:700; letter-spacing:-0.04em;">U<span style="color:#F2541B;">-</span>tron</div>

    <p style="margin:32px 0 0; font-size:16px; line-height:1.55;">Hi ${firstName},</p>
    <p style="margin:12px 0 0; font-size:16px; line-height:1.55; color:#56534A;">
      Course evaluations for ${term} are open. Sign in with this email address and the password below.
    </p>

    <div style="margin:24px 0 0; font-size:12px; letter-spacing:0.04em; color:#8C887D; font-family:${mono};">YOUR PASSWORD</div>
    <div style="margin:8px 0 0; padding:16px; background:#F7F6F3; border:1px solid #E5E2DA; border-radius:8px; font-family:${mono}; font-size:22px; letter-spacing:0.02em;">${password}</div>

    <a href="${signInUrl}" target="_blank" rel="noopener"
       style="display:inline-block; margin:24px 0 0; padding:12px 20px; background:#16150F; color:#FFFFFF; border-radius:8px; font-size:15px; font-weight:500; text-decoration:none;">Sign in to U-tron</a>

    <p style="margin:32px 0 0; padding-top:20px; border-top:1px solid #E5E2DA; font-size:13px; line-height:1.55; color:#8C887D;">
      This password was made for you and can't be changed. Your answers are anonymous: they are stored separately from your name.
      Lost this email? Contact the registrar.
    </p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
