# Security Gate System
**Authority:** server-side enforcement; defense in depth.
**Cross-references:** `STRIDE-THREAT-MODEL.md` · `RUNBOOK.md` · `ACCESS-GATES.md`
**Last revised:** 2026-04-30

---

## 8.1 — RATE LIMITING

### API Gateway level (free, AWS-managed)
- Default: 50 rps steady, 100 burst (per source IP, AWS-detected)
- Stage: `$default` on api ID `qizuwjquh9`

### Application level (Lambda, DDB-backed)

| Endpoint / action | Limit | Window | Exceeded response | UI behaviour |
|---|---|---|---|---|
| `POST /auth/request` | 5 | 15 min | 429 + `retryAfter` | Toast "Wait Ns" + preserve email field |
| `POST /auth/verify` | 10 | 15 min | 429 | Toast + preserve typed code |
| `POST /checkout/session` | 20 | 1 min | 429 | Toast "Slow down — wait Ns" |
| `POST /myhire/applications` | 10 | 1 hour | 429 | Form-level error with retry timer |
| `POST /feedback` (anon) | 5 | 1 hour | 429 | Toast |
| `POST /feedback` (authed) | 20 | 1 hour | 429 | Toast |
| `POST /events`, `/events/batch` | 120 | 1 min | 429 | Silent client-side back-off |
| `POST /agents/run` | tier-based | 1 month | 429 + upgrade CTA | Modal "Upgrade for more" |

All values configurable via `_shared.mjs#rateLimit()`. Backed by DynamoDB atomic increments with TTL.

---

## 8.2 — BOT DETECTION

### Layer 1 — Behavioral signals (free)
- Time between first paint and first interaction (humans usually >300ms)
- Mouse movement entropy on landing page
- Form-fill speed (instantaneous = bot)
- Honey-pot field (`companyWebsite` on hire form, hidden CSS) — already shipped

### Layer 2 — Device fingerprinting (defer)
- Canvas hash, WebGL hash, font list, timezone, screen dims
- Stored in DDB row keyed by hash → cross-session correlation
- `[CUSTOMIZE — implement at >5k MAU when bot abuse rates justify the privacy trade-off]`

### Layer 3 — CAPTCHA (Cloudflare Turnstile)
- Triggers at the edge for suspicious requests (rate-limit hits, anonymous bursts)
- Cloudflare Turnstile is free + privacy-respecting (no Google reCAPTCHA)
- Accessibility fallback: audio challenge + manual review by `support@cwleaders.com`
- `[CUSTOMIZE — wire when first abuse incident; not yet active]`

### Bot score → action

| Score (0-1, 1=bot) | Action |
|---|---|
| 0.0 – 0.3 | Allow |
| 0.3 – 0.7 | Challenge with Turnstile |
| 0.7 – 1.0 | Block + log |
| Repeat blocks within 24h | Add IP to WAFv2 deny list |

---

## 8.3 — SESSION MANAGEMENT

### Tokens
- HS256 JWT signed with 96-char `JWT_SECRET`
- Issued at `/auth/verify` and `/auth/firebase`
- TTL: 14 days sliding (refreshed on every authed call via `/auth/me`)
- Storage: localStorage (planned migration to HttpOnly Cookie auth — `MIGRATION-ROADMAP.md`)

### Idle timeout
- Web SPAs: 24 hours of no activity → JWT expires naturally
- Desktop app: 14 days persistent (license-token model)
- Warning modal at 23h:30m for web sessions:

```
title:     "Still there?"
body:      "We'll sign you out in 30 minutes for your security."
ctaStay:   "I'm here"
ctaSignOut: "Sign me out"
```

### Absolute timeout
- 30 days regardless of activity → require fresh sign-in
- Triggered at JWT verification when `iat > 30 days ago`

### Concurrent session limit

| Tier | Limit |
|---|---|
| Free | 3 active devices |
| Basic | 5 |
| Powerhouse | 10 |
| Agentic / Enterprise | unlimited |

Enforced by tracking session IDs in DDB `pk=USER#<id>, sk=SESSION#<sessionId>`. Above limit → oldest session forcibly invalidated.

### Session invalidation triggers
- Password / email change → all sessions invalidated, force re-auth
- Suspicious activity (anomaly detection) → flag for re-auth
- Manual revoke via Settings → Sessions
- Account deletion → all sessions terminated immediately

### "Remember me"
- Default ON (sliding 14d JWT is the implementation)
- Off → session-only cookie equivalent (clear on browser close); `[CUSTOMIZE — not yet exposed in UI]`

---

## 8.4 — INPUT VALIDATION RULEBOOK

