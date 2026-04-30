# License Key System
**Last revised:** 2026-04-30

---

## OVERVIEW

Every paid purchase generates a unique license key. Keys are bound to:
- **An email address** (the buyer)
- **A tier** (Basic / Powerhouse / Agentic / Enterprise seat / Enterprise org)
- **Up to N machines** (default 3; Enterprise = unlimited)

## LIFECYCLE

```
   Stripe Checkout completes
            │
            ▼
   ┌──────────────────────────────────┐
   │ stripe-webhook Lambda            │
   │   1. Verify HMAC sig             │
   │   2. Map price → tier            │
   │   3. Generate key (16-char A-Z2-7│
   │      + check-digit)              │
   │   4. Store in DDB:               │
   │      pk=LICENSE#<norm>, sk=META  │
   │      gsi2pk=EMAIL#<email>        │
   │   5. Upgrade user's plan field   │
   │   6. SES branded license email   │
   └──────────────────────────────────┘
            │
            ▼
   User receives email → opens desktop app → enters key
            │
            ▼
   ┌──────────────────────────────────┐
   │ desktop-update Lambda            │
   │   - Verify key + email           │
   │   - Add machineId to .machines[] │
   │   - Issue machine-bound JWT      │
   │     (license-token, 90d sliding) │
   │   - Return tier capabilities     │
   └──────────────────────────────────┘
            │
            ▼
   Desktop app caches license-token, unlocks tier features
```

## DATA MODEL

```
LICENSE row:
  pk:          LICENSE#<key-without-dashes-uppercase>
  sk:          META
  gsi1pk:      LICENSE#<key>            ← lookup by key
  gsi1sk:      META
  gsi2pk:      EMAIL#<email>            ← list-all-licenses by email
  gsi2sk:      LICENSE#<createdAtMs>
  key:         "AB12-CDEF-3456-789Z"    ← human-friendly with dashes + check
  tier:        "powerhouse" | ...
  email:       <buyer email lowercased>
  stripeSession: cs_live_…
  stripePrice: price_…
  maxMachines: 3 (or higher per tier)
  machines: [
    { machineId, label, activatedAt, lastSeenAt, ip_hash }
  ]
  createdAt:   ISO timestamp
  revoked:     bool
  revokedAt:   ISO timestamp (if revoked)
  transferredAt, transferredFrom (if transferred)
```

## API ENDPOINTS

### GET /licenses (auth required)
Returns all licenses for the current user's email.
```json
{
  "licenses": [
    {
      "key": "AB12-••••-••••-789Z",       // masked for display
      "fullKey": "AB12-CDEF-3456-789Z",   // copyable
      "tier": "powerhouse",
      "status": "active",
      "maxMachines": 3,
      "machines": [
        { "machineId": "m_…", "label": "MacBook Pro M2",
          "lastSeenAt": "…", "activatedAt": "…" }
      ],
      "createdAt": "2026-04-30T10:30:00Z",
      "stripeSession": "cs_live_…"
    }
  ],
  "count": 1,
  "activePlan": "powerhouse"
}
```

### POST /licenses/{key}/revoke-machine (auth required)
Body: `{ "machineId": "m_…" }`
Removes a machine binding so the license can be moved to a new device.
Returns: `{ "ok": true, "remaining": 2 }`

### POST /licenses/{key}/transfer (auth required)
Body: `{ "newEmail": "alice@example.com" }`
Reassigns license ownership. Clears all machine bindings (new owner re-activates).
Returns: `{ "ok": true, "transferredTo": "alice@…", "machinesCleared": 3 }`

## CANCELLATION FLOW

When a Stripe subscription is cancelled (handled by stripe-webhook on `customer.subscription.deleted`):
1. Find license by `stripePrice` + `email`
2. Set `revoked: true, revokedAt: now`
3. **Grace period:** keep the license functional until the period end (Stripe `current_period_end`)
4. After period end: license-token issuance returns `403` for that key; desktop app surfaces "Subscription expired — renew to continue."

## SECURITY NOTES

- Keys are 16-char Crockford-base32 with a 6-char check suffix → namespace ~10²⁴, brute-force not feasible
- Keys are never logged in plaintext (we log the prefix only)
- License-tokens are HS256 JWTs with `machineId + email + tier + exp` claims, signed with `JWT_SECRET`
- Machine binding: a license-token is only valid on the machine whose hash matches `payload.mid`
- Revocation: 90-day token TTL means revoked subs stop working within 90 days even without server check; daily desktop-update polling tightens to ≤24h
- All license operations write to `DSAR_LOG` for audit

## OPERATIONAL TASKS

| Task | How |
|---|---|
| Look up a license by email | `aws dynamodb query --table-name lead-table --index-name gsi2 --key-condition 'gsi2pk = :p AND begins_with(gsi2sk, :s)' …` |
| Manually revoke a key | `aws dynamodb update-item ... SET revoked = true` |
| Refund + revoke | Stripe refund triggers webhook `charge.refunded` → automated revoke (see stripe-webhook) |
| Issue a comp license | `aws lambda invoke --function-name lead-stripe-webhook --payload <synthetic-event>` |
| Audit who has tier X | `aws dynamodb scan --filter-expression 'tier = :t'` |

## FUTURE WORK

- **Volume licenses** for Enterprise org tier — single key activates N seats; tracked via separate `LICENSE_SEATS` rows
- **License analytics dashboard** — admin page showing activation rate, machine count distribution, revocation rate
- **Hardware-binding strengthening** — currently machineId is a self-reported UUID; consider SHA-256(MAC+OS+CPU) for tamper-resistance (Tauri 2.x exposes via plugin-os)
- **License key rotation** — for compromised keys, allow self-service rotate-without-losing-machines
