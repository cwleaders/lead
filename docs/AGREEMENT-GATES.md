# Agreement Gate System
**Spec for every consent / acceptance gate in the platform.**
**Last revised:** 2026-04-30

---

## 6.1 — TERMS OF SERVICE ACCEPTANCE GATE

### Triggers
- New account creation (sign-up flow)
- Existing user on first session after Terms version bump (server-issued JWT carries `tos_v` claim; mismatch triggers gate)

### UI spec

```
┌─ Modal (centered, ~520px wide, glass surface, escape disabled) ──────┐
│                                                                      │
│  📋  Updated Terms                                                   │
│                                                                      │
│  We've updated our Terms of Service and Privacy Policy.              │
│                                                                      │
│  Key changes:                                                        │
│   • [bullet 1 — pulled from /docs/changelog]                         │
│   • [bullet 2]                                                       │
│   • [bullet 3]                                                       │
│                                                                      │
│  [📄 Read full Terms]  [📄 Read full Privacy]                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ☐  I agree to the updated Terms of Service and Privacy Policy. │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│           [ Accept and continue → ]    [ Sign me out ]              │
└──────────────────────────────────────────────────────────────────────┘
```

- ESC is **disabled** on this modal — escape route is "Sign me out"
- Backdrop click is **disabled** — same rationale
- Checkbox must be checked before primary CTA enables
- "Sign me out" calls `/auth/signout` then redirects to home

### Copy

```
title:        "Updated Terms"
subhead:      "We've updated our Terms of Service and Privacy Policy."
keyChangesH:  "Key changes:"
linkTos:      "Read full Terms"
linkPriv:     "Read full Privacy"
checkbox:     "I agree to the updated Terms of Service and Privacy Policy."
ctaPrimary:   "Accept and continue →"
ctaDecline:   "Sign me out"
declineText:  "If you decline, you'll be signed out and your account will pause until you accept. Your data is preserved per our DPA §13."
```

### Acceptance log schema

```
DDB row:
  pk:          USER#<userId>
  sk:          CONSENT#tos#<version>#<isoTs>
  gsi1pk:      CONSENT#tos
  gsi1sk:      <isoTs>
  userId:      <uuid>
  scope:       "tos"
  documentId:  "tos"
  documentVer: "1.0"
  documentHash: <sha256-of-doc-text>
  ipHash:      <ipHash>
  userAgent:   <trimmed>
  geo:         <country-code>
  method:      signup | re-accept-modal | api
  createdAt:   <isoTs>
  ttl:         <now + 7y>
```

### API endpoint

```
POST /auth/legal/accept
Body: { documents: [{ scope, version }], context?: "signup" | "re-accept" }
Auth: Bearer JWT
Response: { ok: true, ids: [<consent-row-ids>], userJwt: <new-jwt-with-updated-tos_v-claim> }
Rate-limit: 5 / hour / IP (anti-spam)
```

[CUSTOMIZE — implementation queued; piggy-backs on existing `auth-profile` Lambda]

---

## 6.2 — PRIVACY CONSENT GATE (granular)

### Triggers
- First sign-up (single shot, alongside ToS)
- Settings → Privacy → Manage consent (anytime)

### UI spec — layered consent

```
┌─ Modal ──────────────────────────────────────────────────────────────┐
│  Privacy controls                                                    │
│                                                                      │
│  We use the absolute minimum data needed. Adjust below; toggle off   │
│  anytime in Settings → Privacy.                                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ ☑ Strictly necessary               (locked — required)       │    │
│  │   Sign-in tokens, billing, security                          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ ☐ Product analytics                                          │    │
│  │   We measure feature use to improve. No third-party trackers.│    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ ☐ Email updates                                              │    │
│  │   ≤1/month product updates. Never marketing partners.        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Read our Privacy Policy for full details.                          │
│                                                                      │
│            [ Save preferences ]      [ Accept all ]    [ Reject     │
│                                                          non-       │
│                                                          essential ]│
└──────────────────────────────────────────────────────────────────────┘
```

### Storage schema

```
DDB user record extension:
  prefs: {
    consent: {
      analytics:        { granted: bool, at: isoTs, method: "banner|settings|api", ip: hash },
      emailMarketing:   { granted: bool, at: isoTs, ... },
      aiCloudProcessing: { granted: bool, at: isoTs, ... }
    }
  }
```

### Withdrawal

- Settings → Privacy → toggle each category
- Triggers immediate stop of associated processing
- Audit row written: `pk=USER#<id>, sk=CONSENT#analytics#withdraw#<isoTs>`
- For email: also calls SES `PutSuppressedDestination`

### Re-prompt triggers

- Privacy material change (bump in privacy.html version)
- 13-month silent state (annual re-confirmation per CCPA best practice)

---

## 6.3 — COOKIE CONSENT BANNER

Since CW Leaders uses **only strictly-necessary** browser storage (`lead.token`, `lead.user`, `cw.consent`, `myhire-application-draft`), an EU-style "non-essential cookie banner" is **not legally required** under GDPR/ePrivacy — strictly-necessary cookies are exempt.

**However**, we ship a transparency banner that:
1. Communicates our position ("We use only essential storage — no tracking.")
2. Records the user's acknowledgement in `cw.consent` so we can prove communication
3. Lets EU users explicitly consent to product analytics if/when we ship them

### UI spec — banner (bottom, dismissible)

```
┌──────────────────────────────────────────────────────────────────────┐
│  We don't track you across the web.                                  │
│  We use a small amount of strictly-necessary browser storage to keep │
│  you signed in and the apps working. No advertising cookies.         │
│  No cross-site tracking. Ever.                                       │
│                                                                      │
│       [ Got it ]    [ Manage details → ]                             │
└──────────────────────────────────────────────────────────────────────┘
```