| Input | Client validation | Server validation | Error |
|---|---|---|---|
| Email | Regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`, max 200 | Same + DNS MX check optional | "That's not a valid email." |
| Password | n/a (magic-link) | n/a | n/a |
| Display name | 1-60 chars, trim | Same + reject control chars | "Display name needs 1-60 characters." |
| URL | Must parse with `new URL()` | Same + scheme allowlist (https only for sharing) | "Use a full https:// URL." |
| File (upload) | size + MIME on FileReader | size verified server-side via S3 presign constraints; MIME re-checked at /complete | "File too large." / "File type not supported." |
| Phone | Loose: digits, +, spaces, parens, hyphens, 7-20 chars | Normalized via libphonenumber `[CUSTOMIZE]` | "Enter a phone number including country code." |
| Free text | length cap per field | Same + control-char strip + truncate | per-field |
| Numbers | type=number, min/max | Same + parseInt/parseFloat with isFinite | "Enter a valid number." |
| Date | type=date or ISO format | Same + range check | "Pick a date." / "Date must be in the future." |
| Address | 1-500 chars per line | Same | "{line} is required." |
| Credit card | n/a — Stripe Checkout handles all PAN | n/a | n/a |

**SQL injection:** N/A — DynamoDB doesn't use SQL. Field values still parameterized by SDK.
**XSS:** Output-encoded by default (we use `textContent`/`innerText`, never `innerHTML` with user input). Exceptions audited in code review.
**SSRF:** Outbound `fetch()` calls only target hard-coded provider URLs. User-supplied URLs (e.g., webhook target when we ship public API) will go through allowlist + DNS resolution + RFC1918 block. `[CUSTOMIZE — implement when public API ships]`

---

## 8.5 — ENCRYPTION

### In-transit
- TLS 1.2 minimum (1.3 preferred); enforced by ACM cert + CloudFront viewer protocol policy = `redirect-to-https`
- HSTS preload (already shipped via `cwleaders-secure-headers` policy): `max-age=63072000; includeSubDomains; preload`
- Certificate: ACM-managed, auto-renewing, `*.cwleaders.com`

### At-rest
- DynamoDB: AES-256, AWS-managed KMS keys (default)
- S3: AES-256 server-side encryption (SSE-S3) by default; planned migration to SSE-KMS for compliance docs `[CUSTOMIZE — when SOC 2 conversation triggers]`
- Lambda env vars: AES-256 encrypted by Lambda service; `JWT_SECRET` rotation via runbook §5.5
- CloudWatch logs: encrypted with default `AWSLogs` KMS key

### Field-level
- Currently none. **Planned for Command tier workforce data:** field-level AES-256 with a per-org KMS key so that even AWS console operators can't read it. `[CUSTOMIZE — sprint 2 of post-launch]`

### Backup encryption
- DDB PITR: encrypted with same key as table
- S3 versioning: inherits bucket encryption

### Key rotation
- ACM certs: AWS auto-rotates ~30d before expiry
- KMS CMKs: annual rotation enabled
- JWT_SECRET: 90-day rotation via `RUNBOOK.md` §5.5
- Stripe keys: when chat-leak suspected; minimum annual

---

## 8.6 — ANOMALY DETECTION

| Anomaly | Detection | Threshold | Action | User notification |
|---|---|---|---|---|
| New device sign-in | UA hash + IP geolocation diff | First time on this UA hash | Email "New device sign-in" | Email + audit row |
| Geographic shift | IP geo distance | >500km from last sign-in within 24h | Step-up: email confirm | Email + must confirm before high-value actions |
| Bulk export attempt | DDB pk-scan rate per user | >100 items/min | Throttle + alarm | Banner "Export queued for review" |
| Rapid password / email change | `/auth/profile` mutations | 2+ within 24h | Block + email alert | Email + 24h cooldown |
| Multiple failed `/auth/verify` | Wrong code for known email | >3 in 5 min | Lock 15 min | Modal "Account temporarily locked" |
| Stripe chargeback | Webhook event | Any | Suspend account pending review | Email + grace period |
| Disposable-email signup at scale | Burner domain regex | >5/hour | Captcha required | Silent |

[CUSTOMIZE — anomaly engine spec written; some hooks (bulk-export rate, geo-shift) not yet implemented. Sprint 2.]

---

## 8.7 — SECURITY HEADERS (live, verified)

Already shipped via `cwleaders-secure-headers` CloudFront response-headers policy. Reference values:

```
Content-Security-Policy: default-src 'self' https://*.cwleaders.com;
  script-src 'self' 'unsafe-inline' https://*.cwleaders.com https://www.gstatic.com
            https://*.firebaseapp.com https://apis.google.com https://accounts.google.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.cwleaders.com;
  img-src 'self' data: blob: https:;
  font-src 'self' https://fonts.gstatic.com data:;
  connect-src 'self' https://api.cwleaders.com https://*.cwleaders.com
              https://*.googleapis.com https://*.firebaseio.com
              https://identitytoolkit.googleapis.com https://securetoken.googleapis.com
              https://api.stripe.com;
  frame-src 'self' https://*.firebaseapp.com https://accounts.google.com
            https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com;
  media-src 'self' blob: https://*.cwleaders.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://*.cwleaders.com https://checkout.stripe.com;
  frame-ancestors 'none';
  upgrade-insecure-requests

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin

Permissions-Policy:
  accelerometer=(), camera=(self), display-capture=(self),
  gyroscope=(), magnetometer=(), microphone=(self),
  payment=(self "https://checkout.stripe.com"), usb=(),
  interest-cohort=()

Cross-Origin-Opener-Policy: same-origin-allow-popups
X-CW-Edge: cwleaders-secure-v1
```

### CORS
- Allowlist enforced server-side in `_shared.mjs#corsHeaders`
- Allowed origins: `lead.cwleaders.com`, `studio.cwleaders.com`, `upload.cwleaders.com`, `download.cwleaders.com`, `myhire.cwleaders.com`, `localhost:8080`, `localhost:5173`
- Credentials: never (token in Authorization header, not cookies — for now)
- Methods: GET, POST, PUT, DELETE, OPTIONS

### CSP nonces
- Currently using `'unsafe-inline'` for inline scripts (legacy from rapid bootstrap)
- Migration to nonce-based CSP planned in `MIGRATION-ROADMAP.md`
