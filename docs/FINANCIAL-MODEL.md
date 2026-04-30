# Financial Model — 18-Month Projection
**Owner:** founder
**Reviewed:** monthly
**Last revision:** 2026-04-30

---

## A. UNIT ECONOMICS (#24 — LTV/CAC)

### Revenue per paid user

| Tier | Price | Stripe fee (2.9% + 30¢) | Net per user/month |
|---|---|---|---|
| Basic ($4.99/mo) | $4.99 | $0.45 | **$4.54** |
| Powerhouse ($14.99/mo) | $14.99 | $0.73 | **$14.26** |
| Agentic ($29.99/mo) | $29.99 | $1.17 | **$28.82** |
| Enterprise seat ($59/seat/mo) | $59.00 | $2.01 | **$56.99** |

### Cost per paid user (marginal)

Estimated at scale (assume 50% on Powerhouse, 35% on Basic, 12% on Agentic, 3% on Enterprise):

| Cost component | $/user/mo (Powerhouse blend) |
|---|---|
| AWS Lambda invocations | $0.01 |
| DynamoDB on-demand | $0.02 |
| S3 storage (200MB avg) | $0.005 |
| CloudFront egress (10GB) | $0.85 |
| AI inference (Gemini free + Groq free + Claude paid sliver) | $0.30 |
| SES (10 emails) | $0.001 |
| **Total marginal cost** | **$1.19** |

**Gross margin per user:**
- Basic: ($4.54 − $0.50) / $4.54 = **89%**
- Powerhouse: ($14.26 − $1.19) / $14.26 = **92%**
- Agentic: ($28.82 − $3.50) / $28.82 = **88%**

> 88-92% gross margins are software-typical. Healthy.

### LTV calculation

Assume **monthly churn = 5%** (industry median for sub-$30 SaaS).
- Average customer life = 1 / 0.05 = 20 months
- LTV (Powerhouse) = $14.26 × 20 = **$285**
- LTV (Basic) = $4.54 × 20 = **$91**

### CAC target

Bootstrap rule: keep CAC under 1/3 of LTV.
- Powerhouse CAC ceiling: **$95** (we plan to spend $0 in paid ads → CAC ~$0 organic)
- Basic CAC ceiling: **$30** (same)

LTV/CAC ratio at $0 CAC = ∞. That's the math advantage of organic distribution.

**Validation milestone:** by day 90 we'll have ~200 paid users with measurable churn data. LTV currently a forecast, not a measurement.

---

## B. BREAK-EVEN ANALYSIS (#26)

### Fixed monthly costs (current)
- AWS infra idle: $0.51
- Domain (Route53): $0.50
- Stripe: $0 (no monthly minimum)
- SES: $0 (under 50k/day quota)
- **Total fixed: ~$1.01/mo**

### Variable / committed
- AI free tier covers ~250 paid Powerhouse users at current usage. Beyond that, +$0.30/user.
- CloudFront egress free tier: 1TB/mo.

### Break-even at different scales

| Paid users | Mix | Net rev/mo | Marginal cost/mo | Net | Status |
|---|---|---|---|---|---|
| 10 | 7B/2P/1A | $86 | $11 | **+$75** | profitable from first 10 |
| 100 | 70B/20P/10A | $904 | $115 | **+$789** | |
| 500 | 350B/100P/50A | $4,510 | $580 | **+$3,930** | |
| 2,000 | 1400B/400P/200A | $18,040 | $2,300 | **+$15,740** | profitable founder salary territory |
| 10,000 | 7000B/2000P/1000A | $90,200 | $11,500 | **+$78,700** | hire team |

> **Break-even = ~1 paid user.** That's the bootstrap advantage.

