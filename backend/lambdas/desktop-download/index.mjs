/* GET /desktop/download?platform={mac|win|linux|auto}
   Issues a 302 redirect to the latest installer for the requested platform.
   Tracks each download (event row in DDB) so we can attribute virality.

   ?auto sniffs the User-Agent and picks the right installer.
*/

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV, ipHash, shortId } from './_shared.mjs';

const s3 = new S3Client({ region: ENV.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const INSTALLERS_BUCKET = process.env.INSTALLERS_BUCKET || `lead-installers-${process.env.AWS_ACCOUNT_ID || ''}`;
const MANIFEST_KEY = 'manifest/latest.json';

let manifestCache = null;
let manifestCacheExpires = 0;
async function getManifest() {
  if (manifestCache && Date.now() < manifestCacheExpires) return manifestCache;
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: INSTALLERS_BUCKET, Key: MANIFEST_KEY }));
    manifestCache = JSON.parse(await r.Body.transformToString('utf-8'));
    manifestCacheExpires = Date.now() + 60_000;
    return manifestCache;
  } catch { return null; }
}

function detectPlatform(ua = '') {
  const u = ua.toLowerCase();
  if (u.includes('mac') || u.includes('darwin')) {
    if (u.includes('arm64') || u.includes('aarch64')) return 'mac-aarch64';
    return 'mac-x86_64';
  }
  if (u.includes('windows') || u.includes('win64') || u.includes('win32')) return 'win-x86_64';
  if (u.includes('linux')) return 'linux-x86_64';
  return null;
}

const PLATFORM_ALIAS = {
  mac: 'mac-aarch64',
  win: 'win-x86_64',
  linux: 'linux-x86_64',
  windows: 'win-x86_64',
  darwin: 'mac-aarch64',
  'mac-aarch64': 'mac-aarch64',
  'mac-x86_64': 'mac-x86_64',
  'win-x86_64': 'win-x86_64',
  'linux-x86_64': 'linux-x86_64',
};

const FRIENDLY_NOT_AVAILABLE = `
<!doctype html><html><head><meta charset="utf-8"><title>Coming soon</title>
<style>body{background:#0a0e1a;color:#e8eaf2;font-family:-apple-system,Inter,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;text-align:center}h1{font-size:32px;margin-bottom:12px}p{color:#8a93b3;line-height:1.55}a{color:#fbbf24}</style>
</head><body>
<h1>Studio is on the way.</h1>
<p>The free desktop app for Mac, Windows, and Linux is in final QA. We'll email everyone on the waitlist the moment it's ready.</p>
<p style="margin-top:24px"><a href="https://studio.cwleaders.com">← Back to Studio</a></p>
</body></html>`;

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const ua = event.headers?.['user-agent'] || '';
  const fromParam = event.headers?.['x-lead-from'] || qs.from || '';

  let target = qs.platform || 'auto';
  if (target === 'auto') target = detectPlatform(ua) || 'mac-aarch64';
  target = PLATFORM_ALIAS[target] || target;

  const manifest = await getManifest();
  const bundle = manifest?.platforms?.[target];

  // Track the click regardless of outcome
  const installId = shortId(12);
  ddb.send(new PutCommand({
    TableName: ENV.TABLE,
    Item: {
      pk: `EVENT#${new Date().toISOString().slice(0,10)}`,
      sk: `DOWNLOAD#${Date.now()}#${installId}`,
      gsi2pk: 'DESKTOP_DOWNLOADS',
      gsi2sk: new Date().toISOString(),
      installId,
      platform: target,
      version: manifest?.version || null,
      ua,
      from: fromParam || null,
      ipHash: ipHash(event),
      ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 3600,
    }
  })).catch(e => console.warn('download log', e.message));

  if (!bundle?.installerKey) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: FRIENDLY_NOT_AVAILABLE,
    };
  }

  // Generate a presigned URL to the installer (5 min, single use)
  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: INSTALLERS_BUCKET,
    Key: bundle.installerKey,
    ResponseContentDisposition: `attachment; filename="${bundle.installerName || 'CW-Leaders-Studio'}"`,
  }), { expiresIn: 300 });

  return { statusCode: 302, headers: { location: url, 'cache-control': 'no-store' }, body: '' };
};
