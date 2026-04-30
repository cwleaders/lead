# Loading & Cancel / Exit UX System
**Authority:** Zero-Trap Mandate — every loading state has a timeout; every action has an escape route.
**Last revised:** 2026-04-30 · cross-references: 15 zero-trap patches landed in QA pass

---

## 9.1 — LOADING STATE SPECIFICATIONS

### Loading types

| Type | Show-after delay | Component | Duration brackets / copy | Timeout | Cancel |
|---|---|---|---|---|---|
| **App boot** (web SPA) | 0ms | Splash with logo + spinner | <2s: nothing · 2-5s: "Starting up…" · >5s: "Taking longer than expected — refresh?" | 30s → reload prompt | n/a |
| **App boot** (desktop) | 0ms | Native splash from Tauri | <2s: nothing · 2-8s: "Loading models…" (Whisper/CLIP unpacking) | 60s → "Local model load failed; cloud-only fallback" | n/a |
| **Page transition** | 0ms | Skeleton screens (eq.css `.skeleton-*`) | <300ms: skeleton · sustained: prefetch indicator | 8s → error page | n/a |
| **Data fetch** (inline) | 200ms (avoid flicker) | Inline spinner + label | <1s: spinner only · 1-3s: "Fetching…" · 3-10s: "Still loading…" · 10-30s: "Larger than usual — hang tight" · 30s+: "This is unusual; you can leave this page" | 30s → retry prompt | Yes — abort button |
| **User action** (button click → API) | 0ms | Button label change ("Saving…") | <1s: "…" · 1-3s: spinner in button · >3s: progress text | 15s → toast "Took longer than expected" | Limited (auth/checkout/hire actions) |
| **File upload** | 0ms | Per-file card with progress bar | percentage + speed + ETA | 60s no progress = stall, abort | Yes — X button on card (already shipped) |
| **Long process** (export, AI agent run) | 0ms | Inline status component | step-by-step description ("Analyzing…", "Generating…", "Saving…") | depends on operation; user can leave page | Yes; backgrounded if user navigates |

### Skeleton screens

Per-page skeletons in `eq.css`:
- `.skeleton-line.short|medium|long` for text
- `.skeleton-block` for paragraph blocks
- `.skeleton-card` for card containers
- `.skeleton-avi` for avatars

Render skeletons directly in HTML with same dimensions as final content (CLS = 0).

### Background-able operations

When a user navigates away during a long process (>10s):
1. Operation continues server-side
2. Browser notification (if permission granted) when complete
3. Toast on next page load: "Your export is ready: [download]"
4. Email after 5 min if user hasn't returned

---

## 9.2 — CANCEL / EXIT DECISION ENGINE

### Categories

| Category | Definition | UI behaviour | Cleanup |
|---|---|---|---|
| **No-consequence** | Closing has no data loss (read-only modal, popover) | Close immediately on X / ESC / scrim / back | none |
| **Minor-loss** | Closing loses unsaved draft (form half-filled, settings tweaked) | Ask "Discard changes?" | discard staged changes |
| **Significant-loss** | Closing breaks a multi-step flow (subscription change wizard, hire-application) | "Save draft and exit?" + auto-save | persist draft locally |
| **Irreversible** | Action commits permanent change (delete, send, publish) | Type-confirmation + 14d grace where possible | depends |
| **Subscription** | Cancel a paid plan | Dedicated 5-screen flow (§9.4) | downgrade at period end |
| **Process** | A backend operation in progress | "Run in background?" / "Stop?" | abort if possible, otherwise let finish |

### Modal copy by category

**MINOR-LOSS — discard draft**
```
title:    Discard your changes?
body:     You have unsaved changes. Leave anyway?
cta1:     Discard (red)
cta2:     Keep editing
```

**SIGNIFICANT-LOSS — save and exit**
```
title:    Save and exit?
body:     We'll save your draft so you can come back later.
cta1:     Save and exit
cta2:     Keep going
cta3:     Discard
```

