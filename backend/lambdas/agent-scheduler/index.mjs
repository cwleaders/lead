/* Agent scheduler — fired hourly by EventBridge.
   Walks all agents armed with a schedule and triggers any that are due.
   Calls agent-runtime via AWS SDK invoke instead of HTTP for speed.

   Schedule semantics:
     - "hourly"        → run every hour
     - "daily"         → run once per day (~UTC midnight; keeps simple for MVP)
     - "weekly"        → run once a week (Monday)
     - "end-of-day"    → run at 22:00 UTC each day
     - "morning"       → run at 14:00 UTC each day (~7am PT)
     - "on-change"     → handled by event-driven triggers, not schedule
     - null / "manual" → never auto-runs */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ENV } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const lambda = new LambdaClient({ region: ENV.REGION });

const RUNTIME_FN = process.env.RUNTIME_FN_NAME || 'lead-agent-runtime';

function shouldRun(cadence, now, lastRunAt) {
  if (!cadence || cadence === 'manual' || cadence === 'on-change') return false;
  const lastRun = lastRunAt ? new Date(lastRunAt) : null;
  const hourUTC = now.getUTCHours();
  const dayUTC = now.getUTCDay();          // 0=Sun, 1=Mon

  switch (cadence) {
    case 'hourly':
      return !lastRun || (now - lastRun) >= 55 * 60 * 1000;
    case 'daily':
      return !lastRun || (now - lastRun) >= 23 * 3600 * 1000;
    case 'weekly':
      return dayUTC === 1 && (!lastRun || (now - lastRun) >= 6 * 24 * 3600 * 1000);
    case 'end-of-day':
      return hourUTC === 22 && (!lastRun || (now - lastRun) >= 23 * 3600 * 1000);
    case 'morning':
      return hourUTC === 14 && (!lastRun || (now - lastRun) >= 23 * 3600 * 1000);
    default:
      return false;
  }
}

export const handler = async () => {
  const now = new Date();
  const due = [];

  for (const cadence of ['hourly','daily','weekly','end-of-day','morning']) {
    const r = await ddb.send(new QueryCommand({
      TableName: ENV.TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :p',
      ExpressionAttributeValues: { ':p': `AGENT_SCHEDULE#${cadence}` },
      Limit: 100,
    })).catch(() => ({ Items: [] }));
    for (const item of r.Items || []) {
      if (shouldRun(cadence, now, item.lastRunAt)) due.push(item);
    }
  }

  console.log(`scheduler: ${due.length} agents due`);
  let invoked = 0;

  for (const agent of due) {
    // Build a synthetic API GW event so agent-runtime accepts it
    const userEmail = agent.gsi1sk.split('#')[0];
    // Synthesize a JWT-less event — agent-runtime calls authFromEvent which
    // returns null. We bypass that by setting a special "scheduled" flag.
    const fakeEvent = {
      requestContext: { http: { method: 'POST', path: `/agents/${agent.agentName}/run`, sourceIp: 'scheduler' } },
      pathParameters: { name: agent.agentName },
      headers: {
        // sign a synthetic JWT for this user using JWT_SECRET
        authorization: `Bearer ${signSchedulerToken(userEmail)}`,
        'x-scheduled': 'true',
      },
      body: JSON.stringify({ scheduledRun: true }),
      rawPath: `/agents/${agent.agentName}/run`,
      isBase64Encoded: false,
    };

    try {
      await lambda.send(new InvokeCommand({
        FunctionName: RUNTIME_FN,
        InvocationType: 'Event',                 // fire-and-forget
        Payload: Buffer.from(JSON.stringify(fakeEvent)),
      }));
      invoked++;
    } catch (e) {
      console.warn(`failed to invoke ${agent.agentName} for ${userEmail}:`, e.message);
    }

    // Update nextRunAt regardless of invoke success
    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE,
      Key: { pk: `USER#${userEmail}`, sk: `AGENT#${agent.agentName}` },
      UpdateExpression: 'SET scheduledTriggeredAt = :t',
      ExpressionAttributeValues: { ':t': now.toISOString() },
    })).catch(() => {});
  }

  return { ok: true, scanned: due.length, invoked };
};

// Lightweight HS256 token mirroring _shared.mjs signJwt — keeps this file self-contained
import crypto from 'node:crypto';
function signSchedulerToken(email) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET not configured');
  const now = Math.floor(Date.now()/1000);
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = enc({ alg:'HS256', typ:'JWT' });
  const payload = enc({ sub: `scheduler:${email}`, email, iat: now, exp: now + 600 });
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}
