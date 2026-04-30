/* POST /auth/firebase
   Body: { idToken }   (Firebase ID token from client SDK after Google sign-in)
   Returns: { jwt, user }

   Verifies the Firebase token locally using Google's published RSA public keys
   (no Firebase Admin SDK needed — keeps the bundle tiny).
   On success, mirrors the user into our DynamoDB single-table and issues
   our own HS256 JWT so all other Lambdas can use the same auth header. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { ENV, ok, bad, oops, preflight, parseBody, signJwt, shortId } from './_shared.mjs';
import { withBreaker, fetchWithTimeout } from './_breaker.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const KEYS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let keysCache = null;
let keysExp = 0;

async function getFirebaseKeys() {
  if (keysCache && Date.now() < keysExp) return keysCache;
  return withBreaker('firebase-keys', async () => {
    const r = await fetchWithTimeout(KEYS_URL, {}, 5000);
    if (!r.ok) throw new Error(`firebase keys ${r.status}`);
    const cc = r.headers.get('cache-control') || 'max-age=3600';
    const m = cc.match(/max-age=(\d+)/);
    const ttlSecs = m ? Math.min(parseInt(m[1], 10), 21600) : 3600;
    keysCache = await r.json();
    keysExp = Date.now() + ttlSecs * 1000;
    return keysCache;
  });
}

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function verifyFirebaseToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [hB64, pB64, sB64] = parts;
  const header = JSON.parse(b64urlDecode(hB64).toString('utf8'));
  const payload = JSON.parse(b64urlDecode(pB64).toString('utf8'));
  const sig = b64urlDecode(sB64);

  if (header.alg !== 'RS256') throw new Error('algorithm not RS256');
  if (!header.kid) throw new Error('no kid');
  if (payload.aud !== projectId) throw new Error(`aud ${payload.aud} != ${projectId}`);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('iss mismatch');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('token expired');
  if (payload.iat > now + 60) throw new Error('iat in future');
  if (payload.auth_time && payload.auth_time > now + 60) throw new Error('auth_time in future');
  if (!payload.sub || !payload.email) throw new Error('missing sub or email');

  const keys = await getFirebaseKeys();
  const pem = keys[header.kid];
  if (!pem) throw new Error(`unknown kid: ${header.kid}`);

  const pubKey = crypto.createPublicKey(pem);
  const data = Buffer.from(`${hB64}.${pB64}`);
  const verified = crypto.verify('RSA-SHA256', data, pubKey, sig);
  if (!verified) throw new Error('signature invalid');

  return payload;
}

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) return bad('firebase not configured (FIREBASE_PROJECT_ID env var missing)', origin);

    const { idToken } = parseBody(event);
    if (!idToken) return bad('idToken required', origin);

    let claims;
    try {
      claims = await verifyFirebaseToken(idToken, projectId);
    } catch (e) {
      console.warn('firebase verify failed:', e.message);
      return bad('invalid firebase token', origin);
    }

    const email = claims.email.trim().toLowerCase();
    const userPk = `USER#${email}`;

    const existing = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' }
    }));

    let user;
    if (existing.Item) {
      user = existing.Item;
      await ddb.send(new UpdateCommand({
        TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' },
        UpdateExpression: 'SET lastSeen = :t, firebaseUid = :u, displayName = if_not_exists(displayName, :n), photoURL = if_not_exists(photoURL, :p)',
        ExpressionAttributeValues: {
          ':t': new Date().toISOString(),
          ':u': claims.sub,
          ':n': claims.name || '',
          ':p': claims.picture || ''
        }
      })).catch(() => {});
    } else {
      user = {
        pk: userPk, sk: 'PROFILE',
        gsi1pk: `EMAIL#${email}`, gsi1sk: 'PROFILE',
        userId: shortId(12),
        email,
        plan: 'free',
        firebaseUid: claims.sub,
        displayName: claims.name || '',
        photoURL: claims.picture || '',
        emailVerified: !!claims.email_verified,
        provider: 'google',
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      await ddb.send(new PutCommand({ TableName: ENV.TABLE, Item: user }));
    }

    const jwt = signJwt({
      sub: user.userId,
      email: user.email,
      plan: user.plan,
      provider: 'google'
    });

    return ok({
      jwt,
      user: {
        id: user.userId,
        email: user.email,
        plan: user.plan,
        displayName: user.displayName,
        photoURL: user.photoURL
      }
    }, origin);
  } catch (err) {
    console.error('auth-firebase', err);
    return oops(err.message, origin);
  }
};
