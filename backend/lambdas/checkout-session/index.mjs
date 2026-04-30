/* POST /checkout/session
   Body: { tier: "basic" | "powerhouse" | "agentic" | "enterprise_seat" | "enterprise_org",
           email?, quantity?, success_url?, cancel_url? }
   Creates a Stripe Checkout Session and returns the redirect URL.

   Required env: STRIPE_API_KEY, PRICE_MAP_JSON
*/

import { ENV, ok, bad, oops, preflight, parseBody, authFromEvent, rateLimit, tooMany } from './_shared.mjs';
import { withBreaker, fetchWithTimeout } from './_breaker.mjs';

const PRICE_MAP = process.env.PRICE_MAP_JSON ? JSON.parse(process.env.PRICE_MAP_JSON) : {};

// PRICE_MAP shape:
// {
//   "basic":           { "price": "price_xxx", "mode": "payment" },
//   "powerhouse":      { "price": "price_xxx", "mode": "payment" },
//   "agentic":         { "price": "price_xxx", "mode": "subscription" },
//   "enterprise_seat": { "price": "price_xxx", "mode": "subscription" },
//   "enterprise_org":  { "price": "price_xxx", "mode": "subscription" }
// }

export const handler = async (event) => {
  const pf = preflight(event); if (pf) return pf;
  const origin = event.headers?.origin;
  if (!process.env.STRIPE_API_KEY) return bad('stripe not configured', origin);

  // Rate limit: 20 checkout creations per minute per IP (more than enough for real shoppers)
  const rl = await rateLimit({ event, key: 'checkout', limit: 20, windowSec: 60 });
  if (!rl.ok) return tooMany(rl.retryAfter, origin);

  try {
    const body = parseBody(event);
    const auth = authFromEvent(event);
    const email = (body.email || auth?.email || '').trim().toLowerCase();
    const tier = body.tier;
    const quantity = Math.max(1, parseInt(body.quantity || '1', 10));

    const priceCfg = PRICE_MAP[tier];
    if (!priceCfg) return bad(`unknown tier: ${tier}`, origin);

    const success = safeRedirect(body.success_url, `https://studio.cwleaders.com/unlock?session={CHECKOUT_SESSION_ID}`);
    const cancel  = safeRedirect(body.cancel_url,  `https://studio.cwleaders.com/?cancel=1`);

    const params = new URLSearchParams();
    params.set('mode', priceCfg.mode || 'payment');
    params.set('line_items[0][price]', priceCfg.price);
    params.set('line_items[0][quantity]', String(quantity));
    params.set('success_url', success);
    params.set('cancel_url', cancel);
    params.set('allow_promotion_codes', 'true');
    if (email) params.set('customer_email', email);
    params.set('metadata[tier]', tier);
    if (auth?.sub) params.set('metadata[userId]', auth.sub);
    if (auth?.email) params.set('metadata[email]', auth.email);

    let data;
    try {
      data = await withBreaker('stripe-api', async () => {
        const r = await fetchWithTimeout('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.STRIPE_API_KEY}`,
            'content-type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        }, 10000);
        const j = await r.json();
        if (!r.ok) {
          const e = new Error(j.error?.message || 'stripe error');
          e.status = r.status;
          e.upstream = j;
          throw e;
        }
        return j;
      });
    } catch (err) {
      if (err.code === 'CIRCUIT_OPEN') {
        return { statusCode: 503, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'payments temporarily unavailable, please try again in a moment' }) };
      }
      console.error('stripe checkout error', err);
      return bad(err.message || 'stripe error', origin);
    }
    return ok({ url: data.url, sessionId: data.id }, origin);
  } catch (err) {
    console.error('checkout-session', err);
    return oops(err.message, origin);
  }
};

// CRIT-3 fix: only allow redirects back to our own domains
const ALLOWED_REDIRECT_HOSTS = new Set([
  'lead.cwleaders.com', 'studio.cwleaders.com', 'upload.cwleaders.com',
  'download.cwleaders.com', 'myhire.cwleaders.com'
]);
function safeRedirect(url, fallback) {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return fallback;
    if (!ALLOWED_REDIRECT_HOSTS.has(u.hostname)) return fallback;
    return u.toString();
  } catch { return fallback; }
}
