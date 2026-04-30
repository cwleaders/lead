# Compliance Implementation Map
**Owner:** founder (acting DPO until appointed)
**Last revised:** 2026-04-30 · **Audit cadence:** quarterly

---

## 3.1 — REGULATION × REQUIREMENT × IMPLEMENTATION TABLE

### GDPR / UK GDPR

| Requirement | Implementation | Status | Owner |
|---|---|---|---|
| Lawful basis for processing (Art. 6) | Documented per data category in privacy.html §3 | ✅ | DPO |
| Information notice (Art. 13) | privacy.html (12 sections, plain English) | ✅ | DPO |
| Data subject rights — access, rectify, erase, portability, restrict, object (Art. 15-22) | DSAR endpoint at `privacy@cwleaders.com` + 30-day response | ✅ | DPO |
| Consent — granular, withdrawable, demonstrable (Art. 7) | Cookie consent banner (Phase 6) + per-feature consent (Phase 6.6) | ⚠️ pending | Frontend |
| Records of processing activities (Art. 30) | This document + privacy.html | ✅ | DPO |
| DPO appointment (Art. 37) | Solo founder acts; appoint or contract by 5k MAU | ⚠️ | Founder |
| DPIA for high-risk processing (Art. 35) | Done for Command tier in dpa.html §14 | ✅ | DPO |
| Breach notification 72h to supervisor; without undue delay to subjects (Art. 33-34) | RUNBOOK.md §3 + dpa.html §9 | ✅ | RUNBOOK |
| International transfer mechanism (Art. 44-49) | SCCs Module 2 incorporated by reference in dpa.html §12; Schrems II add'l safeguards | ✅ | DPO |
| Sub-processor disclosure (Art. 28) | subprocessors.html + 30-day notice | ✅ | DPO |
| Privacy by design / default (Art. 25) | Local-first architecture; opt-out of cloud sync | ✅ | Eng |
| Children — no processing under 16 without parental consent (Art. 8) | Privacy §10 + Terms gate users to 16+ | ✅ | Product |
| Right to lodge complaint with supervisor | privacy.html §8 | ✅ | DPO |

### CCPA / CPRA (California)

| Requirement | Implementation | Status |
|---|---|---|
| Notice at collection | privacy.html + cookies.html | ✅ |
| Right to know, delete, correct, limit use of sensitive PI | DSAR pipeline at `privacy@cwleaders.com` + Privacy §8 | ✅ |
| "Do Not Sell or Share" link | Compliance footer link injected by `nav.js` | ✅ |
| Service Provider role declaration | dpa.html §17 | ✅ |
| 12-month look-back for disclosures | DDB query + manual export procedure documented | ⚠️ — formalize procedure |
| Sensitive PI (SPI) special protections | Defined in privacy §3.5 (Command); not collected elsewhere | ✅ |
| Annual privacy notice update | Reviewed each April | ✅ |

### PCI DSS (via Stripe SAQ A)

| Requirement | Implementation | Status |
|---|---|---|
| Never touch raw PAN | Stripe Checkout (hosted) — we receive only `last4` and tokens | ✅ |
| Quarterly vulnerability scan | Tenable / Qualys [CUSTOMIZE — schedule when first enterprise demands] | ⚠️ |
| Annual SAQ A | Self-attest at `stripe.com/dashboard/settings/compliance` | ⚠️ Q1 2027 |
| Cardholder data flow diagram | None needed — no CHD ever touches our infra | ✅ N/A |

### EU AI Act (Limited-Risk classification)

| Requirement | Implementation | Status |
|---|---|---|
| Disclose AI use to users (Art. 52) | "Powered by Gemini/Claude" tooltip on agent panel + privacy.html §3 | ⚠️ — verify tooltip visible |
| Mark AI-generated content | Watermark/tag on AI-generated debriefs in Studio canvas | ⚠️ — implement before launch |
| Risk assessment if classification rises | Quarterly review of new AI features against high-risk list | ✅ scheduled |
| Prohibited use (no biometric ID, no social scoring, no manipulation of vulnerable populations) | AUP §2.5 explicitly forbids | ✅ |

### ADA / WCAG 2.2 AA

| Requirement | Implementation | Status |
|---|---|---|
| Color contrast 4.5:1 body / 3:1 large text | Tokens audited; one bump pending (`--t3` → `--t3-on-surface`) | ✅ |
| Keyboard navigation full coverage | Verified across 5 SPAs; canvas drag-keyboard alternative pending v0.2 | ⚠️ |
| Screen-reader semantic HTML | Verified; toast region added in this pass | ✅ |
| 200% zoom without horizontal scroll | Verified | ✅ |
| Captions / transcripts for video features | Whisper local transcription, free | ✅ |
| Accessibility statement | accessibility.html | ✅ |
| Feedback channel | accessibility@cwleaders.com, 5-day response | ✅ |
| External audit | Scheduled post-launch (Deque or APX) [CUSTOMIZE budget] | ⚠️ |

