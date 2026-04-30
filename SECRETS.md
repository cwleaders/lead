# LEAD — Secrets & Environment Setup

Everything is deployed and code-complete. The remaining work is **paste these env vars into the right Lambdas** to flip the revenue switches.

All commands assume you are in the repo root with `aws` CLI authenticated to account `069422358723` (region `us-east-1`).

---

## 1. JWT signing secret (DO THIS FIRST)

The current default is a placeholder. Generate a strong secret and inject it into every Lambda that issues or verifies JWTs:

```bash
JWT_SECRET=$(openssl rand -hex 48)
echo "Generated JWT_SECRET (save this somewhere safe): $JWT_SECRET"

for fn in lead-auth-request lead-auth-verify lead-auth-me \
          lead-presign-upload lead-checkout-session \
          lead-license-validate lead-admin-snapshot \
          lead-enterprise-org lead-telemetry-ingest; do
  current=$(aws lambda get-function-configuration --function-name $fn \
    --query 'Environment.Variables' --output json)
  patched=$(echo "$current" | python3 -c "
import json,sys,os
v = json.load(sys.stdin) or {}
v['JWT_SECRET'] = os.environ['JWT_SECRET']
print(json.dumps(v))" )
  aws lambda update-function-configuration --function-name $fn \
    --environment "Variables=$patched" >/dev/null && echo "  ✓ $fn"
done
```

---

## 2. SES verified sender (for magic-link emails + license delivery)

The `cwleaders.com` domain already has SES DKIM records. Verify production access in SES, then:

```bash
SES_FROM="noreply@cwleaders.com"   # or whatever you want

for fn in lead-auth-request lead-stripe-webhook; do
  current=$(aws lambda get-function-configuration --function-name $fn \
    --query 'Environment.Variables' --output json)
  patched=$(echo "$current" | SES_FROM=$SES_FROM python3 -c "
import json,sys,os
v = json.load(sys.stdin) or {}
v['SES_FROM'] = os.environ['SES_FROM']
print(json.dumps(v))" )
  aws lambda update-function-configuration --function-name $fn \
    --environment "Variables=$patched" >/dev/null && echo "  ✓ $fn"
done
```

