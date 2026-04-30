import { getConfig } from "../config.mjs";

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream"
]);

const REQUIRED_TEXT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "country",
  "targetRole",
  "currentTitle",
  "yearsExperience",
  "availability",
  "workAuthorization",
  "travelPreference",
  "whyCwLeaders"
];

function clean(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim();
}

function singleValue(value) {
  return Array.isArray(value) ? clean(value[0]) : clean(value);
}

function firstFile(value) {
  return Array.isArray(value) ? value[0] : value;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikePhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7;
}

function looksLikeUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasAllowedFileType(file) {
  if (!file) {
    return false;
  }

  const extension = file.filename.split(".").pop()?.toLowerCase() || "";
  return ALLOWED_EXTENSIONS.has(extension) && ALLOWED_MIME_TYPES.has(file.contentType);
}

export function validateApplicationPayload(rawFields = {}, rawFiles = {}, config = getConfig()) {
  const normalized = {
    firstName: singleValue(rawFields.firstName),
    lastName: singleValue(rawFields.lastName),
    email: singleValue(rawFields.email).toLowerCase(),
    phone: singleValue(rawFields.phone),
    city: singleValue(rawFields.city),
    state: singleValue(rawFields.state),
    country: singleValue(rawFields.country),
    linkedin: singleValue(rawFields.linkedin),
    portfolio: singleValue(rawFields.portfolio),
    targetRole: singleValue(rawFields.targetRole),
    currentTitle: singleValue(rawFields.currentTitle),
    currentCompany: singleValue(rawFields.currentCompany),
    yearsExperience: singleValue(rawFields.yearsExperience),
    compensation: singleValue(rawFields.compensation),
    availability: singleValue(rawFields.availability),
    workAuthorization: singleValue(rawFields.workAuthorization),
    travelPreference: singleValue(rawFields.travelPreference),
    whyCwLeaders: singleValue(rawFields.whyCwLeaders),
    standoutStrength: singleValue(rawFields.standoutStrength),
    sourcePage: singleValue(rawFields.sourcePage) || "/apply/",
    referrer: singleValue(rawFields.referrer),
    companyWebsite: singleValue(rawFields.companyWebsite),
    privacyConsent:
      ["true", "on", "yes", "1"].includes(singleValue(rawFields.privacyConsent).toLowerCase()),
    accuracyConsent:
      ["true", "on", "yes", "1"].includes(singleValue(rawFields.accuracyConsent).toLowerCase())
  };

  const files = {
    resume: firstFile(rawFiles.resume),
    coverLetter: firstFile(rawFiles.coverLetter)
  };

  const errors = {};

  for (const key of REQUIRED_TEXT_FIELDS) {
    if (!normalized[key]) {
      errors[key] = "This field is required.";
    }
  }

  if (normalized.email && !looksLikeEmail(normalized.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (normalized.phone && !looksLikePhone(normalized.phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (normalized.linkedin && !looksLikeUrl(normalized.linkedin)) {
    errors.linkedin = "Enter a valid LinkedIn URL.";
  }

  if (normalized.portfolio && !looksLikeUrl(normalized.portfolio)) {
    errors.portfolio = "Enter a valid portfolio URL.";
  }

  if (!Number.isFinite(Number(normalized.yearsExperience))) {
    errors.yearsExperience = "Enter your years of experience as a number.";
  }

  if (normalized.whyCwLeaders && normalized.whyCwLeaders.length < 40) {
    errors.whyCwLeaders = "Share a bit more detail so we can understand your fit.";
  }

  if (!normalized.privacyConsent) {
    errors.privacyConsent = "You must agree to the privacy notice.";
  }

  if (!normalized.accuracyConsent) {
    errors.accuracyConsent = "You must confirm your information is accurate.";
  }

  if (normalized.companyWebsite) {
    errors.companyWebsite = "Invalid submission.";
  }

  if (!files.resume) {
    errors.resume = "Please upload your resume.";
  } else {
    if (!hasAllowedFileType(files.resume)) {
      errors.resume = "Resume must be a PDF, DOC, or DOCX file.";
    } else if (files.resume.size > config.maxFileBytes) {
      errors.resume = "Resume exceeds the 5 MB upload limit.";
    }
  }

  if (files.coverLetter) {
    if (!hasAllowedFileType(files.coverLetter)) {
      errors.coverLetter = "Cover letter must be a PDF, DOC, or DOCX file.";
    } else if (files.coverLetter.size > config.maxFileBytes) {
      errors.coverLetter = "Cover letter exceeds the 5 MB upload limit.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      normalized,
      files
    }
  };
}
