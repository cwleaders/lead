import path from "node:path";

const DEFAULT_PUBLIC_SITE_URL = "https://myhire.cwleaders.com";

function pick(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig(env = process.env) {
  const publicSiteUrl = pick(env.PUBLIC_SITE_URL, DEFAULT_PUBLIC_SITE_URL);
  const deliveryMode =
    pick(env.DELIVERY_MODE, "").toLowerCase() ||
    (pick(env.S3_BUCKET) && pick(env.SES_FROM_EMAIL) ? "aws" : "local");

  const allowedOrigins = pick(
    env.ALLOWED_ORIGINS,
    `${publicSiteUrl},http://localhost:4321,http://127.0.0.1:4321`
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    appName: "MyHire by CW Leaders",
    publicSiteUrl,
    deliveryMode,
    awsRegion: pick(env.AWS_REGION, "us-east-1"),
    s3Bucket: pick(env.S3_BUCKET),
    sesFromEmail: pick(env.SES_FROM_EMAIL, "MyHire <no-reply@cwleaders.com>"),
    internalNotificationEmail: pick(env.INTERNAL_NOTIFICATION_EMAIL, "newapp@cwleaders.com"),
    contactEmail: pick(env.CONTACT_EMAIL, "newapp@cwleaders.com"),
    allowedOrigins,
    fileUrlTtlSeconds: pickNumber(env.FILE_URL_TTL_SECONDS, 60 * 60 * 24 * 7),
    maxFileBytes: pickNumber(env.MAX_FILE_BYTES, 5 * 1024 * 1024),
    localDataDir: path.resolve(env.LOCAL_DATA_DIR || ".local-data"),
    sendApplicantConfirmation:
      String(env.SEND_APPLICANT_CONFIRMATION ?? "true").toLowerCase() !== "false"
  };
}

export function isOriginAllowed(origin, config) {
  if (!origin) {
    return true;
  }

  return config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin);
}
