/* POST /enterprise/telemetry
   Body: { orgId, kind, severity?, summary?, vmapKey?, payload? }

   Receives lightweight telemetry from desktop agents (Phase 3+).
   Stores compact event records in DynamoDB; large payloads should already be in S3
   under files/telemetry/<orgId>/<eventId>/ via separate presigned URL flow. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, parseBody, authFromEvent, shortId } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const VALID_KINDS = new Set([
  'session_start','session_end',
  'milestone','active_window','idle','focus',
  'security_anomaly','consent_violation',
  'flare_pause','flare_resume',
  'overwatch_request','overwatch_clear',
  'visual_diff_resolve'
]);

const VALID_SEVERITIES = new Set(['info','low','medium','high','critical']);

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const auth = authFromEvent(event);
  if (!auth) return bad('unauthorized', origin);

  try {
    const { orgId, kind, severity, summary, vmapKey, payload } = parseBody(event);
    if (!orgId) return bad('orgId required', origin);
    if (!kind || !VALID_KINDS.has(kind)) return bad('invalid kind', origin);
    if (severity && !VALID_SEVERITIES.has(severity)) return bad('invalid severity', origin);

    // Membership check (employee must belong to org with active consent)
    const member = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: `ORG#${orgId}`, sk: `MEMBER#${auth.email}` }
    }));
    if (!member.Item) return bad('not a member', origin);
    if (member.Item.status !== 'active') return bad('membership not active', origin);

    const now = new Date().toISOString();
    const eventId = shortId(10);
    const sev = severity || 'info';

    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: `ORG#${orgId}`, sk: `TELEMETRY#${now}#${eventId}`,
        gsi1pk: `EMP#${orgId}#${auth.email}`, gsi1sk: `T#${now}`,
        gsi2pk: sev === 'critical' || sev === 'high'
          ? `ALERTS#${orgId}` : `TELEMETRY#${orgId}`,
        gsi2sk: `T#${now}`,
        eventId, orgId,
        email: auth.email, userId: auth.sub,
        kind, severity: sev,
        summary: summary || null,
        payloadKey: vmapKey || null,
        at: now,
        // small inline payload only — large blobs should be in S3
        payload: payload && JSON.stringify(payload).length < 4000 ? payload : null
      }
    }));

    return ok({ eventId, recordedAt: now }, origin);
  } catch (err) {
    console.error('telemetry-ingest', err);
    return oops(err.message, origin);
  }
};