### Banner copy — 3 versions

**Minimal** (default for desktop, post-launch):
> We use only strictly-necessary storage to keep you signed in. [Got it] [Details]

**Standard** (current):
> We don't track you across the web. We use a small amount of strictly-necessary browser storage to keep you signed in and the apps working. No advertising cookies. No cross-site tracking. Ever.
> [Got it] [Manage details →]

**Detailed** (for Manage modal):
> See `cookies.html` table — all entries listed with purpose and lifetime.

### Cookie storage

```
key:      cw.consent
value:    JSON { "essential": true, "analytics": <bool>, "marketing": false, "version": 1, "at": <isoTs> }
type:     localStorage (not a cookie technically — same legal effect)
duration: 12 months
```

### Implementation

- Lazy-loaded via `lead.js` after DOM ready
- Banner renders only if `cw.consent` is missing OR version-bumped
- Footer link "Cookie preferences" always reopens the manage modal
- Script-blocking: not needed in v1 (no non-essential scripts loaded)

---

## 6.4 — AGE VERIFICATION GATE

### Trigger
- Sign-up flow — single checkbox prior to email submit

### UI

Single line within sign-up form, above the email field:

```
☐  I confirm I am at least 16 years old (or the minimum age in my country, if higher).
```

- Checkbox must be checked to enable Send Code button
- Lightweight — no date picker, no ID upload (we don't host children's data; AUP enforces)

### Underage rejection

If a user later self-discloses age <16 (e.g., in MyHire form):
- Account flagged
- Notification sent to `privacy@cwleaders.com`
- Account suspended pending parental verification per privacy.html §10
- All data destroyed if no parental consent within 30 days

### Jurisdiction-specific thresholds

We treat **16** as the global floor (EU GDPR Art. 8). US COPPA bars <13 unconditionally; we cover that and exceed it.

---

## 6.5 — PAYMENT AUTHORIZATION GATE

### Trigger
- Click "Upgrade" / "Subscribe" → Stripe Checkout flow

### Pre-purchase summary UI (our page, before Stripe)

```
┌─ Confirm your subscription ──────────────────────────────────────────┐
│                                                                      │
│  Powerhouse plan                                          $14.99/mo  │
│                                                                      │
│  Includes:                                                           │
│   • Unlimited recordings + cloud sync                                │
│   • AI debriefs (300 cloud credits/mo)                               │
│   • Workforce-monitoring (Command tier — separate)                   │
│                                                                      │
│  Billed monthly. Cancel any time — 14-day money-back guarantee.      │
│                                                                      │
│  By continuing you agree to our Terms and Refund Policy.             │
│                                                                      │
│                       [ Continue to payment → ]                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Stripe-hosted Checkout
- We never collect card data — Stripe Checkout takes over
- Success URL: `https://studio.cwleaders.com/unlock?session={CHECKOUT_SESSION_ID}` (allowlisted)
- Cancel URL: `https://studio.cwleaders.com/?cancel=1`

### Subscription activation confirmation

```
┌─ You're in. ─────────────────────────────────────────────────────────┐
│  Welcome to Powerhouse.                                              │
│  Your license is now active. You'll see new features the next time   │
│  you open Studio.                                                    │
│                                                                      │
│  Receipt: [view] [download PDF]                                      │
│  Manage subscription anytime: settings → billing                     │
│                                                                      │
│           [ Open Studio → ]    [ Browse new features ]               │
└──────────────────────────────────────────────────────────────────────┘
```

### Receipt template (email)

Already wired via `_email-templates.mjs#licenseDeliveryEmail`. Branded HTML + plain-text.

---

## 6.6 — FEATURE-SPECIFIC CONSENT GATES

### Cloud AI consent

**Trigger:** First time user invokes a cloud AI agent (Coach, Critic, etc.)

```
┌─ One-time consent: cloud AI ─────────────────────────────────────────┐
│                                                                      │
│  Studio's local AI handles most tasks on your device. Some heavier   │
│  tasks (Coach, Critic) use cloud models from Google, Anthropic, or   │
│  Groq.                                                               │
│                                                                      │
│  When you run a cloud agent:                                         │
│   • Your prompt is sent to the model                                 │
│   • Models DO NOT train on your data (contractually excluded)        │
│   • Prompts are not stored on our servers                            │
│                                                                      │
│  You can switch back to local-only any time in Settings → AI.        │
│                                                                      │
│      [ Use cloud AI ]      [ Local only ]                            │
└──────────────────────────────────────────────────────────────────────┘
```

Storage: `prefs.aiCloudOptIn = true|false` in DDB user record.

### Workforce monitoring consent (Command tier)

Already specified in `dpa.html` §14 + AUP §2.2. Gate UI:

```
┌─ Activate Workforce Monitoring ──────────────────────────────────────┐
│                                                                      │
│  ⚠ This is a sensitive feature. Read carefully.                      │
│                                                                      │
│  By activating, you confirm:                                         │
│   ☐ Your organization has a lawful basis under all applicable laws   │
│   ☐ You have provided clear written notice to monitored individuals  │
│   ☐ You have obtained their consent (where required by law)          │
│   ☐ You will not monitor off-clock activity                          │
│   ☐ You accept the indemnification clause in our DPA §14             │
│                                                                      │
│  All four checkboxes required.                                       │
│                                                                      │
│  Notice template (download): notice-en-us.pdf                        │
│  Consent record CSV uploader: [Choose file]                          │
│                                                                      │
│        [ Activate ]    [ Cancel ]                                    │
└──────────────────────────────────────────────────────────────────────┘
```

This gate also writes a row to DDB `pk=ORG#<id>, sk=COMMAND_ACTIVATION#<isoTs>` with all the affirmations + uploaded consent records hash.
