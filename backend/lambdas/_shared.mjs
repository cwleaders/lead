/* Shared helpers for all Lambdas — single-file, no external deps.
   AWS SDK v3 is bundled in nodejs20.x runtime. */

import crypto from 'node:crypto';

export const ENV = {
  TABLE:        process.env.LEAD_TABLE        || 'lead-table',
  FILES_BUCKET: process.env.LEAD_FILES_BUCKET || `lead-files-${process.env.AWS_ACCOUNT_ID}`,
  CDN_DOMAIN:   process.env.LEAD_CDN_DOMAIN   || 'download.cwleaders.com',
  REGION:       process.env.AWS_REGION        || 'us-east-1',
  ANON_MAX_BYTES: 100 * 1024 * 1024,
  ANON_TTL_HOURS: 24,
  ALLOWED_ORIGINS: [
    'https://lead.cwleaders.com',
    'https://studio.cwleaders.com',
    'https://upload.cwleaders.com',
    'https://download.cwleaders.com',
    'https://myhire.cwleaders.com',
    'http://localhost:8080',
    'http://localhost:5173'
  ]
};

/* Versioning + envelope metadata (BANDAID I3 — response envelope rollout) */
export const TOS_VERSION     = '1.0';
export const PRIVACY_VERSION = '1.0';
export const API_VERSION     = 'v1.0.0';

function withMeta(body, opts = {}) {
  // Backwards-compatible: if body is already shaped { data, meta }, leave it.
  // Otherwise wrap in envelope only when caller opts in via opts.envelope.
  if (!opts.envelope) return body;
  if (body && typeof body === 'object' && 'data' in body && 'meta' in body) return body;
  return {
    data: body,
    meta: {
      legal:   { tos_version: TOS_VERSION, privacy_version: PRIVACY_VERSION },
      version: API_VERSION,
      request_id: opts.requestId || undefined,
      rate_limit: opts.rateLimit || undefined,
      ...(opts.meta || {})
    }
  };
}

const json = (status, body, origin, opts = {}) => ({
  statusCode: status,
  headers: corsHeaders(origin),
  body: JSON.stringify(withMeta(body, opts))
});

export const ok    = (body, origin, opts) => json(200, body, origin, opts);
export const bad   = (msg,  origin, opts) => json(400, { error: msg }, origin, opts);
export const notFound = (msg, origin, opts) => json(404, { error: msg || 'not found' }, origin, opts);
export const oops  = (msg,  origin, opts) => json(500, { error: msg || 'internal' }, origin, opts);

/* 412 Precondition Failed — used when ToS version has changed and the user
   must re-accept before further authed calls succeed. Frontend lead.js#api()
   intercepts 412 and shows the re-acceptance modal. */
export const preconditionFailed = (extra, origin) => ({
  statusCode: 412,
  headers: corsHeaders(origin),
  body: JSON.stringify({ error: 'precondition_failed', ...(extra || {}) })
});

export function corsHeaders(origin) {
  const allow = ENV.ALLOWED_ORIGINS.includes(origin) ? origin : ENV.ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin':  allow,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age':       '600',
    'content-type':                 'application/json',
    'cache-control':                'no-store',
    'vary':                         'origin'
  };
}

export function preflight(event) {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event.headers?.origin), body: '' };
  }
  return null;
}

export function parseBody(event) {
  if (!event.body) return {};
  try {
    return event.isBase64Encoded
      ? JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'))
      : JSON.parse(event.body);
  } catch { return {}; }
}

/** Crockford base32 short id, ~62 bits of entropy in 12 chars */
const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function shortId(len = 12) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPH[bytes[i] % 32];
  return out;
}

/** 16-char Crockford base32 license key with checksum: XXXX-XXXX-XXXX-XXXX */
export function licenseKey() {
  const bytes = crypto.randomBytes(10);
  let raw = '';
  for (let i = 0; i < 10; i++) raw += ALPH[bytes[i] % 32];
  // 6-char checksum from sha256 of raw, base32-encoded
  const hash = crypto.createHash('sha256').update(raw).digest();
  let check = '';
  for (let i = 0; i < 6; i++) check += ALPH[hash[i] % 32];
  const all = raw + check;
  return `${all.slice(0,4)}-${all.slice(4,8)}-${all.slice(8,12)}-${all.slice(12,16)}`;
}

export function ipHash(event) {
  const ip = event.requestContext?.http?.sourceIp || '';
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT||'lead')).digest('hex').slice(0, 16);
}

/* ---------- JWT (HS256) helpers ---------------------------------------- */
const b64url = b => Buffer.from(b).toString('base64')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlDecode = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

export function signJwt(payload, ttlSeconds = 14 * 24 * 3600) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'lead-dev-secret-change-me') {
    throw new Error('JWT_SECRET not configured');
  }
  const now = Math.floor(Date.now() / 1000);
  // last_auth = freshness checkpoint for L5 (sensitive-action) gates
  // tos_v     = ToS version the user accepted at sign-in time; A1/A2 gate compares
  const body = {
    iat: now,
    exp: now + ttlSeconds,
    last_auth: now,
    tos_v: TOS_VERSION,
    ...payload
  };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(body));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}

