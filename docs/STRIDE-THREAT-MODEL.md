# STRIDE Threat Model — CW Leaders Studio
**Last revised:** 2026-04-30 · **Audit cadence:** quarterly

---

## SCOPE

In scope: 5 web SPAs + Tauri desktop + 16 Lambdas + DynamoDB + S3 + Stripe + Firebase + AI providers.
Out of scope: end-user device security; AWS account-level compromise (covered separately in `RUNBOOK.md` §4).

## ASSETS (data flows)

| ID | Asset | Sensitivity |
|---|---|---|
| A1 | Customer Personal Data (email, name, payment metadata) | High |
| A2 | Authentication tokens (JWT, magic-link codes) | Critical |
| A3 | Stripe live keys + webhook secret | Critical |
| A4 | User-uploaded files (recordings, attachments) | High (user-confidential) |
| A5 | AI prompts (potentially proprietary IP) | High |
| A6 | Hiring application data (PII + Skill Check recordings) | Very High (employment law) |
| A7 | Workforce-monitoring data (Command tier) | Very High (employment law) |

## TRUST BOUNDARIES

```
[End user browser]   ←TLS→   [CloudFront]   ←HTTPS→   [API Gateway]   →   [Lambda]   →   [DDB / S3]
                                                          │                  │
                                                          └──→ [Stripe]      └──→ [AI providers]
```

---

## STRIDE — Top 10 Vectors with mitigations

### S — Spoofing

**T1. Forged JWT** — attacker mints a JWT for another user.
**Mitigation:** HS256 signature with 96-char `JWT_SECRET` (env-encrypted, ≠ default). Server verifies on every authed call (`authFromEvent` in `_shared.mjs`). **Status: ✅ closed.**

**T2. Forged Firebase ID token** — attacker submits an ID token for an account they don't own.
**Mitigation:** `auth-firebase` Lambda independently verifies token via Google's published RSA keys; checks `aud`, `iss`, `exp`, `iat`. Doesn't trust the client. **Status: ✅ closed.**

### T — Tampering

**T3. Tampered Stripe webhook** — attacker fakes a checkout-completed event to issue free licenses.
**Mitigation:** `stripe-webhook` Lambda verifies HS256 signature with `STRIPE_WEBHOOK_SECRET` and `crypto.timingSafeEqual`. Rejects malformed timestamps. **Status: ✅ closed.**

**T4. Tampered file upload (size/type bypass)** — attacker submits a 5GB upload claiming it's 1MB.
**Mitigation:** S3 enforces presigned URL constraints; `complete-upload` Lambda re-checks actual size. **Status: ✅ closed.**

### R — Repudiation

**T5. User claims "I didn't subscribe"** after a Stripe charge.
**Mitigation:** Stripe holds payment-intent record + signed receipt; Lambda logs `checkout.session.completed` with userId. CloudWatch retention 30d. For older disputes, Stripe's own retention is authoritative. **Status: ⚠️ partial — extend log retention to 1y for billing-related events.**

### I — Information Disclosure

**T6. PII leak via API error message** — internal stack trace leaks user email or account internals.
**Mitigation:** All Lambdas use `oops()` helper which returns generic `{error: "internal"}`. No stack traces in production responses. **Status: ✅ closed.**

**T7. Anonymous file shared with attacker** — uploader shares link, attacker brute-forces other tokens.
**Mitigation:** File tokens are 16-char base32 (`shortId`), >10²⁴ namespace. Anonymous files TTL 24h. Auth required for >100MB. **Status: ✅ closed.**

**T8. CORS misconfiguration leaks credentialed responses to attacker site.**
**Mitigation:** `_shared.mjs#corsHeaders` allowlists only the 5 cwleaders.com origins + localhost. Origin not in list defaults to first allowed (no wildcard). **Status: ✅ closed.**

### D — Denial of Service

**T9. /auth/request flood** — attacker sends millions of magic-link emails to exhaust SES quota.
**Mitigation:** API GW throttle 50rps + Lambda IP rate-limit 5/15min. SES quota 50k/day with backoff. **Status: ✅ closed.**

**T10. AI provider exhaustion** — attacker sends huge prompts to drain Gemini/Claude quota.
**Mitigation:** Circuit breakers (Phase 5) trip after 5 failures; per-user credit budget enforces budget per tier (planned in `_entitlements.mjs`). **Status: ⚠️ partial — credit budget not yet enforced server-side.**

### E — Elevation of Privilege

**T11. Regular user reads admin endpoints.**
**Mitigation:** Admin endpoints (`/admin/*`) check `payload.role === 'admin'` server-side. Currently only one admin email allowlisted in env var. **Status: ✅ closed for v1.**

---

## SUMMARY

| Category | Vectors mapped | Closed | Partial | Open |
|---|---|---|---|---|
| Spoofing | 2 | 2 | 0 | 0 |
| Tampering | 2 | 2 | 0 | 0 |
| Repudiation | 1 | 0 | 1 | 0 |
| Information Disclosure | 3 | 3 | 0 | 0 |
| Denial of Service | 2 | 1 | 1 | 0 |
| Elevation of Privilege | 1 | 1 | 0 | 0 |
| **TOTAL** | **11** | **9** | **2** | **0** |

**Coverage: 9/11 fully closed, 2 partial mitigations identified.** No open vectors at this surface.

## REMAINING WORK
1. T5 — Extend Stripe-billing-event log retention to 1y (CloudWatch group selector). Effort: 0.1d.
2. T10 — Wire `_entitlements.mjs` credit-budget enforcement on agent-runtime. Effort: 1d.

Both tasks scheduled in `MIGRATION-ROADMAP.md`.
