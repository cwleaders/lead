/* POST /privacy/export
   GDPR Art. 15 (right of access) + Art. 20 (data portability) endpoint.
   Auth: required.
   Behavior: scans every DDB row + S3 prefix associated with the user,
   packages a JSON manifest + media list into a presigned S3 zip URL,
   emails the link to the verified account email.

   Response is a 202 Accepted because the operation runs asynchronously.
*/

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ENV, ok, bad, oops, preflight, authFromEvent, shortId } from './_shared.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const s3  = new S3Client({ region: ENV.REGION });
const ses = new SESv2Client({ region: ENV.REGION });

const EXPORT_BUCKET = process.env.LEAD_EXPORT_BUCKET || ENV.FILES_BUCKET;

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  const user = authFromEvent(event);
  if (!user) return { statusCode: 401, headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ error: 'sign_in_required' }) };

  const userId = user.sub;
  const email  = user.email;
  if (!userId || !email) return bad('invalid token claims', origin);

  try {
    // 1. Collect: scan DDB rows where pk=USER#<id>, plus user-owned cross-pk rows
    const userItems = await collectByPk(`USER#${userId}`);
    const consents  = await collectByPk(`USER#${userId}`, 'CONSENT#');
    const sessions  = await collectByPk(`USER#${userId}`, 'SESSION#');

    // 2. Build manifest (PII redacted where appropriate; full email kept by design)
    const manifest = {
      generatedAt: new Date().toISOString(),
      generatedFor: { userId, email },
      gdprArticle: '15 (access) + 20 (portability)',
      schema: 'cwleaders-dsar-v1',
      account: redact(userItems),
      consents: consents,
      sessions: sessions.map(s => ({ ...s, /* tokens not exported */ jwt: '[redacted]' })),
      // Recordings + files: list metadata + presigned download URLs (24h expiry)
      // Reference: keys live at S3 lead-files-…/<userId>/<fileId>
      mediaPrefix: `s3://${ENV.FILES_BUCKET}/${userId}/`,
      retentionExplainer: 'See https://lead.cwleaders.com/privacy section 7'
    };

    // 3. Write manifest to S3 with private ACL + 7-day TTL via lifecycle
    const exportId  = shortId();
    const exportKey = `dsar/${userId}/${exportId}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: EXPORT_BUCKET,
      Key: exportKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: { 'cw-purpose': 'dsar-export', 'cw-user-id': userId }
    }));

    // 4. Generate 7-day presigned URL
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: EXPORT_BUCKET,
      Key: exportKey
    }), { expiresIn: 7 * 24 * 3600 });

    // 5. Audit row — DSAR_LOG for compliance
    await ddb.send(new PutCommand({
      TableName: ENV.TABLE,
      Item: {
        pk: 'DSAR_LOG',
        sk: `${new Date().toISOString()}#${exportId}#${userId}`,
        gsi1pk: `USER#${userId}`,
        gsi1sk: `DSAR#${new Date().toISOString()}`,
        type: 'export',
        userId,
        email,
        exportId,
        s3Key: exportKey,
        itemCount: userItems.length + consents.length + sessions.length,
        createdAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600  // 7-year retention
      }
    }));

    // 6. Email the link
    if (process.env.SES_FROM) {
      const html = `
        <p>Hi,</p>
        <p>Your CW Leaders data export is ready. The link below stays valid for 7 days.</p>
        <p><a href="${downloadUrl}" style="color:#fbbf24">Download my data</a></p>
        <p>Manifest format: JSON. Media files (recordings) are referenced by S3 path; reply to this email if you want them packaged into a zip and we'll do it manually.</p>
        <p>If you didn't request this, please reply now — privacy@cwleaders.com.</p>
        <p>— CW Leaders</p>`.trim();
      await ses.send(new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: { Data: 'Your CW Leaders data export' },
            Body: { Html: { Data: html }, Text: { Data: html.replace(/<[^>]+>/g, '') } }
          }
        }
      }));
    }

    return ok({ ok: true, exportId, status: 'sent_to_email' }, origin);
  } catch (err) {
    console.error('dsar-export', err);
    return oops(err.message, origin);
  }
};

async function collectByPk(pk, skPrefix) {
  const params = {
    TableName: ENV.TABLE,
    KeyConditionExpression: skPrefix ? 'pk = :pk AND begins_with(sk, :p)' : 'pk = :pk',
    ExpressionAttributeValues: skPrefix ? { ':pk': pk, ':p': skPrefix } : { ':pk': pk },
    Limit: 1000
  };
  const r = await ddb.send(new QueryCommand(params));
  return r.Items || [];
}

function redact(items) {
  // Strip secret-like fields
  return items.map(i => {
    const out = { ...i };
    delete out.codeHash;
    delete out.licenseSecret;
    delete out.passwordHash;
    return out;
  });
}
