/* POST /license/validate
   Body: { key, machineId }
   Returns: { valid, tier, features[], expires, jwt }   <- jwt is HS256-signed */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { ENV, ok, bad, notFound, oops, preflight, parseBody } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const FEATURES_BY_TIER = {
  basic:      ['record', 'spotlight'],
  powerhouse: ['record', 'spotlight', 'storyboard', 'kinetic', 'glassboard', 'vmap', 'timelapse', 'privacyblur'],
  agentic:    ['record', 'spotlight', 'storyboard', 'kinetic', 'glassboard', 'vmap', 'timelapse', 'privacyblur',
               'cloudsync', 'silentglass', 'agentic', 'skillcheck', 'proctor']
};

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  try {
    const { key, machineId } = parseBody(event);
    if (!key || !machineId) return bad('key and machineId required', origin);

    const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== 16) return bad('malformed key', origin);

    const q = await ddb.send(new QueryCommand({
      TableName: ENV.TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :p AND gsi1sk = :s',
      ExpressionAttributeValues: { ':p': `LICENSE#${normalized}`, ':s': 'META' },
      Limit: 1
    }));
    const lic = q.Items?.[0];
    if (!lic) return notFound('license not found', origin);
    if (lic.revoked) return bad('license revoked', origin);
    if (lic.expires && new Date(lic.expires) < new Date()) return bad('license expired', origin);

    // Bind to machine on first use
    const machines = lic.machines || [];
    if (!machines.includes(machineId)) {
      if (machines.length >= (lic.maxMachines || 3)) {
        return bad('machine limit reached', origin);
      }
      machines.push(machineId);
      await ddb.send(new UpdateCommand({
        TableName: ENV.TABLE, Key: { pk: lic.pk, sk: lic.sk },
        UpdateExpression: 'SET machines = :m, lastSeen = :t',
        ExpressionAttributeValues: { ':m': machines, ':t': new Date().toISOString() }
      }));
    }

    const features = FEATURES_BY_TIER[lic.tier] || FEATURES_BY_TIER.basic;
    const jwt = signJwt({
      sub: lic.userId || normalized,
      key: normalized,
      tier: lic.tier,
      features,
      exp: Math.floor(Date.now()/1000) + 14*24*3600,    // 14d offline grace
      iat: Math.floor(Date.now()/1000)
    });

    return ok({ valid: true, tier: lic.tier, features, expires: lic.expires || null, jwt }, origin);
  } catch (err) {
    console.error('license-validate error', err);
    return oops(err.message, origin);
  }
};

function signJwt(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET not configured');
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = obj => Buffer.from(JSON.stringify(obj))
    .toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}
