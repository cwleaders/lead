/* PATCH /auth/profile
   Body: { persona?, displayName?, photoURL?, preferences? }
   Updates the user's PROFILE record. Auth-required. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, parseBody, authFromEvent } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const VALID_PERSONAS = [
  'controller',  // managers / team leads
  'subordinate', // employees being managed
  'applicant',   // job seekers
  'sharer',      // people who mostly send files
  'recorder',    // people who mostly record screens
  'admin'        // enterprise admins
];

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  const auth = authFromEvent(event);
  if (!auth) return bad('sign in required', origin);

  try {
    const body = parseBody(event);
    const userPk = `USER#${auth.email.toLowerCase()}`;

    // Build a dynamic update expression
    const sets = ['lastUpdatedAt = :t'];
    const vals = { ':t': new Date().toISOString() };

    if (body.persona !== undefined) {
      if (body.persona && !VALID_PERSONAS.includes(body.persona))
        return bad(`persona must be one of: ${VALID_PERSONAS.join(', ')}`, origin);
      sets.push('persona = :p');
      vals[':p'] = body.persona || null;
    }
    if (typeof body.displayName === 'string') {
      sets.push('displayName = :dn');
      vals[':dn'] = body.displayName.trim().slice(0, 80);
    }
    if (typeof body.photoURL === 'string') {
      sets.push('photoURL = :ph');
      vals[':ph'] = body.photoURL.trim().slice(0, 500);
    }
    if (body.preferences && typeof body.preferences === 'object') {
      sets.push('preferences = :pr');
      vals[':pr'] = sanitizePrefs(body.preferences);
    }

    if (sets.length === 1) return bad('no fields to update', origin);

    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE,
      Key: { pk: userPk, sk: 'PROFILE' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeValues: vals,
      ConditionExpression: 'attribute_exists(pk)',
    }));

    const refreshed = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' }
    }));

    return ok({
      ok: true,
      user: {
        id: refreshed.Item.userId,
        email: refreshed.Item.email,
        displayName: refreshed.Item.displayName || '',
        photoURL: refreshed.Item.photoURL || '',
        plan: refreshed.Item.plan || 'free',
        persona: refreshed.Item.persona || null,
        preferences: refreshed.Item.preferences || {},
      }
    }, origin);
  } catch (err) {
    console.error('auth-profile', err);
    return oops(err.message, origin);
  }
};

function sanitizePrefs(p) {
  // Whitelist of allowed preference keys to keep things tidy
  const allowed = ['theme', 'reducedMotion', 'defaultRecordingFps', 'defaultRecordingResolution',
                   'tone', 'firstScreenLayout', 'showOnboarding', 'preferredAgent', 'tz'];
  const out = {};
  for (const k of allowed) if (p[k] !== undefined) out[k] = p[k];
  return out;
}
