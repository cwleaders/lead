/* GET /auth/me
   Returns the current user from JWT, plus an aggregate of files + licenses. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, authFromEvent } from './_shared.mjs';
import { publicEntitlements } from './_entitlements.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  const auth = authFromEvent(event);
  if (!auth) {
    // 401 with structured error so the frontend ApiError class catches it
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json',
                 'access-control-allow-origin': origin || '*',
                 'access-control-allow-credentials': 'false' },
      body: JSON.stringify({ error: 'sign_in_required' })
    };
  }

  try {
    const userPk = `USER#${auth.email}`;
    const profile = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' }
    }));
    if (!profile.Item) return bad('user not found', origin);

    // Files owned by this user (last 100)
    const files = await ddb.send(new QueryCommand({
      TableName: ENV.TABLE,
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :p',
      ExpressionAttributeValues: { ':p': `USER#${auth.sub}` },
      ScanIndexForward: false,
      Limit: 100
    })).catch(() => ({ Items: [] }));

    // Licenses for this email
    const licenses = await ddb.send(new QueryCommand({
      TableName: ENV.TABLE,
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :p',
      ExpressionAttributeValues: { ':p': `EMAIL#${auth.email}` },
      ScanIndexForward: false,
      Limit: 20
    })).catch(() => ({ Items: [] }));

    const plan = profile.Item.plan || 'free';
    const fileItems = files.Items || [];
    const usedBytes = fileItems.reduce((s, f) => s + (f.actualSize || f.size || 0), 0);
    const totalDownloads = fileItems.reduce((s, f) => s + (f.downloadCount || 0), 0);

    return ok({
      user: {
        id: profile.Item.userId,
        email: profile.Item.email,
        displayName: profile.Item.displayName || '',
        photoURL: profile.Item.photoURL || '',
        plan,
        persona: profile.Item.persona || null,
        preferences: profile.Item.preferences || {},
        createdAt: profile.Item.createdAt,
        provider: profile.Item.provider || 'magic-link'
      },
      entitlements: publicEntitlements(plan),
      usage: {
        files: {
          count:        fileItems.length,
          usedBytes,
          downloads:    totalDownloads
        },
        aiCredits: {
          monthlyAllotment: publicEntitlements(plan).aiCredits,
          consumedThisMonth: profile.Item.aiCreditsUsed || 0
        }
      },
      files: fileItems.slice(0, 50).map(f => ({
        fileId: f.fileId,
        shareToken: f.shareToken,
        name: f.name,
        size: f.actualSize || f.size,
        type: f.type,
        downloadCount: f.downloadCount || 0,
        createdAt: f.createdAt,
        expiresAt: f.expiresAt
      })),
      licenses: (licenses.Items || []).filter(l => l.tier).map(l => ({
        key: l.key,
        tier: l.tier,
        createdAt: l.createdAt,
        revoked: l.revoked || false
      }))
    }, origin);
  } catch (err) {
    console.error('auth-me', err);
    return oops(err.message, origin);
  }
};
