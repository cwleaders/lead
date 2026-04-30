/* DELETE /account
   Initiates the 14-day grace deletion window per docs/LOADING-AND-EXIT.md §9.5.
   Auth: required + L5 fresh re-auth (last_auth ≤ 5min).
   Behavior:
     - Flags user with status=deletion_pending and deletion_at=now+14d
     - Invalidates all current sessions (revokes JWT)
     - Adds SES suppression so we don't send marketing
     - Returns confirmation; cron does the actual destroy at T+14d.

   The user can reactivate inside the 14-day window via /account/reactivate.
*/

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, PutSuppressedDestinationCommand } from '@aws-sdk/client-sesv2';
import { ENV, ok, bad, oops, preflight, authFromEvent, parseBody, ipHash } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const ses = new SESv2Client({ region: ENV.REGION });

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  const user = authFromEvent(event);
  if (!user) return { statusCode: 401, headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ error: 'sign_in_required' }) };

  // L5 check — fresh re-auth required (5-minute window)
  const ageSec = Math.floor(Date.now()/1000) - (user.last_auth || 0);
  if (ageSec > 300) {
    return { statusCode: 401, headers: { 'content-type': 'application/json' },
             body: JSON.stringify({ error: 'reauth_required', ageSec }) };
  }

  const body = parseBody(event);
  // Type-confirmation — UI requires user to retype their email
  if ((body.confirmEmail || '').toLowerCase().trim() !== (user.email || '').toLowerCase().trim()) {
    return bad('email_mismatch', origin);
  }

  try {
    const now = Date.now();
    const deletionAt = Math.floor(now / 1000) + 14 * 24 * 3600;
    const isoNow = new Date(now).toISOString();

    // 1. Flag the user record
    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE,
      Key: { pk: `USER#${user.sub}`, sk: 'PROFILE' },
      UpdateExpression:
        'SET #s = :pending, deletion_at = :da, deletion_requested_at = :ra, deletion_ip_hash = :ih',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':pending': 'deletion_pending',
        ':da': deletionAt,
        ':ra': isoNow,
        ':ih': ipHash(event)
      }
    }));

    // 2. Audit row
    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: 'DSAR_LOG',
        sk: `${isoNow}#delete-request#${user.sub}`,
        gsi1pk: `USER#${user.sub}`,
        gsi1sk: `DSAR#${isoNow}`,
        type: 'delete_request',
        userId: user.sub,
        email: user.email,
        deletionAt,
        createdAt: isoNow,
        ttl: Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600
      }
    }));

    // 3. Suppress marketing (we don't send marketing today, but defensive)
    if (user.email) {
      try {
        await ses.send(new PutSuppressedDestinationCommand({
          EmailAddress: user.email,
          Reason: 'COMPLAINT'  // Closest SES enum to "user-requested"
        }));
      } catch (e) {
        // SES might already have it suppressed — continue
        console.warn('SES suppression noop:', e.message);
      }
    }

    // 4. Invalidate all sessions — write a sentinel that auth-me reads
    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE,
      Key: { pk: `USER#${user.sub}`, sk: 'PROFILE' },
      UpdateExpression: 'SET sessions_invalid_after = :now',
      ExpressionAttributeValues: { ':now': Math.floor(Date.now() / 1000) }
    }));

    return ok({
      ok: true,
      status: 'deletion_pending',
      deletion_at: new Date(deletionAt * 1000).toISOString(),
      reactivate_until: new Date(deletionAt * 1000).toISOString(),
      message: 'Account scheduled for deletion in 14 days. Sign in within that window to cancel.'
    }, origin);
  } catch (err) {
    console.error('account-delete-request', err);
    return oops(err.message, origin);
  }
};
