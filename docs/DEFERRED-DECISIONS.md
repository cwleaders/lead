# Deferred Decisions Register
**Purpose:** Make every "we're not doing this yet" an *explicit* decision with a *trigger* for revisit, not a forgotten gap.

---

## i18n / Localization (Point #60)

**Decision:** Defer i18n until 5,000 paying users OR until international (non-English) traffic exceeds 30% of pageviews.
**Why now:** All strings hardcoded in English; founding team operates in English; LATAM/EU translation cost > expected revenue at current scale.
**Watching:** GA pageview-by-language ratio; Stripe customer-by-country ratio.
**Cost when triggered:** ~80 dev-hours to externalize strings + ~$0.10/word LSP for first language. Likely first locale: Spanish-LATAM (large founder-friendly market).
**Decision-maker:** founder.
**Revisit:** every Q1.

## A/B Testing Infrastructure (Point #66)

**Decision:** Defer formal experimentation infra until 2,000 weekly active users.
**Why now:** Below ~1k WAU, statistical power to detect 10% lifts requires runs of 4+ weeks — slower than gut-check + revert. Manual "ship → watch metrics → keep or roll back" outperforms infra at our scale.
**What we use instead:** Persona-based cohorts (already in DDB) for natural segmentation; CloudFront URL-prefix splitting if needed (`/v2/`).
**When triggered:** Self-host GrowthBook or pick LaunchDarkly free tier. Estimated build: 1 week.
**Revisit:** when WAU > 1.5k for 4 consecutive weeks.

## ETL / Data Warehousing (Point #65)

**Decision:** Defer dedicated warehouse until first BI question can't be answered with a 30-line DDB scan.
**Why now:** All operational queries fit in single-table access patterns. Snowflake + Fivetran + dbt = ~$300/month with no proportionate signal at current event volume.
**Stop-gap:** Daily DDB → S3 export (cron) writes parquet for ad-hoc Athena queries. Cost: pennies/month.
**Build (when triggered):** S3 → DuckDB or → Snowflake free tier ($25 credit). 2-week effort.
**Revisit:** at 50k MAU OR when 3+ unanswerable BI questions accumulate.

## ML / Training Pipeline (Point #68)

**Decision:** **Permanent** — CW Leaders **does not train AI models on user data**. This is a stated public commitment in `privacy.html` §4 and a competitive differentiator.
**What we do instead:** Consume frontier models (Gemini, Claude, Groq) via API; run on-device inference (Whisper, CLIP, Tesseract) for privacy-sensitive workloads.
**Trigger to revisit:** Never, unless the entire privacy-stance pivots — which would require rewriting the privacy policy with 14-day notice to users (per `privacy.html` §11).
**Decision-maker:** founder + legal (because contractually committed).

## Native Mobile Apps (anticipated future #60.5)

**Decision:** Defer native iOS/Android until desktop has >10k MAU.
**Why now:** PWA on studio.cwleaders.com handles mobile-first; Tauri 2.x mobile is alpha; native dev would split engineering.
**Trigger:** desktop MAU > 10k AND mobile-PWA usage > 30% of total session time.

## Public API & SDK (Point #71)

**Decision:** Defer public API + OAuth scopes until 5+ explicit integration requests received.
**Why now:** Public APIs are a contract that's expensive to break; can't break what doesn't exist yet.
**Stop-gap:** Document the existing private API for internal partners under NDA.
**Trigger:** 5 documented external integration requests OR a partnership deal demands it.

## SOC2 Type II Certification

**Decision:** Defer until first enterprise customer demands it.
**Why now:** ~$30-60k/year + 12-month observation window for a Type II report. Enterprise tier (Command) is the only customer class that asks.
**Stop-gap:** SOC2-aligned controls are already implemented (audit trail, encryption, access logging) and documented in `STRIDE-THREAT-MODEL.md` + `RUNBOOK.md`. The certification itself is what's deferred, not the practice.
**Trigger:** First enterprise contract asks "show us your SOC2." That conversation is the budget-justification.

---

## Decision-revisit checklist

Once a quarter, walk through every entry above and ask:
1. Has the trigger fired?
2. Has the cost-of-delay risen since last review?
3. Has the cost-of-implementation dropped (e.g., new tooling)?

Triggered decisions move to `MIGRATION-ROADMAP.md` with concrete sprint placement.
