/* GET /desktop/update?platform={target}-{arch}&current={current_version}&channel={stable|previous|beta}
   Tauri's updater plugin calls this on every app launch.

   Channels (release-audit P1-32 rollback support):
     stable    — manifest/latest.json   (default)
     previous  — manifest/previous.json (rollback target if a release breaks)
     beta      — manifest/beta.json     (opt-in early access)

   Response shape (when an update is available):
     {
       "version":   "0.2.0",
       "notes":     "Highlights of what's new",
       "pub_date":  "2026-05-01T12:00:00Z",
       "platforms": {
         "mac-aarch64": { "signature": "...", "url": "https://..." }
       }
     }

   Response shape (no update): HTTP 204 No Content
*/

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ENV } from './_shared.mjs';

const s3 = new S3Client({ region: ENV.REGION });
const INSTALLERS_BUCKET = process.env.INSTALLERS_BUCKET || `lead-installers-${process.env.AWS_ACCOUNT_ID || ''}`;

const MANIFEST_KEYS = {
  stable:   'manifest/latest.json',
  previous: 'manifest/previous.json',
  beta:     'manifest/beta.json'
};

const manifestCache = new Map();   // channel-key → { value, expires }

async function getManifest(channel = 'stable') {
  const key = MANIFEST_KEYS[channel] || MANIFEST_KEYS.stable;
  const cached = manifestCache.get(key);
  if (cached && Date.now() < cached.expires) return cached.value;
  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: INSTALLERS_BUCKET,
      Key: key,
    }));
    const text = await resp.Body.transformToString('utf-8');
    const value = JSON.parse(text);
    manifestCache.set(key, { value, expires: Date.now() + 60_000 });
    return value;
  } catch (err) {
    if (err.name === 'NoSuchKey') return null;
    throw err;
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10));
  const pb = b.split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const platform = qs.platform || 'unknown';
  const current  = qs.current  || '0.0.0';
  const channel  = MANIFEST_KEYS[qs.channel] ? qs.channel : 'stable';

  try {
    const manifest = await getManifest(channel);
    if (!manifest) {
      return { statusCode: 204, headers: { 'cache-control': 'public, max-age=60', 'x-cw-channel': channel }, body: '' };
    }
    if (compareVersions(manifest.version, current) <= 0) {
      return { statusCode: 204, headers: { 'cache-control': 'public, max-age=60', 'x-cw-channel': channel }, body: '' };
    }
    const platformBundle = manifest.platforms?.[platform];
    if (!platformBundle) {
      return { statusCode: 204, headers: { 'cache-control': 'public, max-age=60', 'x-cw-channel': channel }, body: '' };
    }

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
        'x-cw-channel': channel
      },
      body: JSON.stringify({
        version:  manifest.version,
        notes:    manifest.notes || '',
        pub_date: manifest.pub_date || new Date().toISOString(),
        platforms: { [platform]: platformBundle }
      })
    };
  } catch (err) {
    console.error('desktop-update', err);
    return { statusCode: 204, headers: {}, body: '' };
  }
};
