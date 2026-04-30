# Migration Roadmap — Architectural Debt & Maturation
**Cadence:** items here move into sprint backlog when triggered, not before.

---

## OPENAPI 3.1 SPEC (Point #4)

**Goal:** Generate machine-readable contract for all 25 API GW routes to enable: client SDKs, contract tests, automated docs.
**Approach:**
1. Hand-author `backend/openapi.yaml` listing every route with request/response shapes (estimated 1 day).
2. Add `npx @stoplight/spectral lint openapi.yaml` to CI (when CI exists).
3. Generate Postman collection from spec for QA.
**Trigger:** before first external API consumer (partner, mobile native, etc).
**Effort:** ~1 day.

## AWS CDK MIGRATION (Point #5)

**Goal:** Replace `deploy.sh` (~900 lines of bash) with TypeScript CDK stacks; gain peer-review + diff visibility.
**Approach:** Greenfield CDK app at `backend/cdk/` mirroring current resources, deployed alongside existing stack. Run both for 2 weeks; cut over once parity verified.
**Trade-off:** CDK adds ~5MB of node_modules and a CloudFormation tax (slower deploys). Worth it once team>1.
**Trigger:** team size ≥ 2 OR resource count ≥ 50 (currently 16 lambdas + 5 distros = 21).
**Effort:** ~5 days for parity, +2 days observation, +1 day cutover.

## TYPESCRIPT MIGRATION (Point #10)

**Goal:** Type-safety across both frontend and Lambda code.
**Approach:** Per-package opt-in. Start with shared `_shared.mjs` + `_breaker.mjs` (smallest blast radius). Add tsc + tsconfig with `allowJs: true` so migration is incremental.
**Trigger:** team size ≥ 2 OR LOC ≥ 30k.
**Effort:** ~3 days for backend; ~5 days for frontends (vanilla JS makes the migration awkward — may coincide with framework adoption).

## SECRETS MANAGER MIGRATION (Point #14)

**Goal:** Move JWT_SECRET, STRIPE_API_KEY, AI keys out of Lambda env vars into AWS Secrets Manager with auto-rotation.
**Approach:**
1. Create secrets at `cwleaders/prod/{jwt,stripe,ai}` (estimate $3.20/month for 8 secrets).
2. Add `getSecret(name)` helper with 5-min in-memory cache to `_shared.mjs`.
3. Lambdas read from Secrets Manager on cold start.
4. Remove plaintext env vars after parity verification.
5. Configure AutomaticRotation on JWT_SECRET (Lambda function rotates monthly).
**Trade-off:** First-call latency adds ~30ms (mitigated by 5-min cache). Cost: $3-5/mo. Compliance gain: significant (rotation, audit trail).
**Trigger:** SOC2 conversation OR first compliance-aware enterprise contract.
**Effort:** ~2 days.

## CLOUDTRAIL AUDIT LOG (Point #16)

**Goal:** Immutable audit trail of admin/sensitive actions (separate from CloudWatch which has 30d retention and is mutable by IAM).
**Approach:**
1. Enable CloudTrail organization-wide if not already.
2. Configure trail writing to a dedicated `lead-audit-logs` S3 bucket with **Object Lock in Compliance Mode** (immutable, even root can't delete for retention period).
3. Retention: 7 years (legal preservation).
4. Add CloudWatch metric filter for sensitive Lambdas (auth-firebase, stripe-webhook, admin-snapshot) → SNS alert on errors.
**Cost:** ~$2-5/mo at current volume.
**Effort:** ~0.5 day.

## EXTENDED LOG RETENTION (T5 from STRIDE)

**Goal:** Stripe-billing-event logs kept 1 year (tax/dispute window) vs current 30d default.
**Approach:** `aws logs put-retention-policy --log-group-name /aws/lambda/lead-stripe-webhook --retention-in-days 365`
**Effort:** 1 line.

## ENTITLEMENT/CREDIT BUDGET ENFORCEMENT (T10 from STRIDE)

**Goal:** Server-side enforcement of per-tier AI credit caps to prevent runaway AI spend.
**Approach:**
1. Add `creditsRemainingThisMonth` field to user record in DDB.
2. `_entitlements.mjs#deductCredits(userId, n)` atomic decrement.
3. `agent-runtime` calls `deductCredits` *before* invoking AI, refunds on failure.
4. Frontend reads remaining via `/auth/me`.
**Effort:** ~1 day.

## DDB CROSS-REGION BACKUP (Tier-3 DR)

**Goal:** Survive a full us-east-1 outage (rare but happens).
**Approach:** Daily DDB → S3 export to `lead-backups-us-west-2`. PITR already covers same-region recovery.
**Cost:** ~$1/mo at current data size; scales linearly.
**Effort:** ~0.5 day (managed export feature).
**Trigger:** 1k MAU OR first compliance question about RTO.

## STRIPE BACKUP PSP PLAYBOOK

**Goal:** Survive Stripe account suspension (rare; happens to legitimate startups occasionally).
**Approach:** Document migration to Lemon Squeezy or Paddle. Pre-create accounts. Keep customer-email→tier mapping in our own DDB so re-charging is mechanical.
**Effort:** ~1 day to document + 1 day to setup backup PSP account (don't wire to checkout until needed).

## GITHUB ACTIONS CI/CD (Point #47)

**Goal:** Replace local `./deploy.sh` runs with PR-driven deploys.
**Approach:**
1. `.github/workflows/deploy.yml` — on push to `main`, run `deploy.sh frontend` and `deploy.sh lambdas`.
2. AWS credentials via OIDC role assumption (no long-lived secrets in GH).
3. Pre-deploy: lint + smoke test (curl /health) + load-test (k6 against staging).
**Effort:** ~1 day.
**Status:** Spec written; implementation queued.

## STAGING ENVIRONMENT (Point #48)

**Goal:** Mirror prod for safe testing.
**Approach:**
1. Subdomain: `staging.cwleaders.com` for portal; `staging-api.cwleaders.com` for API.
2. Separate DDB table `lead-table-staging`.
3. Separate Lambdas with `staging-` prefix sharing the same code zip.
4. Stripe test-mode keys.
**Cost:** ~$1/mo (everything stays in free tier).
**Effort:** ~1 day to spin up; depends on `deploy.sh` parameterization.

---

## SCHEDULE

| Item | Trigger | Owner | Effort |
|---|---|---|---|
| OpenAPI spec | Pre-partner | founder | 1d |
| GitHub Actions CI/CD | Now (Phase A) | founder | 1d |
| Staging environment | Now (Phase A) | founder | 1d |
| CloudTrail audit | Pre-launch | founder | 0.5d |
| Stripe-event log retention | Pre-launch | founder | 0.01d |
| Credit-budget enforcement | Day 1–30 post-launch | founder | 1d |
| DDB cross-region backup | 1k MAU | founder | 0.5d |
| Secrets Manager | First enterprise | founder | 2d |
| TypeScript migration | Team≥2 | new hire | 3-5d |
| CDK migration | Team≥2 | new hire | 7d |
| Stripe backup PSP | After first $10k MRR | founder | 2d |

**Total work captured:** ~22 days (~4 weeks of focused build, spread over 6+ months by trigger.)
