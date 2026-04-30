# Copy System — Style Guide + Templates + Forbidden Patterns
**Authority:** brand-config.json `voice.*` + this document
**Last revised:** 2026-04-30

---

## 5.1 — STYLE GUIDE

### Voice & tone

| Tone dimension | Setting | DO write | DON'T write |
|---|---|---|---|
| Formality | Professional-casual | "Your account is ready." | "Hey there! 🎉 Your awesome account is all set!" |
| Confidence | High, never breathless | "We block tracking by default." | "We're proud to announce industry-leading privacy!" |
| Brevity | Short over clever | "Recording saved." | "Your beautiful recording has been securely captured to the cloud." |
| Warmth | Earned, not performed | "Sorry — that didn't work. Try again or email us." | "Oops! We're so sorry for the inconvenience! 😔" |
| Authority | Show, don't claim | "TLS 1.2+ encryption in transit." | "Industry-leading bank-level security." |

### Word list

**Preferred → Rejected:**
- people / creators / the team → users, consumers
- folks → ladies and gentlemen, you guys
- sign in → log in
- sign up → register
- delete → remove (when destruction is permanent)
- continue → click here
- account → profile (when referring to the billable entity)
- settings → preferences (we standardize on settings)
- workspace → org or organization (in B2B context)

### Capitalization

- **Sentence case** for all UI elements (buttons, headings, labels) — never Title Case
- **Title Case** only for product proper nouns: "CW Leaders Studio", "Mind-Free", "MyHire"
- All caps only for: `<eyebrow>` labels (≤8 chars) and tier badges
- "AI" stays uppercase; "API" stays uppercase; "URL" stays uppercase

### Punctuation

- Oxford comma: yes
- Em-dash with no spaces: yes (— like this)
- Single space after period
- Avoid exclamation marks except for genuine errors or success ("Welcome back!" is allowed once at the moment of value)

### Numbers & dates

- 0–9 spelled out in body copy ("three taps"), 10+ as numerals
- Always use numerals in UI (button labels, table cells)
- Money: $4.99/mo (not "USD 4.99/month" in product UI)
- Dates: "Apr 30, 2026" in US; "30 Apr 2026" in EU/UK locale; ISO `2026-04-30` in legal docs and audit logs
- Times: 12h with AM/PM in US, 24h in EU; relative ("3 minutes ago") preferred in UI

### Inclusive language

- Singular "they" — always
- Avoid gendered phrasing: "his/her", "guys"
- Avoid ableist metaphors: "blind to", "tone-deaf", "crazy/insane"
- Avoid colonial metaphors: "master/slave" → primary/replica; "blacklist/whitelist" → blocklist/allowlist
- "Person-first" language for any disability mention

---

## 5.2 — UI COPY TEMPLATES

### Authentication

**LOGIN PAGE**
```
title:         Sign in to CW Leaders
subhead:       One account, four tools.
emailLabel:    Email
emailPh:       you@company.com
ctaPrimary:    Send code →
ctaGoogle:     Continue with Google
linkSignup:    No account? Create one →
linkForgot:    (intentionally omitted — magic link replaces password reset)
errInvalidEmail: Enter a valid email address.
errSent:       Couldn't send a code right now. Try again in a moment.
err429:        Too many attempts. Wait {retryAfter}s.
loading:       Sending…
```

**MAGIC-LINK CODE STEP**
```
title:         Check your email
subhead:       We sent a 6-digit code to {email}.
ctaPrimary:    Verify →
linkBack:      use different email
linkResend:    resend code
errCode:       That code didn't match. Try again.
errExpired:    This code expired. Send a new one.
err429:        Too many attempts. Wait {retryAfter}s.
loading:       Verifying…
```

**REGISTRATION (= sign-in for us)**
```
(handled by same modal — magic-link first-time vs returning is identical UX)
welcomeTitle:  Welcome to CW Leaders
welcomeSub:    Pick your persona — we'll tune Studio to your day. (Change anytime.)
```

**MFA SETUP** — N/A in v1 (magic-link is single-factor by design + Google sign-in for stronger). Mark `[CUSTOMIZE — re-add when account-takeover risk justifies friction]`.