export function verifyJwt(token) {
  if (!token) return null;
  let secret;
  try {
    secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === 'lead-dev-secret-change-me') return null;
  } catch { return null; }
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  } catch { return null; }
  let payload;
  try { payload = JSON.parse(b64urlDecode(p)); } catch { return null; }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Pull and verify a Bearer JWT from the request. Returns payload or null. */
export function authFromEvent(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? verifyJwt(m[1]) : null;
}

/* gate(level, opts) — progressive disclosure decorator (Phase 7 / Phase 10).
   Wraps a handler and short-circuits with the right status code if the user
   doesn't meet the level. Use as:
     export const handler = gate(4, { role: ['paid_powerhouse','paid_agentic'] })(
       async (event, ctx) => { … ctx.user is the verified JWT payload … }
     );

   level 0 — public, no auth required
   level 2 — JWT required
   level 3 — JWT + email_verified
   level 4 — JWT + role allowlist
   level 5 — JWT + fresh re-auth (last_auth ≤ 5min ago)
   plus opts.tosCheck=true forces 412 if user's tos_v != current TOS_VERSION.
*/
export function gate(level = 2, opts = {}) {
  return (handler) => async (event) => {
    const pf = preflight(event); if (pf) return pf;
    const origin = event.headers?.origin;

    // Level 0 — pass through
    if (level === 0) return handler(event, { user: null });

    const user = authFromEvent(event);
    if (level >= 2 && !user) {
      return { statusCode: 401, headers: corsHeaders(origin),
               body: JSON.stringify({ error: 'sign_in_required' }) };
    }
    if (level >= 3 && !user.email_verified) {
      return { statusCode: 403, headers: corsHeaders(origin),
               body: JSON.stringify({ error: 'email_not_verified' }) };
    }
    if (level >= 4 && opts.role) {
      const need = Array.isArray(opts.role) ? opts.role : [opts.role];
      if (!need.includes(user.role)) {
        return { statusCode: 403, headers: corsHeaders(origin),
                 body: JSON.stringify({ error: 'role_required', needed: need, current: user.role }) };
      }
    }
    if (level >= 5) {
      const ageSec = Math.floor(Date.now()/1000) - (user.last_auth || 0);
      if (ageSec > 300) {  // 5-minute fresh-reauth window
        return { statusCode: 401, headers: corsHeaders(origin),
                 body: JSON.stringify({ error: 'reauth_required', ageSec }) };
      }
    }
    if (opts.tosCheck && user.tos_v !== TOS_VERSION) {
      return preconditionFailed(
        { reason: 'tos_outdated', accepted: user.tos_v, current: TOS_VERSION },
        origin
      );
    }
    return handler(event, { user, origin });
  };
}

/** Generate a short numeric code (for magic-link emails) */
export function authCode(len = 6) {
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += (bytes[i] % 10).toString();
  return s;
}

/* ---------- IP rate limiting (DynamoDB TTL) ---------------------------- */
/* Lazy-load DDB client so cold-start cost only hits Lambdas that actually use it. */
let _ddb = null;
async function ddb() {
  if (_ddb) return _ddb;
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
  _ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
  return _ddb;
}

/**
 * rateLimit({ event, key, limit, windowSec })
 * Atomically increments a per-IP-and-key counter with TTL.
 * Returns { ok: true } if under limit, { ok: false, retryAfter } if blocked.
 *
 * Storage: pk=`rl#<ip-hash>`, sk=`<key>#<window-start>`, ttl=window-start+windowSec
 */
export async function rateLimit({ event, key, limit = 30, windowSec = 60 }) {
  try {
    const ip = ipHash(event);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSec);
    const ttl = windowStart + windowSec + 60; // small grace
    const client = await ddb();
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const res = await client.send(new UpdateCommand({
      TableName: ENV.TABLE,
      Key: { pk: `rl#${ip}`, sk: `${key}#${windowStart}` },
      UpdateExpression: 'ADD #c :one SET #t = if_not_exists(#t, :ttl)',
      ExpressionAttributeNames: { '#c': 'c', '#t': 'ttl' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': ttl },
      ReturnValues: 'ALL_NEW'
    }));
    const count = Number(res.Attributes?.c || 0);
    if (count > limit) {
      return { ok: false, retryAfter: Math.max(1, (windowStart + windowSec) - now), count, limit };
    }
    return { ok: true, count, limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    // Fail-open: never let DDB outage cause auth/checkout to break.
    console.warn('[rateLimit] degraded, allowing request:', err.message);
    return { ok: true, degraded: true };
  }
}

/** 429 response helper */
export function tooMany(retryAfter, origin) {
  return {
    statusCode: 429,
    headers: { ...corsHeaders(origin), 'retry-after': String(retryAfter || 60) },
    body: JSON.stringify({ error: 'rate limited, please slow down', retryAfter })
  };
}
