/* POST /feedback
   Body: { kind: "bug" | "idea" | "praise" | "rage", message, email?, page?, screenshotDataUrl? }
   Stores user feedback in DynamoDB with 365-day TTL.
   Privacy-respecting: no analytics SDK, no cross-site tracking, no third-party.

   Auth: optional. Anonymous feedback is allowed (rate-limited harder). */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, parseBody, authFromEvent, ipHash, shortId, rateLimit, tooMany } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const KINDS = new Set(['bug', 'idea', 'praise', 'rage']);
const MAX_MSG = 4000;
const MAX_SCREENSHOT_KB = 200; // ~200KB inline screenshot only

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  // Aggressive rate limit on anonymous; gentler if authed
  const auth = authFromEvent(event);
  const limit = auth ? 20 : 5;
  const rl = await rateLimit({ event, key: 'feedback', limit, windowSec: 3600 });
  if (!rl.ok) return tooMany(rl.retryAfter, origin);

  try {
    const body = parseBody(event);
    const kind = (body.kind || '').toLowerCase().trim();
    const message = String(body.message || '').trim().slice(0, MAX_MSG);
    const email = (body.email || auth?.email || '').toLowerCase().trim().slice(0, 200);
    const page = String(body.page || event.headers?.referer || '').slice(0, 500);
    const screenshot = body.screenshotDataUrl;

    if (!KINDS.has(kind)) return bad('invalid kind', origin);
    if (!message || message.length < 4) return bad('message too short', origin);
    if (screenshot && (typeof screenshot !== 'string' || screenshot.length > MAX_SCREENSHOT_KB * 1024)) {
      return bad(`screenshot exceeds ${MAX_SCREENSHOT_KB}KB`, origin);
    }

    const id = shortId();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: `FEEDBACK#${kind}`,
        sk: `${now}#${id}`,
        gsi1pk: 'FEEDBACK',
        gsi1sk: now,
        id,
        kind,
        message,
        email: email || undefined,
        page,
        userAgent: (event.headers?.['user-agent'] || '').slice(0, 200),
        ipHash: ipHash(event),
        userId: auth?.sub || undefined,
        screenshot: screenshot || undefined,
        createdAt: now,
        ttl
      }
    }));

    // Future: SNS publish to slack/email digest

    return ok({ ok: true, id, message: 'Thanks — we read every one.' }, origin);
  } catch (err) {
    console.error('feedback', err);
    return oops(err.message, origin);
  }
};