**SESSION EXPIRED MODAL**
```
title:         Sign in again
body:          Your session timed out. Sign in to continue where you left off.
ctaPrimary:    Sign in →
ctaSecondary:  Stay signed out
```

**ACCOUNT LOCKED**
```
title:         Account temporarily locked
body:          We saw too many sign-in attempts on this account. For your safety, we paused sign-in for 15 minutes.
help:          If this wasn't you, email security@cwleaders.com
ctaPrimary:    OK
```

### Onboarding

**WELCOME SCREEN (post first signin)**
```
title:         Hi {firstName ?? 'there'}.
subhead:       What brings you in?
choices:       I'm recording for myself · I'm sending files · I'm hiring people · I'm leading a team
ctaPrimary:    Continue →
ctaSkip:       Skip — I'll figure it out
```

**SETUP WIZARD (per persona)**
```
step1Title:    Download Studio for {os}
step1Body:     The desktop app is where the magic happens. 3.4 MB, no ads, never trains AI on your data.
step1Cta:      Download → ({sizeMB} MB)
step1Skip:     Skip download — explore the web first

step2Title:    Connect your tools
step2Body:     Optional. Connect Linear, GitHub, or Notion to embed Studio recordings inline. Skip if you'd rather start fresh.
step2Cta:      Connect →
step2Skip:     Skip for now

step3Title:    You're set.
step3Body:     Open the desktop app and press ⌘⇧R to start your first recording.
step3Cta:      Open Studio
```

**FIRST-USE TOOLTIPS (canvas)**
```
tip_record:    Press ⌘⇧R or click here to record your screen.
tip_canvas:    Drag clips anywhere. The canvas is yours — no folders, no rules.
tip_share:     Right-click any clip to copy a share link.
tip_ai:        Type a question — the AI sees your canvas and answers from your work.
```

**EMPTY STATES**
```
canvas_empty:
  title:    Your canvas is empty.
  body:     Hit ⌘⇧R to start your first recording. We'll drop it here.
  cta:      How recording works →

uploads_empty:
  title:    Nothing sent yet.
  body:     Drop a file anywhere on this page — we'll generate a share link in seconds.
  cta:      What can I send? →

downloads_empty:
  title:    No incoming files.
  body:     Anyone with a CW Leaders share link can drop a file for you here.
  cta:      Get your receive URL →

myhire_empty:
  title:    No applications yet.
  body:     Share your roles — applicants get a 4-step Skill Check, you get the receipts.
  cta:      Open positions →

agents_empty:
  title:    No agents armed.
  body:     Pick an agent — we'll wire it to your canvas. Free tier includes Coach + Critic.
  cta:      Browse agents →
```

### Errors (HTTP + network)

**400 BAD REQUEST**
```
title:    That didn't quite work.
body:     We received a request we couldn't process. Try again, or contact us if it keeps happening.
cta1:     Try again
cta2:     hello@cwleaders.com
```

**401 UNAUTHORIZED**
```
title:    Sign in to continue.
body:     This page requires an account. It only takes 30 seconds.
cta1:     Sign in →
cta2:     Go home
```

**403 FORBIDDEN**
```
title:    You don't have access to this.
body:     Either this content isn't shared with you, or your plan doesn't include it.
cta1:     Upgrade →
cta2:     Sign in with a different account
help:     Mistake? hello@cwleaders.com
```

**404 NOT FOUND** (already shipped per Phase 8 master pass)
```
title:    This page doesn't exist.
body:     The link may be old, misspelled, or moved. The good news: we kept the four tools and the dashboard exactly where you left them.
cta1:     Go to Studio →
cta2:     CW Leaders home
help:     Still lost? hello@cwleaders.com
```

**429 RATE LIMITED**
```
title:    Slow down.
body:     You're hitting our rate limit. Try again in {retryAfter}s.
countdown: live timer
cta:      OK
```

**500 INTERNAL ERROR**
```
title:    Something's broken on our end.
body:     We're already on it. The error has been logged with ID {errorId}.
cta1:     Try again
cta2:     Status page
help:     If you want to ping us: hello@cwleaders.com
```

