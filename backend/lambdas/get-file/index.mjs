/* GET /files/{token}      → returns metadata + previewUrl (for download.cwleaders.com viewer)
   GET /files/{token}/dl   → 302 to short-lived presigned download URL */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV, ok, notFound, oops, preflight, corsHeaders } from './_shared.mjs';

const s3 = new S3Client({ region: ENV.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const token = event.pathParameters?.token;
  const rawPath = event.rawPath || event.requestContext?.http?.path || '';
  const action = rawPath.endsWith('/dl') ? 'dl' : null;

  if (!token) return notFound('token required', origin);

  try {
    const q = await ddb.send(new QueryCommand({
      TableName: ENV.TABLE,
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :p AND gsi1sk = :s',
      ExpressionAttributeValues: { ':p': `SHARE#${token}`, ':s': 'META' },
      Limit: 1
    }));
    const item = q.Items?.[0];
    if (!item || item.status !== 'live') return notFound('not found or not ready', origin);

    if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
      return notFound('expired', origin);
    }

    if (action === 'dl') {
      // Issue short-lived presigned URL and 302 to it
      const dlUrl = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: item.bucket, Key: item.key,
        ResponseContentDisposition: `attachment; filename="${escapeFilename(item.name)}"`
      }), { expiresIn: 300 });

      ddb.send(new UpdateCommand({
        TableName: ENV.TABLE, Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'ADD downloadCount :one',
        ExpressionAttributeValues: { ':one': 1 }
      })).catch(e => console.warn('counter failed', e.message));

      return {
        statusCode: 302,
        headers: { ...corsHeaders(origin), location: dlUrl },
        body: ''
      };
    }

    // metadata view
    return ok({
      name: item.name,
      size: item.actualSize || item.size,
      type: item.type,
      expiresAt: item.expiresAt,
      previewUrl: item.previewUrl || null,
      downloadUrl: `https://${ENV.CDN_DOMAIN}/${token}/dl`,
      downloadCount: item.downloadCount || 0
    }, origin);
  } catch (err) {
    console.error('get-file error', err);
    return oops(err.message, origin);
  }
};

function escapeFilename(s) {
  return (s || 'file').replace(/[^\w.\-]/g, '_');
}
