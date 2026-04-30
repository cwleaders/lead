# Access Gate System
**Authority:** server-side enforcement only. Client-side checks are UX, not security.
**Last revised:** 2026-04-30

---

## 7.1 — ACCESS LEVEL DEFINITIONS

### LEVEL 0 — PUBLIC

**Resources:**
- All marketing pages on `lead.cwleaders.com`: `/`, `/enterprise`, `/command`, `/pricing`
- All legal docs: `/terms`, `/privacy`, `/cookies`, `/accessibility`, `/dpa`, `/subprocessors`, `/eula`, `/aup`, `/refund`, `/sla`, `/dmca`, `/third-party-licenses`
- Public API health: `GET /health`
- Open positions: `myhire.cwleaders.com/positions/`
- Free anonymous file upload: `upload.cwleaders.com/` (rate-limited)
- Open share-link receive: `download.cwleaders.com/<token>`
- Desktop installer download: `api.cwleaders.com/desktop/download?platform=…`

**Gate:** None.
**UI:** Standard page. Sign-in CTA in nav, never blocking.

### LEVEL 1 — SOFT GATE

**Resources:**
- Pricing page comparison (deeper info on Powerhouse/Agentic features)
- Anonymous upload at >25 MB triggers a soft prompt
- "What is Mind-Free?" educational pages

**Gate:** Dismissible inline prompt.
**UI spec:**
```
┌─ Inline banner above content ─────────────────────────────────────┐
│  💡  Sign in to unlock larger uploads, save links, and customize. │
│                                                                   │
│       [ Sign in ]    [ No thanks ]                                │
└───────────────────────────────────────────────────────────────────┘
```
- Dismissal stored in `localStorage.cw.soft_dismissed` for 24h
- Doesn't block content — purely an invitation

**Copy:**
- title: "Sign in for more"
- benefits: "Larger uploads · Saved share links · Custom expiration · No ads"
- ctaPrimary: "Sign in"
- ctaSecondary: "No thanks"

### LEVEL 2 — ACCOUNT REQUIRED

**Resources:**
- `studio.cwleaders.com` dashboard
- `lead.cwleaders.com/unlock` (license activation)
- `studio.cwleaders.com/billing`, `/profile`, `/security`
- `POST /files/presign` for >100 MB uploads
- `GET /auth/me`
- `POST /agents/run` (cloud AI)
- All `/desktop/*` license endpoints

**Gate:** Hard redirect to `lead.cwleaders.com/unlock?return=<url>`.
**UI spec:** Full-page redirect preserves return URL via `?return=` query param.

**Copy on landing:**
- title: "Sign in to access {feature}"
- subhead: "It only takes 30 seconds — magic link or Google."
- ctaPrimary: "Send magic link"
- ctaSecondary: "Continue with Google"

### LEVEL 3 — VERIFIED ACCOUNT

**Resources:**
- `POST /myhire/applications` (must be email-verified)
- Sharing recordings publicly (anti-abuse: requires email verification)
- Posting to /feedback as authed user (gets larger rate-limit)

**Gate:** Email verification check via `payload.email_verified` claim in JWT.

**Verification methods:**
- Magic-link sign-in implicitly verifies email (the link is the proof).
- Google sign-in inherits Google's email verification.
- Phone or ID verification: `[CUSTOMIZE — not in v1; only Powerhouse+ users see KYC for Stripe Connect, deferred]`