**502 / 503 SERVICE UNAVAILABLE**
```
title:    Studio is in maintenance mode.
body:     We're applying an update. We'll be back in {eta} or sooner.
cta:      Status page →
```

**NETWORK / OFFLINE BANNER**
```
text:    You're offline. We'll keep your work saved locally — it'll sync when you're back.
icon:    🛜
position: top-of-page banner
```

**TIMEOUT ERROR**
```
title:    That took longer than expected.
body:     Your connection might be slow, or our server is taking a breath. Want to retry?
cta1:     Retry
cta2:     Cancel
```

### Form validation (per field)

```
required_email:    Enter your email.
invalid_email:     That's not a valid email.
required_password: (n/a — magic-link only)
required_field:    {fieldName} is required.
too_short:         {fieldName} needs at least {n} characters.
too_long:          {fieldName} can't exceed {n} characters.
invalid_url:       Enter a full URL starting with https://
invalid_phone:     Use international format: +1 555 555 5555
invalid_date:      Pick a date.
file_too_large:    {fileName} exceeds the {maxMB} MB limit.
file_type:         {fileName} type ({type}) isn't supported.
captcha_failed:    Couldn't verify you're human. Try again.
```

### Notifications (toasts)

**SUCCESS**
```
saved:        Saved.
created:      Created.
updated:      Updated.
deleted:      Deleted.
sent:         Sent.
copied:       Copied to clipboard.
exported:     Export ready — check your email.
imported:     Import complete.
```

**WARNING**
```
limit_near:   You've used {pct}% of your {tier} {feature} limit.
expiring:     Your subscription expires in {n} days.
degraded:     Cloud AI is slow today — falling back to on-device. No charge for this run.
unsaved:      You have unsaved changes.
```

**INFO**
```
update_avail: A new version of Studio is ready. Restart to apply.
tip:          Tip: {tipText}
maintenance:  Scheduled maintenance: {date} at {time}.
```

**ERROR**
```
failed:       That didn't save. Check your connection and try again.
no_perm:      You don't have permission to do that.
quota:        You've hit your monthly {feature} limit. Upgrade or wait until {resetDate}.
```

### Modals & confirmations

**DELETE — single item**
```
title:    Delete {itemType}?
body:     "{itemName}" will be deleted permanently. This can't be undone.
cta1:     Delete (red)
cta2:     Cancel
```

**DELETE — bulk**
```
title:    Delete {n} items?
body:     {n} items will be deleted permanently. This can't be undone.
cta1:     Delete {n} (red)
cta2:     Cancel
```

**DELETE — account** (full flow in Phase 9.5)

**UNSAVED CHANGES**
```
title:    Discard your changes?
body:     You have unsaved changes. Leave anyway?
cta1:     Discard (red)
cta2:     Keep editing
```

**SESSION TIMEOUT WARNING**
```
title:    Still there?
body:     We'll sign you out in {seconds}s for your security.
cta1:     I'm here — stay signed in
cta2:     Sign me out
```

**PAYMENT CONFIRMATION**
```
title:    Confirm your purchase
detail:   {tier} — ${price}/{period}
charge:   {paymentMethod} ending in {last4}
renews:   Renews automatically — cancel any time
ctaPrimary: Pay ${price}
ctaSecondary: Cancel
disclosure: By continuing you agree to our Terms and Refund policy.
```

**SUBSCRIPTION CHANGE**
```
title:    Change to {newTier}?
body:     Effective {effectiveDate}. {proration}.
cta1:     Confirm
cta2:     Cancel
```

**EXPORT**
```
started:  Your export is being prepared. We'll email you a link in a few minutes.
ready:    Your export is ready: download here ({sizeMB} MB).
expired:  Your export link expired. Request a new one.
```

**IMPORT**
```
started:    Importing {n} items…
completed:  Imported {n} items.
partial:    Imported {n} of {total} items. {failed} failed — review.
failed:     Import failed. {reason}
```

### Settings & account

**PROFILE**
```
displayName:  Display name — shown to people you share with.
email:        Email — used to sign in. Change requires re-verification.
persona:      Persona — tunes Studio to your day.
photo:        Photo — square 240×240+ recommended.
```

