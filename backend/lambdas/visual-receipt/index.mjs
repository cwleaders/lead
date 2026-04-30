/* Visual Receipt generator (async, invoked Event-style by complete-upload).
   For images: copy original as preview.
   For PDFs/videos/code: stub for now — write a metadata-only "poster" key.
   Keeps the MVP shipping today; real generators (pdftoppm, ffmpeg layer)
   plug in here later without changing the API contract. */

import { S3Client, CopyObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ENV } from './_shared.mjs';

const s3 = new S3Client({ region: ENV.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const { fileId } = event;
  if (!fileId) return { ok: false, error: 'fileId required' };

  try {
    const got = await ddb.send(new GetCommand({
      TableName: ENV.TABLE, Key: { pk: `FILE#${fileId}`, sk: 'META' }
    }));
    const item = got.Item;
    if (!item) return { ok: false, error: 'not found' };

    let previewUrl = null;
    const t = item.type || '';

    if (t.startsWith('image/')) {
      // Use the original as the preview — CDN-cacheable directly
      previewUrl = `https://${ENV.CDN_DOMAIN}/_preview/${fileId}`;
      await s3.send(new CopyObjectCommand({
        Bucket: item.bucket,
        CopySource: `/${item.bucket}/${encodeURIComponent(item.key)}`,
        Key: `previews/${fileId}.bin`,
        MetadataDirective: 'REPLACE',
        ContentType: t,
        CacheControl: 'public, max-age=86400'
      }));
    } else if (t.startsWith('video/')) {
      // TODO: ffmpeg layer to extract frame @ 10%
      previewUrl = null;
    } else if (t === 'application/pdf') {
      // TODO: pdftoppm layer to render page 1
      previewUrl = null;
    }

    await ddb.send(new UpdateCommand({
      TableName: ENV.TABLE, Key: { pk: item.pk, sk: item.sk },
      UpdateExpression: 'SET previewUrl = :u, receiptGenAt = :t',
      ExpressionAttributeValues: { ':u': previewUrl, ':t': new Date().toISOString() }
    }));

    return { ok: true, previewUrl };
  } catch (err) {
    console.error('receipt error', err);
    return { ok: false, error: err.message };
  }
};