**UI for unverified:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠ Verify your email                                                │
│  We sent a verification link to {email}. Check your inbox.          │
│  Once verified, you can submit applications, share publicly, and    │
│  enable AI agents.                                                  │
│                                                                     │
│      [ Resend link ]    [ Use a different email ]                   │
└─────────────────────────────────────────────────────────────────────┘
```

### LEVEL 4 — ROLE-GATED

**Roles defined in JWT `payload.role`:**

| Role | Definition | Granted by | Resources |
|---|---|---|---|
| `member` | Default authed user | Sign-up | All Level 0-3 |
| `paid_basic` | Active Basic subscription | Stripe webhook | + cloud AI 100/mo, save 10 recordings |
| `paid_powerhouse` | Active Powerhouse subscription | Stripe webhook | + AI 300/mo, unlimited save, MyHire 3 roles |
| `paid_agentic` | Active Agentic subscription | Stripe webhook | + AI 1000/mo, custom agents, all of MyHire |
| `org_member` | Member of an Enterprise org | Org admin invite | Org-shared resources |
| `org_admin` | Admin of an Enterprise org | Founder/initial setup | Org settings, billing, member mgmt |
| `cwl_admin` | CW Leaders staff | Allowlist in env var | All admin endpoints, support tools |

**Gate:** Server-side check `payload.role IN [allowed]` in Lambda; on fail return 403 with `{ error: "permission_required", needed: <role>, current: <role> }`.

**Denied UI:**
```
┌─ Modal ─────────────────────────────────────────────────────────────┐
│  Upgrade to Powerhouse                                              │
│  This feature is included with the Powerhouse plan.                 │
│                                                                     │
│   Powerhouse   $14.99/mo                                            │
│    ✓ Unlimited recording                                            │
│    ✓ AI cloud agents (300/mo)                                       │
│    ✓ Mind-Free canvas with cloud sync                               │
│                                                                     │
│       [ Upgrade ]    [ Maybe later ]                                │
└─────────────────────────────────────────────────────────────────────┘
```

### LEVEL 5 — ELEVATED PRIVILEGE

**Resources:**
- `DELETE /account` (account deletion)
- `POST /admin/*` (any admin endpoint)
- Org admin actions (suspend a member, change billing seat count, end Command activation)
- `POST /auth/profile` for email change
- Workforce monitoring activation (Command tier)

**Gate:** Re-authentication within last 5 minutes (compare current time to `payload.last_auth` claim; require fresh auth challenge if older).

**UI spec:**
```
┌─ Modal (small, focused) ─────────────────────────────────────────────┐
│  Confirm your identity                                               │
│  This is a sensitive action. Please re-enter your email — we'll      │
│  send a fresh code.                                                  │
│                                                                      │
│   Email:  ________________                                           │
│                                                                      │
│      [ Send code ]    [ Cancel ]                                     │
└──────────────────────────────────────────────────────────────────────┘
```

- 5-minute window for the fresh JWT after challenge
- Action retried automatically once challenge succeeds

---

## 7.2 — RESOURCE-TO-LEVEL MAPPING TABLE

### Web routes (CDN + CloudFront)

| Resource | Level | Notes |
|---|---|---|
| `lead.cwleaders.com/` and all subpages | L0 | Public marketing |
| `studio.cwleaders.com/` | L2 → redirect to /unlock if not signed in | Dashboard requires account |
| `studio.cwleaders.com/billing` | L2 + own-account | Plus L5 for plan changes |
| `upload.cwleaders.com/` | L0 (anonymous) → L2 prompt at >100MB |  |
| `upload.cwleaders.com/?from=…` | L0 (with attribution) |  |
| `download.cwleaders.com/<token>` | L0 | Token IS the auth |
| `myhire.cwleaders.com/` | L0 | Marketing |
| `myhire.cwleaders.com/positions/` | L0 | Public job board |
| `myhire.cwleaders.com/apply/?role=…` | L3 (email verified to submit) |  |

### API routes (api.cwleaders.com)

| Endpoint | Level | Role required |
|---|---|---|
| `GET /health` | L0 | none |
| `POST /auth/request` | L0 | rate-limited |
| `POST /auth/verify` | L0 | rate-limited |
| `POST /auth/firebase` | L0 | accepts ID token |
| `GET /auth/me` | L2 | any authed |
| `POST /auth/profile` | L5 | any authed + fresh re-auth |
| `POST /checkout/session` | L2 | any authed |
| `POST /stripe/webhook` | system | Stripe sig only |
| `POST /files/presign` | L0 small / L2 ≥100MB |  |
| `POST /files/complete` | matches presign issuer |  |
| `GET /files/{token}` | L0 (token is auth) |  |
| `POST /myhire/applications` | L3 | email verified |
| `POST /events`, `/events/batch` | L0 (anonymous OK, gentler limit if authed) |  |
| `POST /feedback` | L0 (lower limit) / L2 (higher limit) |  |
| `POST /agents/run` | L4 | role per tier credits |
| `GET /desktop/download` | L0 |  |
| `GET /desktop/update` | L0 (machine-bound license token) |  |
| `POST /admin/*` | L4 | role=cwl_admin |
| `DELETE /account` | L5 | fresh re-auth |
| `POST /command/activate` | L5 | role=org_admin + fresh re-auth + 4-checkbox |

### Desktop app actions

| Action | Level |
|---|---|
| First launch — splash | L0 |
| Sign in | L2 |
| Start recording | L2 |
| Cloud sync a recording | L2 + L4 (paid tier) |
| Run cloud AI agent | L4 + consent gate (Phase 6.6) |
| Activate Command tier | L5 + 4-checkbox gate |

---

## 7.3 — PROGRESSIVE DISCLOSURE — gate middleware

```typescript
// Pseudo-code (matches actual _shared.mjs auth helpers)

import { authFromEvent } from './_shared.mjs';

// Decorator-style gate
function gate(level, opts = {}) {
  return (handler) => async (event) => {
    const payload = authFromEvent(event); // null or decoded JWT

    if (level >= 2 && !payload) {
      return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };
    }
    if (level >= 3 && !payload.email_verified) {
      return { statusCode: 403, body: JSON.stringify({ error: 'email_not_verified' }) };
    }
    if (level >= 4 && opts.role) {
      if (!opts.role.includes(payload.role)) {
        return { statusCode: 403, body: JSON.stringify({
          error: 'role_required',
          needed: opts.role,
          current: payload.role
        })};
      }
    }
    if (level >= 5) {
      const ageSec = Math.floor(Date.now()/1000) - (payload.last_auth || 0);
      if (ageSec > 300) {
        return { statusCode: 401, body: JSON.stringify({ error: 'reauth_required', ageSec }) };
      }
    }

    return handler(event, { user: payload });
  };
}

// Usage in lambda:
export const handler = gate(4, { role: ['paid_powerhouse','paid_agentic'] })(
  async (event, ctx) => {
    // ctx.user is the verified JWT payload
    // ...business logic...
  }
);
```

[CUSTOMIZE — wire this `gate()` decorator into Lambda handlers in next sprint; currently each Lambda inlines its own check. Consolidation makes the access matrix machine-verifiable.]