**SECURITY**
```
sessions:     Sessions — devices currently signed in. Revoke any you don't recognize.
twoFactor:    Two-factor auth — magic-link is your second factor today.
recoveryEmail: Recovery email — backup if you lose access to your primary.
```

**NOTIFICATION PREFS**
```
productUpdates:   Product updates — major releases and changelog (≤1/month).
billingAlerts:    Billing alerts — required for paid plans.
sharedWithYou:    Shared with you — when someone shares a recording with you.
weeklyDigest:     Weekly digest — Saturdays, opt-in.
```

**BILLING**
```
plan:         Plan — {currentTier}. {nextBillDate}.
paymentMethod: Payment method — {brand} ending in {last4}. Update.
billingHistory: Billing history — download invoices.
upgrade:      Upgrade your plan
cancel:       Cancel plan (3-click flow)
```

**PLAN COMPARISON** — see `/pricing` page (current) and `docs/PRODUCT-WEDGE.md` for tier rationale.

### Loading states

```
boot:           CW Leaders is starting up…
page:           (skeleton screens — no text)
fetching:       Fetching your data…
uploading:      Uploading {fileName}… {pct}%
processing:     Processing — this takes about {est}.
processing_long: Still working — you can leave this page; we'll email you when ready.
queued:         Queued — your spot is #{position}.
```

---

## 5.3 — FORBIDDEN COPY PATTERNS

| Pattern | Why bad | Use instead |
|---|---|---|
| "Click here" links | Inaccessible, vague | Descriptive link text: "Open settings →" |
| "Are you sure?" alone | No context for the consequence | "Delete this recording? It can't be undone." |
| "Sorry for the inconvenience." | Empty corporate | "That didn't work. Try again or email us." |
| "We've experienced an unexpected error." | Sounds robotic + scary | "Something's broken on our end. We're on it." |
| "Please" before every imperative | Performative politeness | Just: "Sign in" |
| "Awesome!" / "Yay!" / 🎉 | Manipulative cheerfulness | Plain confirmation: "Saved." |
| "Loading…" indefinitely with no time signal | Anxiety-inducing | Progress indicator + ETA |
| Negative framing ("You can't…") | Scolding | Instead say what they CAN: "Upgrade to Powerhouse to record longer than 5 minutes." |
| Bait-questions ("Want to lose access to your data?") | Guilt manipulation | Plain: "Delete account? All recordings will be erased in 90 days." |
| "Limited time!" "Only 2 left!" without truth | Dark pattern + lying | Don't manufacture urgency |
| ALL-CAPS WARNINGS | Shouting | Use color and weight, not caps |

---

## 5.4 — LOCALIZATION READINESS SPEC

Per `docs/DEFERRED-DECISIONS.md`, i18n is deferred until 5k MAU or >30% non-English traffic. **Spec is ready when triggered:**

### String externalization

- Tool: `i18next` (de-facto standard for vanilla + framework JS)
- Format: ICU MessageFormat for plurals/genders
- Naming convention: `<area>.<component>.<state>` → `auth.modal.signin.cta`
- File location: `/i18n/<locale>/messages.json`
- Source of truth (English): generated from this `COPY-SYSTEM.md`

### Pluralization

ICU plural rules:
```
"items.count": "{count, plural, =0 {No items} one {# item} other {# items}}"
```

### RTL

- Use logical CSS properties (`padding-inline-start`, `margin-inline-end`) — already largely done in `eq.css`
- Add `<html dir="rtl">` based on locale; CSS handles the rest
- Audit Mind-Free canvas drag interactions (mouse-position math may need mirroring)

### Format tokens

- Dates: `Intl.DateTimeFormat` with locale
- Numbers: `Intl.NumberFormat`
- Currency: `Intl.NumberFormat` with `style: 'currency'`
- Relative time: `Intl.RelativeTimeFormat`

### Translation workflow

1. Strings frozen at end of sprint → exported to JSON
2. Crowdin or Lokalise (free for OSS, ~$30/mo for closed)
3. Native-speaker review for legal docs (cheaper to professional-translate Privacy + Terms; rest crowdsourced)
4. RTL testing per release

### First locales (when triggered)

Priority order based on signups data: Spanish (LATAM), Portuguese (BR), French, German, Japanese.
