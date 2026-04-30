import { randomUUID } from "node:crypto";

import { getConfig } from "../src/config.mjs";
import { deliverApplicationEmails } from "../src/lib/email.mjs";
import { parseMultipartFormData } from "../src/lib/multipart.mjs";
import { emptyResponse, jsonResponse } from "../src/lib/responses.mjs";
import { persistApplicationSubmission } from "../src/lib/storage.mjs";
import { validateApplicationPayload } from "../src/lib/validation.mjs";

function header(headers = {}, name) {
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : "";
}

function buildApplicationRecord({ submissionId, normalized, requestMeta }) {
  return {
    submissionId,
    submittedAt: new Date().toISOString(),
    personal: {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      email: normalized.email,
      phone: normalized.phone,
      linkedin: normalized.linkedin,
      portfolio: normalized.portfolio
    },
    location: {
      city: normalized.city,
      state: normalized.state,
      country: normalized.country
    },
    professional: {
      targetRole: normalized.targetRole,
      currentTitle: normalized.currentTitle,
      currentCompany: normalized.currentCompany,
      yearsExperience: Number(normalized.yearsExperience),
      compensation: normalized.compensation
    },
    preferences: {
      availability: normalized.availability,
      workAuthorization: normalized.workAuthorization,
      travelPreference: normalized.travelPreference
    },
    narrative: {
      whyCwLeaders: normalized.whyCwLeaders,
      standoutStrength: normalized.standoutStrength
    },
    consents: {
      privacyConsent: normalized.privacyConsent,
      accuracyConsent: normalized.accuracyConsent
    },
    source: requestMeta
  };
}

export async function handler(event = {}) {
  const config = getConfig();
  const headers = event.headers || {};
  const origin = header(headers, "origin");
  const method =
    event.requestContext?.http?.method || event.httpMethod || header(headers, ":method") || "GET";

  if (method === "OPTIONS") {
    return emptyResponse(204, origin, config);
  }

  if (method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." }, origin, config);
  }

  const contentType = header(headers, "content-type");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(
      415,
      { error: "Use multipart/form-data when submitting an application." },
      origin,
      config
    );
  }

  try {
    const parsed = parseMultipartFormData({
      body: event.body || "",
      contentType,
      isBase64Encoded: Boolean(event.isBase64Encoded)
    });

    const validation = validateApplicationPayload(parsed.fields, parsed.files, config);
    if (!validation.isValid) {
      return jsonResponse(
        400,
        {
          error: "Validation failed.",
          fields: validation.errors
        },
        origin,
        config
      );
    }

    const submissionId = `app_${randomUUID()}`;
    const requestMeta = {
      page: validation.data.normalized.sourcePage,
      referrer:
        validation.data.normalized.referrer ||
        header(headers, "referer") ||
        header(headers, "referrer"),
      userAgent: header(headers, "user-agent"),
      ip: header(headers, "x-forwarded-for")
    };

    const applicationRecord = buildApplicationRecord({
      submissionId,
      normalized: validation.data.normalized,
      requestMeta
    });

    const { finalRecord } = await persistApplicationSubmission({
      submissionId,
      record: applicationRecord,
      files: validation.data.files,
      config
    });

    await deliverApplicationEmails({
      application: finalRecord,
      config
    });

    return jsonResponse(
      200,
      {
        ok: true,
        submissionId,
        redirectUrl: `/thank-you/?submission=${encodeURIComponent(submissionId)}`
      },
      origin,
      config
    );
  } catch (error) {
    console.error("Application submission failed", error);
    return jsonResponse(
      500,
      {
        error: "Something went wrong while sending your application."
      },
      origin,
      config
    );
  }
}