**IRREVERSIBLE — delete recording**
```
title:    Delete this recording?
body:     "{title}" will be deleted permanently. Recordings can't be recovered.
cta1:     Delete (red)
cta2:     Cancel
```

**IRREVERSIBLE — bulk delete**
```
title:    Delete {n} recordings?
body:     {n} recordings will be deleted permanently. Recordings can't be recovered.
cta1:     Delete {n} (red)
cta2:     Cancel
```

---

## 9.3 — UNIVERSAL CLOSE PROTOCOL

| Context | [X] button | ESC | Browser Back | Swipe down (mobile) |
|---|---|---|---|---|
| Lightbox / read-only modal | Close | Close | Close | Close |
| Minor-loss form modal | "Discard?" | "Discard?" | "Discard?" | "Discard?" |
| Significant-loss wizard | "Save and exit?" | Close current step (back) | Close current step (back) | "Save and exit?" |
| Irreversible confirmation | Cancel (no-op) | Cancel | Cancel | Cancel |
| ToS re-acceptance gate | **disabled** (escape via Sign-out only) | disabled | go to /signed-out | n/a |
| Authentication modal | Close (cancel sign-in) | Close | Close | Close |
| Cookie consent banner | n/a (Got-it or Manage) | n/a (banner not modal) | n/a | dismiss=accept-essential-only |
| Mobile drawer | Close button or backdrop | Close | Close | swipe-left or down → close |
| Sidebar (desktop) | Collapse button | n/a | n/a | n/a |
| Persistent overlay (offline banner) | n/a (auto-dismiss when online) | n/a | n/a | n/a |

### ESC contract (already implemented in `lead.js`)
```js
const onKey = (e) => { if (e.key === 'Escape') close(); };
document.addEventListener('keydown', onKey);
// Cleanup on modal removal — prevents listener leak.
```

---

## 9.4 — SUBSCRIPTION CANCELLATION FLOW

**Hard rule:** Maximum 3 active clicks from "Cancel subscription" button to confirmed cancellation. **No** phone call, **no** retention specialist, **no** dark patterns.

### Screen 1 — "Before you go"

```
┌──────────────────────────────────────────────────────────────────────┐
│  Cancel Powerhouse                                                   │
│                                                                      │
│  When you cancel, you'll lose access to:                             │
│   • Cloud sync of recordings (your local recordings stay yours)      │
│   • AI cloud agents (300 credits/month)                              │
│   • Mind-Free unlimited canvas                                       │
│   • Premium support                                                  │
│                                                                      │
│  You'll keep:                                                        │
│   • Your account and all locally-saved recordings                    │
│   • Free tier access (2 cloud-synced recordings, 50 AI credits/mo)   │
│                                                                      │
│  Active until: {periodEnd}                                           │
│                                                                      │
│        [ Continue cancelling ]    [ Keep my plan ]                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Screen 2 — Optional reason (skip-able)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Why are you leaving? (optional)                                     │
│                                                                      │
│  ○ Too expensive                                                     │
│  ○ Not using it enough                                               │
│  ○ Missing a feature I need                                          │
│  ○ Switching to a different tool                                     │
│  ○ Other:  _____________________                                     │
│                                                                      │
│        [ Continue ]    [ Skip ]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Reason logged but **does not block** cancel.

### Screen 3 — Optional retention offer (capped at 1 offer, never repeated)

```
┌──────────────────────────────────────────────────────────────────────┐
│  We'd hate to see you go.                                            │
│                                                                      │
│  Want to switch to Basic ($4.99/mo) and keep access?                 │
│                                                                      │
│        [ Switch to Basic ]    [ No thanks, cancel ]                  │
└──────────────────────────────────────────────────────────────────────┘
```

Customer's choice respected immediately. **No repeat offers.**

### Screen 4 — Confirmation

```
┌──────────────────────────────────────────────────────────────────────┐
│  Powerhouse cancelled.                                               │
│                                                                      │
│  You'll keep Powerhouse access until {periodEnd}.                    │
│  After that, your account drops to Free.                             │
│                                                                      │
│  Need to reactivate? Settings → Billing → "Reactivate".              │
│                                                                      │
│  Confirmation email sent to {email}.                                 │
│                                                                      │
│        [ Done ]                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Screen 5 — Confirmation email

