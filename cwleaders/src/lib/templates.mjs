function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function line(label, value) {
  return value ? `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>` : "";
}

function textLine(label, value) {
  return value ? `${label}: ${value}` : "";
}

function joinLocation(location) {
  return [location.city, location.state, location.country].filter(Boolean).join(", ");
}

function documentsMarkup(documents = []) {
  return documents
    .map(
      (file) =>
        `<li><strong>${escapeHtml(file.fieldName)}</strong>: <a href="${escapeHtml(
          file.accessUrl
        )}">${escapeHtml(file.filename)}</a></li>`
    )
    .join("");
}

function documentsText(documents = []) {
  return documents.map((file) => `${file.fieldName}: ${file.filename} (${file.accessUrl})`).join("\n");
}

export function createInternalApplicationEmail({ application, config }) {
  const fullName = `${application.personal.firstName} ${application.personal.lastName}`;
  const subject = `[CWL Application] ${fullName} | ${application.professional.targetRole}`;
  const location = joinLocation(application.location);

  const html = `
    <div style="font-family:Arial,sans-serif;padding:24px;color:#1d2937;">
      <h1 style="margin:0 0 8px;color:#0e2f4d;">New MyHire application</h1>
      <p style="margin:0 0 24px;">Submitted ${escapeHtml(application.submittedAt)} via MyHire by CW Leaders.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${line("Name", fullName)}
        ${line("Email", application.personal.email)}
        ${line("Phone", application.personal.phone)}
        ${line("Location", location)}
        ${line("LinkedIn", application.personal.linkedin)}
        ${line("Portfolio", application.personal.portfolio)}
        ${line("Target role", application.professional.targetRole)}
        ${line("Current title", application.professional.currentTitle)}
        ${line("Current company", application.professional.currentCompany)}
        ${line("Years of experience", String(application.professional.yearsExperience))}
        ${line("Compensation", application.professional.compensation)}
        ${line("Availability", application.preferences.availability)}
        ${line("Work authorization", application.preferences.workAuthorization)}
        ${line("Travel / relocation", application.preferences.travelPreference)}
      </table>
      <h2 style="margin:24px 0 8px;color:#0e2f4d;">Candidate narrative</h2>
      <p style="white-space:pre-line;">${escapeHtml(application.narrative.whyCwLeaders)}</p>
      ${
        application.narrative.standoutStrength
          ? `<p style="white-space:pre-line;"><strong>Standout strength:</strong><br>${escapeHtml(
              application.narrative.standoutStrength
            )}</p>`
          : ""
      }
      <h2 style="margin:24px 0 8px;color:#0e2f4d;">Documents</h2>
      <ul>${documentsMarkup(application.documents)}</ul>
      <h2 style="margin:24px 0 8px;color:#0e2f4d;">Source</h2>
      <p>Page: ${escapeHtml(application.source.page)}<br>Referrer: ${escapeHtml(
        application.source.referrer || "Direct"
      )}<br>User agent: ${escapeHtml(application.source.userAgent)}<br>IP: ${escapeHtml(
        application.source.ip || "Unavailable"
      )}</p>
      <p style="margin-top:24px;">Contact inbox: <a href="mailto:${escapeHtml(
        config.contactEmail
      )}">${escapeHtml(config.contactEmail)}</a></p>
    </div>
  `;

  const text = [
    "New MyHire application",
    `Submitted: ${application.submittedAt}`,
    textLine("Name", fullName),
    textLine("Email", application.personal.email),
    textLine("Phone", application.personal.phone),
    textLine("Location", location),
    textLine("LinkedIn", application.personal.linkedin),
    textLine("Portfolio", application.personal.portfolio),
    textLine("Target role", application.professional.targetRole),
    textLine("Current title", application.professional.currentTitle),
    textLine("Current company", application.professional.currentCompany),
    textLine("Years of experience", String(application.professional.yearsExperience)),
    textLine("Compensation", application.professional.compensation),
    textLine("Availability", application.preferences.availability),
    textLine("Work authorization", application.preferences.workAuthorization),
    textLine("Travel / relocation", application.preferences.travelPreference),
    "",
    "Why CW Leaders",
    application.narrative.whyCwLeaders,
    application.narrative.standoutStrength
      ? `\nStandout strength\n${application.narrative.standoutStrength}`
      : "",
    "",
    "Documents",
    documentsText(application.documents),
    "",
    `Source page: ${application.source.page}`,
    `Referrer: ${application.source.referrer || "Direct"}`,
    `User agent: ${application.source.userAgent}`,
    `IP: ${application.source.ip || "Unavailable"}`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function createApplicantConfirmationEmail({ application, config }) {
  const firstName = application.personal.firstName;
  const subject = "CW Leaders received your application";
  const html = `
    <div style="font-family:Arial,sans-serif;padding:24px;color:#1d2937;">
      <p>Hello ${escapeHtml(firstName)},</p>
      <p>We received your application through MyHire by CW Leaders.</p>
      <p>Our team reviews submissions from Los Angeles while supporting searches globally. If your background aligns with a current or upcoming opportunity, we will reach out directly.</p>
      <p>You do not need to resubmit unless your information changes materially.</p>
      <p>Questions can be sent to <a href="mailto:${escapeHtml(config.contactEmail)}">${escapeHtml(
        config.contactEmail
      )}</a>.</p>
      <p>Thank you,<br>CW Leaders</p>
    </div>
  `;

  const text = [
    `Hello ${firstName},`,
    "",
    "We received your application through MyHire by CW Leaders.",
    "Our team reviews submissions from Los Angeles while supporting searches globally. If your background aligns with a current or upcoming opportunity, we will reach out directly.",
    "You do not need to resubmit unless your information changes materially.",
    "",
    `Questions: ${config.contactEmail}`,
    "",
    "Thank you,",
    "CW Leaders"
  ].join("\n");

  return { subject, html, text };
}
