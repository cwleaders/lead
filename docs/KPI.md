# KPI Dashboard — Top 5 Metrics That Matter
**Reviewed:** weekly, by founder
**Source of truth:** DynamoDB events table (gsi1pk = `USER#<id>` for cohort queries)

---

## NORTH-STAR METRIC

**Weekly Active Sharing Users (WASU)** — the count of unique users who created at least one share link OR completed at least one recording in the last 7 days.

Why this and not MAU: WASU is a *forward indicator* of viral growth. Every share link is a recipient impression. MAU is too lagging for early traction signal.

---

## TOP 5 KPIs

| # | KPI | Formula | Frequency | Healthy range |
|---|---|---|---|---|
| 1 | **WASU** | `COUNT(DISTINCT userId WHERE event IN [studio.share_link_created, studio.record_complete] AND ts > now()-7d)` | weekly | grow ≥10% WoW first 90 days |
| 2 | **Free → Paid conversion** | `paid_signups / total_signups` cohorted weekly | weekly | ≥5% by day 14 of cohort |
| 3 | **D7 retention** | `users active week 1 / users signed up week 0`, by signup-week cohort | weekly | ≥35% by week 4 |
| 4 | **Viral coefficient k** | `recipients_who_signed_up / shares_sent` over 30d | monthly | ≥0.4 by month 3, ≥1.0 (compounding) at any point = green |
| 5 | **MRR** | sum of active Stripe subscriptions × price | weekly | ≥$1k by day 90, ≥$10k by day 180 |

If any of these is below threshold for **2 consecutive weeks**, halt new feature work and run a 1-week diagnostic sprint.

---

## EVENT TAXONOMY (`backend/lambdas/analytics-event/index.mjs`)

| Event | Required props | Used by KPI |
|---|---|---|
| `auth.signup` | `method` (magic-link/google) | 2, 3 |
| `auth.signin` | — | 3 |
| `auth.signout` | — | 3 |
| `billing.checkout_start` | `tier` | 2 |
| `billing.subscribe` | `tier`, `priceId` | 2, 5 |
| `billing.cancel` | `tier`, `reason?` | 5 |
| `studio.record_start` | — | 1 |
| `studio.record_complete` | `durationSec`, `local` (bool) | 1 |
| `studio.share_link_created` | `kind` (file\|recording) | 1, 4 |
| `upload.dropped` | `sizeBytes`, `mime` | 1 |
| `upload.completed` | `fileId`, `sizeBytes` | 1 |
| `upload.failed` | `reason` | (ops) |
| `download.opened` | `fileId`, `from?` | 4 |
| `download.completed` | `fileId` | 4 |
| `hire.application_submit` | `role` | (sales) |
| `desktop.installed` | `platform`, `version` | 1 |
| `desktop.launched` | `platform`, `version` | 1 |
| `feedback.submitted` | `kind` | (product) |

## QUERY EXAMPLES (PartiQL via `aws dynamodb execute-statement`)

WASU last 7 days:
```sql
SELECT DISTINCT userId FROM "lead-table"."gsi1"
WHERE gsi1pk LIKE 'USER#%'
  AND gsi1sk > '2026-04-23'
  AND name IN ('studio.share_link_created', 'studio.record_complete')
```

Free→Paid by signup week:
```bash
# Count signups in week
aws dynamodb query --table-name lead-table --index-name gsi1 \
  --key-condition-expression 'gsi1pk = :p AND begins_with(gsi1sk, :w)' \
  --expression-attribute-values '{":p":{"S":"USER"},":w":{"S":"2026-04-13"}}'
# Count those who later subscribed
# (then divide)
```

## DASHBOARDING

For now: a single CloudWatch dashboard `lead-kpis` aggregating:
- Lambda invocation counts on `analytics-event` (proxy for client engagement)
- Custom CW metrics published by a daily `lead-kpi-cron` Lambda (planned month 2)

Once volume justifies, export to a notebook or Athena query.

---

## SECONDARY METRICS (track but don't optimize)

- Page-views per session (vanity unless paired with conversion)
- Bounce rate (proxied by sessions with 0 events)
- Mean recording length (signals if Studio is being used as Loom replacement vs. clip tool)
- Cloud cost / paid user (target: <30% of revenue)
- AI calls per active user per week (capacity planning input)
