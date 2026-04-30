/* GET /health
   Lightweight liveness + dependency check.
   Returns 200 with { ok: true, deps:{...} } when dependencies are reachable.
   Returns 503 if a critical dep is unreachable (caller can use this for synthetics). */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, preflight, corsHeaders } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const VERSION = process.env.LEAD_VERSION || 'v1.0.0';
const COMMIT  = process.env.LEAD_COMMIT  || 'unknown';

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const t0 = Date.now();

  const deps = {};
  let ok = true;

  // 1. DynamoDB GetItem on sentinel (uses table-level perms already granted)
  try {
    const start = Date.now();
    await ddb.send(new GetCommand({
      TableName: ENV.TABLE,
      Key: { pk: '__health__', sk: '__sentinel__' },
      ConsistentRead: false
    }));
    deps.dynamodb = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    deps.dynamodb = { ok: false, error: err.message };
    ok = false;
  }

  // 2. Env config — JWT_SECRET must be set (security floor)
  deps.config = {
    ok: !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32,
    jwtConfigured: !!process.env.JWT_SECRET
  };
  if (!deps.config.ok) ok = false;

  const body = {
    ok,
    service: 'lead-api',
    version: VERSION,
    commit: COMMIT,
    region: ENV.REGION,
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - t0,
    deps
  };

  return {
    statusCode: ok ? 200 : 503,
    headers: { ...corsHeaders(origin), 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  };
};