---

## 3.2 — CONSENT MANAGEMENT SPECIFICATION

### Consent types

| ID | Purpose | Legal basis | UI mechanism | Storage | Withdrawal |
|---|---|---|---|---|---|
| `tos_accept` | Terms of Service | Contract | Sign-up flow checkbox | DDB `pk=USER#<id>, sk=CONSENT#tos#<version>` with hash | New signup required to re-accept |
| `privacy_notice` | Privacy notice | Statutory (GDPR Art. 13) | Sign-up flow notice + link | Same row as tos_accept | n/a (informational) |
| `cookie_essential` | Strictly-necessary cookies | Legitimate interest | Implicit on first load | `cw.consent` localStorage key | n/a (cannot withdraw — required) |
| `cookie_analytics` | First-party analytics | Consent | Cookie banner toggle | `cw.consent` JSON `{analytics:true}` | Banner re-open via footer link |
| `cookie_marketing` | Marketing — N/A in v1 (no marketing cookies) | Consent | Banner toggle (defaults OFF, locked OFF in v1) | n/a | n/a |
| `marketing_email` | Product update emails | Consent | Settings toggle (default OFF) | DDB user record `prefs.emailMarketing` | Settings toggle or unsubscribe link |
| `ai_cloud_processing` | Send prompts to cloud AI | Contract + transparency | First-use modal in Studio | DDB user record `prefs.aiCloudOptIn` | Settings → AI → toggle off |
| `command_workforce` | Workforce monitoring (Command tier) | Customer's lawful basis (B2B) | Activation flow with documented notice | DDB org record `command.activatedAt`, `command.notice URL`, `command.consentRecord[]` | Org admin Settings + 14-day grace |

### Consent log schema (DDB)

```
pk:        USER#<userId>
sk:        CONSENT#<scope>#<isoTimestamp>
gsi1pk:    CONSENT
gsi1sk:    <isoTimestamp>#<scope>
scope:     tos | privacy | cookie_analytics | marketing_email | ...
docHash:   sha256 of accepted document text
docVersion: e.g. 1.0
ipHash:    16-char SHA-256 of IP+salt
userAgent: trimmed UA string
geo:       2-letter country code
method:    signup | banner | settings | api
ttl:       7 years (legal hold) — 220924800 seconds
```

### Re-consent triggers

- Terms version change → in-app modal blocking actions until re-accept
- Privacy material change (per privacy.html §11) → 14-day banner + email
- Cookie consent expiry → 12 months from last grant

---

## 3.3 — DATA MAP

| Data element | Source | Storage | Encryption | Retention | Legal basis | Shared with | Cross-border | Deletion |
|---|---|---|---|---|---|---|---|---|
| Email | User signup | DDB `lead-table` pk=USER | AES-256 at rest | 90d post-account-close | Contract | Stripe (billing email), SES (delivery) | US (AWS) | DSAR + 30d |
| Auth code (hashed) | `/auth/request` | DDB pk=AUTHCODE, TTL 15min | AES-256 | 15 min | Contract | none | US | TTL auto |
| JWT session | Server-issued | localStorage | TLS only (client side) | 14d sliding | Contract | none | n/a | Logout/clear |
| Stripe customer ID | `/checkout/session` | DDB pk=USER, attribute | AES-256 | 7y (tax) | Legal obligation | Stripe | Stripe global | 7y purge cron |
| Last 4 of card | Stripe webhook | DDB user record | AES-256 | 7y | Legal obligation | none | n/a | 7y purge |
| Display name | User entered | DDB | AES-256 | account life + 90d | Contract | none | US | DSAR |
| Recordings (cloud sync) | Desktop opt-in | S3 `lead-files-…` | AES-256 + presigned ACL | user-controlled | Contract + consent | CloudFront edge | US edge | DSAR or user delete |
| Anonymous file uploads | upload-app | S3 | AES-256 | TTL 24h | Legitimate interest | recipient via link | US edge | TTL auto |
| Hiring application | myhire form | DDB pk=APP#<id> | AES-256 | 24 months | Consent + LI | none | US | DSAR or auto-purge |
| Skill check recording | Hire flow | S3 | AES-256 | 24 months | Consent | none | US edge | auto-purge |
| AI prompt | agent-runtime | Ephemeral (lambda mem only) | TLS in transit | 0s persisted | Contract | Gemini/Claude/Groq | Various | not stored |
| Hashed IP | every Lambda | CloudWatch logs | TLS + KMS | 30 days | Legitimate interest | none | US | log retention |
| Page-view event | analytics-event | DDB pk=EVT | AES-256 | 90 days | Legitimate interest | none | US | TTL auto |
| Feedback message | feedback Lambda | DDB pk=FEEDBACK | AES-256 | 365 days | Consent | none | US | TTL auto |
| Workforce telemetry (Command) | Desktop on-device → opt-in cloud | DDB + S3 | AES-256 | 12 months default | Customer org's basis | none | US | org-defined retention |

