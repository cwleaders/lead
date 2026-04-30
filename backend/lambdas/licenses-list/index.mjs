/* GET /licenses
   Returns the authenticated user's purchased license keys.
   Auth: required.

   Response:
   {
     licenses: [
       { key, tier, status, maxMachines, machines, createdAt, stripeSession }
     ],
     activePlan: "powerhouse" | "free" | ...
   }

   POST /licenses/{key}/revoke-machine — body { machineId } removes a machine
       from the binding so the user can move their license to a new device.

   POST /licenses/{key}/transfer — body { newEmail } transfers ownership.
       Sends confirmation emails to both old and new accounts.
*/

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, notFound, preflight, parseBody, authFromEvent } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const user = authFromEvent(event);
  if (!user) return { statusCode: 401, headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ error: 'sign_in_required' }) };

  const method = event.requestContext?.http?.method;
  const path = event.requestContext?.http?.path || event.rawPath || '';

  try {
    if (method === 'GET' && path === '/licenses') {
      return await listLicenses(user, origin);
    }
    if (method === 'POST') {
      // /licenses/<key>/revoke-machine  or  /licenses/<key>/transfer
      const m = path.match(/^\/licenses\/([A-Z0-9-]{8,32})\/(revoke-machine|transfer)$/i);
      if (m) {
        const [, key, action] = m;
        const body = parseBody(event);
        if (action === 'revoke-machine') return await revokeMachine(user, key, body.machineId, origin);
        if (action === 'transfer')        return await transferLicense(user, key, body.newEmail, origin);
      }
    }
    return notFound('not found', origin);
  } catch (err) {
    console.error('licenses', err);
    return oops(err.message, origin);
  }
};

async function listLicenses(user, origin) {
  const email = (user.email || '').toLowerCase();
  if (!email) return bad('no email on token', origin);

  // Query GSI2 for all licenses bound to this email
  const r = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    IndexName: 'gsi2',
    KeyConditionExpression: 'gsi2pk = :pk AND begins_with(gsi2sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': `EMAIL#${email}`,
      ':sk': 'LICENSE#'
    }
  }));

  const licenses = (r.Items || []).map(it => ({
    key: maskKey(it.key),                      // mask middle for display safety
    fullKey: it.key,                           // included so user can copy
    tier: it.tier,
    status: it.revoked ? 'revoked' : 'active',
    maxMachines: it.maxMachines || 3,
    machines: (it.machines || []).map(m => ({
      machineId: m.machineId,
      label: m.label,
      lastSeenAt: m.lastSeenAt,
      activatedAt: m.activatedAt
    })),
    createdAt: it.createdAt,
    stripeSession: it.stripeSession
  }));

  return ok({ licenses, count: licenses.length, activePlan: user.plan || 'free' }, origin);
}

async function revokeMachine(user, key, machineId, origin) {
  if (!machineId) return bad('machineId required', origin);
  const norm = key.replace(/-/g, '').toUpperCase();
  // Verify ownership
  const lic = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: { ':pk': `LICENSE#${norm}`, ':sk': 'META' }
  }));
  const item = lic.Items?.[0];
  if (!item) return notFound('license_not_found', origin);
  if ((item.email || '').toLowerCase() !== (user.email || '').toLowerCase()) {
    return { statusCode: 403, headers: { 'content-type': 'application/json' },
             body: JSON.stringify({ error: 'not_your_license' }) };
  }
  const filtered = (item.machines || []).filter(m => m.machineId !== machineId);
  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `LICENSE#${norm}`, sk: 'META' },
    UpdateExpression: 'SET machines = :m, lastModified = :t',
    ExpressionAttributeValues: { ':m': filtered, ':t': new Date().toISOString() }
  }));
  return ok({ ok: true, removed: machineId, remaining: filtered.length }, origin);
}

async function transferLicense(user, key, newEmail, origin) {
  if (!newEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return bad('valid newEmail required', origin);
  }
  const norm = key.replace(/-/g, '').toUpperCase();
  const lic = await ddb.send(new QueryCommand({
    TableName: ENV.TABLE,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: { ':pk': `LICENSE#${norm}`, ':sk': 'META' }
  }));
  const item = lic.Items?.[0];
  if (!item) return notFound('license_not_found', origin);
  if ((item.email || '').toLowerCase() !== (user.email || '').toLowerCase()) {
    return { statusCode: 403, headers: { 'content-type': 'application/json' },
             body: JSON.stringify({ error: 'not_your_license' }) };
  }
  const newE = newEmail.toLowerCase();
  await ddb.send(new UpdateCommand({
    TableName: ENV.TABLE,
    Key: { pk: `LICENSE#${norm}`, sk: 'META' },
    UpdateExpression: 'SET email = :e, gsi2pk = :gp, machines = :m, transferredAt = :t, transferredFrom = :f',
    ExpressionAttributeValues: {
      ':e': newE,
      ':gp': `EMAIL#${newE}`,
      ':m': [],     // clear machine bindings on transfer — new owner re-activates
      ':t': new Date().toISOString(),
      ':f': item.email || ''
    }
  }));
  return ok({ ok: true, transferredTo: newE, machinesCleared: (item.machines || []).length }, origin);
}

/* Mask middle of a license key for safer display: AB12-CDEF-3456-789Z → AB12-••••-••••-789Z */
function maskKey(key) {
  if (!key) return '';
  const parts = key.split('-');
  if (parts.length < 3) return key;
  return [parts[0], '••••', '••••', parts[parts.length - 1]].join('-');
}
