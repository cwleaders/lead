# Risk Register & Kill Criteria
**Owner:** founder@cwleaders.com
**Reviewed:** every quarter; mandatory re-read at month 6 milestone

---

## TOP 5 EXISTENTIAL RISKS

### R1 — Zero-distribution ("nobody finds it")
**Scenario:** Platform launches, $0 marketing spend, organic discovery yields <100 paid users by day 180.
**Probability:** HIGH (this is the default outcome for bootstrapped indie launches).
**Impact:** Existential — without revenue, runway runs out.
**Mitigations:**
- See `docs/DISTRIBUTION-PLAYBOOK.md` — picked ProductHunt + dev-Twitter as wedge channels.
- 30-day post-launch organic-acquisition checkpoint: if <30 signups, pivot to paid + content.
- Recipient-driven viral loop (file sharing → forced sign-up to download) is the cheapest organic engine; instrument and optimize.
**Owner:** founder.

### R2 — Founder burnout / health event
**Scenario:** Solo operator → physical, mental, or financial exhaustion before traction.
**Probability:** MEDIUM-HIGH (chronic for solo bootstrappers).
**Impact:** Existential.
**Mitigations:**
- Hard rule: 1 day/week off (Sunday) and 1 week off per quarter.
- Kill criterion K3 below covers personal-runway floor.
- Backup vault `cwl-prod-emergency` ensures platform survives short founder absence.
- Lean infra ($0.51/mo idle) means runway is set by founder's personal expenses, not company costs.
**Owner:** founder.

### R3 — AI cost spike
**Scenario:** Free tiers tighten or a viral burst pushes Gemini/Groq usage past free quota; AI bills hit $1000+/mo before revenue covers.
**Probability:** MEDIUM (Google has tightened Gemini free tier before).
**Impact:** Significant — could turn unit economics negative overnight.
**Mitigations:**
- Circuit breakers + Mock fallback in `_ai.mjs` (already shipped Phase 5).
- Per-user credit budget on Lambda (not yet enforced — see `_entitlements.mjs` planned).
- Local-first Whisper/CLIP/Tesseract handles ~70% of inference on user's device → never hits the cloud.
- Monthly cost dashboard with $50 alarm threshold (action: build it).
**Owner:** founder.

### R4 — Apple notarization rejection / cert revocation
**Scenario:** Apple revokes Developer ID certificate (DMCA, app-content dispute) → all Mac DMG builds become unrunnable; existing installs throw security warnings.
**Probability:** LOW (process is mechanical; rejections are rare for utility tools).
**Impact:** High — Mac is plurality of target market.
**Mitigations:**
- Ship a Linux AppImage and Windows MSI as fallbacks (already in `package.json` build scripts).
- Backup signing identity from a secondary Apple Developer account (cost: $99/yr) — defer until first signed build.
- Tauri 2.x supports re-signing existing artifacts post-publish.
**Owner:** founder.

### R5 — Loom / Notion / OpenAI ships our wedge feature
**Scenario:** A 1000-engineer competitor adds AI-overlaid screen recording in a Tuesday release; our differentiation evaporates.
**Probability:** MEDIUM (always present in fast-moving categories).
**Impact:** Significant — wipes UVP for some segments.
**Mitigations:**
- Wedge deep, not wide: own "visual thinker / Mind-Free canvas" niche they won't copy because it doesn't fit their UX.
- Local-first privacy stance (no AI training on user data) is structurally hard for incumbents to match credibly.
- 4-tools-bundled UX is a moat: they'd have to bundle Loom + Slack + Greenhouse + Hubstaff, which they won't.
**Owner:** founder.

---

## SECONDARY RISKS (logged, not yet existential)

| ID | Risk | Mitigation |
|---|---|---|
| R6 | DynamoDB throttling at >2000 wcu/sec | On-demand mode (already enabled) absorbs spikes; alarm wired |
| R7 | Stripe account suspension | Backup PSP (Lemon Squeezy or Paddle) docs not yet written |
| R8 | Crypto/web3 spam fills uploads | 24h TTL on anonymous + auth-required for >100MB; rate-limited |
| R9 | Email deliverability degraded | Multiple SES regions + SPF/DKIM/DMARC in place; backup transactional via SendGrid |
| R10 | DMCA on hosted user content | Take-down workflow in Terms §16; takedown@cwleaders.com routes to founder |

---

## KILL CRITERIA (Trip-wires)

These are the **specific, measurable conditions** that trigger a STOP decision and 90-day reassessment.

| ID | Trip-wire | Measurement | Why this number |
|---|---|---|---|
| **K1** | <100 paying users by day 180 post-launch | Stripe dashboard (live revenue users) | That's the floor for *any* unit-economic feedback. |
| **K2** | Net Revenue Retention <80% over any 30-day window after month 3 | DDB query: subs active T-30 vs T+0 | Means churn is structural, not fixable by polish. |
| **K3** | Founder personal runway <3 months | Founder discloses quarterly | Forced-sale outcomes destroy more value than honest pause. |
| **K4** | Cloud + AI bills exceed 50% of MRR for 2 consecutive months | `aws ce get-cost-and-usage` + Stripe MRR | Margin too thin to scale; either re-price or cut local-first deeper. |
| **K5** | Critical CVE / data-breach incident with >100 users affected | CloudTrail + ddb scans | Trust is the entire product; a breach without immediate disclosure + fix kills it. |

### Decision protocol when a trip-wire fires
1. **Pause new feature work for 1 week.**
2. **Honest assessment** with at least one external advisor (not the founder alone).
3. **Choose one of three:**
   - **Pivot:** rebuild around a different wedge using existing infra (architecture is modular).
   - **Pause:** put platform in stewardship mode (existing customers keep service, no new features) for 90 days.
   - **Stop:** wind down — refund active subs, export user data per DPA, transfer domain.

> Predefining the decision is the only way to make it well in the moment. **Print this page.**

---

## REVIEW CADENCE

| When | Review |
|---|---|
| Monthly | Top-5 risk probabilities updated; secondary risks promoted/demoted |
| Quarterly | Full re-read; mitigations audited for staleness |
| Annually | Trip-wires recalibrated against actual usage |
| On any P1 incident | Was this risk in the register? If not, add it. |
