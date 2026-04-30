/* GET /admin/snapshot
   Returns counts + recent rows from each segment of the data lake.
   Gated by ADMIN_EMAILS env var (comma-separated). */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ENV, ok, bad, oops, preflight, authFromEvent } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const auth = authFromEvent(event);
  const admins = (process.env.ADMIN_EMAILS || 'admin@cwleaders.com').split(',').map(s => s.trim().toLowerCase());
  if (!auth || !admins.includes(auth.email?.toLowerCase())) return bad('unauthorized', origin);

  try {
    const [waitlist, files, licenses] = await Promise.all([
      ddb.send(new QueryCommand({
        TableName: ENV.TABLE,
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :p',
        ExpressionAttributeValues: { ':p': 'WAITLIST' },
        ScanIndexForward: false,
        Limit: 50
      })).catch(() => ({ Items: [] })),
      // Recent files: scan with sk == 'META' filter on pk begins_with FILE# — small scan, cheap until table grows
      ddb.send(new ScanCommand({
        TableName: ENV.TABLE,
        FilterExpression: 'begins_with(pk, :p) AND sk = :m',
        ExpressionAttributeValues: { ':p': 'FILE#', ':m': 'META' },
        Limit: 200
      })).catch(() => ({ Items: [] })),
      ddb.send(new ScanCommand({
        TableName: ENV.TABLE,
        FilterExpression: 'begins_with(pk, :p) AND sk = :m',
        ExpressionAttributeValues: { ':p': 'LICENSE#', ':m': 'META' },
        Limit: 200
      })).catch(() => ({ Items: [] }))
    ]);

    // Approximate user count: scan profiles (single-page only — fine until ~1k users)
    const usersScan = await ddb.send(new ScanCommand({
      TableName: ENV.TABLE,
      FilterExpression: 'sk = :p',
      ExpressionAttributeValues: { ':p': 'PROFILE' },
      Select: 'COUNT'
    })).catch(() => ({ Count: 0 }));

    const fileItems = (files.Items || []).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    const licItems = (licenses.Items || []).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));

    return ok({
      counts: {
        waitlist: waitlist.Items?.length || 0,
        users:    usersScan.Count       || 0,
        files:    fileItems.length,
        licenses: licItems.length
      },
      waitlist: (waitlist.Items || []).slice(0, 25).map(w => ({
        email: w.email, source: w.source, createdAt: w.createdAt
      })),
      files: fileItems.slice(0, 25).map(f => ({
        name: f.name, size: f.actualSize || f.size,
        type: f.type, ownerEmail: f.ownerEmail,
        downloadCount: f.downloadCount || 0,
        createdAt: f.createdAt
      })),
      licenses: licItems.slice(0, 25).map(l => ({
        key: l.key, tier: l.tier, email: l.email, createdAt: l.createdAt
      }))
    }, origin);
  } catch (err) {
    console.error('admin-snapshot', err);
    return oops(err.message, origin);
  }
};
