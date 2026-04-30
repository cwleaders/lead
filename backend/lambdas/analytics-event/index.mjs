/* POST /events  (and /events/batch)
   Body (single):  { name, props?, sessionId?, ts? }
   Body (batch):   { events: [{ name, props?, sessionId?, ts? }, ...] }

   Privacy-respecting event log:
   - No third-party. Self-hosted in DynamoDB.
   - 90-day TTL on all event rows.
   - IP is hashed (SHA-256 with IP_SALT), never stored raw.
   - We never collect: precise location, fingerprinting hashes, cross-site identifiers.
   - User ID is the auth subject (UUID), not email.

   Event taxonomy (canonical names — see docs/KPI.md):
     auth.signup, auth.signin, auth.signout
     billing.checkout_start, billing.subscribe, billing.cancel
     studio.record_start, studio.record_complete, studio.share_link_created
     upload.dropped, upload.completed, upload.failed
     download.opened, download.completed
     hire.application_submit, hire.skill_check_complete
     desktop.installed, desktop.launched, desktop.updated
     feedback.submitted */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, parseBody, authFromEvent, ipHash, shortId, rateLimit, tooMany } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const VALID_NAME_RE = /^[a-z][a-z0-9_]{0,40}\.[a-z][a-z0-9_]{0,40}$/i;
const MAX_PROPS_BYTES = 4000;     // per event
const MAX_BATCH = 25;             // DDB BatchWrite limit
const TTL_SECONDS = 90 * 24 * 3600;

function normalizeEvent(e, ip, userId) {
  if (!e || typeof e !== 'object') return null;
  const name = String(e.name || '').trim().slice(0, 80);
  if (!VALID_NAME_RE.test(name)) return null;

  let propsJson = '';
  if (e.props && typeof e.props === 'object') {
    propsJson = JSON.stringify(e.props).slice(0, MAX_PROPS_BYTES);
  }

  const ts = Number.isFinite(e.ts) ? Number(e.ts) : Date.now();
  const id = shortId();
  return {
    pk: `EVT#${name}`,
    sk: `${new Date(ts).toISOString()}#${id}`,
    gsi1pk: userId ? `USER#${userId}` : `IP#${ip}`,
    gsi1sk: `${new Date(ts).toISOString()}#${name}`,
    id,
    name,
    ts,
    props: propsJson,
    sessionId: typeof e.sessionId === 'string' ? e.sessionId.slice(0, 64) : undefined,
    userId: userId || undefined,
    ipHash: ip,
    ttl: Math.floor(ts / 1000) + TTL_SECONDS,
  };
}

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  // Anti-abuse: anonymous batches are heavier, so rate-limit firmly.
  const auth = authFromEvent(event);
  const rl = await rateLimit({ event, key: 'analytics', limit: 120, windowSec: 60 });
  if (!rl.ok) return tooMany(rl.retryAfter, origin);

  try {
    const body = parseBody(event);
    const ip = ipHash(event);
    const userId = auth?.sub || null;

    let raw = [];
    if (Array.isArray(body.events)) raw = body.events;
    else if (body.name) raw = [body];
    else return bad('events array or single event required', origin);

    if (raw.length > MAX_BATCH) return bad(`max ${MAX_BATCH} events per request`, origin);

    const items = raw.map(e => normalizeEvent(e, ip, userId)).filter(Boolean);
    if (items.length === 0) return bad('no valid events', origin);

    // BatchWrite up to 25 at a time
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [ENV.TABLE]: items.map(Item => ({ PutRequest: { Item } }))
      }
    }));

    return ok({ ok: true, accepted: items.length, dropped: raw.length - items.length }, origin);
  } catch (err) {
    console.error('analytics-event', err);
    return oops(err.message, origin);
  }
};
