/* POST /files/complete
   Body: { fileId, etags? }   // etags only required for multipart
   Marks the file as 'live', completes any multipart upload, kicks off receipt generation. */

import { S3Client, CompleteMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ENV, ok, bad, notFound, oops, preflight, parseBody } from './_shared.mjs';

const s3 = new S3Client({ region: ENV.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const lambda = new LambdaClient({ region: ENV.REGION });

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  try {
    const { fileId, etags } = parseBody(event);
    if (!fileId) return bad('fileId required', origin);

    const got = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: `FILE#${fileId}`, sk: 'META' }
    }));
    const item = got.Item;
    if (!item) return notFound('file not found', origin);

    // Complete multipart upload if needed
    if (item.uploadId && Array.isArray(etags) && etags.length) {
      await s3.send(new CompleteMultipartUploadCommand({
        Bucket: item.bucket, Key: item.key, UploadId: item.uploadId,
        MultipartUpload: {
          Parts: etags.map(e => ({ PartNumber: e.partNumber, ETag: e.etag }))
        }
      }));
    }

    // Verify object actually landed
    let actualSize = item.size;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: item.bucket, Key: item.key }));
      actualSize = head.ContentLength;
    } catch (e) {
      console.warn('head failed', e.message);
    }

    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE, Key: { pk: `FILE#${fileId}`, sk: 'META' },
      UpdateExpression: 'SET #s = :s, actualSize = :sz, completedAt = :t',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': 'live', ':sz': actualSize, ':t': new Date().toISOString()
      }
    }));

    // Fire-and-forget receipt generation (event-style invoke)
    if (process.env.RECEIPT_FN_NAME) {
      lambda.send(new InvokeCommand({
        FunctionName: process.env.RECEIPT_FN_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ fileId }))
      })).catch(e => console.warn('receipt invoke failed', e.message));
    }

    return ok({
      fileId,
      shareToken: item.shareToken,
      downloadUrl: `https://${ENV.CDN_DOMAIN}/${item.shareToken}`,
      expiresAt: item.expiresAt
    }, origin);
  } catch (err) {
    console.error('complete error', err);
    return oops(err.message, origin);
  }
};
