/* POST /stripe/webhook
   Verifies Stripe signature, generates a license key on successful checkout,
   stores it in DynamoDB, emails it via SES.

   Required env:
     STRIPE_WEBHOOK_SECRET  (whsec_…)
     STRIPE_API_KEY         (sk_live_… or sk_test_…)
     SES_FROM               (verified sender)
*/

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import crypto from 'node:crypto';
import { ENV, ok, bad, oops, licenseKey, shortId } from './_shared.mjs';
import { licenseDeliveryEmail } from './_email-templates.mjs';
import { withBreaker, fetchWithTimeout } from './_breaker.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: ENV.REGION }));
const ses = new SESv2Client({ region: ENV.REGION });

const PRICE_TO_TIER = {
  // Filled in at deploy after Stripe products created.
  // Format: 'price_XXX': 'basic' | 'powerhouse' | 'agentic'
  ...(process.env.PRICE_MAP_JSON ? JSON.parse(process.env.PRICE_MAP_JSON) : {})
};

export const handler = async (event) => {
  try {
    const sig = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
    const payload = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    if (!verifyStripeSig(payload, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
      return bad('invalid signature');
    }

    const evt = JSON.parse(payload);

    if (evt.type !== 'checkout.session.completed') {
      return ok({ ignored: evt.type });
    }

    const session = evt.data.object;
    const email = session.customer_details?.email || session.customer_email;
    const lineItems = await fetchLineItems(session.id);

    const generated = [];
    for (const li of lineItems) {
      const tier = PRICE_TO_TIER[li.price.id];
      if (!tier) {
        console.warn('unmapped price', li.price.id);
        continue;
      }
      const key = licenseKey();
      const norm = key.replace(/-/g, '');
      await ddb.send(new PutCommand({
        TableName: ENV.TABLE,
        Item: {
          pk: `LICENSE#${norm}`, sk: 'META',
          gsi1pk: `LICENSE#${norm}`, gsi1sk: 'META',
          gsi2pk: `EMAIL#${(email||'').toLowerCase()}`,
          gsi2sk: `LICENSE#${Date.now()}`,
          key, tier, email,
          stripeSession: session.id,
          stripePrice: li.price.id,
          maxMachines: 3, machines: [],
          createdAt: new Date().toISOString(),
          revoked: false
        }
      }));
      generated.push({ key, tier });
    }

    // Upgrade the user's plan immediately if we know who they are.
    // The highest tier purchased wins.
    if (email && generated.length) {
      const RANK = { studio: 1, creator: 2, pro: 3, teams: 4, enterprise_seat: 4, enterprise_org: 5 };
      const winner = generated
        .map(g => g.tier)
        .sort((a, b) => (RANK[b] || 0) - (RANK[a] || 0))[0];
      const planMap = {
        studio: 'studio',
        creator: 'creator',
        pro: 'pro',
        teams: 'teams',
        enterprise_seat: 'enterprise',
        enterprise_org:  'enterprise'
      };
      const newPlan = planMap[winner] || 'free';
      const userPk = `USER#${email.toLowerCase()}`;
      const profile = await ddb.send(new GetCommand({
        TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' }
      })).catch(() => ({ Item: null }));
      if (profile.Item) {
        await ddb.send(new UpdateCommand({
          TableName: ENV.TABLE, Key: { pk: userPk, sk: 'PROFILE' },
          UpdateExpression: 'SET #p = :p, planUpgradedAt = :t, lastStripeSession = :s',
          ExpressionAttributeNames: { '#p': 'plan' },
          ExpressionAttributeValues: {
            ':p': newPlan,
            ':t': new Date().toISOString(),
            ':s': session.id
          }
        }));
      } else {
        // No account yet — auto-provision one so their plan applies on first sign-in
        await ddb.send(new PutCommand({
          TableName: ENV.TABLE,
          Item: {
            pk: userPk, sk: 'PROFILE',
            gsi1pk: `EMAIL#${email.toLowerCase()}`, gsi1sk: 'PROFILE',
            userId: shortId(12),
            email: email.toLowerCase(),
            plan: newPlan,
            provider: 'stripe-direct',
            createdAt: new Date().toISOString(),
            planUpgradedAt: new Date().toISOString(),
            lastStripeSession: session.id
          }
        }));
      }
      await sendLicenseEmail(email, generated);
    }

    return ok({ generated: generated.length });
  } catch (err) {
    console.error('stripe-webhook error', err);
    return oops(err.message);
  }
};

function verifyStripeSig(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
}

async function fetchLineItems(sessionId) {
  return withBreaker('stripe-api', async () => {
    const res = await fetchWithTimeout(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=20&expand[]=data.price`,
      { headers: { authorization: `Bearer ${process.env.STRIPE_API_KEY}` } },
      8000
    );
    if (!res.ok) throw new Error(`stripe line_items ${res.status}`);
    const data = await res.json();
    return data.data || [];
  });
}

async function sendLicenseEmail(email, licenses) {
  // displayName is best-effort; pulled from optional Stripe customer metadata if present
  const tmpl = licenseDeliveryEmail({
    displayName: '',
    licenses,
    downloadUrl: 'https://studio.cwleaders.com'
  });
  await ses.send(new SendEmailCommand({
    FromEmailAddress: process.env.SES_FROM || 'CW Leaders <noreply@cwleaders.com>',
    Destination: { ToAddresses: [email] },
    Content: {
      Simple: {
        Subject: { Data: tmpl.subject },
        Body: {
          Html: { Data: tmpl.html },
          Text: { Data: tmpl.text }
        }
      }
    }
  }));
}
