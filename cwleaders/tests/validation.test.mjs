import test from "node:test";
import assert from "node:assert/strict";

import { validateApplicationPayload } from "../src/lib/validation.mjs";

function buildPayload(overrides = {}) {
  const fields = {
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@example.com",
    phone: "+1 (310) 555-0000",
    city: "Los Angeles",
    state: "CA",
    country: "United States",
    linkedin: "https://www.linkedin.com/in/jordanlee",
    portfolio: "https://portfolio.example.com",
    targetRole: "Chief of Staff",
    currentTitle: "Operations Director",
    currentCompany: "Example Co",
    yearsExperience: "8",
    compensation: "$190k-$220k",
    availability: "Within 30 days",
    workAuthorization: "Authorized to work in my region",
    travelPreference: "Open to travel",
    whyCwLeaders:
      "I thrive in high-accountability environments and I am excited by operator-led search.",
    standoutStrength: "Structured communication under pressure.",
    privacyConsent: "on",
    accuracyConsent: "on"
  };

  const files = {
    resume: [
      {
        filename: "resume.pdf",
        contentType: "application/pdf",
        size: 1024,
        data: Buffer.from("resume")
      }
    ]
  };

  return {
    fields: { ...fields, ...(overrides.fields || {}) },
    files: { ...files, ...(overrides.files || {}) }
  };
}

test("validateApplicationPayload accepts a valid submission", () => {
  const payload = buildPayload();
  const result = validateApplicationPayload(payload.fields, payload.files);
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
});

test("validateApplicationPayload rejects missing consents and resume", () => {
  const payload = buildPayload({
    fields: {
      privacyConsent: "",
      accuracyConsent: "",
      email: "bad-email"
    },
    files: {
      resume: []
    }
  });

  const result = validateApplicationPayload(payload.fields, payload.files);
  assert.equal(result.isValid, false);
  assert.equal(result.errors.email, "Enter a valid email address.");
  assert.equal(result.errors.privacyConsent, "You must agree to the privacy notice.");
  assert.equal(result.errors.accuracyConsent, "You must confirm your information is accurate.");
  assert.equal(result.errors.resume, "Please upload your resume.");
});
