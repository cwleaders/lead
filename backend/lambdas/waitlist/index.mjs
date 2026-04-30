/* POST /waitlist
   Captures emails for the LEAD launch list.
   Body: { email, source, referrer, utm } */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, parseBody, ipHash } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  try {
    const { email, source, referrer, utm } = parseBody(event);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('invalid email', origin);
    const norm = email.trim().toLowerCase();
    const now = new Date().toISOString();

    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: `WAITLIST#${norm}`, sk: 'META',
        gsi2pk: 'WAITLIST',
        gsi2sk: `T#${now}`,
        email: norm,
        source: source || 'unknown',
        referrer: referrer || null,
        utm: utm || {},
        ipHash: ipHash(event),
        ua: event.headers?.['user-agent'] || null,
        createdAt: now
      },
      ConditionExpression: 'attribute_not_exists(pk)'
    })).catch(e => {
      // duplicate is fine — silently re-affirm
      if (e.name !== 'ConditionalCheckFailedException') throw e;
    });

    return ok({ ok: true }, origin);
  } catch (err) {
    console.error('waitlist error', err);
    return oops(err.message, origin);
  }
};
