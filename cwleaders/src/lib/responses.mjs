import { isOriginAllowed } from "../config.mjs";

function resolveOrigin(origin, config) {
  if (origin && isOriginAllowed(origin, config)) {
    return origin;
  }

  return config.publicSiteUrl;
}

export function corsHeaders(origin, config) {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(origin, config),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function jsonResponse(statusCode, payload, origin, config) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(origin, config),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

export function emptyResponse(statusCode, origin, config) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(origin, config)
    },
    body: ""
  };
}