If your SES account is still in sandbox, [request production access](https://console.aws.amazon.com/ses/home#/account) — usually approved in a few hours.

---

## 3. Stripe (the revenue switch)

### 3a. Create products in Stripe Dashboard

In your **already-connected Stripe account**, create these 5 products and copy each Price ID:

| Product | Mode | Amount | Used by |
|---|---|---|---|
| LEAD Basic Capture | One-time | $4.99 | `tier=basic` |
| LEAD Visual Powerhouse | One-time | $19.99 | `tier=powerhouse` |
| LEAD Agentic Cloud | Subscription · monthly | $4.99 (or $29.99 + $4.99/mo via setup fee) | `tier=agentic` |
| LEAD Enterprise Org Activation | Subscription · yearly | $99.99/yr | `tier=enterprise_org` |
| LEAD Enterprise Seat | Subscription · monthly | $19.99/mo | `tier=enterprise_seat` |

You can also let me create them if you re-authenticate the Stripe MCP connector (Settings → Connectors → Stripe).

### 3b. Inject Stripe keys + price map

```bash
STRIPE_API_KEY="sk_live_xxxxx"           # or sk_test_xxxxx during dev
STRIPE_WEBHOOK_SECRET="whsec_xxxxx"      # from Stripe → Webhooks → Add endpoint

# Replace the price_xxx placeholders with your real Stripe price IDs:
PRICE_MAP='{
  "basic":           {"price":"price_basic_id_here","mode":"payment"},
  "powerhouse":      {"price":"price_powerhouse_id_here","mode":"payment"},
  "agentic":         {"price":"price_agentic_id_here","mode":"subscription"},
  "enterprise_org":  {"price":"price_org_activation_id","mode":"subscription"},
  "enterprise_seat": {"price":"price_seat_id_here","mode":"subscription"}
}'

# Push to checkout-session Lambda:
current=$(aws lambda get-function-configuration --function-name lead-checkout-session \
  --query 'Environment.Variables' --output json)
patched=$(echo "$current" | STRIPE_API_KEY=$STRIPE_API_KEY PRICE_MAP_JSON="$PRICE_MAP" python3 -c "
import json,sys,os
v=json.load(sys.stdin) or {}
v['STRIPE_API_KEY']=os.environ['STRIPE_API_KEY']
v['PRICE_MAP_JSON']=os.environ['PRICE_MAP_JSON']
print(json.dumps(v))")
aws lambda update-function-configuration --function-name lead-checkout-session \
  --environment "Variables=$patched"

# Push to stripe-webhook Lambda:
current=$(aws lambda get-function-configuration --function-name lead-stripe-webhook \
  --query 'Environment.Variables' --output json)
patched=$(echo "$current" | STRIPE_API_KEY=$STRIPE_API_KEY \
  STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET PRICE_MAP_JSON="$PRICE_MAP" python3 -c "
import json,sys,os
v=json.load(sys.stdin) or {}
v['STRIPE_API_KEY']=os.environ['STRIPE_API_KEY']
v['STRIPE_WEBHOOK_SECRET']=os.environ['STRIPE_WEBHOOK_SECRET']
v['PRICE_MAP_JSON']=os.environ['PRICE_MAP_JSON']
print(json.dumps(v))")
aws lambda update-function-configuration --function-name lead-stripe-webhook \
  --environment "Variables=$patched"
```

### 3c. Point Stripe webhook at the API

In Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://api.cwleaders.com/stripe/webhook`
- **Events:** `checkout.session.completed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` above.

---

## 4. Admin emails (gate the /admin dashboard)

```bash
ADMIN_EMAILS="you@cwleaders.com,cofounder@cwleaders.com"

current=$(aws lambda get-function-configuration --function-name lead-admin-snapshot \
  --query 'Environment.Variables' --output json)
patched=$(echo "$current" | ADMIN_EMAILS=$ADMIN_EMAILS python3 -c "
import json,sys,os
v=json.load(sys.stdin) or {}
v['ADMIN_EMAILS']=os.environ['ADMIN_EMAILS']
print(json.dumps(v))")
aws lambda update-function-configuration --function-name lead-admin-snapshot \
  --environment "Variables=$patched"
```

---

## 5. Apple Developer ID (for desktop app notarization — Phase 3+)

Not needed yet. When the Tauri build is ready, add these to your CI environment:
- `APPLE_ID`, `APPLE_ID_PASSWORD` (app-specific password from appleid.apple.com)
- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE` (Developer ID Application, base64-encoded)

---

## 6. Verify everything works

```bash
# Magic link should now actually send an email
curl -X POST https://api.cwleaders.com/auth/request \
  -H 'content-type: application/json' \
  -d '{"email":"YOUR_EMAIL"}'

# Check your inbox for the 6-digit code, then:
curl -X POST https://api.cwleaders.com/auth/verify \
  -H 'content-type: application/json' \
  -d '{"email":"YOUR_EMAIL","code":"123456"}'

# Should return { jwt, user }

# Test Stripe checkout (after step 3):
curl -X POST https://api.cwleaders.com/checkout/session \
  -H 'content-type: application/json' \
  -d '{"tier":"basic","email":"test@example.com"}'

# Should return { url: "https://checkout.stripe.com/..." }
```

---

## What's still using a placeholder

| Component | Default | Risk |
|---|---|---|
| `JWT_SECRET` | `lead-dev-secret-change-me` | **Critical — fix immediately.** Anyone who reads the code can forge tokens. |
| `STRIPE_API_KEY` | unset | Buy buttons return 400 |
| `STRIPE_WEBHOOK_SECRET` | unset | Webhook rejects all events |
| `PRICE_MAP_JSON` | `{}` | Checkout returns "unknown tier" |
| `SES_FROM` | unset | Magic-link emails silently fail |
| `ADMIN_EMAILS` | `admin@cwleaders.com` | /admin only opens for that one email |

**Fix `JWT_SECRET` first**, then SES, then Stripe. That's the order to revenue.