```
Subject: Your CW Leaders subscription is cancelled

Hi {firstName},

We've cancelled your Powerhouse subscription as you requested.

What happens now:
• Powerhouse features stay active until {periodEnd}
• After that, your account drops to Free
• Your account, recordings, and data are preserved
• You can reactivate anytime — your data is exactly where you left it

If this was a mistake or we got something wrong, just hit reply.

— CW Leaders
```

---

## 9.5 — ACCOUNT DELETION FLOW

### Screen 1 — Warning + scope

```
┌──────────────────────────────────────────────────────────────────────┐
│  Delete your account                                                 │
│                                                                      │
│  This will permanently delete:                                       │
│   • Your CW Leaders account                                          │
│   • All cloud-synced recordings, files, and mind-maps                │
│   • All share links you created (recipients lose access)             │
│   • Your billing history (what we keep is governed by tax law —      │
│     7 years for invoice records, anonymized)                         │
│                                                                      │
│  This will NOT delete:                                               │
│   • Locally-saved recordings on your computer (those are yours)      │
│   • Files shared WITH you by other people (their copy)               │
│                                                                      │
│  We provide a 14-day grace period — your account is suspended,       │
│  not destroyed, for the first 14 days. Reactivate anytime in that    │
│  window. After 14 days, deletion is permanent.                       │
│                                                                      │
│        [ Continue ]    [ Cancel ]                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Screen 2 — Type to confirm

```
┌──────────────────────────────────────────────────────────────────────┐
│  To confirm deletion, type your email below:                         │
│                                                                      │
│  Email:  __________________                                          │
│                                                                      │
│  ☐  I understand this is permanent after 14 days.                    │
│  ☐  I have downloaded any data I want to keep.                       │
│                                                                      │
│        [ Delete my account ] (disabled until both check)             │
│        [ Cancel ]                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Screen 3 — Final confirm + DSAR option

```
┌──────────────────────────────────────────────────────────────────────┐
│  Last chance.                                                        │
│                                                                      │
│  Want to download a copy of your data first?                         │
│  We'll generate a JSON + media archive and email you a link          │
│  (typically ready in 2-5 minutes).                                   │
│                                                                      │
│        [ Yes — download my data first ]                              │
│        [ No — just delete my account ]                               │
│        [ Wait, cancel ]                                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Backend behavior

- T+0: Account flagged `status=deletion_pending`, `deletion_at=now+14d`. All sessions invalidated. SES suppression added.
- T+0 → T+14d: Sign-in attempts redirect to `/account/reactivate?token=…` — one-click reactivate.
- T+14d (cron): Lambda `dsar-delete` runs:
  - DDB scan all rows with `pk=USER#<id>` → delete
  - S3 list all `<userId>/*` → delete
  - Mark Stripe customer `deleted_at` (does not delete Stripe; tax records 7y)
  - Telemetry rows: anonymize `userId` to `null`, keep aggregate counters
  - Audit row in `pk=DSAR_LOG` for compliance

### Confirmation email (T+14d)

```
Subject: Your CW Leaders account has been deleted

Hi,

Your CW Leaders account has been permanently deleted as requested on {requestDate}.

What we kept (legally required):
  • Anonymized billing transaction records — 7 years for tax compliance
  • Audit log of the deletion event itself

What's gone, forever:
  • Your account profile, recordings, files, mind-maps, share links
  • Your sign-in credentials
  • Your behavioral telemetry

Thanks for trying CW Leaders. If we ever made it right or did wrong by you,
we'd love to hear: hello@cwleaders.com

— CW Leaders
```

[CUSTOMIZE — `dsar-delete` cron Lambda not yet implemented; manual DSAR pipeline operates today via privacy@cwleaders.com. Sprint 1 post-launch deliverable.]
