/* POST /files/presign
   Body: { name, size, type }
   Auth: optional Cognito JWT — if absent, treat as anonymous (24h expiry, 100MB cap)
   Returns: { fileId, shareToken, uploadUrl, parts?, downloadUrl } */

import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV, ok, bad, oops, preflight, parseBody, shortId, ipHash, authFromEvent } from './_shared.mjs';

const s3  = new S3Client({ region: ENV.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));

const PART_SIZE      = 8 * 1024 * 1024;
const MULTIPART_AT   = 16 * 1024 * 1024;
const URL_TTL_SECS   = 60 * 30; // 30 min to upload

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;

  try {
    const { name, size, type } = parseBody(event);
    if (!name || typeof size !== 'number') return bad('name and size required', origin);

    const auth = authFromEvent(event);
    const owner = auth?.sub || null;
    const ownerEmail = auth?.email || null;
    const plan = auth?.plan || 'anonymous';
    const isAnon = !owner;

    // Tier-aware size caps
    const cap = isAnon
      ? ENV.ANON_MAX_BYTES
      : (plan === 'free' ? 5 * 1024 * 1024 * 1024
        : plan === 'pro' ? 100 * 1024 * 1024 * 1024
        : 500 * 1024 * 1024 * 1024);
    if (size > cap) return bad(`upload exceeds ${cap} byte cap for ${plan} plan`, origin);

    const fileId     = shortId(12);
    const shareToken = shortId(10);
    const key        = `files/${fileId}/${sanitize(name)}`;
    const contentType = type || 'application/octet-stream';
    const now = Date.now();
    const expiresAt = isAnon ? new Date(now + ENV.ANON_TTL_HOURS * 3600_000).toISOString() : null;
    const ttl       = isAnon ? Math.floor((now + ENV.ANON_TTL_HOURS * 3600_000) / 1000) : undefined;

    let response;

    if (size >= MULTIPART_AT) {
      const m = await s3.send(new CreateMultipartUploadCommand({
        Bucket: ENV.FILES_BUCKET, Key: key, ContentType: contentType
      }));
      const partCount = Math.ceil(size / PART_SIZE);
      const parts = [];
      for (let i = 1; i <= partCount; i++) {
        const url = await getSignedUrl(s3, new UploadPartCommand({
          Bucket: ENV.FILES_BUCKET, Key: key, UploadId: m.UploadId, PartNumber: i
        }), { expiresIn: URL_TTL_SECS });
        parts.push({ partNumber: i, url });
      }
      response = { fileId, shareToken, uploadId: m.UploadId, parts, key };
    } else {
      const url = await getSignedUrl(s3, new PutObjectCommand({
        Bucket: ENV.FILES_BUCKET, Key: key, ContentType: contentType
      }), { expiresIn: URL_TTL_SECS });
      response = { fileId, shareToken, uploadUrl: url, key };
    }

    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: `FILE#${fileId}`,
        sk: 'META',
        gsi1pk: `SHARE#${shareToken}`,
        gsi1sk: 'META',
        gsi2pk: owner ? `USER#${owner}` : `ANON#${ipHash(event)}`,
        gsi2sk: `FILE#${now}`,
        fileId, shareToken,
        name, size, type: contentType,
        key, bucket: ENV.FILES_BUCKET,
        owner, ownerEmail, plan, anonymous: isAnon,
        status: 'pending',
        uploadId: response.uploadId || null,
        ipHash: ipHash(event),
        createdAt: new Date(now).toISOString(),
        expiresAt,
        ...(ttl ? { ttl } : {})
      }
    }));

    return ok({
      ...response,
      downloadUrl: `https://${ENV.CDN_DOMAIN}/${shareToken}`,
      expiresAt
    }, origin);
  } catch (err) {
    console.error('presign error', err);
    return oops(err.message, origin);
  }
};

function sanitize(name) {
  return (name || 'file').replace(/[^\w.\-]/g, '_').slice(0, 200);
}
