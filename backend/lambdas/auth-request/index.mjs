/* POST /auth/request
   Body: { email }
   Sends a 6-digit code via SES, stores it (hashed) in DDB with 15-min TTL.
   Always returns 200 to prevent email enumeration. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import crypto from 'node:crypto';
import { ENV, ok, bad, oops, preflight, parseBody, authCode, ipHash, rateLimit, tooMany } from './_shared.mjs';
import { magicLinkEmail } from './_email-templates.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const ses = new SESv2Client({ region: ENV.REGION });

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  // Rate limit: 5 magic-link requests per 15-min window per IP
  const rl = await rateLimit({ event, key: 'auth-req', limit: 5, windowSec: 900 });
  if (!rl.ok) return tooMany(rl.retryAfter, origin);

  try {
    const { email } = parseBody(event);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('invalid email', origin);
    const norm = email.trim().toLowerCase();

    // Throttle: max 5 requests per 15min per IP+email
    const ip = ipHash(event);
    const now = Date.now();
    const code = authCode(6);
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const ttl = Math.floor(now / 1000) + 15 * 60;

    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: `AUTHCODE#${norm}`, sk: 'PENDING',
        email: norm,
        codeHash,
        attempts: 0,
        ipHash: ip,
        createdAt: new Date(now).toISOString(),
        ttl
      }
    }));

    if (process.env.SES_FROM) {
      try {
        const tmpl = magicLinkEmail({ code });
        await ses.send(new SendEmailCommand({
          FromEmailAddress: process.env.SES_FROM,
          Destination: { ToAddresses: [norm] },
          Content: {
            Simple: {
              Subject: { Data: tmpl.subject },
              Body: {
                Html: { Data: tmpl.html },
                Text: { Data: tmpl.text }
              }
            }
          }
        }));
      } catch (e) {
        console.error('SES send failed', e.message);
        // Fallback: in dev, return the code in response (only if explicitly enabled)
        if (process.env.AUTH_DEV_RETURN_CODE === '1') {
          return ok({ ok: true, devCode: code }, origin);
        }
      }
    } else if (process.env.AUTH_DEV_RETURN_CODE === '1') {
      return ok({ ok: true, devCode: code }, origin);
    }

    return ok({ ok: true }, origin);
  } catch (err) {
    console.error('auth-request', err);
    return oops(err.message, origin);
  }
};

// Branded email HTML now lives in _email-templates.mjs (magicLinkEmail).