---

## 3.4 — DATA SUBJECT RIGHTS IMPLEMENTATION

| Right | UI entry | Verification | Timeline | Implementation |
|---|---|---|---|---|
| **Access** (Art. 15) | Settings → Privacy → "Download my data" or `privacy@cwleaders.com` subj "data request" | Email-confirm via magic-link | 30 days | Lambda `dsar-export` queries DDB by user pk, packages JSON + media URLs into S3 zip, emails signed link |
| **Rectification** (Art. 16) | Settings → Profile → edit fields | Auth required | Real-time | `/auth/profile` PATCH |
| **Erasure** (Art. 17) | Settings → Privacy → "Delete account" | Type-confirmation + 14d grace | 30 days post-grace | Lambda `dsar-delete` cron — see Phase 9.5 |
| **Portability** (Art. 20) | Same as Access | Same | 30 days | JSON Schema-compliant export |
| **Restriction** (Art. 18) | Email request | Email-confirm | 30 days | Manual flag in DDB user record blocks all processing |
| **Objection** (Art. 21) | Settings → Notification preferences (marketing) | Auth | Real-time | Toggle persists to DDB |
| **Automated decision-making** (Art. 22) | n/a — no automated decisions with legal effects (privacy §8) | — | — | — |
| **CCPA "Do Not Sell"** | Footer link → mailto with subject filled | Email-confirm | 15 business days | Same as objection (we don't sell, so it's a no-op + confirmation email) |

### DSAR endpoint spec

- **Inbound:** `mailto:privacy@cwleaders.com` (subject filtering on "data request", "DSAR", "Do Not Sell")
- **Internal queue:** Forwards to founder until DPO appointed; SLA 5 business days to acknowledge, 30 days to fulfill
- **Audit:** Every DSAR generates a row in DDB `pk=DSAR, sk=<isoTs>#<userHash>` with status enum `received|verified|fulfilled|rejected|appealed`

---

## 3.5 — BREACH NOTIFICATION PROCEDURE

See `RUNBOOK.md` §3-4 for full runbook. Compliance summary:

| Severity | Definition | Internal escalation | Regulator notification | User notification |
|---|---|---|---|---|
| **P1 — confirmed PII breach** | Unauthorized exposure of identifying personal data | Founder + legal counsel within 1h | DPA — within **72h** to lead supervisory authority (likely CNIL or ICO depending on subjects) | Without undue delay; per Art. 34 if high risk |
| **P2 — unverified incident** | Anomaly suggesting possible breach | Founder within 4h; investigation team formed | Hold pending verification | Hold pending verification |
| **P3 — minor security event** | Non-PII (e.g., failed exploit attempt) | Logged; no escalation | None | None |

User notification template (P1):

```
Subject: Important security notice from CW Leaders

[First name],

On [date], we detected unauthorized access to a system that contained
information related to your CW Leaders account.

What happened: [plain-English description, no jargon]
What was affected: [exhaustive list]
What we've done: [containment, fixes]
What you should do: [reset password, watch for phishing, etc.]
Resources: [credit-monitoring offer if applicable]

Questions: privacy@cwleaders.com
We're sorry. We'll publish a public post-mortem at /security/incidents.

— CW Leaders
```

---

## 3.6 — WCAG 2.2 AA SPEC

See `docs/WCAG-AUDIT.md` for the full audit + remediation plan.

**Quick reference (enforced):**
- Body text contrast ≥ 4.5:1
- Large text (≥18pt or ≥14pt bold) contrast ≥ 3:1
- Focus visible on every interactive element (`eq.css :where(...)` rule)
- Touch targets ≥ 44×44 CSS px on mobile
- Reduced motion via `prefers-reduced-motion` honored
- Skip-link class shipped (wiring to HTML pending — WCAG-AUDIT remediation P1)
- Toast region uses `role="status" aria-live="polite"` (just shipped)
- 200% text zoom without horizontal scroll
- Captions/transcripts auto-generated for video (Whisper)
