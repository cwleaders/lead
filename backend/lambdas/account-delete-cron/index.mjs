/* lead-account-delete-cron
   Triggered by EventBridge daily at 03:00 UTC.
   Finds all user records with status=deletion_pending AND deletion_at <= now,
   then performs the destructive cascade.

   Uses GSI1 (we add a new index pk for this: pk=DELETION_QUEUE) — but to avoid
   a schema change we instead scan with a filter expression. At <50k MAU this is
   fine; switch to a dedicated GSI when scan cost matters.
*/

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, DeleteCommand, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { ENV } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const s3  = new S3Client({ region: ENV.REGION });

export const handler = async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const summary = { scanned: 0, deleted: 0, errors: [] };

  // Scan for due-for-deletion users (single-table; cheap at small scale)
  let cursor;
  do {
    const r = await ddb.send(new ScanCommand({
      TableName: ENV.TABLE,
      FilterExpression: 'sk = :sk AND #s = :pending AND deletion_at <= :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':sk': 'PROFILE', ':pending': 'deletion_pending', ':now': nowSec },
      ProjectionExpression: 'pk, sk, email',
      ExclusiveStartKey: cursor
    }));
    cursor = r.LastEvaluatedKey;
    summary.scanned += (r.Items || []).length;

    for (const profile of r.Items || []) {
      try {
        await deleteUserCascade(profile);
        summary.deleted += 1;
      } catch (err) {
        console.error('cascade failed for', profile.pk, err.message);
        summary.errors.push({ user: profile.pk, error: err.message });
      }
    }
  } while (cursor);

  console.log('account-delete-cron summary', JSON.stringify(summary));
  return summary;
};

async function deleteUserCascade(profile) {
  const userId = profile.pk.replace(/^USER#/, '');
  const isoNow = new Date().toISOString();

  // 1. Delete every DDB row with pk=USER#<id>
  let cursor;
  let totalRows = 0;
  do {
    const q = await ddb.send(new QueryCommand({
      TableName: ENV.TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': profile.pk },
      ProjectionExpression: 'pk, sk',
      ExclusiveStartKey: cursor
    }));
    cursor = q.LastEvaluatedKey;
    const items = q.Items || [];
    totalRows += items.length;
    // BatchWriteCommand limits to 25 per call
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [ENV.TABLE]: chunk.map(it => ({ DeleteRequest: { Key: { pk: it.pk, sk: it.sk } } }))
        }
      }));
    }
  } while (cursor);

  // 2. Delete S3 prefix lead-files-…/<userId>/*
  let kToken;
  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: ENV.FILES_BUCKET,
      Prefix: `${userId}/`,
      ContinuationToken: kToken
    }));
    kToken = list.NextContinuationToken;
    if ((list.Contents || []).length > 0) {
      // chunk 1000 per S3 limit
      for (let i = 0; i < list.Contents.length; i += 1000) {
        const chunk = list.Contents.slice(i, i + 1000);
        await s3.send(new DeleteObjectsCommand({
          Bucket: ENV.FILES_BUCKET,
          Delete: { Objects: chunk.map(o => ({ Key: o.Key })), Quiet: true }
        }));
      }
    }
  } while (kToken);

  // 3. Audit row in DSAR_LOG (immutable; the deletion of the user itself is logged separately)
  await ddb.send(new PutCommand({
    TableName: ENV.TABLE,
    Item: {
      pk: 'DSAR_LOG',
      sk: `${isoNow}#delete-final#${userId}`,
      type: 'delete_final',
      userId,
      // Email is *not* preserved here — the audit trail is intentionally deidentified
      // beyond the userId hash, satisfying GDPR Art. 17 right-to-erasure while
      // retaining proof-of-execution for compliance.
      rowsDeleted: totalRows,
      completedAt: isoNow,
      ttl: Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600
    }
  }));
}