The real break-even question is **founder personal runway** (#25), not company costs.

---

## C. PERSONAL RUNWAY (#25)

**Action required: founder must disclose personal monthly burn + cash on hand to complete this section.**

Template:
```
Monthly personal burn: $______
Cash on hand:          $______
Personal runway:       _______ months

Decision: 
  if runway < 6 months  → consider freelance income alongside
  if runway < 3 months  → trigger Kill Criterion K3 (RISK doc)
```

Until disclosed, the personal-runway risk is unbounded. **Founder: please complete and store in 1Password vault `cwl-runway`** (encrypted, not in git).

---

## D. CLOUD SPEND PROJECTION (#22)

### Assumptions
- Free tier covers infrastructure to ~50k MAU (1M Lambda invocations/mo + 25GB DDB storage + 1TB CloudFront egress).
- DDB on-demand = $1.25/M write-ops + $0.25/M read-ops + $0.25/GB-mo storage.
- AI inference: Gemini free 1500 RPD/key; Groq free 30 RPM; Claude billed.

### Month-by-month projection

| Month | MAU forecast | Paid users | MRR | AWS bill | AI bill | Total cost | Net |
|---|---|---|---|---|---|---|---|
| 1  | 100 | 5 | $50 | $0 | $0 | $1 | +$49 |
| 3  | 1,000 | 50 | $700 | $1 | $0 | $2 | +$698 |
| 6  | 5,000 | 250 | $3,500 | $8 | $5 | $13 | +$3,487 |
| 9  | 15,000 | 750 | $11,000 | $35 | $30 | $65 | +$10,935 |
| 12 | 30,000 | 1,500 | $22,000 | $90 | $120 | $210 | +$21,790 |
| 18 | 80,000 | 4,000 | $58,000 | $280 | $480 | $760 | +$57,240 |

> **Cloud spend grows linearly with MAU; revenue grows linearly with paid users; the gap widens.**

**Inflection points:**
- Month 4: leave Lambda free tier (~1M invocations); cost +$0.20 per million extra
- Month 7: leave DDB free tier (25GB) — likely sooner if recordings stored
- Month 10: leave CloudFront free tier (1TB egress) — switch to Cloudflare R2 if egress becomes dominant ($-0.85/user/mo savings is significant at 10k MAU)

### Worst-case (R3 risk realization)

If Gemini revokes free tier mid-launch:
- Month-12 AI bill: $0.30 × 1500 paid users = $450/mo (vs $120 above)
- Mitigation: route 50% to Groq (still free as of write) + 30% to local Whisper/CLIP (free) + 20% to Claude paid.

---

## E. PRICING STRATEGY VALIDATION (#27)

### Current pricing (live in Stripe)

| Tier | Price | Hypothesized buyer |
|---|---|---|
| Basic | $4.99/mo | Indie hackers, students, casual |
| Powerhouse | $14.99/mo | Pros, designers, technical PMs |
| Agentic | $29.99/mo | Power users wanting AI automations |
| Enterprise seat | $59/seat/mo | Teams |
| Enterprise org | $499/mo | Org-wide license |

### Validation tests (run in first 90 days)

**Test 1 — "Are we leaving money on the table?"**
- Ship a $7.99 "Plus" tier between Basic and Powerhouse for 30 days.
- If >25% of new Basic signups upgrade to Plus → pricing is too coarse, raise Basic to $7.99 and rename.
- Cost: 30 minutes Stripe change.

**Test 2 — "Is Powerhouse right-priced?"**
- A/B in landing page (manual cohort, persona-split): show 50% of users $19.99 Powerhouse vs $14.99.
- If conversion rate within 10% → raise to $19.99 (35% revenue lift on tier).
- If conversion rate drops >25% → keep $14.99.

**Test 3 — "Is Agentic ever bought?"**
- If <5% of paid users are on Agentic by day 90 → tier is poorly explained or priced. Either rebrand or kill.

### Competitive benchmark

| Tool | Closest tier | Price | Our equivalent |
|---|---|---|---|
| Loom Business | Pro features | $15/seat/mo | Powerhouse $14.99 ✓ matched |
| Vidyard Plus | Pro | $19/seat/mo | Powerhouse $14.99 (cheaper by $4) |
| Tella Pro | Pro | $19/mo | Powerhouse $14.99 (cheaper) |
| Scribe Pro | Personal | $29/mo | Agentic $29.99 ✓ matched |
| Notion AI | $10 add-on | $10/seat/mo | Embedded in all tiers (advantage) |

> **Defensible:** we undercut Loom while bundling 4 tools. Pricing is competitive.

---

## F. FUNDING REQUIREMENT (#28)

**None.** Bootstrap-feasible by design. See `RISK-AND-KILL-CRITERIA.md` K3 for runway floor.

If kill criterion K3 (founder runway <3mo) fires AND the platform shows traction (>$3k MRR):
- Pre-seed round: $250-500k for 18 months runway + first 2 hires
- Likely investors: indie-friendly micro-funds (Calm Company, EarnestCapital), not VC
- Keep dilution under 12%

If kill criterion K3 fires AND traction is weak: stop, don't raise.
