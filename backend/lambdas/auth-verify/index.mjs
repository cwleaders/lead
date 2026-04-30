/* POST /auth/verify
   Body: { email, code }
   Returns: { jwt, user: { id, email, plan } } */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { ENV, ok, bad, oops, preflight, parseBody, signJwt, shortId } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  try {
    const { email, code } = parseBody(event);
    if (!email || !code) return bad('email and code required', origin);
    const norm = email.trim().toLowerCase();
    const codeNorm = String(code).replace(/\D/g, '');

    const got = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: `AUTHCODE#${norm}`, sk: 'PENDING' }
    }));
    const pending = got.Item;
    if (!pending) return bad('code expired or invalid', origin);
    if (pending.attempts >= 5) return bad('too many attempts', origin);

    const codeHash = crypto.createHash('sha256').update(codeNorm).digest('hex');
    if (codeHash !== pending.codeHash) {
      await ddb.send(new UpdateCommand({
        TableName: ENV.TABLE, Key: { pk: pending.pk, sk: pending.sk },
        UpdateExpression: 'ADD attempts :one',
        ExpressionAttributeValues: { ':one': 1 }
      }));
      return bad('invalid code', origin);
    }

    // Code is valid — invalidate it
    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE, Key: { pk: pending.pk, sk: pending.sk },
      UpdateExpression: 'SET #s = :u', ExpressionAttributeNames: { '#s': 'sk' },
      ExpressionAttributeValues: { ':u': 'USED' }
    })).catch(()=>{});

    // Get or create user
    const userPk = `USER#${norm}`;
    let user;
    const userGet = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' }
    }));
    if (userGet.Item) {
      user = userGet.Item;
      await ddb.send(new UpdateCommand({
        TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' },
        UpdateExpression: 'SET lastSeen = :t',
        ExpressionAttributeValues: { ':t': new Date().toISOString() }
      })).catch(()=>{});
    } else {
      user = {
        pk: userPk, sk: 'PROFILE',
        gsi1pk: `EMAIL#${norm}`, gsi1sk: 'PROFILE',
        userId: shortId(12),
        email: norm,
        plan: 'free',
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      await ddb.send(new PutCommand({ TableName: ENV.TABLE, Item: user }));
    }

    const jwt = signJwt({
      sub: user.userId,
      email: user.email,
      plan: user.plan
    });

    return ok({
      jwt,
      user: {
        id: user.userId,
        email: user.email,
        plan: user.plan
      }
    }, origin);
  } catch (err) {
    console.error('auth-verify', err);
    return oops(err.message, origin);
  }
};
