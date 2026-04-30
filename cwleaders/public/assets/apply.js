const form = document.querySelector("#application-form");

if (form) {
  const storageKey = "myhire-application-draft";
  const query = new URLSearchParams(window.location.search);
  const stepPanels = [...form.querySelectorAll("[data-step-panel]")];
  const stepItems = [...document.querySelectorAll(".stepper__item")];
  const nextButton = document.querySelector("[data-next-step]");
  const backButton = document.querySelector("[data-back-step]");
  const submitButton = document.querySelector("[data-submit-application]");
  const statusRegion = document.querySelector(".form-status");
  const reviewGrid = document.querySelector("[data-review-grid]");
  const roleChip = document.querySelector("[data-role-chip]");
  const roleContext = document.querySelector("[data-role-context]");
  const honeypot = form.elements.companyWebsite;
  const roleFromQuery = query.get("role")?.trim() || "";
  const sourceFromQuery = query.get("source")?.trim() || "";
  let currentStep = 0;

  const reviewFields = [
    ["Name", () => `${form.elements.firstName.value} ${form.elements.lastName.value}`.trim()],
    ["Email", () => form.elements.email.value],
    ["Phone", () => form.elements.phone.value],
    [
      "Location",
      () =>
        [form.elements.city.value, form.elements.state.value, form.elements.country.value]
          .filter(Boolean)
          .join(", ")
    ],
    ["LinkedIn", () => form.elements.linkedin.value || "Not provided"],
    ["Portfolio", () => form.elements.portfolio.value || "Not provided"],
    ["Target role", () => form.elements.targetRole.value],
    ["Current title", () => form.elements.currentTitle.value],
    ["Current company", () => form.elements.currentCompany.value || "Not provided"],
    ["Years of experience", () => form.elements.yearsExperience.value],
    ["Compensation", () => form.elements.compensation.value || "Not provided"],
    ["Availability", () => form.elements.availability.value],
    ["Work authorization", () => form.elements.workAuthorization.value],
    ["Travel / relocation", () => form.elements.travelPreference.value],
    ["Why CW Leaders", () => form.elements.whyCwLeaders.value],
    ["Standout strength", () => form.elements.standoutStrength.value || "Not provided"],
    [
      "Resume",
      () => form.elements.resume.files[0]?.name || "Resume required before submission"
    ],
    [
      "Cover letter",
      () => form.elements.coverLetter.files[0]?.name || "Not provided"
    ]
  ];

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message = "", state = "idle") {
    statusRegion.textContent = message;
    statusRegion.dataset.state = state;
  }

  function saveDraft() {
    const snapshot = {};
    for (const field of form.elements) {
      if (!field.name || field.type === "file" || field.type === "submit" || field.type === "button") {
        continue;
      }

      snapshot[field.name] = field.type === "checkbox" ? field.checked : field.value;
    }

    sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  }

  function restoreDraft() {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    try {
      const snapshot = JSON.parse(raw);
      for (const [name, value] of Object.entries(snapshot)) {
        const field = form.elements[name];
        if (!field || field.type === "file") {
          continue;
        }

        if (field.type === "checkbox") {
          field.checked = Boolean(value);
        } else {
          field.value = value;
        }
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }

  function renderReview() {
    reviewGrid.innerHTML = reviewFields
      .map(
        ([label, getValue]) => `
          <div class="review-item">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(getValue() || "Not provided")}</span>
          </div>
        `
      )
      .join("");
  }

  function fieldsForStep(stepIndex) {
    return [...stepPanels[stepIndex].querySelectorAll("input, select, textarea")].filter(
      (field) => field.type !== "hidden" && !field.disabled
    );
  }

  function setStep(stepIndex) {
    currentStep = stepIndex;
    stepPanels.forEach((panel, index) => {
      panel.hidden = index !== currentStep;
      panel.setAttribute("aria-hidden", String(index !== currentStep));
    });

    stepItems.forEach((item, index) => {
      item.classList.toggle("is-active", index === currentStep);
    });

    backButton.hidden = currentStep === 0;
    nextButton.hidden = currentStep === stepPanels.length - 1;
    submitButton.hidden = currentStep !== stepPanels.length - 1;

    if (currentStep === stepPanels.length - 1) {
      renderReview();
    }
  }

  function validateStep(stepIndex) {
    const fields = fieldsForStep(stepIndex);

    for (const field of fields) {
      if (typeof field.setCustomValidity === "function" && field.dataset.serverError === "true") {
        field.setCustomValidity("");
        field.dataset.serverError = "false";
      }
    }

    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return false;
    }

    return true;
  }

  function stepIndexForField(field) {
    return stepPanels.findIndex((panel) => panel.contains(field));
  }

  function applyServerErrors(errors = {}) {
    const firstEntry = Object.entries(errors)[0];
    if (!firstEntry) {
      setStatus("Please review your submission and try again.", "error");
      return;
    }

    const [fieldName, message] = firstEntry;
    const field = form.elements[fieldName];
    if (field && typeof field.setCustomValidity === "function") {
      field.setCustomValidity(message);
      field.dataset.serverError = "true";
      const stepIndex = stepIndexForField(field);
      if (stepIndex >= 0) {
        setStep(stepIndex);
      }
      field.reportValidity();
      field.focus();
    }

    setStatus("Please correct the highlighted fields and try again.", "error");
  }

  async function submitApplication() {
    if (honeypot?.value) {
      window.location.assign("/thank-you/?submission=screened");
      return;
    }

    const endpoint = form.dataset.apiEndpoint || "/api/applications";
    const payload = new FormData(form);
    payload.set("referrer", document.referrer || "");

    submitButton.disabled = true;
    submitButton.textContent = "Sending application...";
    setStatus("Sending your application securely...", "idle");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: payload,
        headers: {
          Accept: "application/json"
        }
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        applyServerErrors(result.fields || {});
        return;
      }

      sessionStorage.removeItem(storageKey);
      window.location.assign(result.redirectUrl || "/thank-you/");
    } catch {
      setStatus(
        "We could not send your application just now. Please try again or email newapp@cwleaders.com.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit application";
    }
  }

  restoreDraft();
  if (roleFromQuery && !form.elements.targetRole.value) {
    form.elements.targetRole.value = roleFromQuery;
  }
  if (sourceFromQuery) {
    form.elements.sourcePage.value = sourceFromQuery;
  }
  if (roleChip && roleFromQuery) {
    roleChip.hidden = false;
    roleChip.textContent = `Role selected: ${roleFromQuery}`;
  }
  if (roleContext && roleFromQuery) {
    roleContext.hidden = false;
    roleContext.textContent = `${roleFromQuery} is preselected below. You can still adjust the target role field before submitting.`;
  }
  form.elements.referrer.value = document.referrer || "";
  saveDraft();
  setStep(0);

  form.addEventListener("input", (event) => {
    if (typeof event.target.setCustomValidity === "function") {
      event.target.setCustomValidity("");
      event.target.dataset.serverError = "false";
    }
    saveDraft();
  });

  form.addEventListener("change", () => {
    saveDraft();
    if (currentStep === stepPanels.length - 1) {
      renderReview();
    }
  });

  nextButton.addEventListener("click", () => {
    if (!validateStep(currentStep)) {
      return;
    }

    setStep(Math.min(currentStep + 1, stepPanels.length - 1));
    setStatus("");
  });

  backButton.addEventListener("click", () => {
    setStep(Math.max(currentStep - 1, 0));
    setStatus("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateStep(currentStep)) {
      return;
    }

    await submitApplication();
  });
}
